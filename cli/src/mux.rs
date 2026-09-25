use anyhow::{anyhow, bail, Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{mpsc, Notify};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async_tls_with_config, Connector};

pub const WINDOW: u32 = 1024 * 1024;
pub const CHUNK: usize = 64 * 1024;
const ACK_THRESHOLD: u32 = 256 * 1024;
const PING_INTERVAL: Duration = Duration::from_secs(20);
const DEAD_AFTER: Duration = Duration::from_secs(60);

const OPEN: u8 = 0x01;
const DATA: u8 = 0x02;
const CLOSE: u8 = 0x03;
const WINDOW_UPDATE: u8 = 0x04;
const DATAGRAM: u8 = 0x05;
const RESET: u8 = 0x06;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OpenMeta {
    #[serde(default)] pub protocol: String,
    #[serde(default)] pub remote: String,
}

impl OpenMeta {
    pub fn tcp(remote: impl Into<String>) -> Self { Self { protocol: "tcp".into(), remote: remote.into() } }
    pub fn udp(remote: impl Into<String>) -> Self { Self { protocol: "udp".into(), remote: remote.into() } }
    pub fn is_udp(&self) -> bool { self.protocol == "udp" }
}

#[derive(Debug)]
pub enum Incoming {
    Data(Vec<u8>),
    Datagram(Vec<u8>),
    Close,
    Reset,
}

fn encode(kind: u8, id: u32, payload: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(5 + payload.len());
    frame.push(kind);
    frame.extend_from_slice(&id.to_be_bytes());
    frame.extend_from_slice(payload);
    frame
}

struct Credit {
    available: Mutex<i64>,
    notify: Notify,
}

impl Credit {
    fn new() -> Self { Self { available: Mutex::new(WINDOW as i64), notify: Notify::new() } }
    fn add(&self, n: u32) {
        *self.available.lock().unwrap() += n as i64;
        self.notify.notify_waiters();
    }
    async fn take(&self, n: usize, dead: &AtomicBool) -> bool {
        loop {
            if dead.load(Ordering::Relaxed) { return false; }
            {
                let mut avail = self.available.lock().unwrap();
                if *avail >= n as i64 { *avail -= n as i64; return true; }
            }
            let notified = self.notify.notified();
            if dead.load(Ordering::Relaxed) { return false; }
            let _ = tokio::time::timeout(Duration::from_millis(500), notified).await;
        }
    }
}

struct Shared {
    id: u32,
    mux: Arc<Mux>,
    credit: Credit,
    dead: AtomicBool,
    close_sent: AtomicBool,
    close_received: AtomicBool,
}

impl Drop for Shared {
    fn drop(&mut self) {
        self.mux.forget(self.id);
        let clean = self.close_sent.load(Ordering::Relaxed) && self.close_received.load(Ordering::Relaxed);
        if !self.dead.load(Ordering::Relaxed) && !clean {
            self.mux.try_send(Message::Binary(encode(RESET, self.id, &[]).into()));
        }
    }
}

#[derive(Clone)]
pub struct MuxWriter { shared: Arc<Shared> }
pub struct MuxReader { shared: Arc<Shared>, rx: mpsc::UnboundedReceiver<Incoming>, unacked: u32 }

impl MuxWriter {

    pub async fn send(&self, data: &[u8]) -> Result<()> {
        for chunk in data.chunks(CHUNK) {
            if !self.shared.credit.take(chunk.len(), &self.shared.dead).await { bail!("stream closed"); }
            self.shared.mux.send(Message::Binary(encode(DATA, self.shared.id, chunk).into())).await?;
        }
        Ok(())
    }

    pub async fn send_datagram(&self, data: &[u8]) -> Result<()> {
        if data.len() > 65507 { return Ok(()); }
        if self.shared.dead.load(Ordering::Relaxed) { bail!("stream closed"); }
        self.shared.mux.send(Message::Binary(encode(DATAGRAM, self.shared.id, data).into())).await
    }

    pub async fn close(&self) {
        if self.shared.dead.load(Ordering::Relaxed) || self.shared.close_sent.swap(true, Ordering::Relaxed) { return; }
        let _ = self.shared.mux.send(Message::Binary(encode(CLOSE, self.shared.id, &[]).into())).await;
    }

    pub fn reset(&self) {
        if self.shared.dead.swap(true, Ordering::Relaxed) { return; }
        self.shared.mux.try_send(Message::Binary(encode(RESET, self.shared.id, &[]).into()));
    }
}

impl MuxReader {
    fn ack(&mut self) {
        if self.unacked == 0 || self.shared.dead.load(Ordering::Relaxed) { return; }
        let n = self.unacked;
        self.unacked = 0;
        self.shared.mux.try_send(Message::Binary(encode(WINDOW_UPDATE, self.shared.id, &n.to_be_bytes()).into()));
    }

    pub async fn recv(&mut self) -> Incoming {
        if self.unacked >= ACK_THRESHOLD { self.ack(); }
        match self.rx.recv().await {
            Some(Incoming::Data(d)) => {
                self.unacked += d.len() as u32;
                Incoming::Data(d)
            }
            Some(Incoming::Close) => {
                self.shared.close_received.store(true, Ordering::Relaxed);
                Incoming::Close
            }
            Some(Incoming::Reset) | None => {
                self.shared.dead.store(true, Ordering::Relaxed);
                Incoming::Reset
            }
            Some(other) => other,
        }
    }
}

struct Entry {
    tx: mpsc::UnboundedSender<Incoming>,
    shared: std::sync::Weak<Shared>,
}

pub struct Mux {
    out: mpsc::Sender<Message>,
    streams: Mutex<HashMap<u32, Entry>>,
    next_id: AtomicU32,
    closed: AtomicBool,
}

pub struct MuxEvents {
    pub control: mpsc::Receiver<Value>,
    pub streams: mpsc::Receiver<(MuxWriter, MuxReader, OpenMeta)>,
}

impl Mux {
    pub async fn connect(url: &str, token: Option<&str>, accept_invalid_certs: bool) -> Result<(Arc<Mux>, MuxEvents)> {
        let mut request = url.into_client_request().context("Invalid server URL")?;
        if let Some(token) = token {
            request.headers_mut().insert("Authorization", format!("Bearer {token}").parse()?);
        }
        let connector = Some(Connector::Rustls(crate::tls::client_config(accept_invalid_certs)?));
        let (ws, _) = connect_async_tls_with_config(request, None, true, connector).await
            .map_err(|e| anyhow!("Could not connect to {url}: {e}"))?;
        let (mut sink, mut source) = ws.split();

        let (out_tx, mut out_rx) = mpsc::channel::<Message>(256);
        let (control_tx, control_rx) = mpsc::channel::<Value>(64);
        let (stream_tx, stream_rx) = mpsc::channel(64);

        let mux = Arc::new(Mux { out: out_tx, streams: Mutex::new(HashMap::new()), next_id: AtomicU32::new(1), closed: AtomicBool::new(false) });

        tokio::spawn(async move {
            while let Some(msg) = out_rx.recv().await {
                if sink.send(msg).await.is_err() { break; }
            }
            let _ = sink.close().await;
        });

        let ping_out = mux.out.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(PING_INTERVAL).await;
                if ping_out.send(Message::Text(r#"{"type":"ping"}"#.into())).await.is_err() { break; }
            }
        });

        let reader_mux = mux.clone();
        tokio::spawn(async move {
            loop {
                let msg = match tokio::time::timeout(DEAD_AFTER, source.next()).await {
                    Ok(Some(Ok(msg))) => msg,
                    _ => break,
                };
                match msg {
                    Message::Text(text) => {
                        let Ok(value) = serde_json::from_str::<Value>(&text) else { continue };
                        match value.get("type").and_then(|t| t.as_str()) {
                            Some("ping") => { let _ = reader_mux.out.send(Message::Text(r#"{"type":"pong"}"#.into())).await; }
                            Some("pong") => {}
                            Some(_) => { if control_tx.send(value).await.is_err() { break; } }
                            None => {}
                        }
                    }
                    Message::Binary(data) => {
                        if data.len() < 5 { continue; }
                        let kind = data[0];
                        let id = u32::from_be_bytes([data[1], data[2], data[3], data[4]]);
                        let payload = &data[5..];
                        if kind == OPEN {
                            let meta: OpenMeta = serde_json::from_slice(payload).unwrap_or_default();
                            let (writer, reader) = reader_mux.register(id);
                            if stream_tx.send((writer, reader, meta)).await.is_err() { break; }
                            continue;
                        }
                        let (tx, shared) = {
                            let streams = reader_mux.streams.lock().unwrap();
                            match streams.get(&id) { Some(e) => (e.tx.clone(), e.shared.upgrade()), None => continue }
                        };
                        match kind {
                            DATA => { let _ = tx.send(Incoming::Data(payload.to_vec())); }
                            DATAGRAM => { let _ = tx.send(Incoming::Datagram(payload.to_vec())); }
                            CLOSE => { let _ = tx.send(Incoming::Close); }
                            RESET => {
                                if let Some(s) = shared { s.dead.store(true, Ordering::Relaxed); }
                                let _ = tx.send(Incoming::Reset);
                                reader_mux.forget(id);
                            }
                            WINDOW_UPDATE => {
                                if payload.len() >= 4 {
                                    if let Some(s) = shared { s.credit.add(u32::from_be_bytes([payload[0], payload[1], payload[2], payload[3]])); }
                                }
                            }
                            _ => {}
                        }
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            reader_mux.shutdown();
        });

        Ok((mux, MuxEvents { control: control_rx, streams: stream_rx }))
    }

    fn register(self: &Arc<Self>, id: u32) -> (MuxWriter, MuxReader) {
        let (tx, rx) = mpsc::unbounded_channel();
        let shared = Arc::new(Shared {
            id, mux: self.clone(), credit: Credit::new(),
            dead: AtomicBool::new(false), close_sent: AtomicBool::new(false), close_received: AtomicBool::new(false),
        });
        self.streams.lock().unwrap().insert(id, Entry { tx, shared: Arc::downgrade(&shared) });
        (MuxWriter { shared: shared.clone() }, MuxReader { shared, rx, unacked: 0 })
    }

    pub async fn open(self: &Arc<Self>, meta: &OpenMeta) -> Result<(MuxWriter, MuxReader)> {
        if self.closed.load(Ordering::Relaxed) { bail!("not connected"); }
        let id = self.next_id.fetch_add(2, Ordering::Relaxed);
        let (writer, reader) = self.register(id);
        self.send(Message::Binary(encode(OPEN, id, serde_json::to_vec(meta)?.as_slice()).into())).await?;
        Ok((writer, reader))
    }

    pub async fn send_control(&self, message: Value) -> Result<()> {
        self.send(Message::Text(message.to_string().into())).await
    }

    pub async fn close(&self) {
        let _ = self.out.send(Message::Close(None)).await;
        self.shutdown();
    }

    async fn send(&self, msg: Message) -> Result<()> {
        if self.closed.load(Ordering::Relaxed) { bail!("connection closed"); }
        self.out.send(msg).await.map_err(|_| anyhow!("connection closed"))
    }

    fn try_send(&self, msg: Message) {
        if self.closed.load(Ordering::Relaxed) { return; }
        let out = self.out.clone();
        tokio::spawn(async move { let _ = out.send(msg).await; });
    }

    fn forget(&self, id: u32) {
        self.streams.lock().unwrap().remove(&id);
    }

    fn shutdown(&self) {
        self.closed.store(true, Ordering::Relaxed);
        let entries: Vec<Entry> = self.streams.lock().unwrap().drain().map(|(_, e)| e).collect();
        for entry in entries {
            if let Some(shared) = entry.shared.upgrade() { shared.dead.store(true, Ordering::Relaxed); }
            let _ = entry.tx.send(Incoming::Reset);
        }
    }
}

pub async fn expect(events: &mut MuxEvents, expected: &str) -> Result<Value> {
    match events.control.recv().await {
        Some(msg) => {
            let kind = msg.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if kind == "error" {
                let message = msg.get("message").and_then(|m| m.as_str()).unwrap_or("unknown error");
                let code = msg.get("code").and_then(|m| m.as_str()).unwrap_or("error");
                bail!("{message} ({code})");
            }
            if kind != expected { bail!("Unexpected message from server: {kind}"); }
            Ok(msg)
        }
        None => bail!("Connection closed by server"),
    }
}

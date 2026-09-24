use anyhow::{bail, Context, Result};
use serde_json::json;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::net::{TcpListener, UdpSocket};
use crate::api::ws_url;
use crate::config::{normalize_url, Config};
use crate::mux::{expect, Incoming, Mux, MuxEvents, MuxWriter, OpenMeta};
use crate::session::{Events, JoinEvent, Stop, Task};
use crate::shape::Shape;
use crate::tcp::{pump_tcp, UDP_IDLE};
use crate::tunnel::server_hello;

pub type PortPicker = Box<dyn Fn(u16) -> Result<u16> + Send + Sync>;

#[derive(Debug)]
pub struct PortInUse { pub port: u16, pub bind: String }

impl std::fmt::Display for PortInUse {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "Port {} is already in use on {}", self.port, self.bind)
    }
}

impl std::error::Error for PortInUse {}

pub struct Options {
    pub target: String,
    pub port: Option<u16>,
    pub bind: String,
    pub server: Option<String>,
    pub pick_port: Option<PortPicker>,
}

type Current = Arc<Mutex<Option<Arc<Mux>>>>;

async fn join(url: &str, code: &str, accept_invalid_certs: bool) -> Result<(Arc<Mux>, MuxEvents, u16, bool)> {
    let (mux, mut events) = Mux::connect(url, None, accept_invalid_certs).await?;
    mux.send_control(server_hello("joiner", None)).await?;
    expect(&mut events, "hello").await?;
    mux.send_control(json!({ "type": "join", "code": code })).await?;
    let msg = expect(&mut events, "joined").await?;
    let port = msg.get("port").and_then(|p| p.as_u64()).context("joined without port")? as u16;
    let online = msg.get("online").and_then(|o| o.as_bool()).unwrap_or(true);
    Ok((mux, events, port, online))
}

async fn bind(bind_addr: &str, port: u16, pick_port: Option<&PortPicker>) -> Result<(TcpListener, UdpSocket, u16)> {
    let mut port = port;
    loop {
        let addr: SocketAddr = format!("{bind_addr}:{port}").parse().with_context(|| format!("Invalid bind address {bind_addr}"))?;
        match (TcpListener::bind(addr).await, UdpSocket::bind(addr).await) {
            (Ok(tcp), Ok(udp)) => return Ok((tcp, udp, port)),
            _ => match pick_port {
                Some(pick) => port = pick(port)?,
                None => return Err(PortInUse { port, bind: bind_addr.to_string() }.into()),
            },
        }
    }
}

fn parse_scheme(rest: &str) -> Result<(String, Option<String>)> {
    let (path, query) = rest.split_once('?').unwrap_or((rest, ""));
    let code = path.trim_start_matches("connect").trim_matches('/').to_string();
    if code.is_empty() { bail!("That link carries no share code"); }

    let mut server = None;
    for pair in query.split('&') {
        let Some((key, value)) = pair.split_once('=') else { continue };
        if key != "server" { continue }
        let decoded = percent_decode(value);
        if !decoded.starts_with("http://") && !decoded.starts_with("https://") {
            bail!("The server in that link is not an http(s) address");
        }
        server = Some(decoded.trim_end_matches('/').to_string());
    }
    Ok((code, server))
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&value[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn parse_target(target: &str) -> Result<(String, Option<String>)> {
    let target = target.trim();
    if let Some(rest) = target.strip_prefix("tunlit://") {
        return parse_scheme(rest);
    }
    if let Some(rest) = target.strip_prefix("http://").or_else(|| target.strip_prefix("https://")) {
        let scheme = if target.starts_with("https://") { "https" } else { "http" };
        let (authority, path) = rest.split_once('/').unwrap_or((rest, ""));
        if authority.is_empty() { bail!("\"{target}\" has no server in it"); }
        let code = path.rsplit('/').find(|part| !part.is_empty()).unwrap_or("");
        if code.is_empty() { bail!("\"{target}\" has no share code in it"); }
        return Ok((code.to_string(), Some(format!("{scheme}://{authority}"))));
    }
    Ok((target.to_string(), None))
}

pub fn resolve(target: &str, server: Option<&str>) -> Result<(String, String, String)> {
    let (code, from_link) = parse_target(target)?;
    if code.is_empty() || !code.chars().all(|c| c.is_ascii_alphanumeric()) { bail!("The share code must be alphanumeric"); }
    if code.len() <= 26 { bail!("That share code is too short"); }
    let cfg = Config::load()?;
    let server_url = server.map(normalize_url).or(from_link).or_else(|| cfg.server_url())
        .ok_or_else(|| anyhow::anyhow!("No server in that code. Paste the whole link, or use --server <url>"))?;
    let tunnel_id = code[..code.len() - 26].to_string();
    Ok((code, tunnel_id, server_url))
}

fn is_fatal(text: &str) -> bool { text.contains("(invalid_code)") || text.contains("(not_found)") }

pub async fn run(opts: Options, out: Events<JoinEvent>, mut stop: Stop) -> Result<()> {
    let (code, tunnel_id, server_url) = resolve(&opts.target, opts.server.as_deref())?;
    let cfg = Config::load()?;
    let url = ws_url(&server_url);

    let _ = out.send(JoinEvent::Connecting);
    let joined = tokio::select! {
        result = join(&url, &code, cfg.accept_invalid_certs) => result,
        _ = stop.wait() => return Ok(()),
    };
    let (mux, mut events, remote_port, online) = joined?;

    let bound = bind(&opts.bind, opts.port.unwrap_or(remote_port), opts.pick_port.as_ref()).await;
    let (tcp, udp, local_port) = match bound {
        Ok(bound) => bound,
        Err(err) => {
            let _ = mux.send_control(json!({ "type": "bye" })).await;
            mux.close().await;
            return Err(err);
        }
    };
    let _ = out.send(JoinEvent::Forwarding { bind: opts.bind.clone(), port: local_port, tunnel_id, owner_online: online });

    let current: Current = Arc::new(Mutex::new(Some(mux.clone())));
    let _listeners = (Task(tokio::spawn(accept_tcp(tcp, current.clone()))), Task(tokio::spawn(accept_udp(udp, current.clone()))));

    let mut backoff = 1u64;
    loop {
        let lost = tokio::select! {
            ended = drain(&mut events) => {
                if let Some(reason) = ended {
                    *current.lock().unwrap() = None;
                    let _ = out.send(JoinEvent::Ended(reason));
                    return Ok(());
                }
                true
            }
            _ = stop.wait() => false,
        };
        if !lost {
            let session = current.lock().unwrap().take();
            if let Some(session) = session {
                let _ = session.send_control(json!({ "type": "bye" })).await;
                session.close().await;
            }
            let _ = out.send(JoinEvent::Stopped);
            return Ok(());
        }
        *current.lock().unwrap() = None;

        let mut reason = None;
        loop {
            let _ = out.send(JoinEvent::Reconnecting { seconds: backoff, reason: reason.take() });
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(backoff)) => {}
                _ = stop.wait() => { let _ = out.send(JoinEvent::Stopped); return Ok(()); }
            }
            let attempt = tokio::select! {
                result = join(&url, &code, cfg.accept_invalid_certs) => result,
                _ = stop.wait() => { let _ = out.send(JoinEvent::Stopped); return Ok(()); }
            };
            match attempt {
                Ok((new_mux, new_events, _, _)) => {
                    let _ = out.send(JoinEvent::Reconnected);
                    *current.lock().unwrap() = Some(new_mux);
                    events = new_events;
                    backoff = 1;
                    break;
                }
                Err(err) => {
                    let text = err.to_string();
                    if is_fatal(&text) { bail!("{text}"); }
                    backoff = (backoff * 2).min(30);
                    reason = Some(text);
                }
            }
        }
    }
}

async fn drain(events: &mut MuxEvents) -> Option<String> {
    loop {
        tokio::select! {
            msg = events.control.recv() => match msg {
                None => return None,
                Some(msg) => {
                    if msg.get("type").and_then(|t| t.as_str()) == Some("bye") {
                        return Some(msg.get("reason").and_then(|r| r.as_str()).unwrap_or("closed by the server").to_string());
                    }
                }
            },
            stream = events.streams.recv() => { if stream.is_none() { return None; } }
        }
    }
}

async fn accept_tcp(listener: TcpListener, current: Current) {
    loop {
        let Ok((socket, peer)) = listener.accept().await else { continue };
        let _ = socket.set_nodelay(true);
        let mux = current.lock().unwrap().clone();
        let Some(mux) = mux else { drop(socket); continue };
        tokio::spawn(async move {
            match mux.open(&OpenMeta::tcp(peer.to_string())).await {
                Ok((writer, reader)) => pump_tcp(socket, writer, reader, &Shape::default()).await,
                Err(_) => drop(socket),
            }
        });
    }
}

struct Flow { writer: MuxWriter, last_active: Arc<Mutex<Instant>> }

async fn accept_udp(socket: UdpSocket, current: Current) {
    let socket = Arc::new(socket);
    let flows: Arc<Mutex<HashMap<SocketAddr, Flow>>> = Arc::new(Mutex::new(HashMap::new()));
    let mut sweep = tokio::time::interval(Duration::from_secs(10));
    let mut buf = vec![0u8; 65535];
    loop {
        let (n, src) = tokio::select! {
            received = socket.recv_from(&mut buf) => match received { Ok(pair) => pair, Err(_) => continue },
            _ = sweep.tick() => {
                let expired: Vec<Flow> = {
                    let mut map = flows.lock().unwrap();
                    let dead: Vec<SocketAddr> = map.iter().filter(|(_, f)| f.last_active.lock().unwrap().elapsed() > UDP_IDLE).map(|(a, _)| *a).collect();
                    dead.into_iter().filter_map(|a| map.remove(&a)).collect()
                };
                for flow in expired { flow.writer.close().await; }
                continue;
            }
        };
        let existing = {
            let map = flows.lock().unwrap();
            map.get(&src).map(|f| { *f.last_active.lock().unwrap() = Instant::now(); f.writer.clone() })
        };
        let writer = match existing {
            Some(w) => w,
            None => {
                let mux = current.lock().unwrap().clone();
                let Some(mux) = mux else { continue };
                let Ok((writer, mut reader)) = mux.open(&OpenMeta::udp(src.to_string())).await else { continue };
                let last_active = Arc::new(Mutex::new(Instant::now()));
                let handle = writer.clone();
                flows.lock().unwrap().insert(src, Flow { writer, last_active: last_active.clone() });

                let socket = socket.clone();
                let flows = flows.clone();
                tokio::spawn(async move {
                    loop {
                        match reader.recv().await {
                            Incoming::Datagram(data) => { *last_active.lock().unwrap() = Instant::now(); let _ = socket.send_to(&data, src).await; }
                            Incoming::Close | Incoming::Reset => break,
                            Incoming::Data(_) => {}
                        }
                    }
                    flows.lock().unwrap().remove(&src);
                });
                handle
            }
        };
        let _ = writer.send_datagram(&buf[..n]).await;
    }
}

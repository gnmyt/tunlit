use tokio::sync::{mpsc, watch};

pub struct Request {
    pub kind: String,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub duration: u64,
    pub ip: String,
    pub country: Option<String>,
    pub org: Option<String>,
    pub flags: Vec<String>,
}

impl Request {
    pub fn from_control(message: &serde_json::Value) -> Self {
        let field = |key: &str| message.get(key).and_then(|value| value.as_str()).unwrap_or("").to_string();
        let optional = |key: &str| message.get(key).and_then(|value| value.as_str()).map(String::from);
        Self {
            kind: field("kind"),
            method: field("method"),
            path: field("path"),
            status: message.get("status").and_then(|value| value.as_u64()).unwrap_or(0) as u16,
            duration: message.get("duration").and_then(|value| value.as_u64()).unwrap_or(0),
            ip: field("ip"),
            country: optional("country"),
            org: optional("org"),
            flags: message.get("flags").and_then(|value| value.as_array()).map(|list| list.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default(),
        }
    }

    pub fn intel(&self) -> Option<String> {
        let parts: Vec<&str> = self.country.iter().chain(self.org.iter()).chain(self.flags.iter()).map(String::as_str).collect();
        if parts.is_empty() { None } else { Some(parts.join(" · ")) }
    }
}

#[derive(Clone)]
pub struct Online {
    pub id: String,
    pub url: Option<String>,
    pub share_code: Option<String>,
    pub connect_url: Option<String>,
    pub custom_urls: Vec<String>,
    pub persistent: bool,
    pub access: Option<String>,
}

impl Online {
    pub fn link(&self, server_url: &str) -> Option<String> {
        if let Some(url) = &self.url { return Some(url.clone()); }
        let code = self.share_code.as_ref()?;
        Some(self.connect_url.clone().unwrap_or_else(|| format!("{server_url}/@tunlit/connect/{code}")))
    }
}

pub enum TunnelEvent {
    Connecting,
    Online(Online),
    Resumed(Online),
    Replaced(Online),
    Request(Request),
    Access(String),
    Reconnecting { seconds: u64, reason: Option<String> },
    Stopped,
    Ended(String),
}

pub enum JoinEvent {
    Connecting,
    Forwarding { bind: String, port: u16, tunnel_id: String, owner_online: bool },
    Reconnecting { seconds: u64, reason: Option<String> },
    Reconnected,
    Stopped,
    Ended(String),
}

pub type Events<T> = mpsc::UnboundedSender<T>;

pub fn channel<T>() -> (Events<T>, mpsc::UnboundedReceiver<T>) { mpsc::unbounded_channel() }

#[derive(Clone)]
pub struct StopHandle(watch::Sender<bool>);

impl StopHandle {
    pub fn stop(&self) { let _ = self.0.send(true); }
}

pub struct Stop(watch::Receiver<bool>);

impl Stop {
    pub fn new() -> (StopHandle, Self) {
        let (tx, rx) = watch::channel(false);
        (StopHandle(tx), Self(rx))
    }

    pub fn subscribe(handle: &StopHandle) -> Self {
        Self(handle.0.subscribe())
    }

    pub async fn wait(&mut self) {
        if *self.0.borrow() { return; }
        while self.0.changed().await.is_ok() {
            if *self.0.borrow() { return; }
        }
        std::future::pending::<()>().await;
    }
}

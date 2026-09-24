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

pub struct Connection {
    pub opened: bool,
    pub protocol: String,
    pub ip: String,
    pub country: Option<String>,
    pub org: Option<String>,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub duration: u64,
    pub reason: Option<String>,
    pub detail: Option<String>,
}

impl Connection {
    pub fn from_control(message: &serde_json::Value) -> Self {
        let text = |key: &str| message.get(key).and_then(|value| value.as_str()).map(String::from);
        let number = |key: &str| message.get(key).and_then(|value| value.as_u64()).unwrap_or(0);
        let detail = message.get("detail").filter(|value| !value.is_null()).map(|value| {
            let name = value.get("name").and_then(|v| v.as_str()).unwrap_or("");
            match value.get("info").and_then(|v| v.as_str()) { Some(info) => format!("{name} {info}"), None => name.to_string() }
        });
        Self {
            opened: message.get("event").and_then(|value| value.as_str()) == Some("open"),
            protocol: text("protocol").unwrap_or_default().to_uppercase(),
            ip: text("ip").unwrap_or_default(),
            country: text("country"),
            org: text("org"),
            bytes_in: number("bytesIn"),
            bytes_out: number("bytesOut"),
            duration: number("duration"),
            reason: text("reason"),
            detail,
        }
    }

    pub fn intel(&self) -> Option<String> {
        let parts: Vec<&str> = self.country.iter().chain(self.org.iter()).map(String::as_str).collect();
        if parts.is_empty() { None } else { Some(parts.join(" · ")) }
    }

    pub fn line(&self) -> String {
        let mut parts = vec![format!("{:<4}", self.protocol), if self.opened { "open  ".to_string() } else { "closed".to_string() }, self.ip.clone()];
        if self.opened {
            if let Some(detail) = &self.detail { parts.push(detail.clone()); }
            if let Some(intel) = self.intel() { parts.push(intel); }
        } else {
            parts.push(format!("{} in, {} out, {}", bytes(self.bytes_in), bytes(self.bytes_out), seconds(self.duration)));
            if let Some(reason) = &self.reason { parts.push(reason.clone()); }
        }
        parts.join("  ")
    }
}

fn bytes(value: u64) -> String {
    const UNITS: [&str; 4] = ["B", "kB", "MB", "GB"];
    let mut size = value as f64;
    let mut unit = 0;
    while size >= 1000.0 && unit < UNITS.len() - 1 { size /= 1000.0; unit += 1; }
    if unit == 0 { format!("{value} B") } else { format!("{size:.1} {}", UNITS[unit]) }
}

fn seconds(millis: u64) -> String {
    if millis < 1000 { format!("{millis}ms") } else { format!("{:.1}s", millis as f64 / 1000.0) }
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
    Connection(Connection),
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

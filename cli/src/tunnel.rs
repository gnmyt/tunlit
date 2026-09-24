use anyhow::{bail, Context, Result};
use serde_json::json;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpStream;
use crate::api::ws_url;
use crate::config::Config;
use crate::mux::{expect, Mux, MuxEvents, OpenMeta};
use crate::router::{self, Route, RouteTarget};
use crate::serve;
use crate::session::{Connection, Events, Online, Request, Stop, Task, TunnelEvent};
use crate::shape::Shape;
use crate::tcp::{pump_tcp, pump_udp_owner};

pub const PROTOCOL_VERSION: u64 = 1;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub struct Target { pub host: String, pub port: u16, pub tls: bool }

impl Target {
    pub fn parse(raw: &str) -> Result<Self> {
        let raw = raw.trim();
        if let Ok(port) = raw.parse::<u16>() { return Ok(Self { host: "127.0.0.1".into(), port, tls: false }); }

        let (scheme, rest) = match raw.split_once("://") {
            Some((scheme, rest)) => (Some(scheme.to_ascii_lowercase()), rest.split(['/', '?', '#']).next().unwrap_or("")),
            None => (None, raw),
        };
        let default_port = match scheme.as_deref() {
            Some("https") => Some(443),
            Some("http") => Some(80),
            Some(other) => bail!("Invalid target \"{raw}\": {other}:// is not supported, use http:// or https://"),
            None => None,
        };
        let (host, port) = match rest.rsplit_once(':') {
            Some((host, port)) if !port.contains(']') => {
                (host, port.parse::<u16>().with_context(|| format!("Invalid port in \"{raw}\""))?)
            }
            _ => (rest, default_port.with_context(|| format!("Invalid target \"{raw}\": use <port>, <host>:<port> or https://<host>[:<port>]"))?),
        };
        let host = host.trim_matches(|c| c == '[' || c == ']');
        if host.is_empty() { bail!("Invalid target \"{raw}\""); }
        let tls = match scheme.as_deref() {
            Some("https") => true,
            Some(_) => false,
            None => port == 443,
        };
        Ok(Self { host: host.to_string(), port, tls })
    }

    pub fn authority(&self) -> String {
        if self.host.contains(':') { format!("[{}]:{}", self.host, self.port) } else { format!("{}:{}", self.host, self.port) }
    }

    pub fn label(&self) -> String {
        if self.tls { format!("https://{}", self.authority()) } else { self.authority() }
    }

    pub fn tls_connector(&self) -> Result<tokio_native_tls::TlsConnector> {
        let connector = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .danger_accept_invalid_hostnames(true)
            .use_sni(self.host.parse::<std::net::IpAddr>().is_err())
            .build()?;
        Ok(connector.into())
    }

    pub async fn resolve(&self) -> Result<Vec<SocketAddr>> {
        let addrs: Vec<SocketAddr> = tokio::net::lookup_host((self.host.as_str(), self.port)).await?.collect();
        if addrs.is_empty() { bail!("Could not resolve {}", self.host); }
        Ok(addrs)
    }
}

pub enum TargetSpec { Addr(Target), Dir(PathBuf), Routes(Vec<Route>) }

impl TargetSpec {
    pub fn with_routes(target: &str, routes: &[String]) -> Result<Self> {
        Self::routed(RouteTarget::parse(target)?, routes.iter().map(|raw| Route::parse(raw)).collect::<Result<_>>()?)
    }

    pub fn label(&self) -> String {
        match self {
            Self::Addr(target) => target.label(),
            Self::Dir(dir) => format!("{} (static files)", dir.display()),
            Self::Routes(routes) => format!("{} +{} routes", routes[0].target.label(), routes.len() - 1),
        }
    }

    pub fn dir(raw: &str) -> Result<Self> {
        Self::routed(RouteTarget::dir(raw)?, Vec::new())
    }

    pub fn routed(root: RouteTarget, mut routes: Vec<Route>) -> Result<Self> {
        if routes.is_empty() {
            return Ok(match root { RouteTarget::Addr(target) => Self::Addr(target), RouteTarget::Dir(dir) => Self::Dir(dir) });
        }
        routes.insert(0, Route::new("/", root)?);
        Ok(Self::Routes(routes))
    }

    pub fn parse(raw: &str) -> Result<Self> {
        let path = Path::new(raw);
        if path.is_dir() { return Ok(Self::Dir(path.to_path_buf())); }
        Ok(Self::Addr(Target::parse(raw)?))
    }
}

const CATEGORIES: [&str; 4] = ["tor", "vpn", "datacenter", "blocklist"];

#[derive(Clone, Default)]
pub struct Rules {
    pub allow_ips: Vec<String>,
    pub allow_countries: Vec<String>,
    pub block_ips: Vec<String>,
    pub block_countries: Vec<String>,
    pub block: Vec<String>,
}

fn split(values: Vec<String>) -> Vec<String> {
    values.iter().flat_map(|value| value.split(',')).map(str::trim).filter(|value| !value.is_empty()).map(String::from).collect()
}

fn countries(values: Vec<String>) -> Result<Vec<String>> {
    split(values).into_iter().map(|code| {
        let code = code.to_uppercase();
        if code.len() != 2 || !code.chars().all(|c| c.is_ascii_uppercase()) { bail!("\"{code}\" is not a country code"); }
        Ok(code)
    }).collect()
}

impl Rules {
    pub fn ips(allow_ips: Vec<String>) -> Self {
        Self { allow_ips, ..Self::default() }
    }

    pub fn new(allow_ips: Vec<String>, allow_countries: Vec<String>, block_ips: Vec<String>, block_countries: Vec<String>, block: Vec<String>) -> Result<Self> {
        let block = split(block).into_iter().map(|entry| {
            let entry = entry.to_lowercase();
            if !CATEGORIES.contains(&entry.as_str()) { bail!("\"{entry}\" is not one of {}", CATEGORIES.join(", ")); }
            Ok(entry)
        }).collect::<Result<_>>()?;
        Ok(Self { allow_ips: split(allow_ips), allow_countries: countries(allow_countries)?, block_ips: split(block_ips), block_countries: countries(block_countries)?, block })
    }

    fn is_empty(&self) -> bool {
        self.allow_ips.is_empty() && self.allow_countries.is_empty() && self.block_ips.is_empty() && self.block_countries.is_empty() && self.block.is_empty()
    }
}

#[derive(Clone)]
pub struct Access {
    pub rules: Rules,
    pub password: Option<String>,
    pub require_login: bool,
}

impl Access {
    pub fn new(rules: Rules, password: Option<String>, require_login: bool) -> Result<Self> {
        if password.is_some() && require_login {
            bail!("Use either --password or --require-login, not both");
        }
        Ok(Self { rules, password, require_login })
    }

    fn as_json(&self) -> Option<serde_json::Value> {
        if self.rules.is_empty() && self.password.is_none() && !self.require_login { return None; }
        let auth = if self.require_login { "tunlit" } else if self.password.is_some() { "password" } else { "none" };
        let rules = &self.rules;
        Some(json!({
            "auth": auth,
            "password": self.password,
            "allow": { "ips": rules.allow_ips, "countries": rules.allow_countries },
            "block": { "ips": rules.block_ips, "countries": rules.block_countries, "categories": rules.block },
        }))
    }
}

pub struct Options { pub mode: &'static str, pub target: TargetSpec, pub name: Option<String>, pub keep_host: bool, pub access: Access, pub shape: Shape }

impl Options {
    pub fn http(target: TargetSpec, name: Option<String>, keep_host: bool, access: Access) -> Self {
        Self { mode: "http", target, name, keep_host, access, shape: Shape::default() }
    }

    pub fn tcp(target: Target, name: Option<String>, access: Access) -> Self {
        Self { mode: "tcp", target: TargetSpec::Addr(target), name, keep_host: false, access, shape: Shape::default() }
    }

    pub fn shaped(self, shape: Shape) -> Self {
        Self { shape, ..self }
    }
}

pub fn server_hello(role: &str, token: Option<&str>) -> serde_json::Value {
    let mut hello = json!({ "type": "hello", "version": PROTOCOL_VERSION, "role": role, "client": format!("tunlit-cli/{}", env!("CARGO_PKG_VERSION")) });
    if let Some(token) = token { hello["token"] = json!(token); }
    hello
}

struct Registration { online: Online, resume_token: String }

async fn register(url: &str, token: &str, accept_invalid_certs: bool, opts: &Options, target: &Target, resume: Option<&str>) -> Result<(Arc<Mux>, MuxEvents, Registration)> {
    let (mux, mut events) = Mux::connect(url, Some(token), accept_invalid_certs).await?;
    mux.send_control(server_hello("owner", Some(token))).await?;
    expect(&mut events, "hello").await?;
    let mut message = json!({
        "type": "register", "mode": opts.mode, "target": target.authority(),
        "name": opts.name, "keepHost": opts.keep_host, "resume": resume,
    });
    if let Some(policy) = opts.access.as_json() {
        message["policy"] = policy;
    }
    mux.send_control(message).await?;
    let msg = expect(&mut events, "registered").await?;
    let get = |key: &str| msg.get(key).and_then(|v| v.as_str()).map(|s| s.to_string());
    let registration = Registration {
        online: Online {
            id: get("id").context("registered without id")?,
            url: get("url"),
            share_code: get("shareCode"),
            connect_url: get("connectUrl"),
            custom_urls: msg.get("customUrls").and_then(|v| v.as_array()).map(|list| list.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default(),
            persistent: msg.get("persistent").and_then(|v| v.as_bool()).unwrap_or(false),
            access: get("access"),
        },
        resume_token: get("resumeToken").context("registered without resume token")?,
    };
    Ok((mux, events, registration))
}

enum Ended {
    Dropped,
    Error(String),
    ByServer(String),
}

async fn serve_streams(events: &mut MuxEvents, target: &Target, shape: &Shape, out: &Events<TunnelEvent>) -> Ended {
    loop {
        tokio::select! {
            stream = events.streams.recv() => {
                let Some((writer, reader, meta)) = stream else { return Ended::Dropped };
                let target = target.clone();
                let shape = shape.clone();
                tokio::spawn(async move { handle_stream(writer, reader, meta, target, shape).await; });
            }
            control = events.control.recv() => match control {
                None => return Ended::Dropped,
                Some(msg) => match msg.get("type").and_then(|t| t.as_str()) {
                    Some("error") => return Ended::Error(msg.get("message").and_then(|m| m.as_str()).unwrap_or("unknown error").to_string()),
                    Some("bye") => return Ended::ByServer(msg.get("reason").and_then(|r| r.as_str()).unwrap_or("closed by the server").to_string()),
                    Some("request") => { let _ = out.send(TunnelEvent::Request(Request::from_control(&msg))); }
                    Some("connection") => { let _ = out.send(TunnelEvent::Connection(Connection::from_control(&msg))); }
                    Some("access") => { let _ = out.send(TunnelEvent::Access(msg.get("access").and_then(|v| v.as_str()).unwrap_or("open to anyone").to_string())); }
                    _ => {}
                },
            }
        }
    }
}

pub async fn connect_target(addrs: &[SocketAddr]) -> Result<TcpStream> {
    let mut last = anyhow::anyhow!("no address to connect to");
    for addr in addrs {
        match tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect(addr)).await {
            Ok(Ok(socket)) => { let _ = socket.set_nodelay(true); return Ok(socket); }
            Ok(Err(err)) => last = err.into(),
            Err(_) => last = anyhow::anyhow!("connect timed out"),
        }
    }
    Err(last)
}

async fn handle_stream(writer: crate::mux::MuxWriter, reader: crate::mux::MuxReader, meta: OpenMeta, target: Target, shape: Shape) {
    let Ok(addrs) = target.resolve().await else { writer.reset(); return };
    if meta.is_udp() {
        let _ = pump_udp_owner(addrs[0], writer, reader, &shape).await;
        return;
    }
    let Ok(socket) = connect_target(&addrs).await else { writer.reset(); return };
    if !target.tls { return pump_tcp(socket, writer, reader, &shape).await; }

    let handshake = async { target.tls_connector()?.connect(&target.host, socket).await.map_err(anyhow::Error::from) };
    match tokio::time::timeout(CONNECT_TIMEOUT, handshake).await {
        Ok(Ok(stream)) => pump_tcp(stream, writer, reader, &shape).await,
        _ => writer.reset(),
    }
}

pub async fn prepare(opts: Options) -> Result<(Options, Target, String, Option<Task>)> {
    let label = opts.target.label();
    let (target, local) = match opts.target {
        TargetSpec::Addr(target) => (target, None),
        TargetSpec::Dir(dir) => {
            if opts.mode == "tcp" { bail!("`tunlit tcp` needs a port or host:port, not a directory"); }
            local(serve::start(dir).await?)
        }
        TargetSpec::Routes(routes) => local(router::start(routes).await?),
    };
    Ok((Options { target: TargetSpec::Addr(target.clone()), ..opts }, target, label, local))
}

fn local((port, task): (u16, Task)) -> (Target, Option<Task>) {
    (Target { host: "127.0.0.1".into(), port, tls: false }, Some(task))
}

fn is_fatal(text: &str) -> bool {
    text.contains("(unauthorized)") || text.contains("(invalid_name)") || text.contains("(name_taken)") || text.contains("(name_reserved)") || text.contains("(quota_exceeded)")
}

pub async fn run(opts: Options, target: Target, out: Events<TunnelEvent>, mut stop: Stop) -> Result<()> {
    let cfg = Config::load()?;
    let (server_url, token) = cfg.require_auth()?;
    let url = ws_url(&server_url);

    let _ = out.send(TunnelEvent::Connecting);
    let first = tokio::select! {
        result = register(&url, &token, cfg.accept_invalid_certs, &opts, &target, None) => result,
        _ = stop.wait() => return Ok(()),
    };
    let (mut mux, mut events, mut reg) = first?;
    let _ = out.send(TunnelEvent::Online(reg.online.clone()));

    let mut backoff = 1u64;
    loop {
        let outcome = tokio::select! {
            result = serve_streams(&mut events, &target, &opts.shape, &out) => result,
            _ = stop.wait() => {
                let _ = mux.send_control(json!({ "type": "bye" })).await;
                mux.close().await;
                let _ = out.send(TunnelEvent::Stopped);
                return Ok(());
            }
        };
        match outcome {
            Ended::Error(message) => bail!("Server error: {message}"),
            Ended::ByServer(reason) => {
                let _ = out.send(TunnelEvent::Ended(reason));
                return Ok(());
            }
            Ended::Dropped => {}
        }

        let mut reason = None;
        loop {
            let _ = out.send(TunnelEvent::Reconnecting { seconds: backoff, reason: reason.take() });
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(backoff)) => {}
                _ = stop.wait() => { let _ = out.send(TunnelEvent::Stopped); return Ok(()); }
            }
            let attempt = tokio::select! {
                result = register(&url, &token, cfg.accept_invalid_certs, &opts, &target, Some(&reg.resume_token)) => result,
                _ = stop.wait() => { let _ = out.send(TunnelEvent::Stopped); return Ok(()); }
            };
            match attempt {
                Ok((new_mux, new_events, new_reg)) => {
                    let same = new_reg.online.id == reg.online.id;
                    mux = new_mux; events = new_events; reg = new_reg;
                    let _ = out.send(if same { TunnelEvent::Resumed(reg.online.clone()) } else { TunnelEvent::Replaced(reg.online.clone()) });
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

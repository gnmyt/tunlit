use anyhow::{bail, Context, Result};
use console::style;
use indicatif::{ProgressBar, ProgressStyle};
use serde_json::json;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpStream;
use crate::api::ws_url;
use crate::config::Config;
use crate::mux::{expect, Mux, MuxEvents, OpenMeta};
use crate::qr;
use crate::serve;
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

    fn tls_connector(&self) -> Result<tokio_native_tls::TlsConnector> {
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

pub enum TargetSpec { Addr(Target), Dir(PathBuf) }

impl TargetSpec {
    pub fn dir(raw: &str) -> Result<Self> {
        let path = Path::new(raw);
        if !path.exists() { bail!("\"{raw}\" does not exist"); }
        if !path.is_dir() { bail!("\"{raw}\" is not a directory - use `tunlit http {raw}` for a port or host:port"); }
        Ok(Self::Dir(path.to_path_buf()))
    }

    pub fn parse(raw: &str) -> Result<Self> {
        let path = Path::new(raw);
        if path.is_dir() { return Ok(Self::Dir(path.to_path_buf())); }
        Ok(Self::Addr(Target::parse(raw)?))
    }
}

#[derive(Clone)]
pub struct Access {
    pub allowed_ips: Vec<String>,
    pub password: Option<String>,
    pub require_login: bool,
}

impl Access {
    pub fn new(allow: Vec<String>, password: Option<String>, require_login: bool) -> Result<Self> {
        if password.is_some() && require_login {
            bail!("Use either --password or --require-login, not both");
        }
        Ok(Self { allowed_ips: allow, password, require_login })
    }

    fn as_json(&self) -> Option<serde_json::Value> {
        if self.allowed_ips.is_empty() && self.password.is_none() && !self.require_login { return None; }
        let auth = if self.require_login { "tunlit" } else if self.password.is_some() { "password" } else { "none" };
        Some(json!({ "allowedIps": self.allowed_ips, "auth": auth, "password": self.password }))
    }

    pub fn summary(&self) -> Option<String> {
        let mut parts = Vec::new();
        if self.require_login { parts.push("tunlit login required".to_string()); }
        if self.password.is_some() { parts.push("password protected".to_string()); }
        if !self.allowed_ips.is_empty() { parts.push(format!("allowed: {}", self.allowed_ips.join(", "))); }
        if parts.is_empty() { None } else { Some(parts.join(" · ")) }
    }
}

pub struct Options { pub mode: &'static str, pub target: TargetSpec, pub name: Option<String>, pub keep_host: bool, pub access: Access }

pub fn spinner(message: &str) -> ProgressBar {
    let spinner = ProgressBar::new_spinner();
    spinner.set_style(ProgressStyle::default_spinner().template("{spinner:.green} {msg}").unwrap());
    spinner.set_message(message.to_string());
    spinner.enable_steady_tick(Duration::from_millis(100));
    spinner
}

pub fn server_hello(role: &str, token: Option<&str>) -> serde_json::Value {
    let mut hello = json!({ "type": "hello", "version": PROTOCOL_VERSION, "role": role, "client": format!("tunlit-cli/{}", env!("CARGO_PKG_VERSION")) });
    if let Some(token) = token { hello["token"] = json!(token); }
    hello
}

struct Registration { id: String, url: Option<String>, share_code: Option<String>, connect_url: Option<String>, resume_token: String }

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
        id: get("id").context("registered without id")?,
        url: get("url"),
        share_code: get("shareCode"),
        connect_url: get("connectUrl"),
        resume_token: get("resumeToken").context("registered without resume token")?,
    };
    Ok((mux, events, registration))
}

fn print_ready(reg: &Registration, target: &Target, label: &str, server_url: &str, resumed: bool, access: &Access) {
    if resumed {
        println!("{} Reconnected, tunnel {} is back online", style("✓").green().bold(), style(&reg.id).cyan());
        return;
    }
    println!("{} Tunnel {} is online", style("✓").green().bold(), style(&reg.id).cyan().bold());
    if let Some(url) = &reg.url {
        println!("  {}  {}  {}", style(url).cyan().bold().underlined(), style("→").dim(), style(label).bold());
        println!();
        qr::print(url);
        qr::copy(url);
    } else if let Some(code) = &reg.share_code {
        let link = reg.connect_url.clone().unwrap_or_else(|| format!("{server_url}/@tunlit/connect/{code}"));
        println!("  Forwarding {} (tcp+udp)", style(target.label()).bold());
        println!("  Others run: {}", style(format!("tunlit connect {link}")).cyan().bold());
        println!();
        qr::print(&link);
        qr::copy(&format!("tunlit connect {link}"));
    }
    if let Some(summary) = access.summary() {
        println!("  {} {}", style("Access:").dim(), style(summary).yellow());
    }
    println!("Press {} to stop.", style("Ctrl+C").bold());
}

enum Ended {
    Dropped,
    Error(String),
    ByServer(String),
}

async fn serve_streams(events: &mut MuxEvents, target: &Target) -> Ended {
    loop {
        tokio::select! {
            stream = events.streams.recv() => {
                let Some((writer, reader, meta)) = stream else { return Ended::Dropped };
                let target = target.clone();
                tokio::spawn(async move { handle_stream(writer, reader, meta, target).await; });
            }
            control = events.control.recv() => match control {
                None => return Ended::Dropped,
                Some(msg) => match msg.get("type").and_then(|t| t.as_str()) {
                    Some("error") => return Ended::Error(msg.get("message").and_then(|m| m.as_str()).unwrap_or("unknown error").to_string()),
                    Some("bye") => return Ended::ByServer(msg.get("reason").and_then(|r| r.as_str()).unwrap_or("closed by the server").to_string()),
                    Some("request") => print_request(&msg),
                    _ => {}
                },
            }
        }
    }
}

fn print_request(message: &serde_json::Value) {
    let field = |key: &str| message.get(key).and_then(|value| value.as_str()).unwrap_or("").to_string();
    let status = message.get("status").and_then(|value| value.as_u64()).unwrap_or(0);
    let duration = message.get("duration").and_then(|value| value.as_u64()).unwrap_or(0);
    let method = field("method");
    let path = field("path");

    let coloured_status = match status {
        200..=299 => style(status).green(),
        300..=399 => style(status).cyan(),
        400..=499 => style(status).yellow(),
        _ => style(status).red(),
    };
    let label = if field("kind") == "ws" { style("WS ").magenta().to_string() } else { style(format!("{method:<4}")).bold().to_string() };
    println!("{} {} {} {}", label, coloured_status.bold(), style(path).dim(), style(format!("{duration}ms")).dim());
}

async fn connect_target(addrs: &[SocketAddr]) -> Result<TcpStream> {
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

async fn handle_stream(writer: crate::mux::MuxWriter, reader: crate::mux::MuxReader, meta: OpenMeta, target: Target) {
    let Ok(addrs) = target.resolve().await else { writer.reset(); return };
    if meta.is_udp() {
        if pump_udp_owner(addrs[0], writer, reader).await.is_err() { /* stream was reset on error */ }
        return;
    }
    let Ok(socket) = connect_target(&addrs).await else { writer.reset(); return };
    if !target.tls { return pump_tcp(socket, writer, reader).await; }

    let handshake = async { target.tls_connector()?.connect(&target.host, socket).await.map_err(anyhow::Error::from) };
    match tokio::time::timeout(CONNECT_TIMEOUT, handshake).await {
        Ok(Ok(stream)) => pump_tcp(stream, writer, reader).await,
        _ => writer.reset(),
    }
}

pub async fn run(opts: Options) -> Result<()> {
    let cfg = Config::load()?;
    let (server_url, token) = cfg.require_auth()?;
    let url = ws_url(&server_url);

    let (target, label) = match &opts.target {
        TargetSpec::Addr(target) => (target.clone(), target.label()),
        TargetSpec::Dir(dir) => {
            if opts.mode == "tcp" { bail!("`tunlit tcp` needs a port or host:port, not a directory"); }
            let port = serve::start(dir.clone()).await?;
            let shown = if dir == Path::new(".") { std::env::current_dir().map(|d| d.display().to_string()).unwrap_or_else(|_| ".".into()) } else { dir.display().to_string() };
            (Target { host: "127.0.0.1".into(), port, tls: false }, format!("{shown} (static files)"))
        }
    };

    let spin = spinner("Connecting to server...");
    let first = register(&url, &token, cfg.accept_invalid_certs, &opts, &target, None).await;
    spin.finish_and_clear();
    let (mut mux, mut events, mut reg) = first?;
    print_ready(&reg, &target, &label, &server_url, false, &opts.access);

    let mut backoff = 1u64;
    loop {
        let outcome = tokio::select! {
            result = serve_streams(&mut events, &target) => result,
            _ = tokio::signal::ctrl_c() => {
                let _ = mux.send_control(json!({ "type": "bye" })).await;
                mux.close().await;
                println!("\n{} Tunnel closed", style("✓").green().bold());
                return Ok(());
            }
        };
        match outcome {
            Ended::Error(message) => bail!("Server error: {message}"),
            Ended::ByServer(reason) => {
                println!("{} Tunnel ended: {}", style("✓").green().bold(), style(reason).dim());
                return Ok(());
            }
            Ended::Dropped => {}
        }

        let spin = spinner("Connection lost, reconnecting...");
        loop {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(backoff)) => {}
                _ = tokio::signal::ctrl_c() => { spin.finish_and_clear(); println!("{} Stopped", style("✓").green().bold()); return Ok(()); }
            }
            match register(&url, &token, cfg.accept_invalid_certs, &opts, &target, Some(&reg.resume_token)).await {
                Ok((new_mux, new_events, new_reg)) => {
                    spin.finish_and_clear();
                    let same = new_reg.id == reg.id;
                    mux = new_mux; events = new_events; reg = new_reg;
                    if same { print_ready(&reg, &target, &label, &server_url, true, &opts.access); }
                    else {
                        println!("{} The old tunnel expired, a new one was created", style("!").yellow().bold());
                        print_ready(&reg, &target, &label, &server_url, false, &opts.access);
                    }
                    backoff = 1;
                    break;
                }
                Err(err) => {
                    let text = err.to_string();
                    if text.contains("(unauthorized)") || text.contains("(invalid_name)") || text.contains("(name_taken)") { spin.finish_and_clear(); bail!("{text}"); }
                    backoff = (backoff * 2).min(30);
                    spin.set_message(format!("Reconnecting in {backoff}s... ({text})"));
                }
            }
        }
    }
}

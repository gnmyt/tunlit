use anyhow::{bail, Context, Result};
use console::style;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tokio::sync::mpsc::UnboundedReceiver;
use crate::config::Config;
use crate::session::{self, Stop, StopHandle, TunnelEvent};
use crate::tunnel::{self, Access, Options, Target, TargetSpec};

pub const EXAMPLE: &str = "tunnels:\n  myapp:\n    http: 3000\n  db:\n    tcp: 5432\n    allow: [10.0.0.0/8]\n";

#[derive(Deserialize)]
struct Manifest {
    #[serde(default)]
    tunnels: BTreeMap<String, Entry>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Endpoint { Port(u16), Text(String) }

impl Endpoint {
    fn text(&self) -> String {
        match self { Self::Port(port) => port.to_string(), Self::Text(text) => text.clone() }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    http: Option<Endpoint>,
    serve: Option<PathBuf>,
    tcp: Option<Endpoint>,
    #[serde(default)] keep_host: bool,
    #[serde(default)] allow: Vec<String>,
    password: Option<String>,
    #[serde(default)] require_login: bool,
}

impl Entry {
    fn options(self, name: &str) -> Result<Options> {
        let access = Access::new(self.allow, self.password, self.require_login)?;
        let id = Some(name.to_string());
        match (self.http, self.serve, self.tcp) {
            (Some(http), None, None) => Ok(Options::http(TargetSpec::Addr(Target::parse(&http.text())?), id, self.keep_host, access)),
            (None, Some(dir), None) => Ok(Options::http(TargetSpec::dir(&dir.to_string_lossy())?, id, false, access)),
            (None, None, Some(tcp)) => Ok(Options::tcp(Target::parse(&tcp.text())?, id, access)),
            _ => bail!("{name}: set exactly one of http, serve or tcp"),
        }
    }
}

pub fn default_path() -> Result<PathBuf> {
    Ok(dirs::config_dir().context("No config directory")?.join("tunlit").join("tunnels.yml"))
}

pub fn load(path: &Path) -> Result<Vec<(String, Options)>> {
    let text = std::fs::read_to_string(path).with_context(|| format!("Could not read {}", path.display()))?;
    let manifest: Manifest = serde_yaml_ng::from_str(&text).with_context(|| format!("{} is not valid", path.display()))?;
    if manifest.tunnels.is_empty() { bail!("{} defines no tunnels", path.display()); }
    manifest.tunnels.into_iter().map(|(name, entry)| Ok((name.clone(), entry.options(&name)?))).collect()
}

fn log(name: &str, message: impl std::fmt::Display) {
    println!("{} {message}", style(format!("[{name}]")).cyan().bold());
}

async fn print(name: String, mut rx: UnboundedReceiver<TunnelEvent>) {
    while let Some(event) = rx.recv().await {
        match event {
            TunnelEvent::Connecting => {}
            TunnelEvent::Online(online) | TunnelEvent::Replaced(online) => {
                match &online.url {
                    Some(url) => log(&name, format!("online {}", style(url).underlined())),
                    None => log(&name, format!("online, share code {}", online.share_code.as_deref().unwrap_or(""))),
                }
                for url in &online.custom_urls { log(&name, format!("       {}", style(url).underlined())); }
            }
            TunnelEvent::Resumed(_) => log(&name, "reconnected"),
            TunnelEvent::Request(request) => log(&name, format!("{} {} {} {}ms", request.method, request.status, request.path, request.duration)),
            TunnelEvent::Reconnecting { seconds, reason } => match reason {
                Some(reason) => log(&name, format!("reconnecting in {seconds}s ({reason})")),
                None => log(&name, "connection lost, reconnecting"),
            },
            TunnelEvent::Stopped => log(&name, "stopped"),
            TunnelEvent::Ended(reason) => log(&name, format!("ended: {reason}")),
        }
    }
}

async fn wait_for_signal(stop: StopHandle) {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut term = signal(SignalKind::terminate()).expect("SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    { let _ = tokio::signal::ctrl_c().await; }
    stop.stop();
}

pub async fn run(path: Option<PathBuf>) -> Result<()> {
    let path = match path { Some(path) => path, None => default_path()? };
    Config::load()?.require_auth()?;
    let tunnels = load(&path)?;
    println!("{} Starting {} tunnel{} from {}", style("✓").green().bold(), tunnels.len(), if tunnels.len() == 1 { "" } else { "s" }, style(path.display()).dim());

    let (handle, _) = Stop::new();
    tokio::spawn(wait_for_signal(handle.clone()));

    let mut tasks = Vec::new();
    for (name, opts) in tunnels {
        let (events, rx) = session::channel();
        let stop = Stop::subscribe(&handle);
        let printer = tokio::spawn(print(name.clone(), rx));
        tasks.push(tokio::spawn(async move {
            let result = async {
                let (target, _) = tunnel::prepare(&opts).await?;
                tunnel::run(opts, target, events, stop).await
            }.await;
            if let Err(err) = &result { log(&name, format!("{} {err:#}", style("failed:").red())); }
            let _ = printer.await;
            result.is_ok()
        }));
    }

    let mut ok = true;
    for task in tasks { ok &= task.await.unwrap_or(false); }
    if ok { Ok(()) } else { bail!("Not every tunnel came up") }
}

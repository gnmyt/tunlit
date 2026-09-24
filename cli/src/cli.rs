use anyhow::Result;
use console::style;
use dialoguer::{Input, Select};
use indicatif::{ProgressBar, ProgressStyle};
use std::future::Future;
use std::io::IsTerminal;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedReceiver;
use crate::auth::{self, LoginEvent};
use crate::config::Config;
use crate::connect;
use crate::qr;
use crate::session::{self, Events, JoinEvent, Online, Request, Stop, TunnelEvent};
use crate::shape::Shape;
use crate::tui;
use crate::tunnel::{self, Options};

#[derive(serde::Deserialize)]
struct Me { username: String }

fn ok() -> console::StyledObject<&'static str> { style("✓").green().bold() }
fn warn() -> console::StyledObject<&'static str> { style("!").yellow().bold() }

#[derive(Default)]
struct Printer { spinner: Option<ProgressBar> }

impl Printer {
    fn busy(&mut self, message: String) {
        match &self.spinner {
            Some(spinner) => spinner.set_message(message),
            None => {
                let spinner = ProgressBar::new_spinner();
                spinner.set_style(ProgressStyle::default_spinner().template("{spinner:.green} {msg}").unwrap());
                spinner.set_message(message);
                spinner.enable_steady_tick(Duration::from_millis(100));
                self.spinner = Some(spinner);
            }
        }
    }

    fn idle(&mut self) {
        if let Some(spinner) = self.spinner.take() { spinner.finish_and_clear(); }
    }

    fn reconnecting(&mut self, seconds: u64, reason: Option<String>) {
        match reason {
            None => self.busy("Connection lost, reconnecting...".into()),
            Some(text) => self.busy(format!("Reconnecting in {seconds}s... ({text})")),
        }
    }
}

fn session<E>() -> (Events<E>, UnboundedReceiver<E>, Stop) {
    let (events, rx) = session::channel();
    let (handle, stop) = Stop::new();
    tokio::spawn(async move {
        let _ = tokio::signal::ctrl_c().await;
        handle.stop();
    });
    (events, rx, stop)
}

async fn printed<E: Send + 'static>(
    mut rx: UnboundedReceiver<E>,
    mut print: impl FnMut(&mut Printer, E) + Send + 'static,
    work: impl Future<Output = Result<()>>,
) -> Result<()> {
    let printer = tokio::spawn(async move {
        let mut printer = Printer::default();
        while let Some(event) = rx.recv().await { print(&mut printer, event); }
        printer.idle();
    });
    let result = work.await;
    let _ = printer.await;
    result
}

fn print_ready(online: &Online, target_label: &str, server_url: &str, shape: &Shape) {
    let kind = if online.persistent { style(" (persistent)").dim().to_string() } else { String::new() };
    println!("{} Tunnel {} is online{kind}", ok(), style(&online.id).cyan().bold());
    if let Some(url) = &online.url {
        println!("  {}  {}  {}", style(url).cyan().bold().underlined(), style("→").dim(), style(target_label).bold());
        for custom in &online.custom_urls {
            println!("  {}", style(custom).cyan().underlined());
        }
        println!();
        qr::print(url);
        if qr::copy(url) { println!("{} Copied to clipboard", ok()); }
    } else if let Some(link) = online.link(server_url) {
        println!("  Forwarding {} (tcp+udp)", style(target_label).bold());
        println!("  Others run: {}", style(format!("tunlit connect {link}")).cyan().bold());
        println!();
        qr::print(&link);
        if qr::copy(&format!("tunlit connect {link}")) { println!("{} Copied to clipboard", ok()); }
    }
    if let Some(summary) = &online.access {
        println!("  {} {}", style("Access:").dim(), style(summary).yellow());
    }
    if let Some(summary) = shape.summary() {
        println!("  {} {}", style("Network:").dim(), style(summary).yellow());
    }
    println!("Press {} to stop.", style("Ctrl+C").bold());
}

fn print_request(request: &Request) {
    let status = match request.status {
        200..=299 => style(request.status).green(),
        300..=399 => style(request.status).cyan(),
        400..=499 => style(request.status).yellow(),
        _ => style(request.status).red(),
    };
    let label = if request.kind == "ws" { style("WS ").magenta().to_string() } else { style(format!("{:<4}", request.method)).bold().to_string() };
    let intel = request.intel().map(|text| format!("  {text}")).unwrap_or_default();
    println!("{} {} {} {}{}", label, status.bold(), style(&request.path).dim(), style(format!("{}ms", request.duration)).dim(), style(intel).dim());
}

pub async fn tunnel(opts: Options, plain: bool) -> Result<()> {
    let cfg = Config::load()?;
    let (server_url, token) = cfg.require_auth()?;
    let (opts, target, label, _local) = tunnel::prepare(opts).await?;
    let shape = opts.shape.clone();

    if !plain && std::io::stdout().is_terminal() {
        let api = crate::api::ApiClient::new(&server_url, Some(&token), cfg.accept_invalid_certs)?;
        let me: Me = api.get("/auth/me").await?;
        let ctx = tui::Context { server_url, account: me.username, target: label, network: shape.summary(), tcp: opts.mode == "tcp" };
        let (events, rx) = session::channel();
        let (handle, stop) = Stop::new();
        let ui = tokio::spawn(tui::run(rx, handle, ctx));
        let result = tunnel::run(opts, target, events, stop).await;
        match ui.await?? {
            Some(reason) => println!("{} Tunnel ended: {}", warn(), style(reason).dim()),
            None => println!("{} Tunnel closed", ok()),
        }
        return result;
    }

    let (events, rx, stop) = session();
    printed(rx, move |printer, event| match event {
        TunnelEvent::Connecting => printer.busy("Connecting to server...".into()),
        TunnelEvent::Online(online) => { printer.idle(); print_ready(&online, &label, &server_url, &shape); }
        TunnelEvent::Resumed(online) => { printer.idle(); println!("{} Reconnected, tunnel {} is back online", ok(), style(&online.id).cyan()); }
        TunnelEvent::Replaced(online) => {
            printer.idle();
            println!("{} The old tunnel expired, a new one was created", warn());
            print_ready(&online, &label, &server_url, &shape);
        }
        TunnelEvent::Request(request) => print_request(&request),
        TunnelEvent::Connection(connection) => println!("{}", style(connection.line()).dim()),
        TunnelEvent::Access(summary) => println!("{} {}", style("Access:").dim(), style(summary).yellow()),
        TunnelEvent::Reconnecting { seconds, reason } => printer.reconnecting(seconds, reason),
        TunnelEvent::Stopped => { printer.idle(); println!("\n{} Tunnel closed", ok()); }
        TunnelEvent::Ended(reason) => { printer.idle(); println!("{} Tunnel ended: {}", ok(), style(reason).dim()); }
    }, tunnel::run(opts, target, events, stop)).await
}

pub async fn connect(target: String, port: Option<u16>, bind: String, server: Option<String>) -> Result<()> {
    let explicit = port.is_some();
    let pick_port: connect::PortPicker = Box::new(move |taken| {
        println!("{} Port {} is already in use", warn(), style(taken).bold());
        if explicit || !console::user_attended() { anyhow::bail!("Choose another port with --port"); }
        Ok(Input::new().with_prompt("Local port to use instead").default(taken + 1).interact_text()?)
    });
    let opts = connect::Options { target, port, bind, server, pick_port: Some(pick_port) };
    let (events, rx, stop) = session();

    printed(rx, |printer, event| match event {
        JoinEvent::Connecting => printer.busy("Connecting to server...".into()),
        JoinEvent::Forwarding { bind, port, tunnel_id, owner_online } => {
            printer.idle();
            println!("{} Forwarding {} (tcp+udp) {} {}", ok(),
                style(format!("{bind}:{port}")).cyan().bold(), style("→").dim(), style(&tunnel_id).bold().green());
            if !owner_online { println!("{} The owner is currently offline, connections will work once it is back", warn()); }
            println!("Press {} to stop.", style("Ctrl+C").bold());
        }
        JoinEvent::Reconnecting { seconds, reason } => printer.reconnecting(seconds, reason),
        JoinEvent::Reconnected => { printer.idle(); println!("{} Reconnected", ok()); }
        JoinEvent::Stopped => { printer.idle(); println!("\n{} Stopped", ok()); }
        JoinEvent::Ended(reason) => { printer.idle(); println!("{} Disconnected: {}", ok(), style(reason).dim()); }
    }, connect::run(opts, events, stop)).await
}

#[derive(serde::Deserialize)]
struct Listed {
    id: String,
    target: String,
    url: Option<String>,
    online: bool,
    #[serde(rename = "graceUntil")] grace_until: Option<u64>,
    joiners: u64,
    persistent: bool,
    #[serde(rename = "customUrls")] custom_urls: Vec<String>,
}

#[derive(serde::Deserialize)]
struct Tunnels { tunnels: Vec<Listed>, now: u64 }

#[derive(serde::Deserialize)]
struct Saved { name: String, url: String, live: bool }

#[derive(serde::Deserialize)]
struct Persistent { tunnels: Vec<Saved> }

fn mark(name: &str, persistent: bool) -> String { if persistent { format!("{name} *") } else { name.to_string() } }

pub async fn list() -> Result<()> {
    let cfg = Config::load()?;
    let (server_url, token) = cfg.require_auth()?;
    let api = crate::api::ApiClient::new(&server_url, Some(&token), cfg.accept_invalid_certs)?;
    let (live, saved): (Tunnels, Persistent) = tokio::try_join!(api.get("/tunnels"), api.get("/persistent"))?;

    let mut rows: Vec<[String; 4]> = live.tunnels.iter().map(|tunnel| {
        let state = if tunnel.online { style("● online").green().to_string() }
            else if let Some(until) = tunnel.grace_until { style(format!("○ closes in {}s", until.saturating_sub(live.now) / 1000)).yellow().to_string() }
            else { style("○ offline").yellow().to_string() };
        let address = match &tunnel.url {
            Some(url) => std::iter::once(url.as_str()).chain(tunnel.custom_urls.iter().map(String::as_str)).collect::<Vec<_>>().join(", "),
            None => format!("tcp+udp · {} connected", tunnel.joiners),
        };
        [mark(&tunnel.id, tunnel.persistent), state, address, tunnel.target.clone()]
    }).collect();
    rows.extend(saved.tunnels.iter().filter(|saved| !saved.live)
        .map(|saved| [mark(&saved.name, true), style("○ offline").dim().to_string(), saved.url.clone(), String::new()]));

    if rows.is_empty() {
        println!("No tunnels. Start one with {}", style("tunlit http 3000").cyan());
        return Ok(());
    }
    let widths: Vec<usize> = (0..3).map(|column| rows.iter().map(|row| console::measure_text_width(&row[column])).max().unwrap()).collect();
    for [name, state, address, target] in &rows {
        println!("{}  {}  {}  {}",
            style(console::pad_str(name, widths[0], console::Alignment::Left, None)).bold(),
            console::pad_str(state, widths[1], console::Alignment::Left, None),
            style(console::pad_str(address, widths[2], console::Alignment::Left, None)).cyan(),
            style(target).dim());
    }
    if rows.iter().any(|row| row[0].ends_with('*')) { println!("{}", style("* persistent").dim()); }
    Ok(())
}

pub async fn login() -> Result<()> {
    let cfg = Config::load()?;

    let server_url: String = if let Some(ref url) = cfg.server_url {
        println!("Current server: {}", style(url).cyan());
        let choice = Select::new().with_prompt("Server URL")
            .items(["Keep current server", "Enter a new server URL"]).default(0).interact()?;
        if choice == 0 { url.clone() } else { Input::new().with_prompt("Server URL").interact_text()? }
    } else {
        Input::new().with_prompt("Server URL (e.g. https://tunlit.example.com)").interact_text()?
    };
    let (events, rx, stop) = session();

    printed(rx, |printer, event| match event {
        LoginEvent::Code { code, handoff_url } => {
            println!();
            println!("  Approve this device at {}", style(&handoff_url).cyan().bold().underlined());
            println!("  Code: {}", style(&code).bold().green());
            if open::that_detached(&handoff_url).is_ok() {
                println!("  {}", style("Opened in your browser.").dim());
            }
            println!();
            printer.busy("Waiting for approval...".into());
        }
        LoginEvent::Linked { server_url, info } => {
            printer.idle();
            println!("{} This device is linked to {} ({} {})", ok(), style(&server_url).cyan().bold(), info.name, info.version);
            println!("  Tunnels will be created under {}", style(&info.base_domain).cyan());
        }
    }, auth::link(&server_url, cfg.accept_invalid_certs, events, stop)).await
}

pub fn logout() -> Result<()> {
    if !auth::logout()? {
        println!("This device is not linked.");
        return Ok(());
    }
    println!("{} Token removed from this device", ok());
    println!("  {}", style("Revoke it on the server under Settings › Devices.").dim());
    Ok(())
}

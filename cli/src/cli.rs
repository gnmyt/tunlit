use anyhow::Result;
use console::style;
use dialoguer::{Input, Select};
use indicatif::{ProgressBar, ProgressStyle};
use std::future::Future;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedReceiver;
use crate::auth::{self, LoginEvent};
use crate::config::Config;
use crate::connect;
use crate::qr;
use crate::session::{self, Events, JoinEvent, Online, Request, Stop, TunnelEvent};
use crate::tunnel::{self, Access, Options};

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

fn print_ready(online: &Online, target_label: &str, server_url: &str, access: &Access) {
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
    if let Some(summary) = access.summary() {
        println!("  {} {}", style("Access:").dim(), style(summary).yellow());
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
    println!("{} {} {} {}", label, status.bold(), style(&request.path).dim(), style(format!("{}ms", request.duration)).dim());
}

pub async fn tunnel(opts: Options) -> Result<()> {
    let cfg = Config::load()?;
    let (server_url, _) = cfg.require_auth()?;
    let (opts, target, label) = tunnel::prepare(opts).await?;
    let access = opts.access.clone();
    let (events, rx, stop) = session();

    printed(rx, move |printer, event| match event {
        TunnelEvent::Connecting => printer.busy("Connecting to server...".into()),
        TunnelEvent::Online(online) => { printer.idle(); print_ready(&online, &label, &server_url, &access); }
        TunnelEvent::Resumed(online) => { printer.idle(); println!("{} Reconnected, tunnel {} is back online", ok(), style(&online.id).cyan()); }
        TunnelEvent::Replaced(online) => {
            printer.idle();
            println!("{} The old tunnel expired, a new one was created", warn());
            print_ready(&online, &label, &server_url, &access);
        }
        TunnelEvent::Request(request) => print_request(&request),
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

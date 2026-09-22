use anyhow::{bail, Result};
use console::style;
use dialoguer::{Input, Select};
use indicatif::{ProgressBar, ProgressStyle};
use std::time::Duration;
use crate::api::ApiClient;
use crate::config::{normalize_url, Config};

const POLL_INTERVAL: Duration = Duration::from_secs(2);

pub async fn login() -> Result<()> {
    let mut cfg = Config::load()?;

    let server_url: String = if let Some(ref url) = cfg.server_url {
        println!("Current server: {}", style(url).cyan());
        let choice = Select::new().with_prompt("Server URL")
            .items(&["Keep current server", "Enter a new server URL"]).default(0).interact()?;
        if choice == 0 { url.clone() } else { Input::new().with_prompt("Server URL").interact_text()? }
    } else {
        Input::new().with_prompt("Server URL (e.g. https://tunlit.example.com)").interact_text()?
    };

    let server_url = normalize_url(&server_url);
    let client = ApiClient::new(&server_url, None, cfg.accept_invalid_certs)?;
    let info = client.info().await?;
    let request = client.device_create(&hostname()).await?;

    println!();
    println!("  Approve this device at {}", style(&request.handoff_url).cyan().bold().underlined());
    println!("  Code: {}", style(&request.code).bold().green());
    if open::that_detached(&request.handoff_url).is_ok() {
        println!("  {}", style("Opened in your browser.").dim());
    }
    println!();

    let spinner = ProgressBar::new_spinner();
    spinner.set_style(ProgressStyle::default_spinner().template("{spinner:.green} {msg}").unwrap());
    spinner.set_message("Waiting for approval...");
    spinner.enable_steady_tick(Duration::from_millis(100));

    let token = loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        let poll = client.device_poll(&request.poll_token).await?;
        match poll.status.as_str() {
            "pending" => continue,
            "authorized" => break poll.token.ok_or_else(|| anyhow::anyhow!("Approved but no token was returned"))?,
            _ => {
                spinner.finish_and_clear();
                bail!("The code expired or was denied. Run `tunlit login` again");
            }
        }
    };
    spinner.finish_and_clear();

    let linked = ApiClient::new(&server_url, Some(&token), cfg.accept_invalid_certs)?;
    linked.whoami().await?;

    cfg.server_url = Some(server_url.clone());
    cfg.device_token = Some(token);
    cfg.save()?;

    println!("{} This device is linked to {} ({} {})", style("✓").green().bold(),
             style(&server_url).cyan().bold(), info.name, info.version);
    println!("  Tunnels will be created under {}", style(&info.base_domain).cyan());
    Ok(())
}

pub fn logout() -> Result<()> {
    let mut cfg = Config::load()?;
    if cfg.device_token.is_none() {
        println!("This device is not linked.");
        return Ok(());
    }
    cfg.device_token = None;
    cfg.save()?;
    println!("{} Token removed from this device", style("✓").green().bold());
    println!("  {}", style("Revoke it on the server under Settings › Devices.").dim());
    Ok(())
}

fn hostname() -> String {
    std::env::var("HOSTNAME")
        .ok()
        .or_else(|| std::fs::read_to_string("/etc/hostname").ok().map(|name| name.trim().to_string()))
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "tunlit CLI".to_string())
}

use anyhow::{bail, Result};
use std::time::Duration;
use crate::api::{ApiClient, Me, ServerInfo};
use crate::connect::percent_decode;
use crate::config::{normalize_url, Config};
use crate::session::{Events, Stop};

const POLL_INTERVAL: Duration = Duration::from_secs(2);

pub enum LoginEvent {
    Code { code: String, handoff_url: String },
    Linked { server_url: String, info: ServerInfo },
}

pub struct Invite { pub server_url: String, pub token: String }

pub fn parse_invite(link: &str) -> Option<Invite> {
    let link = link.trim();
    if let Some(rest) = link.strip_prefix("tunlit://invite/") {
        let (token, query) = rest.split_once('?').unwrap_or((rest, ""));
        let server = query.split('&').find_map(|pair| pair.strip_prefix("server=")).map(percent_decode)?;
        return Some(Invite { server_url: normalize_url(&server), token: token.trim_matches('/').to_string() });
    }
    let (server, token) = link.split_once("/@tunlit/invite/")?;
    if !server.starts_with("http://") && !server.starts_with("https://") { return None; }
    Some(Invite { server_url: normalize_url(server), token: token.trim_matches('/').to_string() })
}

pub async fn accept_invite(invite: Invite, accept_invalid_certs: bool) -> Result<(Me, ServerInfo)> {
    if invite.token.is_empty() { bail!("That invite link carries no token"); }
    link_token(invite.server_url, invite.token, accept_invalid_certs).await.map_err(|_| anyhow::anyhow!("That invite link is not valid any more"))
}

pub async fn link_token(server_url: String, token: String, accept_invalid_certs: bool) -> Result<(Me, ServerInfo)> {
    let server_url = normalize_url(&server_url);
    let client = ApiClient::new(&server_url, Some(&token), accept_invalid_certs)?;
    let info = client.info().await?;
    let me = client.whoami().await.map_err(|_| anyhow::anyhow!("The server did not accept that token"))?;
    let mut cfg = Config::load()?;
    cfg.server_url = Some(server_url);
    cfg.device_token = Some(token);
    cfg.save()?;
    Ok((me, info))
}

pub async fn link(server_url: &str, accept_invalid_certs: bool, out: Events<LoginEvent>, mut stop: Stop) -> Result<()> {
    let server_url = normalize_url(server_url);
    let client = ApiClient::new(&server_url, None, accept_invalid_certs)?;
    let info = client.info().await?;
    let request = client.device_create(&hostname()).await?;
    let _ = out.send(LoginEvent::Code { code: request.code.clone(), handoff_url: request.handoff_url.clone() });

    let token = loop {
        tokio::select! {
            _ = tokio::time::sleep(POLL_INTERVAL) => {}
            _ = stop.wait() => return Ok(()),
        }
        let poll = client.device_poll(&request.poll_token).await?;
        match poll.status.as_str() {
            "pending" => continue,
            "authorized" => break poll.token.ok_or_else(|| anyhow::anyhow!("Approved but no token was returned"))?,
            _ => bail!("The code expired or was denied. Run `tunlit login` again"),
        }
    };

    let linked = ApiClient::new(&server_url, Some(&token), accept_invalid_certs)?;
    linked.whoami().await?;

    let mut cfg = Config::load()?;
    cfg.server_url = Some(server_url.clone());
    cfg.device_token = Some(token);
    cfg.save()?;

    let _ = out.send(LoginEvent::Linked { server_url, info });
    Ok(())
}

pub fn logout() -> Result<bool> {
    let mut cfg = Config::load()?;
    if cfg.device_token.is_none() { return Ok(false); }
    cfg.device_token = None;
    cfg.save()?;
    Ok(true)
}

fn hostname() -> String {
    std::env::var("HOSTNAME")
        .ok()
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .or_else(|| std::fs::read_to_string("/etc/hostname").ok().map(|name| name.trim().to_string()))
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "tunlit CLI".to_string())
}

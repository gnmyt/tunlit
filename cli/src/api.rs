use anyhow::{bail, Result};
use reqwest::Client;
use serde::Deserialize;

pub struct ApiClient {
    client: Client,
    base_url: String,
    token: Option<String>,
}

#[derive(Deserialize)]
pub struct ServerInfo { pub name: String, pub version: String, #[serde(rename = "baseDomain")] pub base_domain: String }

#[derive(Deserialize)]
pub struct DeviceRequest {
    pub code: String,
    #[serde(rename = "pollToken")] pub poll_token: String,
    #[serde(rename = "handoffUrl")] pub handoff_url: String,
}

#[derive(Deserialize)]
pub struct DevicePoll { pub status: String, pub token: Option<String> }

impl ApiClient {
    pub fn new(base_url: &str, token: Option<&str>, accept_invalid_certs: bool) -> Result<Self> {
        Ok(Self {
            client: Client::builder().danger_accept_invalid_certs(accept_invalid_certs).build()?,
            base_url: base_url.trim_end_matches('/').to_string(),
            token: token.map(|t| t.to_string()),
        })
    }

    fn url(&self, path: &str) -> String { format!("{}/@tunlit/api{}", self.base_url, path) }

    pub async fn info(&self) -> Result<ServerInfo> {
        let resp = self.client.get(self.url("/info")).send().await?;
        if !resp.status().is_success() { bail!("Server did not answer like a tunlit server ({})", resp.status()); }
        Ok(resp.json().await?)
    }

    pub async fn device_create(&self, client: &str) -> Result<DeviceRequest> {
        let response = self.client.post(self.url("/auth/device/create"))
            .json(&serde_json::json!({ "client": client })).send().await?;
        if !response.status().is_success() { bail!("Could not start the login ({})", response.status()); }
        Ok(response.json().await?)
    }

    pub async fn device_poll(&self, poll_token: &str) -> Result<DevicePoll> {
        let response = self.client.post(self.url("/auth/device/poll"))
            .json(&serde_json::json!({ "pollToken": poll_token })).send().await?;
        if !response.status().is_success() { bail!("Could not check the login ({})", response.status()); }
        Ok(response.json().await?)
    }

    pub async fn whoami(&self) -> Result<()> {
        let token = self.token.as_deref().ok_or_else(|| anyhow::anyhow!("Not authenticated"))?;
        let resp = self.client.get(self.url("/whoami")).header("Authorization", format!("Bearer {token}")).send().await?;
        match resp.status().as_u16() {
            200 => Ok(()),
            401 => bail!("The token was rejected by the server"),
            other => bail!("Unexpected response from server: {other}"),
        }
    }
}

pub fn ws_url(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/').replacen("https://", "wss://", 1).replacen("http://", "ws://", 1);
    format!("{base}/@tunlit/ws")
}

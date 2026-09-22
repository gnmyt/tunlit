use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)] pub server_url: Option<String>,
    #[serde(default)] pub device_token: Option<String>,
    #[serde(default)] pub accept_invalid_certs: bool,
}

impl Config {
    fn path() -> Result<PathBuf> {
        let dir = dirs::config_dir().context("No config directory")?.join("tunlit");
        fs::create_dir_all(&dir)?;
        Ok(dir.join("config.json"))
    }

    pub fn load() -> Result<Self> {
        let path = Self::path()?;
        if !path.exists() { return Ok(Self::default()); }
        serde_json::from_str(&fs::read_to_string(&path)?).context("Failed to parse config")
    }

    pub fn save(&self) -> Result<()> {
        Ok(fs::write(Self::path()?, serde_json::to_string_pretty(self)?)?)
    }

    pub fn server_url(&self) -> Option<String> {
        std::env::var("TUNLIT_SERVER").ok().filter(|v| !v.trim().is_empty())
            .or_else(|| self.server_url.clone())
            .map(|v| normalize_url(&v))
    }

    pub fn token(&self) -> Option<String> {
        self.device_token.clone()
    }

    pub fn require_server(&self) -> Result<String> {
        self.server_url().ok_or_else(|| anyhow::anyhow!("No server configured. Run `tunlit login` or pass --server / TUNLIT_SERVER"))
    }

    pub fn require_auth(&self) -> Result<(String, String)> {
        let url = self.require_server()?;
        let token = self.token().ok_or_else(|| anyhow::anyhow!("This device is not linked. Run `tunlit login` first"))?;
        Ok((url, token))
    }
}

pub fn normalize_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") { trimmed.to_string() } else { format!("https://{trimmed}") }
}

pub fn set(key: &str, value: &str) -> Result<()> {
    let mut cfg = Config::load()?;
    match key {
        "server-url" => cfg.server_url = Some(normalize_url(value)),
        "device-token" => cfg.device_token = Some(value.to_string()),
        "accept-invalid-certs" => cfg.accept_invalid_certs = value.parse().context("Must be 'true' or 'false'")?,
        _ => bail!("Unknown key: {key}. Valid: server-url, device-token, accept-invalid-certs"),
    }
    cfg.save()?;
    println!("Set {key} = {}", if key == "device-token" { "(set)" } else { value });
    Ok(())
}

pub fn get(key: &str) -> Result<()> {
    let cfg = Config::load()?;
    println!("{}", match key {
        "server-url" => cfg.server_url.unwrap_or_default(),
        "accept-invalid-certs" => cfg.accept_invalid_certs.to_string(),
        "device-token" => cfg.device_token.map(|_| "(set)".into()).unwrap_or_default(),
        _ => bail!("Unknown key: {key}"),
    });
    Ok(())
}

pub fn show() -> Result<()> {
    let cfg = Config::load()?;
    println!("server-url:           {}", cfg.server_url.as_deref().unwrap_or("(not set)"));
    println!("accept-invalid-certs: {}", cfg.accept_invalid_certs);
    println!("device-token:         {}", if cfg.device_token.is_some() { "(set)" } else { "(not set)" });
    Ok(())
}

use anyhow::{bail, Context, Result};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use crate::config::Config;

const REPOSITORY: &str = "https://github.com/gnmyt/tunlit";
const CHECK_EVERY: u64 = 24 * 60 * 60;
pub const CURRENT: &str = env!("CARGO_PKG_VERSION");

#[derive(PartialEq)]
pub enum Install { Binary, Msi, Managed }

fn exe() -> Result<PathBuf> {
    std::env::current_exe().context("Could not find the tunlit binary")
}

fn owned_by(command: &str, args: &[&str], path: &Path) -> bool {
    Command::new(command).args(args).arg(path).output().is_ok_and(|out| out.status.success())
}

pub fn detect() -> Install {
    let Ok(path) = exe() else { return Install::Binary };
    let text = path.to_string_lossy();
    if cfg!(windows) {
        let program_files = std::env::var("ProgramFiles").unwrap_or_default();
        return if !program_files.is_empty() && text.starts_with(&program_files) { Install::Msi } else { Install::Binary };
    }
    let managed = text.contains("/Cellar/") || text.contains("/homebrew/")
        || (cfg!(target_os = "linux") && (owned_by("dpkg", &["-S"], &path) || owned_by("rpm", &["-qf"], &path)));
    if managed { Install::Managed } else { Install::Binary }
}

fn parse(version: &str) -> Option<[u64; 3]> {
    let mut parts = version.trim_start_matches('v').split('.').map(|part| part.parse::<u64>().ok());
    Some([parts.next()??, parts.next()??, parts.next()??])
}

pub fn newer(candidate: &str) -> bool {
    matches!((parse(candidate), parse(CURRENT)), (Some(a), Some(b)) if a > b)
}

fn client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder().user_agent(format!("tunlit/{CURRENT}")).timeout(Duration::from_secs(60)).build()?)
}

pub async fn latest() -> Result<String> {
    #[derive(serde::Deserialize)]
    struct Release { tag_name: String }
    let release: Release = client()?.get("https://api.github.com/repos/gnmyt/tunlit/releases/latest").send().await?.error_for_status()?.json().await?;
    Ok(release.tag_name.trim_start_matches('v').to_string())
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub async fn check() -> Option<String> {
    let mut cfg = Config::load().ok()?;
    if now().saturating_sub(cfg.update_checked_at) < CHECK_EVERY {
        return cfg.update_latest.clone().filter(|version| newer(version));
    }
    let version = latest().await.ok()?;
    cfg.update_checked_at = now();
    cfg.update_latest = Some(version.clone());
    cfg.save().ok()?;
    newer(&version).then_some(version)
}

fn asset(install: &Install) -> Result<&'static str> {
    let gui = cfg!(feature = "gui");
    Ok(match (install, std::env::consts::OS, std::env::consts::ARCH) {
        (Install::Msi, _, "x86_64") => "tunlit-x64.msi",
        (Install::Msi, _, "aarch64") => "tunlit-arm64.msi",
        (_, "windows", "x86_64") => "tunlit-windows-x64.exe",
        (_, "windows", "aarch64") => "tunlit-windows-arm64.exe",
        (_, "linux", "x86_64") => if gui { "tunlit-linux-x64" } else { "tunlit-linux-x64-static" },
        (_, "linux", "aarch64") => if gui { "tunlit-linux-arm64" } else { "tunlit-linux-arm64-static" },
        (_, "linux", "arm") => "tunlit-linux-armv7-static",
        (_, "linux", "riscv64") => "tunlit-linux-riscv64-static",
        (_, "macos", "x86_64") => "tunlit-macos-x64",
        (_, "macos", "aarch64") => "tunlit-macos-arm64",
        (_, os, arch) => bail!("No prebuilt tunlit for {os} {arch}"),
    })
}

async fn download(version: &str, name: &str, to: &Path) -> Result<()> {
    let url = format!("{REPOSITORY}/releases/download/v{version}/{name}");
    let bytes = client()?.get(&url).send().await?.error_for_status().with_context(|| format!("Could not download {url}"))?.bytes().await?;
    let magic: &[u8] = if name.ends_with(".msi") { b"\xD0\xCF\x11\xE0" } else if cfg!(windows) { b"MZ" } else if cfg!(target_os = "macos") { &[0xCF, 0xFA, 0xED, 0xFE] } else { b"\x7FELF" };
    if !bytes.starts_with(magic) { bail!("The download does not look like a tunlit build"); }
    std::fs::write(to, &bytes)?;
    Ok(())
}

pub async fn apply(version: &str, install: &Install, relaunch_gui: bool) -> Result<()> {
    let name = asset(install)?;
    #[cfg(windows)]
    if *install == Install::Msi {
        use std::os::windows::process::CommandExt;
        let path = std::env::temp_dir().join(name);
        download(version, name, &path).await?;
        let mut script = format!("msiexec /i \"{}\" /passive /norestart", path.display());
        if relaunch_gui { script.push_str(&format!(" && start \"\" \"{}\" gui", exe()?.display())); }
        Command::new("cmd").args(["/c", &script]).creation_flags(0x0000_0008 | 0x0800_0000).spawn()?;
        return Ok(());
    }
    #[cfg(not(windows))]
    let _ = relaunch_gui;
    let target = exe()?;
    let staged = target.with_extension("update");
    download(version, name, &staged).await?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&staged, std::fs::Permissions::from_mode(0o755))?;
    }
    if cfg!(windows) {
        let old = target.with_extension("old");
        let _ = std::fs::remove_file(&old);
        std::fs::rename(&target, &old)?;
    }
    std::fs::rename(&staged, &target).map_err(|err| {
        let _ = std::fs::remove_file(&staged);
        if err.kind() == std::io::ErrorKind::PermissionDenied { anyhow::anyhow!("No permission to replace {}. Run `sudo tunlit update`", target.display()) } else { err.into() }
    })?;
    Ok(())
}

pub fn cleanup() {
    if let Ok(target) = exe() { let _ = std::fs::remove_file(target.with_extension("old")); }
}

use anyhow::{bail, Context, Result};
use console::style;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use crate::config::Config;
use crate::handler::exe;
use crate::headless;

const NAME: &str = "tunlit";

fn run(program: &str, args: &[&str]) -> Result<()> {
    let status = Command::new(program).args(args).status().with_context(|| format!("Could not run {program}"))?;
    if !status.success() { bail!("{program} {} failed", args.join(" ")); }
    Ok(())
}

fn ensure_manifest() -> Result<PathBuf> {
    let path = headless::default_path()?;
    if path.exists() {
        headless::load(&path)?;
        return Ok(path);
    }
    fs::create_dir_all(path.parent().unwrap())?;
    fs::write(&path, headless::EXAMPLE)?;
    bail!("Wrote an example to {}. Edit it, then run `tunlit service install` again", path.display());
}

#[cfg(target_os = "linux")]
fn unit_path() -> Result<PathBuf> {
    Ok(dirs::config_dir().context("No config directory")?.join("systemd").join("user").join(format!("{NAME}.service")))
}

#[cfg(target_os = "linux")]
fn install_platform() -> Result<String> {
    let path = unit_path()?;
    fs::create_dir_all(path.parent().unwrap())?;
    fs::write(&path, format!(
        "[Unit]\nDescription=tunlit tunnels\nAfter=network-online.target\nWants=network-online.target\n\n\
         [Service]\nExecStart={} start\nRestart=on-failure\nRestartSec=5\n\n\
         [Install]\nWantedBy=default.target\n",
        exe()?,
    ))?;
    run("systemctl", &["--user", "daemon-reload"])?;
    run("systemctl", &["--user", "enable", "--now", NAME])?;
    if let Ok(user) = std::env::var("USER") { let _ = Command::new("loginctl").args(["enable-linger", &user]).status(); }
    Ok(format!("systemd user unit {}\n  Logs: journalctl --user -u {NAME} -f", path.display()))
}

#[cfg(target_os = "linux")]
fn uninstall_platform() -> Result<()> {
    let _ = Command::new("systemctl").args(["--user", "disable", "--now", NAME]).status();
    let path = unit_path()?;
    if path.exists() { fs::remove_file(path)?; }
    let _ = Command::new("systemctl").args(["--user", "daemon-reload"]).status();
    Ok(())
}

#[cfg(target_os = "macos")]
fn plist_path() -> Result<PathBuf> {
    Ok(dirs::home_dir().context("No home directory")?.join("Library").join("LaunchAgents").join("dev.tunlit.start.plist"))
}

#[cfg(target_os = "macos")]
fn domain() -> Result<String> {
    let output = Command::new("id").arg("-u").output().context("Could not run id")?;
    Ok(format!("gui/{}", String::from_utf8_lossy(&output.stdout).trim()))
}

#[cfg(target_os = "macos")]
fn install_platform() -> Result<String> {
    let path = plist_path()?;
    let log = dirs::home_dir().context("No home directory")?.join("Library").join("Logs").join("tunlit.log");
    fs::create_dir_all(path.parent().unwrap())?;
    fs::write(&path, format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
         <plist version=\"1.0\"><dict>\n\
         <key>Label</key><string>dev.tunlit.start</string>\n\
         <key>ProgramArguments</key><array><string>{}</string><string>start</string></array>\n\
         <key>RunAtLoad</key><true/>\n<key>KeepAlive</key><true/>\n\
         <key>StandardOutPath</key><string>{log}</string>\n<key>StandardErrorPath</key><string>{log}</string>\n\
         </dict></plist>\n",
        exe()?, log = log.display(),
    ))?;
    let _ = Command::new("launchctl").args(["bootout", &domain()?, &path.to_string_lossy()]).status();
    run("launchctl", &["bootstrap", &domain()?, &path.to_string_lossy()])?;
    Ok(format!("launch agent {}\n  Logs: {}", path.display(), log.display()))
}

#[cfg(target_os = "macos")]
fn uninstall_platform() -> Result<()> {
    let path = plist_path()?;
    let _ = Command::new("launchctl").args(["bootout", &domain()?, &path.to_string_lossy()]).status();
    if path.exists() { fs::remove_file(path)?; }
    Ok(())
}

#[cfg(target_os = "windows")]
fn install_platform() -> Result<String> {
    let action = format!("\"{}\" start", exe()?);
    run("schtasks", &["/Create", "/F", "/SC", "ONLOGON", "/TN", NAME, "/TR", &action, "/RL", "LIMITED"])?;
    run("schtasks", &["/Run", "/TN", NAME])?;
    Ok(format!("scheduled task \"{NAME}\", runs at logon"))
}

#[cfg(target_os = "windows")]
fn uninstall_platform() -> Result<()> {
    let _ = Command::new("schtasks").args(["/End", "/TN", NAME]).status();
    let _ = Command::new("schtasks").args(["/Delete", "/F", "/TN", NAME]).status();
    Ok(())
}

pub fn install() -> Result<()> {
    Config::load()?.require_auth()?;
    let manifest = ensure_manifest()?;
    let installed = install_platform()?;
    println!("{} tunlit starts with your session: {installed}", style("✓").green().bold());
    println!("  Tunnels: {}", style(manifest.display()).dim());
    Ok(())
}

pub fn uninstall() -> Result<()> {
    uninstall_platform()?;
    println!("{} Service removed", style("✓").green().bold());
    Ok(())
}

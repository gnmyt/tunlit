use anyhow::Result;

#[cfg(unix)]
fn entry() -> Result<std::path::PathBuf> {
    use anyhow::Context;
    #[cfg(target_os = "linux")]
    let path = dirs::config_dir().context("No config directory")?.join("autostart/tunlit.desktop");
    #[cfg(target_os = "macos")]
    let path = dirs::home_dir().context("No home directory")?.join("Library/LaunchAgents/dev.tunlit.gui.plist");
    Ok(path)
}

#[cfg(unix)]
pub fn enabled() -> bool {
    entry().is_ok_and(|path| path.exists())
}

#[cfg(unix)]
pub fn set(on: bool) -> Result<()> {
    let path = entry()?;
    if !on { let _ = std::fs::remove_file(&path); return Ok(()); }
    std::fs::create_dir_all(path.parent().unwrap())?;
    let exe = std::env::current_exe()?;
    #[cfg(target_os = "linux")]
    let body = format!("[Desktop Entry]\nType=Application\nName=tunlit\nExec={} gui --hidden\nX-GNOME-Autostart-enabled=true\n", exe.display());
    #[cfg(target_os = "macos")]
    let body = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict>\n<key>Label</key><string>dev.tunlit.gui</string>\n<key>ProgramArguments</key><array><string>{}</string><string>gui</string><string>--hidden</string></array>\n<key>RunAtLoad</key><true/>\n</dict></plist>\n",
        exe.display());
    std::fs::write(&path, body)?;
    Ok(())
}

#[cfg(windows)]
const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";

#[cfg(windows)]
fn reg(args: &[&str]) -> Result<bool> {
    Ok(std::process::Command::new("reg").args(args).output()?.status.success())
}

#[cfg(windows)]
pub fn enabled() -> bool {
    reg(&["query", RUN_KEY, "/v", "tunlit"]).unwrap_or(false)
}

#[cfg(windows)]
pub fn set(on: bool) -> Result<()> {
    let command = format!("\"{}\" gui --hidden", std::env::current_exe()?.display());
    let done = if on { reg(&["add", RUN_KEY, "/v", "tunlit", "/t", "REG_SZ", "/d", &command, "/f"])? } else { reg(&["delete", RUN_KEY, "/v", "tunlit", "/f"])? };
    anyhow::ensure!(done, "Could not update the autostart entry");
    Ok(())
}

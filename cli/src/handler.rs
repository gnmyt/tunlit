use anyhow::{bail, Context, Result};
use console::style;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

const SCHEME: &str = "tunlit";

fn exe() -> Result<String> {
    let path = std::env::current_exe().context("Could not find the tunlit binary")?;
    Ok(path.to_string_lossy().to_string())
}

fn home() -> Result<PathBuf> {
    dirs::home_dir().context("Could not find your home directory")
}

fn desktop_file() -> Result<PathBuf> {
    Ok(dirs::data_dir().context("Could not find your data directory")?
        .join("applications")
        .join("tunlit.desktop"))
}

fn app_bundle() -> Result<PathBuf> {
    Ok(home()?.join("Applications").join("tunlit.app"))
}

fn install_linux() -> Result<PathBuf> {
    let file = desktop_file()?;
    fs::create_dir_all(file.parent().unwrap())?;
    fs::write(&file, format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=tunlit\n\
         Comment=Open a tunlit share link\n\
         Exec={} connect %u\n\
         Terminal=true\n\
         NoDisplay=true\n\
         MimeType=x-scheme-handler/{};\n",
        exe()?, SCHEME,
    ))?;

    let dir = file.parent().unwrap().to_string_lossy().to_string();
    let _ = Command::new("update-desktop-database").arg(&dir).status();
    let _ = Command::new("xdg-mime")
        .args(["default", "tunlit.desktop", &format!("x-scheme-handler/{SCHEME}")])
        .status();
    Ok(file)
}

fn install_macos() -> Result<PathBuf> {
    let bundle = app_bundle()?;
    if bundle.exists() { fs::remove_dir_all(&bundle)?; }
    fs::create_dir_all(bundle.parent().unwrap())?;

    let script = std::env::temp_dir().join("tunlit-handler.applescript");
    fs::write(&script, format!(
        "on open location this_URL\n\
         \tset cmd to quoted form of \"{}\" & \" connect \" & quoted form of this_URL\n\
         \ttell application \"Terminal\"\n\
         \t\tactivate\n\
         \t\tdo script cmd\n\
         \tend tell\n\
         end open location\n",
        exe()?,
    ))?;

    let status = Command::new("osacompile")
        .args(["-o", &bundle.to_string_lossy(), &script.to_string_lossy()])
        .status()
        .context("osacompile is not available")?;
    let _ = fs::remove_file(&script);
    if !status.success() { bail!("osacompile could not build the handler app"); }

    let plist = bundle.join("Contents").join("Info.plist");
    for args in [
        vec!["-insert", "CFBundleURLTypes", "-json", "[]"],
        vec!["-insert", "CFBundleURLTypes.0", "-json", "{}"],
        vec!["-insert", "CFBundleURLTypes.0.CFBundleURLName", "-string", "tunlit"],
        vec!["-insert", "CFBundleURLTypes.0.CFBundleURLSchemes", "-json", "[\"tunlit\"]"],
        vec!["-replace", "CFBundleIdentifier", "-string", "dev.tunlit.cli"],
    ] {
        let _ = Command::new("plutil").args(&args).arg(&plist).status();
    }

    let _ = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
        .args(["-f", &bundle.to_string_lossy()])
        .status();
    Ok(bundle)
}

fn install_windows() -> Result<PathBuf> {
    let key = format!("HKCU\\Software\\Classes\\{SCHEME}");
    let command = format!("cmd.exe /k \"\"{}\" connect \"%1\"\"", exe()?);

    for args in [
        vec![key.clone(), "/ve".into(), "/d".into(), format!("URL:{SCHEME}"), "/f".into()],
        vec![key.clone(), "/v".into(), "URL Protocol".into(), "/d".into(), String::new(), "/f".into()],
        vec![format!("{key}\\shell\\open\\command"), "/ve".into(), "/d".into(), command.clone(), "/f".into()],
    ] {
        let status = Command::new("reg").arg("add").args(&args).status()
            .context("Could not run reg.exe")?;
        if !status.success() { bail!("reg.exe refused to write {key}"); }
    }
    Ok(PathBuf::from(key))
}

pub fn install() -> Result<()> {
    let where_ = if cfg!(target_os = "macos") {
        install_macos()?
    } else if cfg!(target_os = "windows") {
        install_windows()?
    } else if cfg!(target_os = "linux") {
        install_linux()?
    } else {
        bail!("tunlit does not know how to register links on this system");
    };

    println!("{} {} links now open in this tunlit", style("✓").green().bold(), style(format!("{SCHEME}://")).cyan().bold());
    println!("  {}", style(where_.to_string_lossy()).dim());
    println!("  Your browser will ask before it opens one.");
    Ok(())
}

pub fn remove() -> Result<()> {
    if cfg!(target_os = "macos") {
        let bundle = app_bundle()?;
        if bundle.exists() { fs::remove_dir_all(&bundle)?; }
    } else if cfg!(target_os = "windows") {
        let _ = Command::new("reg")
            .args(["delete", &format!("HKCU\\Software\\Classes\\{SCHEME}"), "/f"])
            .status();
    } else {
        let file = desktop_file()?;
        if file.exists() { fs::remove_file(&file)?; }
        let _ = Command::new("update-desktop-database")
            .arg(file.parent().unwrap().to_string_lossy().to_string())
            .status();
    }

    println!("{} {} links are no longer handled by tunlit", style("✓").green().bold(), style(format!("{SCHEME}://")).bold());
    Ok(())
}

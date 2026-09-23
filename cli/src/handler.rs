use anyhow::{bail, Context, Result};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

pub const SCHEME: &str = "tunlit";
const ICON_SVG: &[u8] = include_bytes!("../../packaging/tunlit.svg");

fn exe() -> Result<String> {
    let path = std::env::current_exe().context("Could not find the tunlit binary")?;
    Ok(path.to_string_lossy().to_string())
}

fn home() -> Result<PathBuf> {
    dirs::home_dir().context("Could not find your home directory")
}

fn data_dir() -> Result<PathBuf> {
    dirs::data_dir().context("Could not find your data directory")
}

fn desktop_file() -> Result<PathBuf> {
    Ok(data_dir()?.join("applications").join("tunlit.desktop"))
}

fn icon_file() -> Result<PathBuf> {
    Ok(data_dir()?.join("icons").join("hicolor").join("scalable").join("apps").join("tunlit.svg"))
}

fn app_bundle() -> Result<PathBuf> {
    Ok(home()?.join("Applications").join("tunlit.app"))
}

fn install_linux() -> Result<PathBuf> {
    let icon = icon_file()?;
    fs::create_dir_all(icon.parent().unwrap())?;
    fs::write(&icon, ICON_SVG)?;

    let file = desktop_file()?;
    fs::create_dir_all(file.parent().unwrap())?;
    fs::write(&file, format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=tunlit\n\
         Comment=Share local ports through your own tunlit server\n\
         Exec={} gui %u\n\
         Icon=tunlit\n\
         Terminal=false\n\
         Categories=Network;Utility;\n\
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

    let exe = exe()?;
    let script = std::env::temp_dir().join("tunlit-handler.applescript");
    fs::write(&script, format!(
        "on run\n\
         \tdo shell script quoted form of \"{exe}\" & \" gui > /dev/null 2>&1 &\"\n\
         end run\n\
         on open location this_URL\n\
         \tdo shell script quoted form of \"{exe}\" & \" gui \" & quoted form of this_URL & \" > /dev/null 2>&1 &\"\n\
         end open location\n",
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
    let exe = exe()?;
    let command = format!("\"{exe}\" gui \"%1\"");

    for args in [
        vec![key.clone(), "/ve".into(), "/d".into(), format!("URL:{SCHEME}"), "/f".into()],
        vec![key.clone(), "/v".into(), "URL Protocol".into(), "/d".into(), String::new(), "/f".into()],
        vec![format!("{key}\\DefaultIcon"), "/ve".into(), "/d".into(), format!("{exe},0"), "/f".into()],
        vec![format!("{key}\\shell\\open\\command"), "/ve".into(), "/d".into(), command.clone(), "/f".into()],
    ] {
        let status = Command::new("reg").arg("add").args(&args).status()
            .context("Could not run reg.exe")?;
        if !status.success() { bail!("reg.exe refused to write {key}"); }
    }
    Ok(PathBuf::from(key))
}

pub fn install() -> Result<PathBuf> {
    if cfg!(target_os = "macos") {
        install_macos()
    } else if cfg!(target_os = "windows") {
        install_windows()
    } else if cfg!(target_os = "linux") {
        install_linux()
    } else {
        bail!("tunlit does not know how to register links on this system")
    }
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
        let icon = icon_file()?;
        if icon.exists() { let _ = fs::remove_file(&icon); }
        let _ = Command::new("update-desktop-database")
            .arg(file.parent().unwrap().to_string_lossy().to_string())
            .status();
    }
    Ok(())
}

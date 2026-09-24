use qrcode::render::unicode;
use qrcode::QrCode;

pub fn print(text: &str) {
    let Ok(code) = QrCode::new(text.as_bytes()) else { return };
    let rendered = code.render::<unicode::Dense1x2>().dark_color(unicode::Dense1x2::Light).light_color(unicode::Dense1x2::Dark).quiet_zone(true).build();
    for line in rendered.lines() { println!("  {line}"); }
}

pub fn copy(text: &str) -> bool {
    let Ok(mut clip) = arboard::Clipboard::new() else { return false };
    let text = text.to_string();
    #[cfg(target_os = "linux")]
    {
        use arboard::SetExtLinux;
        std::thread::spawn(move || { let _ = clip.set().wait().text(text); });
        true
    }
    #[cfg(not(target_os = "linux"))]
    clip.set_text(text).is_ok()
}

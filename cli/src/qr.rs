use console::style;
use qrcode::render::unicode;
use qrcode::QrCode;

pub fn print(text: &str) {
    let Ok(code) = QrCode::new(text.as_bytes()) else { return };
    let rendered = code.render::<unicode::Dense1x2>().dark_color(unicode::Dense1x2::Light).light_color(unicode::Dense1x2::Dark).quiet_zone(true).build();
    for line in rendered.lines() { println!("  {line}"); }
}

pub fn copy(text: &str) {
    let copied = arboard::Clipboard::new().and_then(|mut clip| clip.set_text(text.to_string())).is_ok();
    if copied { println!("{} Copied to clipboard", style("✓").green().bold()); }
}

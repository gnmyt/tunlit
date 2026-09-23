use eframe::egui;
use x11rb::connection::Connection;
use x11rb::protocol::randr;
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt};

#[derive(PartialEq)]
pub enum Backend { X11, Wayland }

pub fn choose_backend() -> Backend {
    let has_x11 = std::env::var_os("DISPLAY").is_some_and(|value| !value.is_empty());
    let has_wayland = std::env::var_os("WAYLAND_DISPLAY").is_some_and(|value| !value.is_empty());
    if has_x11 {
        if has_wayland { std::env::remove_var("WAYLAND_DISPLAY"); }
        Backend::X11
    } else {
        Backend::Wayland
    }
}

pub fn primary_work_area(pixels_per_point: f32) -> Option<egui::Rect> {
    let (connection, screen_number) = x11rb::connect(None).ok()?;
    let root = connection.setup().roots.get(screen_number)?.root;

    let monitors = randr::get_monitors(&connection, root, true).ok()?.reply().ok()?.monitors;
    let monitor = monitors.iter().find(|monitor| monitor.primary).or_else(|| monitors.first())?;
    let mut area = egui::Rect::from_min_size(
        egui::pos2(monitor.x as f32, monitor.y as f32),
        egui::vec2(monitor.width as f32, monitor.height as f32),
    );

    let atom = connection.intern_atom(false, b"_NET_WORKAREA").ok()?.reply().ok()?.atom;
    let reply = connection.get_property(false, root, atom, AtomEnum::CARDINAL, 0, 4).ok()?.reply().ok()?;
    if let Some(mut values) = reply.value32() {
        if let (Some(x), Some(y), Some(width), Some(height)) = (values.next(), values.next(), values.next(), values.next()) {
            let work = egui::Rect::from_min_size(egui::pos2(x as f32, y as f32), egui::vec2(width as f32, height as f32));
            area = area.intersect(work);
        }
    }
    if area.width() <= 0.0 || area.height() <= 0.0 { return None; }

    let scale = 1.0 / pixels_per_point;
    Some(egui::Rect::from_min_max(egui::pos2(area.left() * scale, area.top() * scale), egui::pos2(area.right() * scale, area.bottom() * scale)))
}

mod app;
mod format;
mod instance;
#[cfg(target_os = "linux")]
mod linux;
mod pages;
mod theme;
mod tray;
mod widgets;

use anyhow::{Context, Result};
use eframe::egui;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use tokio::runtime::Handle;

const ICON_SIZE: u32 = 128;
const ICON_RGBA: &[u8] = include_bytes!("../../assets/icon-128.rgba");

pub const WINDOW_WIDTH: f32 = 396.0;
pub const WINDOW_HEIGHT: f32 = 704.0;
const CORNER_MARGIN: f32 = 12.0;

static WAYLAND: AtomicBool = AtomicBool::new(false);

pub fn hide_by_closing() -> bool { WAYLAND.load(Ordering::Relaxed) }

pub enum Wake { Toggle, Show, OpenLink(Option<String>), Quit }

#[derive(Clone, Default)]
pub struct Repaint(Arc<Mutex<Option<egui::Context>>>);

impl Repaint {
    pub fn attach(&self, ctx: &egui::Context) { *self.0.lock().unwrap() = Some(ctx.clone()); }
    pub fn detach(&self) { *self.0.lock().unwrap() = None; }
    pub fn ping(&self) { if let Some(ctx) = self.0.lock().unwrap().as_ref() { ctx.request_repaint(); } }
}

pub fn launch(runtime: Handle, link: Option<String>) -> Result<()> {
    detach_console();
    if instance::hand_over(link.as_deref()) { return Ok(()); }
    #[cfg(target_os = "linux")]
    WAYLAND.store(linux::choose_backend() == linux::Backend::Wayland, Ordering::Relaxed);

    let (wake_tx, wake_rx) = mpsc::channel::<Wake>();
    let repaint = Repaint::default();
    let tray = tray::start(wake_tx.clone(), repaint.clone(), &runtime).ok();
    {
        let (wake_tx, repaint) = (wake_tx.clone(), repaint.clone());
        instance::serve(&runtime, move |link| { let _ = wake_tx.send(Wake::OpenLink(link)); repaint.ping(); })
            .context("Could not listen for links from the browser")?;
    }

    let mut state = app::State::new(runtime, repaint.clone(), tray.is_some());
    if let Some(link) = link { state.open_link(link); }

    let result = loop {
        if let Err(err) = run_window(&mut state, &wake_rx, &repaint) { break Err(err); }
        if state.quitting { break Ok(()); }
        match wake_rx.recv() {
            Ok(Wake::Toggle | Wake::Show) => {}
            Ok(Wake::OpenLink(link)) => { if let Some(link) = link { state.open_link(link); } }
            Ok(Wake::Quit) | Err(_) => break Ok(()),
        }
    };
    state.stop_all();
    instance::release();
    result
}

fn run_window(state: &mut app::State, wake_rx: &mpsc::Receiver<Wake>, repaint: &Repaint) -> Result<()> {
    let icon = egui::IconData { rgba: ICON_RGBA.to_vec(), width: ICON_SIZE, height: ICON_SIZE };
    let viewport = egui::ViewportBuilder::default()
        .with_title("tunlit")
        .with_app_id("dev.tunlit.cli")
        .with_inner_size([WINDOW_WIDTH, WINDOW_HEIGHT])
        .with_min_inner_size([WINDOW_WIDTH, WINDOW_HEIGHT])
        .with_max_inner_size([WINDOW_WIDTH, WINDOW_HEIGHT])
        .with_resizable(false)
        .with_decorations(false)
        .with_taskbar(false)
        .with_icon(Arc::new(icon));
    let viewport = match state.corner_position() {
        Some(position) => viewport.with_position(position),
        None => viewport.with_visible(hide_by_closing()),
    };
    let options = eframe::NativeOptions { viewport, ..Default::default() };

    let outcome = eframe::run_native("tunlit", options, Box::new(|cc| {
        theme::install(&cc.egui_ctx);
        repaint.attach(&cc.egui_ctx);
        Ok(Box::new(app::Window::new(cc, state, wake_rx)))
    }));
    repaint.detach();
    outcome.map_err(|err| anyhow::anyhow!("{err}")).context("Could not open the tunlit window")
}

pub fn corner_for(area: egui::Rect) -> egui::Pos2 {
    egui::pos2(area.right() - WINDOW_WIDTH - CORNER_MARGIN, area.bottom() - WINDOW_HEIGHT - CORNER_MARGIN)
}

#[cfg(windows)]
fn detach_console() {
    use windows_sys::Win32::System::Console::{FreeConsole, GetConsoleProcessList};
    let mut processes = [0u32; 2];
    let count = unsafe { GetConsoleProcessList(processes.as_mut_ptr(), processes.len() as u32) };
    if count <= 1 { unsafe { FreeConsole(); } }
}

#[cfg(not(windows))]
fn detach_console() {}

#[cfg(target_os = "linux")]
pub fn work_area(pixels_per_point: f32) -> Option<egui::Rect> {
    if hide_by_closing() { return None; }
    linux::primary_work_area(pixels_per_point)
}

#[cfg(windows)]
pub fn work_area(pixels_per_point: f32) -> Option<egui::Rect> {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::UI::WindowsAndMessaging::{SystemParametersInfoW, SPI_GETWORKAREA};
    let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
    let ok = unsafe { SystemParametersInfoW(SPI_GETWORKAREA, 0, &mut rect as *mut RECT as *mut _, 0) };
    if ok == 0 { return None; }
    let scale = 1.0 / pixels_per_point;
    Some(egui::Rect::from_min_max(
        egui::pos2(rect.left as f32 * scale, rect.top as f32 * scale),
        egui::pos2(rect.right as f32 * scale, rect.bottom as f32 * scale),
    ))
}

#[cfg(not(any(windows, target_os = "linux")))]
pub fn work_area(_pixels_per_point: f32) -> Option<egui::Rect> { None }

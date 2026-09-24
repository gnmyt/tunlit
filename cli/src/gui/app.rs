use eframe::egui::{self, Align, Color32, CursorIcon, Frame, Layout, Margin, RichText, Sense, Stroke, TextureHandle, TextureOptions, Ui, UiBuilder};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};
use tokio::sync::mpsc::UnboundedReceiver;
use std::time::{Duration, Instant};
use tokio::runtime::Handle;
use crate::api::{ApiClient, ServerInfo};
use crate::auth::{self, LoginEvent};
use crate::config::Config;
use crate::connect;
use crate::session::{self, JoinEvent, Online, Request, Stop, StopHandle, TunnelEvent};
use crate::tunnel::{self, Options};
use super::{format, hide_by_closing, theme, widgets, Repaint, Wake};
use super::widgets::ChipKind;

const MAX_REQUESTS: usize = 500;
const TOAST_FOR: Duration = Duration::from_secs(3);

#[derive(Clone, Copy, PartialEq)]
pub enum Page { Tunnels, NewTunnel, Tunnel(u64), Connect, Settings }

pub enum Msg {
    TunnelReady(u64, String),
    Tunnel(u64, TunnelEvent),
    TunnelFailed(u64, String),
    Join(u64, JoinEvent),
    JoinFailed(u64, String, Option<u16>),
    Login(LoginEvent),
    LoginFailed(String),
    Info(Result<ServerInfo, String>),
    FolderPicked(Option<PathBuf>),
}

#[derive(Clone, Copy, PartialEq)]
pub enum TunnelKind { Http, Files, Tcp }

impl TunnelKind {
    pub fn label(self) -> &'static str { match self { Self::Http => "http", Self::Files => "files", Self::Tcp => "tcp" } }
}

#[derive(PartialEq)]
pub enum TunnelState { Connecting, Online, Reconnecting { seconds: u64, reason: Option<String> } }

pub struct LoggedRequest { pub request: Request, pub at: Instant }

pub struct TunnelCard {
    pub id: u64,
    pub kind: TunnelKind,
    pub target_label: String,
    pub access: Option<String>,
    pub state: TunnelState,
    pub online: Option<Online>,
    pub requests: VecDeque<LoggedRequest>,
    pub request_count: u64,
    pub started: Instant,
    pub stop: StopHandle,
    pub show_qr: bool,
    pub copied_at: Option<Instant>,
}

impl TunnelCard {
    pub fn link(&self, server_url: &str) -> Option<String> { self.online.as_ref().and_then(|online| online.link(server_url)) }
    pub fn title(&self) -> String { self.online.as_ref().map(|online| online.id.clone()).unwrap_or_else(|| self.target_label.clone()) }
}

pub enum JoinState { Connecting, Forwarding, Reconnecting { seconds: u64, reason: Option<String> } }

pub struct Forwarding { pub port: u16, pub tunnel_id: String, pub owner_online: bool }

pub struct JoinCard {
    pub id: u64,
    pub target: String,
    pub code: String,
    pub server: String,
    pub state: JoinState,
    pub forwarding: Option<Forwarding>,
    pub started: Instant,
    pub stop: StopHandle,
}

pub enum LoginStage { Idle, Starting, Waiting { code: String, url: String }, Failed(String) }

pub struct LoginForm { pub server: String, pub accept_invalid: bool, pub stage: LoginStage, pub stop: Option<StopHandle> }

#[derive(Clone, Copy, PartialEq)]
pub enum AuthChoice { Open, Password, Login }

pub struct NewTunnelForm {
    pub kind: TunnelKind,
    pub target: String,
    pub dir: String,
    pub picking_dir: bool,
    pub name: String,
    pub keep_host: bool,
    pub auth: AuthChoice,
    pub password: String,
    pub allow: Vec<String>,
    pub allow_input: String,
    pub error: Option<String>,
}

impl Default for NewTunnelForm {
    fn default() -> Self {
        Self { kind: TunnelKind::Http, target: String::new(), dir: String::new(), picking_dir: false, name: String::new(), keep_host: false,
            auth: AuthChoice::Open, password: String::new(), allow: Vec::new(), allow_input: String::new(), error: None }
    }
}

#[derive(Default)]
pub struct ConnectForm { pub link: String, pub error: Option<String>, pub retry_port: Option<String> }

pub struct Toast { pub text: String, pub at: Instant, pub error: bool }

#[derive(Clone)]
struct Mailbox { tx: Sender<Msg>, repaint: Repaint }

impl Mailbox {
    fn send(&self, msg: Msg) {
        let _ = self.tx.send(msg);
        self.repaint.ping();
    }
}

pub struct State {
    pub runtime: Handle,
    mailbox: Mailbox,
    rx: Receiver<Msg>,
    pub page: Page,
    pub cfg: Config,
    pub server_info: Option<Result<ServerInfo, String>>,
    pub tunnels: Vec<TunnelCard>,
    pub joins: Vec<JoinCard>,
    next_id: u64,
    pub login: LoginForm,
    pub new_tunnel: NewTunnelForm,
    pub connect: ConnectForm,
    pub toasts: Vec<Toast>,
    pub has_tray: bool,
    pub quitting: bool,
    monitor: Option<egui::Rect>,
}

impl State {
    pub fn new(runtime: Handle, repaint: Repaint, has_tray: bool) -> Self {
        let (tx, rx) = mpsc::channel();
        let cfg = Config::load().unwrap_or_default();
        let login = LoginForm { server: cfg.server_url.clone().unwrap_or_default(), accept_invalid: cfg.accept_invalid_certs, stage: LoginStage::Idle, stop: None };
        let mut state = Self {
            runtime, mailbox: Mailbox { tx, repaint }, rx, page: Page::Tunnels, cfg, server_info: None, tunnels: Vec::new(), joins: Vec::new(), next_id: 1,
            login, new_tunnel: NewTunnelForm::default(), connect: ConnectForm::default(),
            toasts: Vec::new(), has_tray, quitting: false, monitor: None,
        };
        state.fetch_info();
        state
    }

    pub fn linked(&self) -> bool { self.cfg.device_token.is_some() && self.cfg.server_url().is_some() }

    pub fn server_url(&self) -> String { self.cfg.server_url().unwrap_or_default() }

    pub fn corner_position(&self) -> Option<egui::Pos2> { self.monitor.map(super::corner_for) }

    fn next_id(&mut self) -> u64 { let id = self.next_id; self.next_id += 1; id }

    fn forward<E: Send + 'static>(&self, mut rx: UnboundedReceiver<E>, wrap: impl Fn(E) -> Msg + Send + 'static) {
        let mailbox = self.mailbox.clone();
        self.runtime.spawn(async move {
            while let Some(event) = rx.recv().await { mailbox.send(wrap(event)); }
        });
    }

    pub fn toast(&mut self, text: impl Into<String>) { self.toasts.push(Toast { text: text.into(), at: Instant::now(), error: false }); }
    pub fn toast_error(&mut self, text: impl Into<String>) { self.toasts.push(Toast { text: text.into(), at: Instant::now(), error: true }); }

    pub fn reload_config(&mut self) {
        self.cfg = Config::load().unwrap_or_default();
    }

    pub fn stop_all(&self) {
        for card in &self.tunnels { card.stop.stop(); }
        for join in &self.joins { join.stop.stop(); }
        if let Some(stop) = &self.login.stop { stop.stop(); }
    }

    pub fn open_link(&mut self, link: String) {
        self.page = Page::Connect;
        self.start_join(link, None, "127.0.0.1".into());
    }

    pub fn fetch_info(&mut self) {
        let Some(url) = self.cfg.server_url() else { self.server_info = None; return };
        let accept = self.cfg.accept_invalid_certs;
        let mailbox = self.mailbox.clone();
        self.runtime.spawn(async move {
            let result = async { ApiClient::new(&url, None, accept)?.info().await }.await.map_err(|err| format!("{err:#}"));
            mailbox.send(Msg::Info(result));
        });
    }

    pub fn start_login(&mut self) {
        let server = self.login.server.trim().to_string();
        if server.is_empty() { self.login.stage = LoginStage::Failed("Enter the URL of your tunlit server".into()); return; }
        let (events, rx) = session::channel();
        let (handle, stop) = Stop::new();
        self.login.stop = Some(handle);
        self.login.stage = LoginStage::Starting;
        let accept = self.login.accept_invalid;
        self.forward(rx, Msg::Login);
        let mailbox = self.mailbox.clone();
        self.runtime.spawn(async move {
            if let Err(err) = auth::link(&server, accept, events, stop).await {
                mailbox.send(Msg::LoginFailed(format!("{err:#}")));
            }
        });
    }

    pub fn cancel_login(&mut self) {
        if let Some(stop) = self.login.stop.take() { stop.stop(); }
        self.login.stage = LoginStage::Idle;
    }

    pub fn pick_folder(&mut self) {
        if self.new_tunnel.picking_dir { return; }
        self.new_tunnel.picking_dir = true;
        let start = Some(self.new_tunnel.dir.trim().to_string()).filter(|dir| !dir.is_empty()).map(PathBuf::from);
        let mailbox = self.mailbox.clone();
        self.runtime.spawn(async move {
            let mut dialog = rfd::AsyncFileDialog::new().set_title("Folder to share");
            if let Some(start) = start { dialog = dialog.set_directory(start); }
            let picked = dialog.pick_folder().await.map(|handle| handle.path().to_path_buf());
            mailbox.send(Msg::FolderPicked(picked));
        });
    }

    pub fn start_tunnel(&mut self, kind: TunnelKind, opts: Options) {
        let id = self.next_id();
        let target_label = opts.target.label();
        let (events, rx) = session::channel();
        let (handle, stop) = Stop::new();
        self.tunnels.push(TunnelCard {
            id, kind, target_label, access: None, state: TunnelState::Connecting, online: None,
            requests: VecDeque::new(), request_count: 0, started: Instant::now(), stop: handle, show_qr: false, copied_at: None,
        });
        self.forward(rx, move |event| Msg::Tunnel(id, event));
        let mailbox = self.mailbox.clone();
        self.runtime.spawn(async move {
            let result = async {
                let (opts, target, label, _local) = tunnel::prepare(opts).await?;
                mailbox.send(Msg::TunnelReady(id, label));
                tunnel::run(opts, target, events, stop).await
            }.await;
            if let Err(err) = result { mailbox.send(Msg::TunnelFailed(id, format!("{err:#}"))); }
        });
        self.page = Page::Tunnel(id);
    }

    pub fn start_join(&mut self, target: String, port: Option<u16>, bind: String) {
        let (code, server) = match connect::resolve(&target, None) {
            Ok((code, _, server)) => (code, server),
            Err(err) => { self.connect.error = Some(format!("{err:#}")); self.connect.link = target; return; }
        };
        self.connect = ConnectForm::default();
        if self.joins.iter().any(|join| join.code == code) {
            self.toast("That share is already connected");
            return;
        }
        let id = self.next_id();
        let (events, rx) = session::channel();
        let (handle, stop) = Stop::new();
        self.joins.insert(0, JoinCard {
            id, target: target.clone(), code, server,
            state: JoinState::Connecting, forwarding: None, started: Instant::now(), stop: handle,
        });
        let opts = connect::Options { target, port, bind, server: None, pick_port: None };
        self.forward(rx, move |event| Msg::Join(id, event));
        let mailbox = self.mailbox.clone();
        self.runtime.spawn(async move {
            if let Err(err) = connect::run(opts, events, stop).await {
                let port_in_use = err.downcast_ref::<connect::PortInUse>().map(|taken| taken.port);
                mailbox.send(Msg::JoinFailed(id, format!("{err:#}"), port_in_use));
            }
        });
    }

    fn fail_join(&mut self, id: u64, message: String, port_in_use: Option<u16>) {
        let Some(index) = self.joins.iter().position(|join| join.id == id) else { return };
        let join = self.joins.remove(index);
        if let Some(port) = port_in_use {
            self.connect.link = join.target;
            self.connect.retry_port = Some(port.saturating_add(1).to_string());
            self.connect.error = Some(message);
        } else {
            self.toast_error(message);
        }
    }

    pub fn stop_tunnel(&mut self, id: u64) {
        if let Some(index) = self.tunnels.iter().position(|card| card.id == id) {
            self.tunnels.remove(index).stop.stop();
        }
        if self.page == Page::Tunnel(id) { self.page = Page::Tunnels; }
    }

    pub fn stop_join(&mut self, id: u64) {
        if let Some(index) = self.joins.iter().position(|join| join.id == id) {
            self.joins.remove(index).stop.stop();
        }
    }

    pub fn tunnel_mut(&mut self, id: u64) -> Option<&mut TunnelCard> { self.tunnels.iter_mut().find(|card| card.id == id) }

    pub fn drain(&mut self, ctx: &egui::Context) {
        while let Ok(msg) = self.rx.try_recv() { self.handle(ctx, msg); }
    }

    fn handle(&mut self, ctx: &egui::Context, msg: Msg) {
        match msg {
            Msg::TunnelReady(id, label) => { if let Some(card) = self.tunnel_mut(id) { card.target_label = label; } }
            Msg::Tunnel(id, event) => self.handle_tunnel(id, event),
            Msg::TunnelFailed(id, message) => {
                self.stop_tunnel(id);
                self.toast_error(message);
            }
            Msg::Join(id, event) => self.handle_join(id, event),
            Msg::JoinFailed(id, message, port_in_use) => self.fail_join(id, message, port_in_use),
            Msg::Login(LoginEvent::Code { code, handoff_url }) => {
                ctx.open_url(egui::OpenUrl::new_tab(&handoff_url));
                self.login.stage = LoginStage::Waiting { code, url: handoff_url };
            }
            Msg::Login(LoginEvent::Linked { server_url, info }) => {
                self.login.stage = LoginStage::Idle;
                self.login.stop = None;
                self.reload_config();
                self.server_info = Some(Ok(info));
                self.toast(format!("This device is linked to {}", format::host_of(&server_url)));
            }
            Msg::LoginFailed(message) => { self.login.stage = LoginStage::Failed(message); self.login.stop = None; }
            Msg::Info(result) => self.server_info = Some(result),
            Msg::FolderPicked(path) => {
                self.new_tunnel.picking_dir = false;
                if let Some(path) = path { self.new_tunnel.dir = path.display().to_string(); }
            }
        }
    }

    fn handle_tunnel(&mut self, id: u64, event: TunnelEvent) {
        let Some(card) = self.tunnel_mut(id) else { return };
        let mut toast = None;
        match event {
            TunnelEvent::Connecting => card.state = TunnelState::Connecting,
            TunnelEvent::Online(online) | TunnelEvent::Resumed(online) | TunnelEvent::Replaced(online) => {
                let fresh = card.online.as_ref().is_none_or(|current| current.id != online.id);
                card.state = TunnelState::Online;
                if fresh { toast = Some(format!("Tunnel {} is online", online.id)); }
                card.access = online.access.clone();
                card.online = Some(online);
            }
            TunnelEvent::Connection(_) => {}
            TunnelEvent::Access(summary) => card.access = Some(summary),
            TunnelEvent::Request(request) => {
                card.request_count += 1;
                if card.requests.len() == MAX_REQUESTS { card.requests.pop_back(); }
                card.requests.push_front(LoggedRequest { request, at: Instant::now() });
            }
            TunnelEvent::Reconnecting { seconds, reason } => card.state = TunnelState::Reconnecting { seconds, reason },
            TunnelEvent::Stopped => self.stop_tunnel(id),
            TunnelEvent::Ended(reason) => { self.stop_tunnel(id); toast = Some(format!("Tunnel ended: {reason}")); }
        }
        if let Some(text) = toast { self.toast(text); }
    }

    fn handle_join(&mut self, id: u64, event: JoinEvent) {
        let Some(join) = self.joins.iter_mut().find(|join| join.id == id) else { return };
        match event {
            JoinEvent::Connecting => join.state = JoinState::Connecting,
            JoinEvent::Forwarding { port, tunnel_id, owner_online, .. } => {
                join.state = JoinState::Forwarding;
                join.forwarding = Some(Forwarding { port, tunnel_id, owner_online });
            }
            JoinEvent::Reconnecting { seconds, reason } => join.state = JoinState::Reconnecting { seconds, reason },
            JoinEvent::Reconnected => join.state = JoinState::Forwarding,
            JoinEvent::Stopped => self.stop_join(id),
            JoinEvent::Ended(reason) => { self.stop_join(id); self.toast(format!("Disconnected: {reason}")); }
        }
    }
}

pub struct Window<'a> {
    pub state: &'a mut State,
    wake: &'a Receiver<Wake>,
    pub logo: TextureHandle,
    qr: HashMap<u64, (String, TextureHandle)>,
    visible: bool,
    needs_show: bool,
    place_frames: u8,
}

impl<'a> Window<'a> {
    pub fn new(cc: &eframe::CreationContext<'_>, state: &'a mut State, wake: &'a Receiver<Wake>) -> Self {
        let logo = cc.egui_ctx.load_texture("logo",
            egui::ColorImage::from_rgba_unmultiplied([super::ICON_SIZE as usize; 2], super::ICON_RGBA), TextureOptions::LINEAR);
        let hidden_at_start = state.corner_position().is_none() && !hide_by_closing();
        Self { state, wake, logo, qr: HashMap::new(), visible: !hidden_at_start, needs_show: hidden_at_start, place_frames: 3 }
    }

    pub fn qr_for(&mut self, ctx: &egui::Context, card_id: u64, link: &str) -> Option<TextureHandle> {
        if let Some((known, texture)) = self.qr.get(&card_id) {
            if known == link { return Some(texture.clone()); }
        }
        let texture = qr_texture(ctx, &format!("qr-{card_id}"), link)?;
        self.qr.insert(card_id, (link.to_string(), texture.clone()));
        Some(texture)
    }

    fn place(&mut self, ctx: &egui::Context) {
        let area = super::work_area(ctx.pixels_per_point())
            .or_else(|| ctx.input(|input| input.viewport().monitor_size).map(|monitor| {
                egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(monitor.x, monitor.y - 48.0))
            }));
        let Some(area) = area else { return };
        if area.width() <= super::WINDOW_WIDTH || area.height() <= super::WINDOW_HEIGHT { return; }
        self.state.monitor = Some(area);
        ctx.send_viewport_cmd(egui::ViewportCommand::OuterPosition(super::corner_for(area)));
    }

    fn show(&mut self, ctx: &egui::Context) {
        ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(false));
        ctx.send_viewport_cmd(egui::ViewportCommand::Visible(true));
        ctx.send_viewport_cmd(egui::ViewportCommand::Focus);
        self.visible = true;
        self.place_frames = 3;
        ctx.request_repaint();
    }

    pub fn minimize(&mut self, ctx: &egui::Context) {
        if !self.state.has_tray {
            ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(true));
        } else if hide_by_closing() {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        } else {
            ctx.send_viewport_cmd(egui::ViewportCommand::Visible(false));
            self.visible = false;
        }
    }

    pub fn quit(&mut self, ctx: &egui::Context) {
        self.state.quitting = true;
        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
    }

    fn wake_events(&mut self, ctx: &egui::Context) {
        while let Ok(wake) = self.wake.try_recv() {
            match wake {
                Wake::Toggle => if self.visible { self.minimize(ctx) } else { self.show(ctx) },
                Wake::Show => self.show(ctx),
                Wake::OpenLink(link) => { if let Some(link) = link { self.state.open_link(link); } self.show(ctx); }
                Wake::Quit => self.quit(ctx),
            }
        }
    }

    fn nav(&mut self, root: &mut Ui) {
        let ctx = root.ctx().clone();
        let frame = Frame::new().fill(theme::BACKGROUND).inner_margin(Margin::symmetric(theme::GUTTER as i8, 0));
        egui::Panel::top("nav").frame(frame).exact_size(52.0).resizable(false).show_separator_line(false).show(root, |ui| {
            ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                ui.spacing_mut().item_spacing.x = 6.0;
                ui.image((self.logo.id(), egui::vec2(22.0, 22.0)));
                widgets::text_family(ui, "tunlit", 15.0, theme::TEXT, theme::bold());
                ui.add_space(6.0);
                for (page, label) in [(Page::Tunnels, "Tunnels"), (Page::Connect, "Connect"), (Page::Settings, "Settings")] {
                    let active = match (self.state.page, page) {
                        (Page::Tunnels | Page::NewTunnel | Page::Tunnel(_), Page::Tunnels) => true,
                        (current, target) => current == target,
                    };
                    if nav_link(ui, label, active).clicked() { self.state.page = page; }
                }
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if widgets::minimize_button(ui).clicked() { self.minimize(&ctx); }
                });
            });
            let rect = ui.max_rect();
            let y = rect.bottom() + 0.5;
            ui.painter().line_segment([egui::pos2(rect.left() - theme::GUTTER, y), egui::pos2(rect.right() + theme::GUTTER, y)], Stroke::new(1.0, theme::BORDER));
        });
    }

    fn toasts(&mut self, ctx: &egui::Context) {
        self.state.toasts.retain(|toast| toast.at.elapsed() < TOAST_FOR);
        if self.state.toasts.is_empty() { return; }
        ctx.request_repaint_after(Duration::from_millis(250));
        egui::Area::new(egui::Id::new("toasts")).anchor(egui::Align2::CENTER_BOTTOM, egui::vec2(0.0, -16.0)).order(egui::Order::Foreground).show(ctx, |ui| {
            ui.set_max_width(super::WINDOW_WIDTH - 32.0);
            ui.vertical(|ui| {
                for toast in &self.state.toasts {
                    let (color, dot) = if toast.error { (theme::ERROR, theme::ERROR) } else { (theme::TEXT, theme::SUCCESS) };
                    Frame::new().fill(theme::SURFACE_RAISED).stroke(Stroke::new(1.0, theme::BORDER_STRONG))
                        .corner_radius(theme::corner(theme::RADIUS_INPUT)).inner_margin(Margin::symmetric(14, 10))
                        .shadow(egui::epaint::Shadow { offset: [0, 6], blur: 24, spread: 0, color: Color32::from_black_alpha(140) })
                        .show(ui, |ui| {
                            ui.horizontal(|ui| {
                                widgets::dot(ui, dot);
                                ui.add(egui::Label::new(RichText::new(&toast.text).size(13.0).color(color)).wrap());
                            });
                        });
                }
            });
        });
    }

    pub fn content(ui: &mut Ui, add: impl FnOnce(&mut Ui)) {
        let total = ui.available_width();
        let width = total - theme::GUTTER * 2.0;
        let outer = ui.available_rect_before_wrap();
        let rect = egui::Rect::from_min_size(egui::pos2(outer.left() + theme::GUTTER, outer.top() + 20.0), egui::vec2(width, f32::INFINITY));
        let mut child = ui.new_child(UiBuilder::new().max_rect(rect).layout(Layout::top_down(Align::Min)));
        child.set_width(width);
        add(&mut child);
        ui.allocate_space(egui::vec2(total, child.min_rect().height() + 20.0 + 40.0));
    }
}

fn nav_link(ui: &mut Ui, label: &str, active: bool) -> egui::Response {
    let galley = ui.painter().layout_no_wrap(label.to_string(), theme::font(13.0, theme::medium()), Color32::WHITE);
    let size = galley.size() + egui::vec2(18.0, 10.0);
    let (rect, response) = ui.allocate_exact_size(size, Sense::click());
    let fill = if active { theme::SURFACE_HOVER } else { Color32::TRANSPARENT };
    let color = if active || response.hovered() { theme::TEXT } else { theme::MUTED };
    ui.painter().rect_filled(rect, theme::corner(theme::RADIUS_SMALL), fill);
    ui.painter().galley(rect.center() - galley.size() / 2.0, galley, color);
    if response.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
    response
}

pub fn qr_texture(ctx: &egui::Context, name: &str, text: &str) -> Option<TextureHandle> {
    let code = qrcode::QrCode::new(text.as_bytes()).ok()?;
    let width = code.width();
    let quiet = 2;
    let size = width + quiet * 2;
    let colors = code.to_colors();
    let mut rgba = vec![0u8; size * size * 4];
    for y in 0..size {
        for x in 0..size {
            let inside = quiet..width + quiet;
            let dark = inside.contains(&x) && inside.contains(&y) && colors[(y - quiet) * width + (x - quiet)] == qrcode::Color::Dark;
            let color = if dark { theme::BACKGROUND } else { theme::TEXT };
            let offset = (y * size + x) * 4;
            rgba[offset..offset + 4].copy_from_slice(&[color.r(), color.g(), color.b(), 255]);
        }
    }
    let image = egui::ColorImage::from_rgba_unmultiplied([size, size], &rgba);
    Some(ctx.load_texture(name, image, TextureOptions::NEAREST))
}

impl eframe::App for Window<'_> {
    fn logic(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.wake_events(ctx);
        self.state.drain(ctx);
    }

    fn ui(&mut self, root: &mut Ui, _frame: &mut eframe::Frame) {
        let ctx = root.ctx().clone();
        let closing = ctx.input(|input| input.viewport().close_requested());
        if closing && !self.state.quitting && self.state.has_tray && !hide_by_closing() {
            ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
            self.minimize(&ctx);
        }
        if self.needs_show { self.needs_show = false; self.show(&ctx); }
        if self.place_frames > 0 {
            self.place_frames -= 1;
            self.place(&ctx);
            ctx.request_repaint_after(Duration::from_millis(30));
        }
        let rect = ctx.content_rect();
        ctx.layer_painter(egui::LayerId::background()).rect_stroke(rect, 0.0, Stroke::new(1.0, theme::BORDER_STRONG), egui::StrokeKind::Inside);
        self.nav(root);
        egui::CentralPanel::default().frame(Frame::new().fill(theme::BACKGROUND)).show(root, |ui| {
            let scroll_id = match self.state.page { Page::Tunnels => 0u64, Page::NewTunnel => 1, Page::Tunnel(id) => 100 + id, Page::Connect => 2, Page::Settings => 3 };
            egui::ScrollArea::vertical().id_salt(("page", scroll_id)).auto_shrink([false, false]).show(ui, |ui| {
                match self.state.page {
                    Page::Tunnels => self.tunnels_page(ui),
                    Page::NewTunnel => self.new_tunnel_page(ui),
                    Page::Tunnel(id) => self.tunnel_page(ui, id),
                    Page::Connect => self.connect_page(ui),
                    Page::Settings => self.settings_page(ui),
                }
            });
        });
        self.toasts(&ctx);
    }
}

pub fn state_chip(ui: &mut Ui, state: &TunnelState) {
    match state {
        TunnelState::Connecting => widgets::chip(ui, "Connecting", ChipKind::Neutral),
        TunnelState::Online => widgets::chip(ui, "Online", ChipKind::Online),
        TunnelState::Reconnecting { .. } => widgets::chip(ui, "Reconnecting", ChipKind::Warning),
    };
}

pub fn state_dot(state: &TunnelState) -> Color32 {
    match state {
        TunnelState::Connecting => theme::MUTED,
        TunnelState::Online => theme::SUCCESS,
        TunnelState::Reconnecting { .. } => theme::WARNING,
    }
}

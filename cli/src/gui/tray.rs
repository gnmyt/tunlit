use anyhow::Result;
use std::sync::mpsc::Sender;
use tokio::runtime::Handle;
use super::{Repaint, Wake};

const ICON_SIZE: u32 = 32;
const ICON_RGBA: &[u8] = include_bytes!("../../assets/icon-32.rgba");

pub struct Tray { _keep: Box<dyn std::any::Any> }

#[derive(Clone)]
struct Notifier { wake: Sender<Wake>, repaint: Repaint }

impl Notifier {
    fn send(&self, wake: Wake) {
        let _ = self.wake.send(wake);
        self.repaint.ping();
    }
}

#[cfg(target_os = "linux")]
pub fn start(wake: Sender<Wake>, repaint: Repaint, runtime: &Handle) -> Result<Tray> {
    use ksni::{menu::{MenuItem, StandardItem}, Icon, ToolTip, TrayMethods};

    struct TunlitTray { notify: Notifier }

    impl ksni::Tray for TunlitTray {
        fn id(&self) -> String { "tunlit".into() }
        fn title(&self) -> String { "tunlit".into() }
        fn tool_tip(&self) -> ToolTip { ToolTip { title: "tunlit".into(), ..Default::default() } }
        fn icon_pixmap(&self) -> Vec<Icon> {
            let mut data = Vec::with_capacity(ICON_RGBA.len());
            for pixel in ICON_RGBA.chunks(4) { data.extend_from_slice(&[pixel[3], pixel[0], pixel[1], pixel[2]]); }
            vec![Icon { width: ICON_SIZE as i32, height: ICON_SIZE as i32, data }]
        }
        fn activate(&mut self, _x: i32, _y: i32) { self.notify.send(Wake::Toggle); }
        fn menu(&self) -> Vec<MenuItem<Self>> {
            vec![
                StandardItem { label: "Open tunlit".into(), activate: Box::new(|tray: &mut Self| tray.notify.send(Wake::Show)), ..Default::default() }.into(),
                MenuItem::Separator,
                StandardItem { label: "Quit".into(), activate: Box::new(|tray: &mut Self| tray.notify.send(Wake::Quit)), ..Default::default() }.into(),
            ]
        }
    }

    let tray = TunlitTray { notify: Notifier { wake, repaint } };
    let handle = runtime.block_on(tray.spawn()).map_err(|err| anyhow::anyhow!("No tray available: {err}"))?;
    Ok(Tray { _keep: Box::new(handle) })
}

#[cfg(any(windows, target_os = "macos"))]
pub fn start(wake: Sender<Wake>, repaint: Repaint, _runtime: &Handle) -> Result<Tray> {
    use tray_icon::{menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem}, Icon, MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let notify = Notifier { wake, repaint };

    let menu = Menu::new();
    let open = MenuItem::new("Open tunlit", true, None);
    let quit = MenuItem::new("Quit", true, None);
    menu.append_items(&[&open, &PredefinedMenuItem::separator(), &quit])?;
    let (open_id, quit_id) = (open.id().clone(), quit.id().clone());

    let icon = Icon::from_rgba(ICON_RGBA.to_vec(), ICON_SIZE, ICON_SIZE)?;
    let tray = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip("tunlit")
        .with_icon(icon)
        .with_icon_as_template(cfg!(target_os = "macos"))
        .with_menu_on_left_click(false)
        .build()?;

    let clicks = notify.clone();
    TrayIconEvent::set_event_handler(Some(move |event: TrayIconEvent| {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
            clicks.send(Wake::Toggle);
        }
    }));
    MenuEvent::set_event_handler(Some(move |event: MenuEvent| {
        if *event.id() == open_id { notify.send(Wake::Show); }
        else if *event.id() == quit_id { notify.send(Wake::Quit); }
    }));
    Ok(Tray { _keep: Box::new(tray) })
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
pub fn start(_wake: Sender<Wake>, _repaint: Repaint, _runtime: &Handle) -> Result<Tray> {
    anyhow::bail!("No tray on this platform")
}

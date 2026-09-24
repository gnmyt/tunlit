use eframe::egui::{self, Align, Layout, Ui};
use crate::auth;
use crate::gui::app::Window;
use crate::gui::widgets::{self, ButtonKind};
use crate::gui::{autostart, theme, HOTKEY_LABEL};

impl Window<'_> {
    pub fn settings_page(&mut self, ui: &mut Ui) {
        let logo = self.logo.id();
        let mut quit = false;
        let state = &mut self.state;
        let server_url = state.cfg.server_url();
        Window::content(ui, |ui| {
            widgets::heading(ui, "Settings");
            ui.add_space(16.0);

            widgets::section(ui, "Server", None);
            widgets::card(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.scope(|ui| {
                        ui.set_max_width(ui.available_width() - 90.0);
                        match &server_url {
                            Some(url) => { ui.add(egui::Label::new(egui::RichText::new(url).size(14.0).color(theme::TEXT).family(theme::mono())).truncate()); }
                            None => { widgets::text(ui, "No server yet", 14.0, theme::SUBTEXT); }
                        }
                    });
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        if state.linked() { widgets::text(ui, "Linked", 12.5, theme::SUCCESS); }
                        else if server_url.is_some() { widgets::text(ui, "Not linked", 12.5, theme::WARNING); }
                    });
                });
                ui.add_space(4.0);
                match (&server_url, &state.server_info) {
                    (None, _) => {}
                    (Some(_), Some(Ok(info))) => { ui.add(egui::Label::new(egui::RichText::new(format!("{} {} · tunnels under {}", info.name, info.version, info.base_domain)).size(12.5).color(theme::SUBTEXT)).wrap()); }
                    (Some(_), Some(Err(err))) => { ui.add(egui::Label::new(egui::RichText::new(format!("Not reachable: {err}")).size(12.5).color(theme::ERROR)).wrap()); }
                    (Some(_), None) => { widgets::text(ui, "Checking...", 12.5, theme::MUTED); }
                }
                if let Some(me) = &state.me {
                    ui.add_space(2.0);
                    widgets::text(ui, format!("Signed in as {}", me.label()), 12.5, theme::SUBTEXT);
                }
                if state.linked() {
                    ui.add_space(10.0);
                    if widgets::button(ui, "Unlink this device", ButtonKind::Danger).clicked() {
                        match auth::logout() {
                            Ok(_) => { state.reload_config(); state.toast("Device unlinked"); }
                            Err(err) => state.toast_error(format!("{err:#}")),
                        }
                    }
                }
                ui.add_space(12.0);
                widgets::divider(ui);
                ui.add_space(12.0);
                let mut accept = state.cfg.accept_invalid_certs;
                if widgets::toggle_row(ui, "Accept self-signed certificates", "", &mut accept).changed() {
                    state.cfg.accept_invalid_certs = accept;
                    state.login.accept_invalid = accept;
                    match state.cfg.save() { Ok(_) => state.fetch_info(), Err(err) => state.toast_error(format!("{err:#}")) }
                }
            });

            if state.has_tray {
                ui.add_space(24.0);
                widgets::section(ui, "Window", None);
                widgets::card(ui, |ui| {
                    ui.spacing_mut().item_spacing.y = 14.0;
                    let mut autostart_on = state.autostart;
                    if widgets::toggle_row(ui, "Launch at login", "Starts hidden in the tray", &mut autostart_on).changed() {
                        match autostart::set(autostart_on) {
                            Ok(_) => state.autostart = autostart_on,
                            Err(err) => state.toast_error(format!("{err:#}")),
                        }
                    }
                    if state.hotkey { widgets::text(ui, format!("{HOTKEY_LABEL} shows or hides the window"), 12.5, theme::MUTED); }
                });
            }

            ui.add_space(24.0);
            widgets::section(ui, "About", None);
            widgets::card(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.image((logo, egui::vec2(32.0, 32.0)));
                    widgets::text_family(ui, format!("tunlit {}", env!("CARGO_PKG_VERSION")), 14.0, theme::TEXT, theme::semibold());
                    if state.has_tray {
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            if widgets::button(ui, "Quit", ButtonKind::Danger).clicked() { quit = true; }
                        });
                    }
                });
                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    if widgets::button(ui, "Documentation", ButtonKind::Ghost).clicked() { ui.ctx().open_url(egui::OpenUrl::new_tab("https://docs.tunlit.dev/cli")); }
                    if widgets::button(ui, "GitHub", ButtonKind::Ghost).clicked() { ui.ctx().open_url(egui::OpenUrl::new_tab("https://github.com/gnmyt/tunlit")); }
                });
            });
        });
        if quit { self.quit(&ui.ctx().clone()); }
    }
}

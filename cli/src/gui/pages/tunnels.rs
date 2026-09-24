use eframe::egui::{self, Align, Layout, Ui};
use crate::gui::app::{state_dot, LoginStage, Page, TunnelState, Window};
use crate::gui::widgets::{self, ButtonKind, FieldOptions};
use crate::gui::{format, theme};

impl Window<'_> {
    pub fn tunnels_page(&mut self, ui: &mut Ui) {
        Window::content(ui, |ui| {
            if !self.state.linked() {
                self.login_card(ui);
                return;
            }

            let state = &mut self.state;
            let online = state.tunnels.iter().filter(|card| matches!(card.state, TunnelState::Online)).count();
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.spacing_mut().item_spacing.y = 2.0;
                    widgets::heading(ui, "Tunnels");
                    widgets::text(ui, format!("{online} of {} online", state.tunnels.len()), 12.5, theme::MUTED);
                });
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if widgets::button(ui, "New tunnel", ButtonKind::Primary).clicked() {
                        state.new_tunnel.error = None;
                        state.page = Page::NewTunnel;
                    }
                });
            });
            ui.add_space(16.0);

            if state.tunnels.is_empty() {
                widgets::empty_state(ui, "No tunnels yet", "Share a port, a folder or a TCP service.", |ui| {
                    if widgets::button(ui, "Open your first tunnel", ButtonKind::Secondary).clicked() { state.page = Page::NewTunnel; }
                });
                return;
            }

            let server_url = state.server_url();
            let mut open = None;
            ui.spacing_mut().item_spacing.y = 8.0;
            for card in &state.tunnels {
                let response = widgets::clickable_card(ui, ("tunnel-row", card.id), |ui| {
                    ui.vertical(|ui| {
                        ui.spacing_mut().item_spacing.y = 4.0;
                        ui.horizontal(|ui| {
                            ui.spacing_mut().item_spacing.x = 8.0;
                            widgets::dot(ui, state_dot(&card.state));
                            widgets::mono(ui, card.title(), 14.0, theme::TEXT);
                            widgets::text(ui, card.kind.label(), 12.0, theme::MUTED);
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                widgets::text(ui, "›", 16.0, theme::MUTED);
                                widgets::text(ui, format::ago(card.started), 12.0, theme::MUTED);
                            });
                        });
                        let link = card.link(&server_url).unwrap_or_else(|| "connecting...".into());
                        ui.horizontal(|ui| {
                            ui.add_space(16.0);
                            ui.add(egui::Label::new(egui::RichText::new(format!("{link}  ·  {}", card.target_label)).size(12.5).color(theme::SUBTEXT)).truncate());
                        });
                    });
                });
                if response.clicked() { open = Some(card.id); }
            }
            if let Some(id) = open { state.page = Page::Tunnel(id); }
        });
    }

    fn login_card(&mut self, ui: &mut Ui) {
        let logo = self.logo.id();
        let state = &mut self.state;
        ui.vertical_centered(|ui| {
            ui.add_space(28.0);
            ui.image((logo, egui::vec2(56.0, 56.0)));
            ui.add_space(12.0);
            widgets::text_family(ui, "Link this device.", 24.0, theme::TEXT, theme::semibold());
            ui.add_space(24.0);

            ui.with_layout(Layout::top_down(Align::Min), |ui| {
                match &state.login.stage {
                    LoginStage::Idle | LoginStage::Failed(_) => {
                        let mut submit = widgets::field(ui, "login-server", &mut state.login.server,
                            FieldOptions { label: Some("Server URL"), hint: "https://tunlit.example.com", ..Default::default() }).lost_focus()
                            && ui.input(|input| input.key_pressed(egui::Key::Enter));
                        ui.add_space(10.0);
                        widgets::toggle_row(ui, "Accept self-signed certificates", "", &mut state.login.accept_invalid);
                        ui.add_space(8.0);
                        if let LoginStage::Failed(message) = &state.login.stage {
                            widgets::error_notice(ui, message);
                            ui.add_space(8.0);
                        }
                        if widgets::button_sized(ui, "Continue", ButtonKind::Primary, ui.available_width()).clicked() { submit = true; }
                        if submit { state.start_login(); }
                    }
                    LoginStage::Starting => {
                        ui.horizontal(|ui| { ui.spinner(); widgets::text(ui, "Contacting the server...", 14.0, theme::SUBTEXT); });
                    }
                    LoginStage::Waiting { code, url } => {
                        let code = code.clone();
                        let url = url.clone();
                        widgets::card(ui, |ui| {
                            ui.vertical_centered(|ui| {
                                widgets::text(ui, "Approve this device in your browser", 14.0, theme::SUBTEXT);
                                ui.add_space(8.0);
                                widgets::text_family(ui, &code, 30.0, theme::PRIMARY_BRIGHT, theme::bold());
                                ui.add_space(8.0);
                                ui.horizontal(|ui| { ui.spinner(); widgets::text(ui, "Waiting for approval...", 13.0, theme::MUTED); });
                            });
                        });
                        ui.add_space(10.0);
                        ui.horizontal(|ui| {
                            if widgets::button(ui, "Open approval page", ButtonKind::Secondary).clicked() { ui.ctx().open_url(egui::OpenUrl::new_tab(&url)); }
                            if widgets::button(ui, "Cancel", ButtonKind::Ghost).clicked() { state.cancel_login(); }
                        });
                    }
                }
            });
        });
    }
}

use eframe::egui::{self, Align, Layout, Ui};
use crate::gui::app::{JoinState, Window};
use crate::gui::widgets::{self, ButtonKind, ChipKind, FieldOptions};
use crate::gui::{format, theme};

impl Window<'_> {
    pub fn connect_page(&mut self, ui: &mut Ui) {
        let logo = self.logo.id();
        let state = &mut self.state;
        Window::content(ui, |ui| {
            let mut start = None;
            ui.vertical_centered(|ui| {
                ui.add_space(if state.joins.is_empty() { 96.0 } else { 24.0 });
                ui.image((logo, egui::vec2(56.0, 56.0)));
                ui.add_space(14.0);
                widgets::text_family(ui, "Paste a share link.", 24.0, theme::TEXT, theme::semibold());
                ui.add_space(20.0);
                ui.with_layout(Layout::top_down(Align::Min), |ui| {
                    let form = &mut state.connect;
                    let mut submit = widgets::field(ui, "connect-link", &mut form.link, FieldOptions { hint: "https://tunlit.example.com/@tunlit/connect/…", mono: true, ..Default::default() }).lost_focus()
                        && ui.input(|input| input.key_pressed(egui::Key::Enter));
                    ui.add_space(10.0);
                    if let Some(error) = &form.error { widgets::error_notice(ui, error); ui.add_space(10.0); }
                    if let Some(port) = &mut form.retry_port {
                        widgets::field(ui, "connect-port", port, FieldOptions { label: Some("Local port"), hint: "4000", mono: true, ..Default::default() });
                        ui.add_space(10.0);
                    }
                    if widgets::button_sized(ui, "Connect", ButtonKind::Primary, ui.available_width()).clicked() { submit = true; }
                    if submit {
                        let link = form.link.trim().to_string();
                        let port = form.retry_port.as_ref().map(|port| port.trim().parse::<u16>()).transpose();
                        if link.is_empty() {
                            form.error = Some("Paste a share link first".into());
                        } else if let Ok(port) = port {
                            start = Some((link, port));
                        } else {
                            form.error = Some("The local port must be a number between 1 and 65535".into());
                        }
                    }
                });
            });
            if let Some((link, port)) = start { state.start_join(link, port, "127.0.0.1".into()); }

            if state.joins.is_empty() { return; }
            ui.add_space(36.0);

            let mut stop = None;
            ui.spacing_mut().item_spacing.y = 8.0;
            for join in &state.joins {
                widgets::card(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.spacing_mut().item_spacing.x = 8.0;
                        match &join.state {
                            JoinState::Connecting => { widgets::chip(ui, "Connecting", ChipKind::Neutral); }
                            JoinState::Forwarding => { widgets::dot(ui, theme::SUCCESS); }
                            JoinState::Reconnecting { .. } => { widgets::chip(ui, "Reconnecting", ChipKind::Warning); }
                        }
                        ui.scope(|ui| {
                            ui.set_max_width(ui.available_width() - 84.0);
                            if let Some(forwarding) = &join.forwarding {
                                widgets::mono(ui, format!("Port {}", forwarding.port), 14.0, theme::TEXT);
                                widgets::text(ui, "→", 13.0, theme::MUTED);
                                ui.add(egui::Label::new(egui::RichText::new(&forwarding.tunnel_id).size(13.0).color(theme::PRIMARY_BRIGHT).family(theme::mono())).truncate());
                            } else {
                                ui.add(egui::Label::new(egui::RichText::new(&join.target).size(12.5).color(theme::SUBTEXT).family(theme::mono())).truncate());
                            }
                        });
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            if widgets::button(ui, "Stop", ButtonKind::Danger).clicked() { stop = Some(join.id); }
                        });
                    });
                    ui.add_space(2.0);
                    widgets::text(ui, format!("{} · {}", format::host_of(&join.server), format::ago(join.started)), 12.0, theme::MUTED);

                    match &join.state {
                        JoinState::Reconnecting { seconds, reason } => {
                            ui.add_space(8.0);
                            let text = match reason { Some(reason) => format!("Connection lost, retrying in {seconds}s ({reason})"), None => "Connection lost, reconnecting...".to_string() };
                            widgets::warning_notice(ui, &text);
                        }
                        JoinState::Forwarding if join.forwarding.as_ref().is_some_and(|f| !f.owner_online) => {
                            ui.add_space(8.0);
                            widgets::warning_notice(ui, "The owner is offline right now.");
                        }
                        _ => {}
                    }
                });
            }
            if let Some(id) = stop { state.stop_join(id); }
        });
    }
}

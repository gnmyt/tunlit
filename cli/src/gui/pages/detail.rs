use eframe::egui::{self, Align, Layout, Ui};
use crate::gui::app::{state_chip, Page, TunnelKind, TunnelState, Window};
use crate::gui::widgets::{self, ButtonKind, ChipKind};
use crate::gui::{format, theme};

impl Window<'_> {
    pub fn tunnel_page(&mut self, ui: &mut Ui, id: u64) {
        let server_url = self.state.server_url();
        let Some(index) = self.state.tunnels.iter().position(|card| card.id == id) else { self.state.page = Page::Tunnels; return };
        let link = self.state.tunnels[index].link(&server_url);
        let qr = match (&link, self.state.tunnels[index].show_qr) {
            (Some(link), true) => self.qr_for(&ui.ctx().clone(), id, link),
            _ => None,
        };
        let mut go_back = false;
        let mut stop = false;

        Window::content(ui, |ui| {
            let card = &mut self.state.tunnels[index];
            if widgets::back_link(ui, "Tunnels").clicked() { go_back = true; }
            ui.add_space(12.0);

            ui.add(egui::Label::new(egui::RichText::new(card.title()).size(20.0).color(theme::TEXT).family(theme::semibold())).truncate());
            ui.add_space(6.0);
            ui.horizontal_wrapped(|ui| {
                ui.spacing_mut().item_spacing = egui::vec2(6.0, 6.0);
                state_chip(ui, &card.state);
                widgets::chip(ui, card.kind.label(), ChipKind::Neutral);
                widgets::chip(ui, &card.target_label, ChipKind::Mono);
                if let Some(access) = &card.access { widgets::chip(ui, access, ChipKind::Warning); }
                widgets::text(ui, format!("Started {}", format::ago(card.started)), 12.0, theme::MUTED);
            });
            ui.add_space(12.0);
            ui.horizontal(|ui| {
                if let Some(url) = card.online.as_ref().and_then(|online| online.url.clone()) {
                    if widgets::button(ui, "Open in browser", ButtonKind::Secondary).clicked() { ui.ctx().open_url(egui::OpenUrl::new_tab(url)); }
                }
                if widgets::button(ui, "Stop", ButtonKind::Danger).clicked() { stop = true; }
            });
            ui.add_space(12.0);

            if let TunnelState::Reconnecting { seconds, reason } = &card.state {
                let text = match reason { Some(reason) => format!("Connection lost, retrying in {seconds}s ({reason})"), None => "Connection lost, reconnecting...".to_string() };
                widgets::warning_notice(ui, &text);
                ui.add_space(12.0);
            }

            if let Some(link) = &link {
                let is_share = card.online.as_ref().is_some_and(|online| online.url.is_none());
                let shown = if is_share { format!("tunlit connect {link}") } else { link.clone() };
                widgets::copy_row(ui, ("copy", card.id), &shown, &mut card.copied_at);
                ui.add_space(8.0);
                let label = if card.show_qr { "Hide QR code" } else { "Show QR code" };
                if widgets::button(ui, label, ButtonKind::Ghost).clicked() { card.show_qr = !card.show_qr; }
                if let Some(qr) = &qr {
                    ui.vertical_centered(|ui| {
                        egui::Frame::new().fill(theme::TEXT).corner_radius(theme::corner(theme::RADIUS_INPUT)).inner_margin(egui::Margin::same(8)).show(ui, |ui| {
                            ui.image((qr.id(), egui::vec2(176.0, 176.0)));
                        });
                    });
                }
            } else if card.state == TunnelState::Connecting {
                ui.horizontal(|ui| { ui.spinner(); widgets::text(ui, "Connecting to the server...", 14.0, theme::SUBTEXT); });
            }

            if card.kind != TunnelKind::Tcp {
                ui.add_space(20.0);
                widgets::section(ui, "Requests", Some(&format!("{} so far", card.request_count)));
                widgets::card(ui, |ui| {
                    if card.requests.is_empty() {
                        widgets::text(ui, "No requests yet.", 13.0, theme::MUTED);
                        return;
                    }
                    ui.spacing_mut().item_spacing.y = 6.0;
                    for logged in card.requests.iter().take(100) {
                        let request = &logged.request;
                        ui.horizontal(|ui| {
                            ui.spacing_mut().item_spacing.x = 8.0;
                            let method = if request.kind == "ws" { "WS".to_string() } else { request.method.clone() };
                            ui.allocate_ui_with_layout(egui::vec2(44.0, 18.0), Layout::left_to_right(Align::Center), |ui| { widgets::mono(ui, method, 12.0, theme::TEXT); });
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                ui.allocate_ui_with_layout(egui::vec2(48.0, 18.0), Layout::right_to_left(Align::Center), |ui| { widgets::mono(ui, format!("{}ms", request.duration), 11.5, theme::MUTED); });
                                widgets::status_chip(ui, request.status);
                                ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                                    ui.add(egui::Label::new(egui::RichText::new(&request.path).size(12.0).color(theme::SUBTEXT).family(theme::mono())).truncate())
                                        .on_hover_text(format!("{} · {}", request.ip, format::ago(logged.at)));
                                });
                            });
                        });
                    }
                });
            }
        });

        if stop { self.state.stop_tunnel(id); }
        if go_back { self.state.page = Page::Tunnels; }
    }
}

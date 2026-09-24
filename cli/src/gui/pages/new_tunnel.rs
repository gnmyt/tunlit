use eframe::egui::{self, Align, Layout, Ui};
use crate::gui::app::{AuthChoice, NewTunnelForm, Page, TunnelKind, Window};
use crate::gui::widgets::{self, ButtonKind, FieldOptions};
use crate::gui::theme;
use crate::tunnel::{Access, Options, Rules, Target, TargetSpec};

impl Window<'_> {
    pub fn new_tunnel_page(&mut self, ui: &mut Ui) {
        let state = &mut self.state;
        Window::content(ui, |ui| {
            if widgets::back_link(ui, "Tunnels").clicked() { state.page = Page::Tunnels; }
            ui.add_space(12.0);
            widgets::text_family(ui, "New tunnel", 22.0, theme::TEXT, theme::semibold());
            ui.add_space(16.0);

            let mut submit = false;
            ui.horizontal(|ui| {
                widgets::segmented(ui, &mut state.new_tunnel.kind, &[(TunnelKind::Http, "HTTP"), (TunnelKind::Files, "Folder"), (TunnelKind::Tcp, "TCP + UDP")]);
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if widgets::button(ui, "Open", ButtonKind::Primary).clicked() { submit = true; }
                });
            });
            if let Some(error) = &state.new_tunnel.error {
                ui.add_space(10.0);
                widgets::error_notice(ui, error);
            }
            ui.add_space(14.0);

            let mut browse = false;
            let form = &mut state.new_tunnel;
            widgets::card(ui, |ui| {
                ui.spacing_mut().item_spacing.y = 14.0;
                match form.kind {
                    TunnelKind::Http => {
                        widgets::field(ui, "nt-target", &mut form.target, FieldOptions { label: Some("Local target"), hint: "3000, 192.168.1.5:8080 or https://localhost:8443", mono: true, ..Default::default() });
                    }
                    TunnelKind::Files => {
                        ui.vertical(|ui| {
                            ui.spacing_mut().item_spacing.y = 6.0;
                            widgets::field_label(ui, "Folder");
                            ui.horizontal(|ui| {
                                let width = ui.available_width() - 96.0;
                                widgets::field(ui, "nt-dir", &mut form.dir, FieldOptions { hint: "/path/to/dist", mono: true, width: Some(width), ..Default::default() });
                                ui.add_enabled_ui(!form.picking_dir, |ui| {
                                    if widgets::button(ui, "Browse", ButtonKind::Secondary).clicked() { browse = true; }
                                });
                            });
                        });
                    }
                    TunnelKind::Tcp => {
                        widgets::field(ui, "nt-tcp", &mut form.target, FieldOptions { label: Some("Local port"), hint: "25565 or 192.168.1.5:5432", mono: true, ..Default::default() });
                    }
                }
                widgets::field(ui, "nt-name", &mut form.name, FieldOptions { label: Some("Name (optional)"), hint: "myapp", mono: true, ..Default::default() });
                if form.kind == TunnelKind::Http {
                    widgets::toggle_row(ui, "Keep the public host", "Send the public hostname as the Host header", &mut form.keep_host);
                }
            });

            ui.add_space(16.0);
            widgets::section(ui, "Access", None);
            widgets::card(ui, |ui| {
                ui.spacing_mut().item_spacing.y = 14.0;
                if form.kind != TunnelKind::Tcp {
                    ui.vertical(|ui| {
                        ui.spacing_mut().item_spacing.y = 6.0;
                        widgets::field_label(ui, "Sign-in");
                        let label = match form.auth { AuthChoice::Open => "Open to everyone", AuthChoice::Password => "Ask for a password", AuthChoice::Login => "Require a tunlit account" };
                        egui::ComboBox::from_id_salt("nt-auth").selected_text(label).width(ui.available_width()).show_ui(ui, |ui| {
                            ui.selectable_value(&mut form.auth, AuthChoice::Open, "Open to everyone");
                            ui.selectable_value(&mut form.auth, AuthChoice::Password, "Ask for a password");
                            ui.selectable_value(&mut form.auth, AuthChoice::Login, "Require a tunlit account");
                        });
                    });
                    if form.auth == AuthChoice::Password {
                        widgets::field(ui, "nt-password", &mut form.password, FieldOptions { label: Some("Password"), hint: "hunter2", secret: true, ..Default::default() });
                    }
                }
                ui.vertical(|ui| {
                    ui.spacing_mut().item_spacing.y = 6.0;
                    widgets::field_label(ui, "Allowed addresses");
                    ui.horizontal(|ui| {
                        let width = ui.available_width() - 80.0;
                        let entered = widgets::field(ui, "nt-allow", &mut form.allow_input, FieldOptions { hint: "203.0.113.5 or 10.0.0.0/8", mono: true, width: Some(width), ..Default::default() }).lost_focus()
                            && ui.input(|input| input.key_pressed(egui::Key::Enter));
                        if widgets::button(ui, "Add", ButtonKind::Secondary).clicked() || entered {
                            let value = form.allow_input.trim().to_string();
                            if !value.is_empty() && !form.allow.contains(&value) { form.allow.push(value); }
                            form.allow_input.clear();
                        }
                    });
                    let mut drop = None;
                    for (index, cidr) in form.allow.iter().enumerate() {
                        ui.horizontal(|ui| {
                            widgets::mono(ui, cidr, 13.0, theme::SUBTEXT);
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                if widgets::button(ui, "Remove", ButtonKind::Ghost).clicked() { drop = Some(index); }
                            });
                        });
                    }
                    if let Some(index) = drop { form.allow.remove(index); }
                });
            });

            if browse { state.pick_folder(); }
            if submit {
                match build_options(&state.new_tunnel) {
                    Ok(opts) => {
                        let kind = state.new_tunnel.kind;
                        state.new_tunnel.error = None;
                        state.start_tunnel(kind, opts);
                    }
                    Err(err) => state.new_tunnel.error = Some(format!("{err:#}")),
                }
            }
        });
    }
}

fn build_options(form: &NewTunnelForm) -> anyhow::Result<Options> {
    let name = Some(form.name.trim().to_string()).filter(|name| !name.is_empty());
    let auth = if form.kind == TunnelKind::Tcp { AuthChoice::Open } else { form.auth };
    let password = (auth == AuthChoice::Password).then(|| form.password.clone());
    if password.as_deref() == Some("") { anyhow::bail!("Enter a password, or pick another sign-in option"); }
    let access = Access::new(Rules::ips(form.allow.clone()), password, auth == AuthChoice::Login)?;
    let target = form.target.trim();
    if form.kind != TunnelKind::Files && target.is_empty() { anyhow::bail!("Enter a port or host:port to share"); }
    Ok(match form.kind {
        TunnelKind::Http => Options::http(TargetSpec::parse(target)?, name, form.keep_host, access),
        TunnelKind::Files => {
            let dir = form.dir.trim();
            if dir.is_empty() { anyhow::bail!("Pick the folder to share"); }
            Options::http(TargetSpec::dir(dir)?, name, false, access)
        }
        TunnelKind::Tcp => Options::tcp(Target::parse(target)?, name, access),
    })
}

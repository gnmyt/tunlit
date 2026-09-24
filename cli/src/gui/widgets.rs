
use eframe::egui::{self, Align, Color32, CursorIcon, Frame, Id, Layout, Margin, Response, RichText, Sense, Stroke, StrokeKind, TextEdit, Ui, Vec2};
use std::time::Instant;
use super::theme::{self, corner};

#[derive(Clone, Copy, PartialEq)]
pub enum ButtonKind { Primary, Secondary, Ghost, Danger }

pub fn button(ui: &mut Ui, text: &str, kind: ButtonKind) -> Response {
    button_sized(ui, text, kind, 0.0)
}

pub fn button_sized(ui: &mut Ui, text: &str, kind: ButtonKind, min_width: f32) -> Response {
    let family = if kind == ButtonKind::Primary { theme::semibold() } else { theme::medium() };
    let galley = ui.painter().layout_no_wrap(text.to_string(), theme::font(14.0, family), Color32::WHITE);
    let padding = egui::vec2(16.0, 7.0);
    let size = Vec2::new((galley.size().x + padding.x * 2.0).max(min_width), (galley.size().y + padding.y * 2.0).max(34.0));
    let (rect, response) = ui.allocate_exact_size(size, Sense::click());
    if !ui.is_rect_visible(rect) { return response; }

    let enabled = ui.is_enabled();
    let hovered = response.hovered() && enabled;
    let (fill, stroke, color) = match kind {
        ButtonKind::Primary => (if hovered { theme::PRIMARY_HOVER } else { theme::PRIMARY_BRIGHT }, Stroke::NONE, theme::ON_PRIMARY),
        ButtonKind::Secondary => (if hovered { theme::SURFACE_HOVER } else { Color32::TRANSPARENT }, Stroke::new(1.0, theme::BORDER_STRONG), theme::TEXT),
        ButtonKind::Ghost => (if hovered { theme::SURFACE_HOVER } else { Color32::TRANSPARENT }, Stroke::NONE, if hovered { theme::TEXT } else { theme::SUBTEXT }),
        ButtonKind::Danger => if hovered { (theme::ERROR_TINT, Stroke::NONE, theme::ERROR) } else { (Color32::TRANSPARENT, Stroke::new(1.0, theme::BORDER_STRONG), theme::SUBTEXT) },
    };
    let (fill, color) = if enabled { (fill, color) } else if kind == ButtonKind::Primary { (theme::SURFACE_HOVER, theme::MUTED) } else { (fill, theme::MUTED) };

    let painter = ui.painter();
    painter.rect(rect, corner(theme::RADIUS_INPUT), fill, stroke, StrokeKind::Inside);
    let text_pos = rect.center() - galley.size() / 2.0;
    painter.galley(text_pos, galley, color);
    if hovered { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
    response
}

pub fn text(ui: &mut Ui, value: impl Into<String>, size: f32, color: Color32) -> Response {
    ui.label(RichText::new(value).size(size).color(color))
}

pub fn text_family(ui: &mut Ui, value: impl Into<String>, size: f32, color: Color32, family: egui::FontFamily) -> Response {
    ui.label(RichText::new(value).size(size).color(color).family(family))
}

pub fn mono(ui: &mut Ui, value: impl Into<String>, size: f32, color: Color32) -> Response {
    ui.label(RichText::new(value).size(size).color(color).family(theme::mono()))
}

pub fn heading(ui: &mut Ui, value: &str) {
    text_family(ui, value, 24.0, theme::TEXT, theme::semibold());
}

pub fn field_label(ui: &mut Ui, label: &str) {
    text(ui, label, 13.0, theme::SUBTEXT);
}

#[derive(Default)]
pub struct FieldOptions<'a> {
    pub label: Option<&'a str>,
    pub hint: &'a str,
    pub mono: bool,
    pub secret: bool,
    pub width: Option<f32>,
}

pub fn field(ui: &mut Ui, id: impl std::hash::Hash + std::fmt::Debug, value: &mut String, options: FieldOptions) -> Response {
    let id = Id::new(id);
    let edit_id = id.with("edit");
    let focused = ui.memory(|memory| memory.has_focus(edit_id));
    let width = options.width.unwrap_or_else(|| ui.available_width());

    ui.vertical(|ui| {
        ui.spacing_mut().item_spacing.y = 6.0;
        if let Some(label) = options.label { field_label(ui, label); }
        ui.set_width(width);
        let frame = Frame::new()
            .fill(theme::SURFACE)
            .stroke(Stroke::new(1.0, if focused { theme::PRIMARY } else { theme::BORDER }))
            .corner_radius(corner(theme::RADIUS_INPUT))
            .inner_margin(Margin::symmetric(14, 9));
        let inner = frame.show(ui, |ui| {
            let family = if options.mono { theme::mono() } else { theme::medium() };
            let mut edit = TextEdit::singleline(value)
                .id(edit_id)
                .frame(Frame::NONE)
                .background_color(Color32::TRANSPARENT)
                .font(theme::font(15.0, family))
                .text_color(theme::TEXT)
                .hint_text(RichText::new(options.hint).color(theme::MUTED).size(15.0))
                .desired_width(f32::INFINITY)
                .margin(Margin::ZERO);
            if options.secret { edit = edit.password(true); }
            ui.add(edit)
        });
        let response = inner.inner;
        if inner.response.hovered() { ui.ctx().set_cursor_icon(CursorIcon::Text); }
        if inner.response.clicked() { ui.memory_mut(|memory| memory.request_focus(edit_id)); }
        response
    }).inner
}

pub fn dot(ui: &mut Ui, color: Color32) {
    let (rect, _) = ui.allocate_exact_size(egui::vec2(8.0, 8.0), Sense::hover());
    ui.painter().circle_filled(rect.center(), 3.5, color);
}

pub fn card<R>(ui: &mut Ui, add: impl FnOnce(&mut Ui) -> R) -> egui::InnerResponse<R> {
    Frame::new()
        .fill(theme::SURFACE)
        .stroke(Stroke::new(1.0, theme::BORDER))
        .corner_radius(corner(theme::RADIUS_CARD))
        .inner_margin(Margin::same(18))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            add(ui)
        })
}

pub fn clickable_card(ui: &mut Ui, id: impl std::hash::Hash + std::fmt::Debug, add: impl FnOnce(&mut Ui)) -> Response {
    let id = Id::new(id);
    let hovered = ui.ctx().read_response(id).is_some_and(|response| response.hovered());
    let fill = if hovered { theme::SURFACE_HOVER } else { theme::SURFACE };
    let frame = Frame::new()
        .fill(fill)
        .stroke(Stroke::new(1.0, if hovered { theme::BORDER_STRONG } else { theme::BORDER }))
        .corner_radius(corner(theme::RADIUS_CARD))
        .inner_margin(Margin::symmetric(18, 14));
    let inner = frame.show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| add(ui));
    });
    let response = ui.interact(inner.response.rect, id, Sense::click());
    if response.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
    response
}

pub fn section(ui: &mut Ui, title: &str, hint: Option<&str>) {
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 10.0;
        text_family(ui, title, 16.0, theme::TEXT, theme::semibold());
        if let Some(hint) = hint { text(ui, hint, 13.0, theme::MUTED); }
    });
    ui.add_space(4.0);
}

pub fn toggle(ui: &mut Ui, on: &mut bool) -> Response {
    let size = egui::vec2(36.0, 20.0);
    let (rect, mut response) = ui.allocate_exact_size(size, Sense::click());
    if response.clicked() { *on = !*on; response.mark_changed(); }
    let how_on = ui.ctx().animate_bool(response.id, *on);
    let fill = if *on { theme::PRIMARY } else { theme::SURFACE_HOVER };
    let stroke = if *on { Stroke::NONE } else { Stroke::new(1.0, theme::BORDER_STRONG) };
    ui.painter().rect(rect, corner(10), fill, stroke, StrokeKind::Inside);
    let radius = 7.0;
    let x = egui::lerp((rect.left() + radius + 3.0)..=(rect.right() - radius - 3.0), how_on);
    ui.painter().circle_filled(egui::pos2(x, rect.center().y), radius, if *on { theme::ON_PRIMARY } else { theme::SUBTEXT });
    if response.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
    response
}

pub fn status_color(status: u16) -> Color32 {
    match status {
        200..=299 => theme::SUCCESS,
        300..=399 => theme::PRIMARY,
        400..=499 => theme::WARNING,
        _ => theme::ERROR,
    }
}

pub fn toggle_row(ui: &mut Ui, label: &str, hint: &str, on: &mut bool) -> Response {
    ui.horizontal(|ui| {
        let text_width = ui.available_width() - 52.0;
        ui.vertical(|ui| {
            ui.set_max_width(text_width);
            ui.spacing_mut().item_spacing.y = 2.0;
            text(ui, label, 14.0, theme::TEXT);
            if !hint.is_empty() { ui.add(egui::Label::new(RichText::new(hint).size(12.5).color(theme::MUTED)).wrap()); }
        });
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| toggle(ui, on)).inner
    }).inner
}

pub fn copy_row(ui: &mut Ui, id: impl std::hash::Hash + std::fmt::Debug, value: &str, copied_at: &mut Option<Instant>) -> bool {
    let mut copied = false;
    let frame = Frame::new()
        .fill(theme::SURFACE)
        .stroke(Stroke::new(1.0, theme::BORDER))
        .corner_radius(corner(theme::RADIUS_SMALL))
        .inner_margin(Margin::symmetric(12, 6));
    frame.show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| {
            let recently = copied_at.is_some_and(|at| at.elapsed().as_secs_f32() < 1.6);
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                let label = if recently { "Copied" } else { "Copy" };
                let response = ui.push_id(Id::new(&id).with("copy"), |ui| button(ui, label, ButtonKind::Ghost)).inner;
                if response.clicked() {
                    ui.ctx().copy_text(value.to_string());
                    *copied_at = Some(Instant::now());
                    copied = true;
                }
                ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                    ui.add(egui::Label::new(RichText::new(value).size(13.0).color(theme::SUBTEXT).family(theme::mono())).truncate());
                });
            });
        });
    });
    copied
}

pub fn notice(ui: &mut Ui, message: &str, color: Color32, tint: Color32) {
    Frame::new()
        .fill(tint)
        .corner_radius(corner(theme::RADIUS_SMALL))
        .inner_margin(Margin::symmetric(14, 10))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.add(egui::Label::new(RichText::new(message).size(13.5).color(color)).wrap());
        });
}

pub fn error_notice(ui: &mut Ui, message: &str) { notice(ui, message, theme::ERROR, theme::ERROR_TINT); }
pub fn warning_notice(ui: &mut Ui, message: &str) { notice(ui, message, theme::WARNING, theme::WARNING_TINT); }

pub fn empty_state(ui: &mut Ui, title: &str, body: &str, add: impl FnOnce(&mut Ui)) {
    Frame::new()
        .stroke(Stroke::new(1.0, theme::BORDER_STRONG))
        .corner_radius(corner(theme::RADIUS_CARD))
        .inner_margin(Margin::symmetric(32, 40))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.vertical_centered(|ui| {
                ui.spacing_mut().item_spacing.y = 8.0;
                text_family(ui, title, 17.0, theme::TEXT, theme::semibold());
                ui.add(egui::Label::new(RichText::new(body).size(14.0).color(theme::SUBTEXT)).wrap());
                ui.add_space(12.0);
                add(ui);
            });
        });
}

pub fn segmented<T: PartialEq + Copy>(ui: &mut Ui, current: &mut T, options: &[(T, &str)]) {
    Frame::new()
        .fill(theme::SURFACE)
        .stroke(Stroke::new(1.0, theme::BORDER))
        .corner_radius(corner(theme::RADIUS_INPUT))
        .inner_margin(Margin::same(3))
        .show(ui, |ui| {
            ui.spacing_mut().item_spacing.x = 3.0;
            ui.horizontal(|ui| {
                for (value, label) in options {
                    let selected = *current == *value;
                    let galley = ui.painter().layout_no_wrap(label.to_string(), theme::font(13.5, theme::medium()), Color32::WHITE);
                    let size = galley.size() + egui::vec2(24.0, 12.0);
                    let (rect, response) = ui.allocate_exact_size(size, Sense::click());
                    let fill = if selected { theme::SURFACE_HOVER } else if response.hovered() { theme::SURFACE_RAISED } else { Color32::TRANSPARENT };
                    let stroke = if selected { Stroke::new(1.0, theme::BORDER_STRONG) } else { Stroke::NONE };
                    ui.painter().rect(rect, corner(theme::RADIUS_SMALL), fill, stroke, StrokeKind::Inside);
                    let color = if selected { theme::TEXT } else { theme::SUBTEXT };
                    ui.painter().galley(rect.center() - galley.size() / 2.0, galley, color);
                    if response.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
                    if response.clicked() { *current = *value; }
                }
            });
        });
}

pub fn back_link(ui: &mut Ui, label: &str) -> Response {
    let response = ui.add(egui::Label::new(RichText::new(format!("←  {label}")).size(13.0).color(theme::MUTED)).sense(Sense::click()));
    if response.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
    response
}

pub fn divider(ui: &mut Ui) {
    let (rect, _) = ui.allocate_exact_size(egui::vec2(ui.available_width(), 1.0), Sense::hover());
    ui.painter().rect_filled(rect, 0.0, theme::BORDER);
}

pub fn minimize_button(ui: &mut Ui) -> Response {
    let (rect, response) = ui.allocate_exact_size(egui::vec2(30.0, 30.0), Sense::click());
    let hovered = response.hovered();
    if hovered {
        ui.painter().rect_filled(rect, corner(theme::RADIUS_SMALL), theme::SURFACE_HOVER);
        ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
    }
    let color = if hovered { theme::TEXT } else { theme::SUBTEXT };
    let center = rect.center();
    let arm = 5.0;
    ui.painter().line_segment([center + egui::vec2(-arm, 0.0), center + egui::vec2(arm, 0.0)], Stroke::new(1.6, color));
    response
}

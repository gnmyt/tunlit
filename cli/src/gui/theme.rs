use eframe::egui::{self, Color32, CornerRadius, FontData, FontDefinitions, FontFamily, FontId, Stroke, TextStyle, Visuals};
use std::sync::Arc;

pub const BACKGROUND: Color32 = Color32::from_rgb(0x11, 0x10, 0x0E);
pub const SURFACE: Color32 = Color32::from_rgb(0x17, 0x16, 0x13);
pub const SURFACE_RAISED: Color32 = Color32::from_rgb(0x1C, 0x1A, 0x17);
pub const SURFACE_HOVER: Color32 = Color32::from_rgb(0x22, 0x1F, 0x1B);
pub const BORDER: Color32 = Color32::from_rgba_premultiplied(18, 18, 18, 18);
pub const BORDER_STRONG: Color32 = Color32::from_rgba_premultiplied(33, 33, 33, 33);

pub const PRIMARY: Color32 = Color32::from_rgb(0x14, 0xB8, 0xA6);
pub const PRIMARY_BRIGHT: Color32 = Color32::from_rgb(0x2D, 0xD4, 0xBF);
pub const PRIMARY_HOVER: Color32 = Color32::from_rgb(0x5E, 0xEA, 0xD4);
pub const PRIMARY_TINT: Color32 = Color32::from_rgba_premultiplied(3, 26, 23, 36);
pub const ON_PRIMARY: Color32 = Color32::from_rgb(0x05, 0x20, 0x1C);

pub const TEXT: Color32 = Color32::from_rgb(0xFA, 0xFA, 0xF9);
pub const SUBTEXT: Color32 = Color32::from_rgb(0xA8, 0xA2, 0x9E);
pub const MUTED: Color32 = Color32::from_rgb(0x79, 0x71, 0x6B);

pub const ERROR: Color32 = Color32::from_rgb(0xF8, 0x71, 0x71);
pub const ERROR_TINT: Color32 = Color32::from_rgba_premultiplied(32, 15, 15, 33);
pub const SUCCESS: Color32 = Color32::from_rgb(0x34, 0xD3, 0x99);
pub const WARNING: Color32 = Color32::from_rgb(0xFB, 0xBF, 0x24);
pub const WARNING_TINT: Color32 = Color32::from_rgba_premultiplied(32, 25, 5, 33);

pub const RADIUS_INPUT: u8 = 12;
pub const RADIUS_CARD: u8 = 14;
pub const RADIUS_SMALL: u8 = 10;

pub const GUTTER: f32 = 16.0;

pub fn medium() -> FontFamily { FontFamily::Proportional }
pub fn semibold() -> FontFamily { FontFamily::Name("semibold".into()) }
pub fn bold() -> FontFamily { FontFamily::Name("bold".into()) }
pub fn mono() -> FontFamily { FontFamily::Monospace }

pub fn font(size: f32, family: FontFamily) -> FontId { FontId::new(size, family) }

pub fn corner(radius: u8) -> CornerRadius { CornerRadius::same(radius) }

pub fn install(ctx: &egui::Context) {
    let mut fonts = FontDefinitions::default();
    fonts.font_data.insert("jakarta-medium".into(), Arc::new(FontData::from_static(include_bytes!("../../assets/PlusJakartaSans-Medium.ttf"))));
    fonts.font_data.insert("jakarta-semibold".into(), Arc::new(FontData::from_static(include_bytes!("../../assets/PlusJakartaSans-SemiBold.ttf"))));
    fonts.font_data.insert("jakarta-bold".into(), Arc::new(FontData::from_static(include_bytes!("../../assets/PlusJakartaSans-Bold.ttf"))));

    let fallback = fonts.families.get(&FontFamily::Proportional).cloned().unwrap_or_default();
    let with_fallback = |first: &str| std::iter::once(first.to_string()).chain(fallback.iter().cloned()).collect::<Vec<_>>();
    fonts.families.insert(FontFamily::Proportional, with_fallback("jakarta-medium"));
    fonts.families.insert(semibold(), with_fallback("jakarta-semibold"));
    fonts.families.insert(bold(), with_fallback("jakarta-bold"));
    ctx.set_fonts(fonts);

    let mut visuals = Visuals::dark();
    visuals.panel_fill = BACKGROUND;
    visuals.window_fill = SURFACE_RAISED;
    visuals.window_stroke = Stroke::new(1.0, BORDER_STRONG);
    visuals.window_corner_radius = corner(RADIUS_CARD);
    visuals.menu_corner_radius = corner(RADIUS_INPUT);
    visuals.extreme_bg_color = SURFACE;
    visuals.faint_bg_color = SURFACE_RAISED;
    visuals.code_bg_color = SURFACE_HOVER;
    visuals.override_text_color = Some(TEXT);
    visuals.hyperlink_color = PRIMARY_BRIGHT;
    visuals.selection.bg_fill = PRIMARY_TINT;
    visuals.selection.stroke = Stroke::new(1.0, PRIMARY);
    visuals.text_cursor.stroke.color = PRIMARY_BRIGHT;

    let widgets = &mut visuals.widgets;
    for (widget, fill, border, text) in [
        (&mut widgets.noninteractive, SURFACE, BORDER, SUBTEXT),
        (&mut widgets.inactive, SURFACE_RAISED, BORDER_STRONG, TEXT),
        (&mut widgets.hovered, SURFACE_HOVER, BORDER_STRONG, TEXT),
        (&mut widgets.active, SURFACE_HOVER, PRIMARY, TEXT),
        (&mut widgets.open, SURFACE_RAISED, PRIMARY, TEXT),
    ] {
        widget.bg_fill = fill;
        widget.weak_bg_fill = fill;
        widget.bg_stroke = Stroke::new(1.0, border);
        widget.fg_stroke = Stroke::new(1.0, text);
        widget.corner_radius = corner(RADIUS_SMALL);
        widget.expansion = 0.0;
    }
    ctx.set_visuals(visuals);

    ctx.all_styles_mut(|style| {
        style.text_styles.insert(TextStyle::Body, font(14.0, medium()));
        style.text_styles.insert(TextStyle::Button, font(14.0, medium()));
        style.text_styles.insert(TextStyle::Small, font(12.0, medium()));
        style.text_styles.insert(TextStyle::Heading, font(22.0, semibold()));
        style.text_styles.insert(TextStyle::Monospace, font(13.0, mono()));
        style.spacing.item_spacing = egui::vec2(8.0, 8.0);
        style.spacing.button_padding = egui::vec2(12.0, 6.0);
        style.spacing.interact_size = egui::vec2(40.0, 30.0);
        style.spacing.combo_width = 160.0;
        style.spacing.scroll.bar_width = 8.0;
        style.spacing.scroll.floating = true;
        style.visuals.striped = false;
        style.interaction.selectable_labels = false;
    });
}

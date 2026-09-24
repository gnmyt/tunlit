use anyhow::Result;
use chrono::{DateTime, Local};
use crossterm::event::{Event, EventStream, KeyCode, KeyEvent, KeyModifiers};
use futures_util::StreamExt;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, BorderType, Borders, Cell, Padding, Paragraph, Row, Sparkline, Table, TableState};
use ratatui::Frame;
use std::collections::VecDeque;
use std::time::{Duration, Instant};
use tokio::sync::mpsc::UnboundedReceiver;
use crate::qr;
use crate::session::{bytes, took, Connection, Online, Request, StopHandle, TunnelEvent};

const KEEP: usize = 500;
const TICK: Duration = Duration::from_millis(200);
const SPINNER: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TEAL: Color = Color::Rgb(20, 184, 166);
const TEAL_BRIGHT: Color = Color::Rgb(45, 212, 191);
const AMBER: Color = Color::Rgb(251, 191, 36);
const RED: Color = Color::Rgb(248, 113, 113);
const GREEN: Color = Color::Rgb(52, 211, 153);
const MUTED: Color = Color::Rgb(121, 113, 107);
const SUBTEXT: Color = Color::Rgb(168, 162, 158);
const BORDER: Color = Color::Rgb(60, 56, 52);

pub struct Context {
    pub server_url: String,
    pub account: String,
    pub target: String,
    pub network: Option<String>,
    pub tcp: bool,
}

enum Status { Connecting, Online, Reconnecting(u64, Option<String>) }

struct Seen<T> { at: DateTime<Local>, item: T }

struct State {
    ctx: Context,
    status: Status,
    online: Option<Online>,
    access: Option<String>,
    requests: VecDeque<Seen<Request>>,
    connections: VecDeque<Seen<Connection>>,
    samples: VecDeque<(Instant, u64)>,
    total: u64,
    errors: u64,
    open: i64,
    bytes_in: u64,
    bytes_out: u64,
    table: TableState,
    copied: bool,
    notice: Option<(String, Instant)>,
    update: Option<String>,
    frame: usize,
    ended: Option<String>,
}

impl State {
    fn apply(&mut self, event: TunnelEvent) {
        match event {
            TunnelEvent::Connecting => self.status = Status::Connecting,
            TunnelEvent::Online(online) | TunnelEvent::Resumed(online) | TunnelEvent::Replaced(online) => {
                self.status = Status::Online;
                self.access = online.access.clone();
                self.online = Some(online);
                if !self.copied && self.copy() { self.notice("Link copied to clipboard"); }
            }
            TunnelEvent::Request(request) => {
                self.total += 1;
                if request.status >= 400 { self.errors += 1; }
                self.samples.push_back((Instant::now(), request.duration));
                while self.samples.len() > KEEP { self.samples.pop_front(); }
                self.requests.push_front(Seen { at: Local::now(), item: request });
                self.requests.truncate(KEEP);
                self.bump();
            }
            TunnelEvent::Connection(connection) => {
                if connection.opened {
                    self.open += 1;
                    self.total += 1;
                    self.connections.push_front(Seen { at: Local::now(), item: connection });
                    self.connections.truncate(KEEP);
                    self.bump();
                } else {
                    self.open -= 1;
                    self.bytes_in += connection.bytes_in;
                    self.bytes_out += connection.bytes_out;
                    self.samples.push_back((Instant::now(), connection.duration));
                    match self.connections.iter_mut().find(|seen| seen.item.key == connection.key) {
                        Some(seen) => seen.item = connection,
                        None => { self.connections.push_front(Seen { at: Local::now(), item: connection }); self.connections.truncate(KEEP); }
                    }
                }
            }
            TunnelEvent::Access(summary) => { self.access = Some(summary); self.notice("Access rules updated"); }
            TunnelEvent::Reconnecting { seconds, reason } => self.status = Status::Reconnecting(seconds, reason),
            TunnelEvent::Update(version) => self.update = Some(version),
            TunnelEvent::Stopped => {}
            TunnelEvent::Ended(reason) => self.ended = Some(reason),
        }
    }

    fn bump(&mut self) {
        if let Some(selected) = self.table.selected() { self.table.select(Some((selected + 1).min(self.entries() - 1))); }
    }

    fn entries(&self) -> usize {
        if self.ctx.tcp { self.connections.len() } else { self.requests.len() }
    }

    fn link(&self) -> Option<String> {
        let online = self.online.as_ref()?;
        online.url.clone().or_else(|| online.link(&self.ctx.server_url).map(|link| format!("tunlit connect {link}")))
    }

    fn copy(&mut self) -> bool {
        let Some(link) = self.link() else { return false };
        self.copied = qr::copy(&link);
        self.copied
    }

    fn notice(&mut self, text: &str) {
        self.notice = Some((text.to_string(), Instant::now()));
    }

    fn rate(&self, window: Duration) -> f64 {
        let since = Instant::now() - window;
        self.samples.iter().filter(|(at, _)| *at >= since).count() as f64 / window.as_secs_f64()
    }

    fn percentile(&self, fraction: f64) -> u64 {
        if self.samples.is_empty() { return 0; }
        let mut values: Vec<u64> = self.samples.iter().map(|(_, value)| *value).collect();
        values.sort_unstable();
        values[((values.len() - 1) as f64 * fraction).round() as usize]
    }

    fn histogram(&self, buckets: usize) -> Vec<u64> {
        let now = Instant::now();
        let mut counts = vec![0u64; buckets];
        for (at, _) in &self.samples {
            let age = now.duration_since(*at).as_secs() as usize;
            if age < buckets { counts[buckets - 1 - age] += 1; }
        }
        counts
    }
}

fn status_color(status: u16) -> Color {
    match status { 200..=299 => GREEN, 300..=399 => TEAL_BRIGHT, 400..=499 => AMBER, _ => RED }
}

fn panel(title: &str) -> Block<'static> {
    Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(BORDER))
        .title(Span::styled(format!(" {title} "), Style::default().fg(SUBTEXT).add_modifier(Modifier::BOLD)))
        .padding(Padding::horizontal(1))
}

fn field(name: &str, value: Span<'static>) -> Line<'static> {
    Line::from(vec![Span::styled(format!("{:<11}", name), Style::default().fg(MUTED)), value])
}

fn plain(text: impl Into<String>) -> Span<'static> { Span::raw(text.into()) }

fn header(state: &State, area: Rect, frame: &mut Frame) {
    let spinner = SPINNER[state.frame % SPINNER.len()];
    let status = match &state.status {
        Status::Connecting => Span::styled(format!("{spinner} connecting"), Style::default().fg(AMBER)),
        Status::Online => Span::raw(""),
        Status::Reconnecting(seconds, reason) => Span::styled(
            match reason { Some(reason) => format!("{spinner} reconnecting in {seconds}s · {reason}"), None => format!("{spinner} reconnecting") },
            Style::default().fg(AMBER),
        ),
    };
    let notice = state.notice.as_ref().filter(|(_, at)| at.elapsed() < Duration::from_secs(3)).map(|(text, _)| text.clone());
    let right = notice.map(|text| Span::styled(text, Style::default().fg(TEAL_BRIGHT))).unwrap_or(status);
    let mut left = vec![
        Span::styled("tunl", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
        Span::styled("it", Style::default().fg(TEAL).add_modifier(Modifier::BOLD)),
        Span::styled(format!("  v{}", env!("CARGO_PKG_VERSION")), Style::default().fg(MUTED)),
    ];
    if let Some(version) = &state.update {
        left.push(Span::styled(format!("  ↑ v{version} available · tunlit update"), Style::default().fg(AMBER)));
    }
    let used: usize = left.iter().map(|span| span.width()).sum::<usize>() + right.width();
    let mut spans = left;
    spans.push(Span::raw(" ".repeat((area.width as usize).saturating_sub(used))));
    spans.push(right);
    frame.render_widget(Paragraph::new(Line::from(spans)), area);
}

fn tunnel_lines(state: &State) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    match &state.online {
        Some(online) => {
            let name = if online.persistent { format!("{}  persistent", online.id) } else { online.id.clone() };
            match &online.url {
                Some(url) => {
                    lines.push(field("Public", Span::styled(url.clone(), Style::default().fg(TEAL_BRIGHT).add_modifier(Modifier::BOLD))));
                    for custom in &online.custom_urls { lines.push(field("", Span::styled(custom.clone(), Style::default().fg(TEAL_BRIGHT)))); }
                }
                None => {
                    if let Some(link) = online.link(&state.ctx.server_url) {
                        lines.push(field("Share", Span::styled(format!("tunlit connect {link}"), Style::default().fg(TEAL_BRIGHT).add_modifier(Modifier::BOLD))));
                    }
                }
            }
            lines.push(field("Local", plain(state.ctx.target.clone())));
            lines.push(field("Name", plain(name)));
        }
        None => lines.push(field("Local", plain(state.ctx.target.clone()))),
    }
    lines.push(field("Account", plain(format!("{} · {}", state.ctx.account, state.ctx.server_url))));
    if let Some(access) = &state.access { lines.push(field("Access", Span::styled(access.clone(), Style::default().fg(AMBER)))); }
    if let Some(network) = &state.ctx.network { lines.push(field("Network", Span::styled(network.clone(), Style::default().fg(AMBER)))); }
    lines
}

fn tunnel_panel(lines: Vec<Line<'static>>, area: Rect, frame: &mut Frame) {
    frame.render_widget(Paragraph::new(lines).block(panel("Tunnel")), area);
}

fn stat(label: &str, value: String) -> Line<'static> {
    Line::from(vec![Span::styled(format!("{:<8}", label), Style::default().fg(MUTED)), Span::styled(value, Style::default().add_modifier(Modifier::BOLD))])
}

fn stats_panel(state: &State, area: Rect, frame: &mut Frame) {
    let block = panel("Activity");
    let inner = block.inner(area);
    frame.render_widget(block, area);
    let rows = Layout::default().direction(Direction::Vertical).constraints([Constraint::Length(2), Constraint::Min(1), Constraint::Length(1)]).split(inner);
    let columns = Layout::default().direction(Direction::Horizontal)
        .constraints([Constraint::Ratio(1, 3), Constraint::Ratio(1, 3), Constraint::Ratio(1, 3)]).split(rows[0]);
    let (left, middle, right) = if state.ctx.tcp {
        (
            vec![stat("open", state.open.max(0).to_string()), stat("total", state.total.to_string())],
            vec![stat("in", bytes(state.bytes_in)), stat("out", bytes(state.bytes_out))],
            vec![stat("per min", format!("{:.1}", state.rate(Duration::from_secs(60)) * 60.0)), stat("p50", format!("{}ms", state.percentile(0.5)))],
        )
    } else {
        (
            vec![stat("total", state.total.to_string()), stat("errors", state.errors.to_string())],
            vec![stat("per min", format!("{:.1}", state.rate(Duration::from_secs(60)) * 60.0)), stat("per 5m", format!("{:.1}", state.rate(Duration::from_secs(300)) * 300.0))],
            vec![stat("p50", format!("{}ms", state.percentile(0.5))), stat("p90", format!("{}ms", state.percentile(0.9)))],
        )
    };
    frame.render_widget(Paragraph::new(left), columns[0]);
    frame.render_widget(Paragraph::new(middle), columns[1]);
    frame.render_widget(Paragraph::new(right), columns[2]);
    let width = rows[1].width as usize;
    if width > 0 && rows[1].height > 0 {
        let data = state.histogram(width);
        frame.render_widget(Sparkline::default().data(&data).style(Style::default().fg(TEAL)), rows[1]);
        let caption = format!("{} per second · last {width}s", if state.ctx.tcp { "connections" } else { "requests" });
        frame.render_widget(Paragraph::new(Span::styled(caption, Style::default().fg(MUTED))).right_aligned(), rows[2]);
    }
}

fn request_row(seen: &Seen<Request>) -> Row<'static> {
    let request = &seen.item;
    let method = if request.kind == "ws" { "WS".to_string() } else { request.method.clone() };
    Row::new(vec![
        Cell::from(Span::styled(seen.at.format("%H:%M:%S").to_string(), Style::default().fg(MUTED))),
        Cell::from(Span::styled(method, Style::default().add_modifier(Modifier::BOLD))),
        Cell::from(Span::styled(request.status.to_string(), Style::default().fg(status_color(request.status)).add_modifier(Modifier::BOLD))),
        Cell::from(request.path.clone()),
        Cell::from(Span::styled(format!("{}ms", request.duration), Style::default().fg(SUBTEXT))),
        Cell::from(Span::styled(request.ip.clone(), Style::default().fg(SUBTEXT))),
        Cell::from(Span::styled(request.intel().unwrap_or_default(), Style::default().fg(MUTED))),
    ])
}

fn connection_row(seen: &Seen<Connection>) -> Row<'static> {
    let connection = &seen.item;
    let state = if connection.opened { Span::styled("open", Style::default().fg(GREEN)) } else { Span::styled(connection.reason.clone().unwrap_or_default(), Style::default().fg(MUTED)) };
    Row::new(vec![
        Cell::from(Span::styled(seen.at.format("%H:%M:%S").to_string(), Style::default().fg(MUTED))),
        Cell::from(Span::styled(connection.protocol.clone(), Style::default().add_modifier(Modifier::BOLD))),
        Cell::from(Span::styled(connection.ip.clone(), Style::default().fg(SUBTEXT))),
        Cell::from(connection.detail.clone().unwrap_or_default()),
        Cell::from(Span::styled(if connection.opened { String::new() } else { format!("{} / {}", bytes(connection.bytes_in), bytes(connection.bytes_out)) }, Style::default().fg(SUBTEXT))),
        Cell::from(Span::styled(if connection.opened { String::new() } else { took(connection.duration) }, Style::default().fg(SUBTEXT))),
        Cell::from(state),
        Cell::from(Span::styled(connection.intel().unwrap_or_default(), Style::default().fg(MUTED))),
    ])
}

fn table(state: &mut State, area: Rect, frame: &mut Frame) {
    let head = Style::default().fg(MUTED).add_modifier(Modifier::BOLD);
    let (title, header, widths, rows): (&str, Vec<&str>, Vec<Constraint>, Vec<Row>) = if state.ctx.tcp {
        (
            "Connections",
            vec!["time", "proto", "client", "protocol", "in / out", "took", "state", "where"],
            vec![Constraint::Length(8), Constraint::Length(5), Constraint::Length(16), Constraint::Min(16), Constraint::Length(18), Constraint::Length(7), Constraint::Length(18), Constraint::Length(24)],
            state.connections.iter().map(connection_row).collect(),
        )
    } else {
        (
            "Requests",
            vec!["time", "method", "status", "path", "took", "client", "where"],
            vec![Constraint::Length(8), Constraint::Length(6), Constraint::Length(6), Constraint::Min(16), Constraint::Length(7), Constraint::Length(16), Constraint::Length(28)],
            state.requests.iter().map(request_row).collect(),
        )
    };
    let empty = rows.is_empty();
    let table = Table::new(rows, widths)
        .header(Row::new(header.into_iter().map(|name| Cell::from(Span::styled(name, head))).collect::<Vec<_>>()).bottom_margin(0))
        .block(panel(title))
        .column_spacing(2)
        .row_highlight_style(Style::default().bg(Color::Rgb(34, 31, 27)).add_modifier(Modifier::BOLD));
    frame.render_stateful_widget(table, area, &mut state.table);
    if empty {
        let hint = if state.ctx.tcp { "Waiting for the first connection" } else { "Waiting for the first request" };
        let inner = Rect::new(area.x + 2, area.y + 2, area.width.saturating_sub(4), 1);
        frame.render_widget(Paragraph::new(Span::styled(hint, Style::default().fg(MUTED))), inner);
    }
}

fn footer(state: &State, area: Rect, frame: &mut Frame) {
    let keys: Vec<(&str, &str)> = if state.ctx.tcp {
        vec![("q", "quit"), ("↑↓", "select"), ("c", "copy share command"), ("d", "dashboard")]
    } else {
        vec![("q", "quit"), ("↑↓", "select"), ("c", "copy url"), ("o", "open in browser"), ("d", "dashboard")]
    };
    let mut spans = Vec::new();
    for (index, (key, action)) in keys.iter().enumerate() {
        if index > 0 { spans.push(Span::styled("  ·  ", Style::default().fg(BORDER))); }
        spans.push(Span::styled(*key, Style::default().fg(TEAL_BRIGHT).add_modifier(Modifier::BOLD)));
        spans.push(Span::styled(format!(" {action}"), Style::default().fg(MUTED)));
    }
    frame.render_widget(Paragraph::new(Line::from(spans)), area);
}

fn draw(frame: &mut Frame, state: &mut State) {
    let area = frame.area();
    let lines = tunnel_lines(state);
    let widest = lines.iter().map(|line| line.width()).fold(0, usize::max) as u16 + 4;
    let column = area.width.saturating_sub(2) * 58 / 100;
    let side_by_side = area.width >= 100 && widest <= column;
    let tunnel_height = if side_by_side { (lines.len() as u16 + 2).max(8) } else { lines.len() as u16 + 2 };
    let constraints = if side_by_side {
        vec![Constraint::Length(1), Constraint::Length(1), Constraint::Length(tunnel_height), Constraint::Min(5), Constraint::Length(1)]
    } else {
        vec![Constraint::Length(1), Constraint::Length(1), Constraint::Length(tunnel_height), Constraint::Length(8), Constraint::Min(5), Constraint::Length(1)]
    };
    let outer = Layout::default().direction(Direction::Vertical).constraints(constraints).horizontal_margin(1).split(area);
    header(state, outer[0], frame);
    if side_by_side {
        let top = Layout::default().direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(58), Constraint::Percentage(42)]).split(outer[2]);
        tunnel_panel(lines, top[0], frame);
        stats_panel(state, top[1], frame);
        table(state, outer[3], frame);
        footer(state, outer[4], frame);
    } else {
        tunnel_panel(lines, outer[2], frame);
        stats_panel(state, outer[3], frame);
        table(state, outer[4], frame);
        footer(state, outer[5], frame);
    }
}

fn quit(key: &KeyEvent) -> bool {
    key.code == KeyCode::Char('q') || (key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL))
}

pub async fn run(mut rx: UnboundedReceiver<TunnelEvent>, stop: StopHandle, ctx: Context) -> Result<Option<String>> {
    let mut state = State {
        ctx, status: Status::Connecting, online: None, access: None, requests: VecDeque::new(), connections: VecDeque::new(),
        samples: VecDeque::new(), total: 0, errors: 0, open: 0, bytes_in: 0, bytes_out: 0, table: TableState::default(),
        copied: false, notice: None, update: None, frame: 0, ended: None,
    };
    let mut terminal = ratatui::init();
    let mut keys = EventStream::new();
    let mut ticker = tokio::time::interval(TICK);
    loop {
        tokio::select! {
            event = rx.recv() => match event {
                Some(event) => state.apply(event),
                None => break,
            },
            Some(Ok(Event::Key(key))) = keys.next() => {
                if quit(&key) { stop.stop(); }
                let last = state.entries().saturating_sub(1);
                match key.code {
                    KeyCode::Up => state.table.select(Some(state.table.selected().map_or(0, |at| at.saturating_sub(1)))),
                    KeyCode::Down => state.table.select(Some(state.table.selected().map_or(0, |at| (at + 1).min(last)))),
                    KeyCode::PageUp => state.table.select(Some(state.table.selected().map_or(0, |at| at.saturating_sub(10)))),
                    KeyCode::PageDown => state.table.select(Some(state.table.selected().map_or(0, |at| (at + 10).min(last)))),
                    KeyCode::Esc | KeyCode::Home => state.table.select(None),
                    KeyCode::Char('c') => { if state.copy() { state.notice("Link copied to clipboard"); } }
                    KeyCode::Char('o') => { if let Some(url) = state.online.as_ref().and_then(|online| online.url.clone()) { let _ = open::that(url); } }
                    KeyCode::Char('d') => { if let Some(online) = &state.online { let _ = open::that(format!("{}/@tunlit/tunnels/{}", state.ctx.server_url, online.id)); } }
                    _ => {}
                }
            },
            _ = ticker.tick() => state.frame += 1,
        }
        terminal.draw(|frame| draw(frame, &mut state))?;
    }
    ratatui::restore();
    Ok(state.ended)
}

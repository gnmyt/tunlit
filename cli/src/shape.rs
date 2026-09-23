use anyhow::{bail, Context, Result};
use std::time::Duration;
use tokio::sync::mpsc::Receiver;
use tokio::time::Instant;

const MIN_STALL: Duration = Duration::from_millis(200);

#[derive(Clone, Default)]
pub struct Shape {
    pub latency: Duration,
    pub jitter: Duration,
    pub bandwidth: Option<u64>,
    pub loss: f64,
}

fn number(text: &str, unit: &str) -> Result<f64> {
    text.parse::<f64>().ok().filter(|value| *value >= 0.0).with_context(|| format!("Invalid {unit} \"{text}\""))
}

pub fn duration(raw: &str) -> Result<Duration> {
    let text = raw.trim().to_ascii_lowercase();
    let (value, factor) = match text.strip_suffix("ms") {
        Some(value) => (value, 0.001),
        None => match text.strip_suffix('s') { Some(value) => (value, 1.0), None => (text.as_str(), 0.001) },
    };
    Ok(Duration::from_secs_f64(number(value.trim(), "duration")? * factor))
}

pub fn rate(raw: &str) -> Result<u64> {
    let text = raw.trim().to_ascii_lowercase().replace(' ', "");
    let units = [("gbps", 125_000_000.0), ("mbps", 125_000.0), ("kbps", 125.0), ("bps", 0.125), ("gb/s", 1e9), ("mb/s", 1e6), ("kb/s", 1e3), ("b/s", 1.0)];
    for (suffix, factor) in units {
        if let Some(value) = text.strip_suffix(suffix) {
            let bytes = number(value, "bandwidth")? * factor;
            if bytes < 1.0 { bail!("Bandwidth \"{raw}\" is too low"); }
            return Ok(bytes as u64);
        }
    }
    bail!("Invalid bandwidth \"{raw}\": use e.g. 512kbps, 2mbps or 100kB/s")
}

pub fn percent(raw: &str) -> Result<f64> {
    let value = number(raw.trim().trim_end_matches('%').trim(), "loss")?;
    if value > 100.0 { bail!("Loss must be between 0 and 100 percent"); }
    Ok(value / 100.0)
}

impl Shape {
    pub fn parse(latency: Option<&str>, jitter: Option<&str>, bandwidth: Option<&str>, loss: Option<&str>) -> Result<Self> {
        Ok(Self {
            latency: latency.map(duration).transpose()?.unwrap_or_default(),
            jitter: jitter.map(duration).transpose()?.unwrap_or_default(),
            bandwidth: bandwidth.map(rate).transpose()?,
            loss: loss.map(percent).transpose()?.unwrap_or_default(),
        })
    }

    pub fn active(&self) -> bool {
        !self.latency.is_zero() || !self.jitter.is_zero() || self.bandwidth.is_some() || self.loss > 0.0
    }

    pub fn summary(&self) -> Option<String> {
        if !self.active() { return None; }
        let mut parts = Vec::new();
        if !self.latency.is_zero() || !self.jitter.is_zero() {
            let mut text = format!("{} ms latency", self.latency.as_millis());
            if !self.jitter.is_zero() { text.push_str(&format!(" ±{} ms", self.jitter.as_millis())); }
            parts.push(text);
        }
        if let Some(bytes) = self.bandwidth {
            let bits = bytes * 8;
            parts.push(if bits >= 1_000_000 { format!("{:.1} mbps", bits as f64 / 1e6) } else { format!("{} kbps", bits / 1000) });
        }
        if self.loss > 0.0 { parts.push(format!("{}% loss", (self.loss * 100.0 * 10.0).round() / 10.0)); }
        Some(parts.join(" · "))
    }

    pub fn lose(&self) -> bool {
        self.loss > 0.0 && fastrand::f64() < self.loss
    }

    fn release(&self, arrived: Instant, len: usize, stall: bool, last: &mut Instant) -> Instant {
        let jitter = Duration::from_secs_f64(fastrand::f64() * self.jitter.as_secs_f64());
        let mut at = arrived + self.latency + jitter;
        if stall && self.lose() { at += (self.latency * 3).max(MIN_STALL); }
        at = at.max(*last);
        if let Some(bytes) = self.bandwidth { at += Duration::from_secs_f64(len as f64 / bytes as f64); }
        *last = at;
        at
    }

    pub async fn next(&self, queue: &mut Queue, stall: bool) -> Option<Vec<u8>> {
        let (arrived, chunk) = queue.rx.recv().await?;
        tokio::time::sleep_until(self.release(arrived, chunk.len(), stall, &mut queue.last)).await;
        Some(chunk)
    }
}

pub struct Queue { rx: Receiver<(Instant, Vec<u8>)>, last: Instant }

impl Queue {
    pub fn new(rx: Receiver<(Instant, Vec<u8>)>) -> Self {
        Self { rx, last: Instant::now() }
    }
}

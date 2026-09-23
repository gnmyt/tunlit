use std::time::Instant;

pub fn ago(since: Instant) -> String {
    let secs = since.elapsed().as_secs();
    if secs < 5 { "just now".into() }
    else if secs < 60 { format!("{secs}s ago") }
    else if secs < 3600 { format!("{}m ago", secs / 60) }
    else if secs < 86_400 { format!("{}h ago", secs / 3600) }
    else { format!("{}d ago", secs / 86_400) }
}

pub fn host_of(url: &str) -> String {
    let rest = url.split("://").nth(1).unwrap_or(url);
    rest.split('/').next().unwrap_or(rest).to_string()
}

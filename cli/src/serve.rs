use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

const MAX_HEADER_BYTES: usize = 16 * 1024;

pub async fn start(dir: PathBuf) -> Result<u16> {
    let dir = dir.canonicalize().with_context(|| format!("Cannot read directory {}", dir.display()))?;
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    tokio::spawn(async move {
        loop {
            let Ok((socket, _)) = listener.accept().await else { continue };
            let dir = dir.clone();
            tokio::spawn(async move { let _ = handle(socket, &dir).await; });
        }
    });
    Ok(port)
}

async fn handle(socket: TcpStream, root: &Path) -> Result<()> {
    let (rd, mut wr) = socket.into_split();
    let mut reader = BufReader::new(rd);

    let mut request_line = String::new();
    reader.read_line(&mut request_line).await?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let raw_path = parts.next().unwrap_or("/").to_string();

    let mut total = request_line.len();
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line).await?;
        total += n;
        if n == 0 || line == "\r\n" || line == "\n" || total > MAX_HEADER_BYTES { break; }
    }

    if method != "GET" && method != "HEAD" {
        return respond(&mut wr, 405, "text/plain; charset=utf-8", b"Method Not Allowed", false).await;
    }

    let path_only = raw_path.split('?').next().unwrap_or("/");
    let decoded = percent_decode(path_only);
    let Some(target) = resolve(root, &decoded) else {
        return respond(&mut wr, 404, "text/plain; charset=utf-8", b"Not Found", method == "HEAD").await;
    };

    if target.is_dir() {
        if !path_only.ends_with('/') {
            let location = format!("{}/", path_only);
            let head = format!("HTTP/1.1 301 Moved Permanently\r\nLocation: {location}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            wr.write_all(head.as_bytes()).await?;
            return Ok(());
        }
        let index = target.join("index.html");
        if index.is_file() { return send_file(&mut wr, &index, method == "HEAD").await; }
        let body = listing(&target, &decoded).await;
        return respond(&mut wr, 200, "text/html; charset=utf-8", body.as_bytes(), method == "HEAD").await;
    }
    if target.is_file() { return send_file(&mut wr, &target, method == "HEAD").await; }
    respond(&mut wr, 404, "text/plain; charset=utf-8", b"Not Found", method == "HEAD").await
}

fn resolve(root: &Path, request_path: &str) -> Option<PathBuf> {
    let mut path = root.to_path_buf();
    for segment in request_path.split('/') {
        match segment {
            "" | "." => {}
            ".." => return None,
            s if s.contains('\\') || s.contains('\0') => return None,
            s => path.push(s),
        }
    }
    let resolved = path.canonicalize().ok()?;
    if resolved.starts_with(root) { Some(resolved) } else { None }
}

async fn send_file(wr: &mut tokio::net::tcp::OwnedWriteHalf, path: &Path, head_only: bool) -> Result<()> {
    let mut file = tokio::fs::File::open(path).await?;
    let len = file.metadata().await?.len();
    let mime = mime_for(path);
    let head = format!("HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {len}\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n");
    wr.write_all(head.as_bytes()).await?;
    if !head_only { tokio::io::copy(&mut file, wr).await?; }
    wr.shutdown().await?;
    Ok(())
}

async fn respond(wr: &mut tokio::net::tcp::OwnedWriteHalf, status: u16, mime: &str, body: &[u8], head_only: bool) -> Result<()> {
    let reason = match status { 200 => "OK", 404 => "Not Found", 405 => "Method Not Allowed", _ => "Error" };
    let head = format!("HTTP/1.1 {status} {reason}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n", body.len());
    wr.write_all(head.as_bytes()).await?;
    if !head_only { wr.write_all(body).await?; }
    wr.shutdown().await?;
    Ok(())
}

async fn listing(dir: &Path, request_path: &str) -> String {
    let mut entries = Vec::new();
    if let Ok(mut read) = tokio::fs::read_dir(dir).await {
        while let Ok(Some(entry)) = read.next_entry().await {
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().await.map(|t| t.is_dir()).unwrap_or(false);
            let size = entry.metadata().await.map(|m| m.len()).unwrap_or(0);
            entries.push((is_dir, name, size));
        }
    }
    entries.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.to_lowercase().cmp(&b.1.to_lowercase())));

    let title = escape(if request_path.is_empty() { "/" } else { request_path });
    let mut html = format!("<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Index of {title}</title><style>body{{font-family:system-ui,sans-serif;margin:2rem auto;max-width:48rem;padding:0 1rem;color:#222}}h1{{font-size:1.25rem}}table{{border-collapse:collapse;width:100%}}td{{padding:.35rem .5rem;border-bottom:1px solid #eee}}td.s{{text-align:right;color:#888;white-space:nowrap}}a{{color:#0d9488;text-decoration:none}}a:hover{{text-decoration:underline}}</style></head><body><h1>Index of {title}</h1><table>");
    if request_path != "/" && !request_path.is_empty() {
        html.push_str("<tr><td><a href=\"../\">../</a></td><td class=\"s\"></td></tr>");
    }
    for (is_dir, name, size) in entries {
        let href = percent_encode(&name);
        let (label, suffix) = if is_dir { (format!("{}/", escape(&name)), "/") } else { (escape(&name), "") };
        let size_text = if is_dir { String::new() } else { human_size(size) };
        html.push_str(&format!("<tr><td><a href=\"{href}{suffix}\">{label}</a></td><td class=\"s\">{size_text}</td></tr>"));
    }
    html.push_str("</table></body></html>");
    html
}

fn human_size(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 { value /= 1024.0; unit += 1; }
    if unit == 0 { format!("{bytes} B") } else { format!("{value:.1} {}", UNITS[unit]) }
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn percent_encode(text: &str) -> String {
    let mut out = String::new();
    for byte in text.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(byte as char),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(value) = u8::from_str_radix(&text[i + 1..i + 3], 16) { out.push(value); i += 3; continue; }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("html") | Some("htm") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js") | Some("mjs") => "text/javascript; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("md") | Some("txt") | Some("log") => "text/plain; charset=utf-8",
        Some("xml") => "application/xml",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("pdf") => "application/pdf",
        Some("zip") => "application/zip",
        Some("wasm") => "application/wasm",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mp3") => "audio/mpeg",
        _ => "application/octet-stream",
    }
}

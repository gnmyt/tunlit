use anyhow::{Context, Result};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader as AsyncBufReader};
use tokio::net::TcpListener;
use tokio::runtime::Handle;

const TIMEOUT: Duration = Duration::from_millis(800);

fn lock_file() -> Result<PathBuf> {
    let dir = dirs::config_dir().context("No config directory")?.join("tunlit");
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("gui.instance"))
}

pub fn hand_over(link: Option<&str>) -> bool {
    let Ok(path) = lock_file() else { return false };
    let Ok(contents) = std::fs::read_to_string(&path) else { return false };
    let mut lines = contents.lines();
    let (Some(port), Some(secret)) = (lines.next().and_then(|p| p.parse::<u16>().ok()), lines.next()) else { return false };
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, TIMEOUT) else { return false };
    let _ = stream.set_read_timeout(Some(TIMEOUT));
    if writeln!(stream, "{secret} {}", link.unwrap_or("")).is_err() { return false; }
    let mut reply = String::new();
    BufReader::new(stream).read_line(&mut reply).is_ok() && reply.trim() == "ok"
}

pub fn serve(runtime: &Handle, on_link: impl Fn(Option<String>) + Send + Sync + 'static) -> Result<()> {
    let listener = runtime.block_on(TcpListener::bind("127.0.0.1:0"))?;
    let port = listener.local_addr()?.port();
    let secret: String = (0..32).map(|_| { let n = rand_byte() % 36; (if n < 10 { b'0' + n } else { b'a' + n - 10 }) as char }).collect();
    let path = lock_file()?;
    std::fs::write(&path, format!("{port}\n{secret}\n"))?;
    #[cfg(unix)]
    { use std::os::unix::fs::PermissionsExt; let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)); }

    runtime.spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else { continue };
            let mut reader = AsyncBufReader::new(stream);
            let mut line = String::new();
            let Ok(Ok(_)) = tokio::time::timeout(TIMEOUT, reader.read_line(&mut line)).await else { continue };
            let Some((given, link)) = line.trim_end().split_once(' ') else { continue };
            if given != secret { continue; }
            let link = link.trim().to_string();
            on_link(if link.is_empty() { None } else { Some(link) });
            let _ = reader.get_mut().write_all(b"ok\n").await;
        }
    });
    Ok(())
}

pub fn release() {
    if let Ok(path) = lock_file() { let _ = std::fs::remove_file(path); }
}

fn rand_byte() -> u8 {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    (RandomState::new().build_hasher().finish() >> 24) as u8
}

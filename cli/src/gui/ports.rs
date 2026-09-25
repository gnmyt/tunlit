use std::collections::BTreeMap;

#[derive(Clone)]
pub struct Listener { pub port: u16, pub process: String }

const TCP_SERVICES: [&str; 10] = ["postgres", "postmaster", "redis-server", "mysqld", "mariadbd", "mongod", "sshd", "memcached", "valkey-server", "beam.smp"];

impl Listener {
    pub fn is_tcp(&self) -> bool { TCP_SERVICES.contains(&self.process.as_str()) }
}

pub fn scan() -> Vec<Listener> {
    let own = std::process::id();
    let mut found: BTreeMap<u16, String> = BTreeMap::new();
    for (port, pid, process) in listeners() {
        if !(1024..32768).contains(&port) || pid == own || process == "tunlit" { continue; }
        found.entry(port).or_insert(process);
    }
    found.into_iter().map(|(port, process)| Listener { port, process }).collect()
}

#[cfg(target_os = "linux")]
fn listeners() -> Vec<(u16, u32, String)> {
    let mut inodes: BTreeMap<u64, u16> = BTreeMap::new();
    for table in ["/proc/net/tcp", "/proc/net/tcp6"] {
        let Ok(text) = std::fs::read_to_string(table) else { continue };
        for line in text.lines().skip(1) {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() < 10 || fields[3] != "0A" { continue; }
            let (Some(port), Ok(inode)) = (fields[1].rsplit(':').next().and_then(|hex| u16::from_str_radix(hex, 16).ok()), fields[9].parse::<u64>()) else { continue };
            inodes.insert(inode, port);
        }
    }
    let mut out = Vec::new();
    let Ok(procs) = std::fs::read_dir("/proc") else { return out };
    for entry in procs.flatten() {
        let Ok(pid) = entry.file_name().to_string_lossy().parse::<u32>() else { continue };
        let Ok(fds) = std::fs::read_dir(entry.path().join("fd")) else { continue };
        let cmdline = std::fs::read(entry.path().join("cmdline")).unwrap_or_default();
        let argv0 = String::from_utf8_lossy(cmdline.split(|byte| *byte == 0).next().unwrap_or_default()).into_owned();
        let name = argv0.rsplit('/').next().unwrap_or_default().to_string();
        for fd in fds.flatten() {
            let Ok(link) = std::fs::read_link(fd.path()) else { continue };
            let text = link.to_string_lossy();
            let Some(inode) = text.strip_prefix("socket:[").and_then(|rest| rest.strip_suffix(']')).and_then(|inode| inode.parse::<u64>().ok()) else { continue };
            if let Some(port) = inodes.get(&inode) { out.push((*port, pid, name.clone())); }
        }
    }
    out
}

#[cfg(target_os = "macos")]
fn listeners() -> Vec<(u16, u32, String)> {
    let Ok(output) = std::process::Command::new("lsof").args(["-nP", "-iTCP", "-sTCP:LISTEN"]).output() else { return Vec::new() };
    String::from_utf8_lossy(&output.stdout).lines().skip(1).filter_map(|line| {
        let fields: Vec<&str> = line.split_whitespace().collect();
        let port = fields.get(8)?.rsplit(':').next()?.parse().ok()?;
        Some((port, fields.get(1)?.parse().ok()?, fields[0].to_string()))
    }).collect()
}

#[cfg(windows)]
fn listeners() -> Vec<(u16, u32, String)> {
    let Ok(netstat) = std::process::Command::new("netstat").args(["-ano", "-p", "TCP"]).output() else { return Vec::new() };
    let names: BTreeMap<u32, String> = std::process::Command::new("tasklist").args(["/FO", "CSV", "/NH"]).output().map(|output| {
        String::from_utf8_lossy(&output.stdout).lines().filter_map(|line| {
            let mut cells = line.split("\",\"");
            let name = cells.next()?.trim_start_matches('"').trim_end_matches(".exe").to_string();
            Some((cells.next()?.parse().ok()?, name))
        }).collect()
    }).unwrap_or_default();
    String::from_utf8_lossy(&netstat.stdout).lines().filter_map(|line| {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.get(3) != Some(&"LISTENING") { return None; }
        let port = fields.get(1)?.rsplit(':').next()?.parse().ok()?;
        let pid: u32 = fields.get(4)?.parse().ok()?;
        Some((port, pid, names.get(&pid).cloned().unwrap_or_default()))
    }).collect()
}

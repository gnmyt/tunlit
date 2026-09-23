use anyhow::Result;
use std::net::SocketAddr;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::UdpSocket;
use tokio::sync::mpsc;
use tokio::time::Instant;
use crate::mux::{Incoming, MuxReader, MuxWriter, CHUNK};
use crate::shape::{Queue, Shape};

pub const UDP_IDLE: Duration = Duration::from_secs(60);
const QUEUE: usize = 256;

pub async fn pump_tcp<S: AsyncRead + AsyncWrite + Unpin>(socket: S, writer: MuxWriter, mut reader: MuxReader, shape: &Shape) {
    let (mut rd, mut wr) = tokio::io::split(socket);
    if !shape.active() {
        let to_mux = async {
            let mut buf = vec![0u8; CHUNK];
            loop {
                match rd.read(&mut buf).await {
                    Ok(0) => { writer.close().await; break; }
                    Ok(n) => { if writer.send(&buf[..n]).await.is_err() { break; } }
                    Err(_) => { writer.reset(); break; }
                }
            }
        };
        let from_mux = async {
            loop {
                match reader.recv().await {
                    Incoming::Data(data) => { if wr.write_all(&data).await.is_err() { break; } }
                    Incoming::Close => { let _ = wr.shutdown().await; break; }
                    Incoming::Reset => break,
                    Incoming::Datagram(_) => {}
                }
            }
        };
        tokio::join!(to_mux, from_mux);
        return;
    }

    let (to_mux_tx, to_mux_rx) = mpsc::channel::<(Instant, Vec<u8>)>(QUEUE);
    let (to_socket_tx, to_socket_rx) = mpsc::channel::<(Instant, Vec<u8>)>(QUEUE);

    let read_socket = async {
        let mut buf = vec![0u8; CHUNK];
        loop {
            match rd.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => { if to_mux_tx.send((Instant::now(), buf[..n].to_vec())).await.is_err() { break; } }
            }
        }
        drop(to_mux_tx);
    };
    let read_mux = async {
        loop {
            match reader.recv().await {
                Incoming::Data(data) => { if to_socket_tx.send((Instant::now(), data)).await.is_err() { break; } }
                Incoming::Close | Incoming::Reset => break,
                Incoming::Datagram(_) => {}
            }
        }
        drop(to_socket_tx);
    };
    let write_mux = async {
        let mut queue = Queue::new(to_mux_rx);
        while let Some(chunk) = shape.next(&mut queue, true).await {
            if writer.send(&chunk).await.is_err() { break; }
        }
        writer.close().await;
    };
    let write_socket = async {
        let mut queue = Queue::new(to_socket_rx);
        while let Some(chunk) = shape.next(&mut queue, true).await {
            if wr.write_all(&chunk).await.is_err() { break; }
        }
        let _ = wr.shutdown().await;
    };
    tokio::join!(read_socket, read_mux, write_mux, write_socket);
}

pub async fn pump_udp_owner(target: SocketAddr, writer: MuxWriter, mut reader: MuxReader, shape: &Shape) -> Result<()> {
    let bind: SocketAddr = if target.is_ipv4() { "0.0.0.0:0".parse()? } else { "[::]:0".parse()? };
    let socket = UdpSocket::bind(bind).await?;
    socket.connect(target).await?;

    let (to_mux_tx, to_mux_rx) = mpsc::channel::<(Instant, Vec<u8>)>(QUEUE);
    let (to_socket_tx, to_socket_rx) = mpsc::channel::<(Instant, Vec<u8>)>(QUEUE);

    let relay = async {
        let mut buf = vec![0u8; 65535];
        loop {
            tokio::select! {
                incoming = tokio::time::timeout(UDP_IDLE, reader.recv()) => match incoming {
                    Ok(Incoming::Datagram(data)) => { if !shape.lose() { let _ = to_socket_tx.try_send((Instant::now(), data)); } }
                    Ok(Incoming::Close) | Ok(Incoming::Reset) | Err(_) => break,
                    Ok(_) => {}
                },
                received = socket.recv(&mut buf) => match received {
                    Ok(n) => { if !shape.lose() { let _ = to_mux_tx.try_send((Instant::now(), buf[..n].to_vec())); } }
                    Err(_) => {}
                },
            }
        }
        drop(to_socket_tx);
        drop(to_mux_tx);
    };
    let write_socket = async {
        let mut queue = Queue::new(to_socket_rx);
        while let Some(datagram) = shape.next(&mut queue, false).await { let _ = socket.send(&datagram).await; }
    };
    let write_mux = async {
        let mut queue = Queue::new(to_mux_rx);
        while let Some(datagram) = shape.next(&mut queue, false).await {
            if writer.send_datagram(&datagram).await.is_err() { break; }
        }
    };
    tokio::join!(relay, write_socket, write_mux);
    writer.close().await;
    Ok(())
}

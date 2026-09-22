use anyhow::Result;
use std::net::SocketAddr;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpStream, UdpSocket};
use crate::mux::{Incoming, MuxReader, MuxWriter, CHUNK};

pub const UDP_IDLE: Duration = Duration::from_secs(60);

pub async fn pump_tcp(socket: TcpStream, writer: MuxWriter, mut reader: MuxReader) {
    let _ = socket.set_nodelay(true);
    let (mut rd, mut wr) = socket.into_split();

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
}

pub async fn pump_udp_owner(target: SocketAddr, writer: MuxWriter, mut reader: MuxReader) -> Result<()> {
    let bind: SocketAddr = if target.is_ipv4() { "0.0.0.0:0".parse()? } else { "[::]:0".parse()? };
    let socket = UdpSocket::bind(bind).await?;
    socket.connect(target).await?;

    let mut buf = vec![0u8; 65535];
    loop {
        tokio::select! {
            incoming = tokio::time::timeout(UDP_IDLE, reader.recv()) => match incoming {
                Ok(Incoming::Datagram(data)) => { let _ = socket.send(&data).await; }
                Ok(Incoming::Close) | Ok(Incoming::Reset) | Err(_) => break,
                Ok(_) => {}
            },
            received = socket.recv(&mut buf) => match received {
                Ok(n) => { if writer.send_datagram(&buf[..n]).await.is_err() { break; } }
                Err(_) => {}
            },
        }
    }
    writer.close().await;
    Ok(())
}

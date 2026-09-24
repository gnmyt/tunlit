use crate::session::Task;
use anyhow::{bail, Result};
use bytes::Bytes;
use http_body_util::{combinators::BoxBody, BodyExt, Empty};
use hyper::body::Incoming;
use hyper::header::{HeaderValue, CONNECTION, UPGRADE};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::TcpListener;
use crate::serve;
use crate::tunnel::{connect_target, Target};

#[derive(Clone)]
pub enum RouteTarget { Addr(Target), Dir(PathBuf) }

#[derive(Clone)]
pub struct Route { pub prefix: String, pub target: RouteTarget }

impl Route {
    pub fn parse(raw: &str) -> Result<Self> {
        let Some((prefix, target)) = raw.split_once('=') else { bail!("Invalid route \"{raw}\": use <prefix>=<target>") };
        Ok(Self { prefix: normalize(prefix)?, target: RouteTarget::parse(target)? })
    }

    pub fn new(prefix: &str, target: RouteTarget) -> Result<Self> {
        Ok(Self { prefix: normalize(prefix)?, target })
    }
}

impl RouteTarget {
    pub fn parse(raw: &str) -> Result<Self> {
        let path = std::path::Path::new(raw);
        if path.is_dir() { return Ok(Self::Dir(path.to_path_buf())); }
        Ok(Self::Addr(Target::parse(raw)?))
    }

    pub fn dir(raw: &str) -> Result<Self> {
        let path = std::path::Path::new(raw);
        if !path.exists() { bail!("\"{raw}\" does not exist"); }
        if !path.is_dir() { bail!("\"{raw}\" is not a directory - use `tunlit http {raw}` for a port or host:port"); }
        Ok(Self::Dir(path.to_path_buf()))
    }

    pub fn label(&self) -> String {
        match self { Self::Addr(target) => target.label(), Self::Dir(dir) => dir.display().to_string() }
    }
}

fn normalize(prefix: &str) -> Result<String> {
    let trimmed = prefix.trim().trim_end_matches('/');
    if trimmed.is_empty() { return Ok("/".into()); }
    if !trimmed.starts_with('/') { bail!("Route prefix \"{prefix}\" must start with /"); }
    Ok(trimmed.to_string())
}

struct Mounted { prefix: String, target: Target, strip: bool }

impl Mounted {
    fn matches(&self, path: &str) -> bool {
        self.prefix == "/" || (path.starts_with(&self.prefix) && matches!(path.as_bytes().get(self.prefix.len()), None | Some(b'/')))
    }

    fn rest<'a>(&self, path: &'a str) -> &'a str {
        if !self.strip || self.prefix == "/" { return path; }
        match &path[self.prefix.len()..] { "" => "/", rest => rest }
    }
}

struct Table { routes: Vec<Mounted> }

impl Table {
    fn pick(&self, path: &str) -> &Mounted {
        self.routes.iter().filter(|route| route.matches(path)).max_by_key(|route| route.prefix.len()).expect("the root route always matches")
    }
}

pub async fn start(routes: Vec<Route>) -> Result<(u16, Task)> {
    let mut mounted = Vec::new();
    let mut servers = Vec::new();
    for route in routes {
        let (target, strip) = match route.target {
            RouteTarget::Addr(target) => (target, false),
            RouteTarget::Dir(dir) => {
                let (port, server) = serve::start(dir).await?;
                servers.push(server);
                (Target { host: "127.0.0.1".into(), port, tls: false }, true)
            }
        };
        mounted.push(Mounted { prefix: route.prefix, target, strip });
    }
    let table = Arc::new(Table { routes: mounted });

    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let task = tokio::spawn(async move {
        let _servers = servers;
        loop {
            let Ok((socket, _)) = listener.accept().await else { continue };
            let table = table.clone();
            tokio::spawn(async move {
                let service = service_fn(move |req| handle(req, table.clone()));
                let _ = http1::Builder::new().preserve_header_case(true).serve_connection(TokioIo::new(socket), service).with_upgrades().await;
            });
        }
    });
    Ok((port, Task(task)))
}

type Body = BoxBody<Bytes, hyper::Error>;

fn status(code: StatusCode) -> Response<Body> {
    Response::builder().status(code).body(Empty::new().map_err(|never| match never {}).boxed()).unwrap()
}

async fn connect(target: &Target) -> Result<Box<dyn Stream>> {
    let socket = connect_target(&target.resolve().await?).await?;
    if !target.tls { return Ok(Box::new(socket)); }
    Ok(Box::new(target.tls_connector()?.connect(&target.host, socket).await?))
}

trait Stream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Stream for T {}

async fn handle(mut req: Request<Incoming>, table: Arc<Table>) -> Result<Response<Body>, hyper::Error> {
    let path = req.uri().path().to_string();
    let route = table.pick(&path);
    if route.strip {
        let rest = route.rest(&path);
        let uri = match req.uri().query() { Some(query) => format!("{rest}?{query}"), None => rest.to_string() };
        let Ok(parsed) = uri.parse() else { return Ok(status(StatusCode::BAD_REQUEST)) };
        *req.uri_mut() = parsed;
    }

    let Ok(stream) = connect(&route.target).await else { return Ok(status(StatusCode::BAD_GATEWAY)) };
    let Ok((mut sender, conn)) = hyper::client::conn::http1::Builder::new().preserve_header_case(true).handshake(TokioIo::new(stream)).await
        else { return Ok(status(StatusCode::BAD_GATEWAY)) };
    tokio::spawn(async move { let _ = conn.with_upgrades().await; });

    let upgrading = req.headers().get(UPGRADE).cloned();
    let client_upgrade = upgrading.as_ref().map(|_| hyper::upgrade::on(&mut req));

    let mut response = match sender.send_request(req).await {
        Ok(response) => response,
        Err(_) => return Ok(status(StatusCode::BAD_GATEWAY)),
    };

    if response.status() == StatusCode::SWITCHING_PROTOCOLS {
        if let (Some(client), Some(upgrade)) = (client_upgrade, upgrading) {
            let upstream = hyper::upgrade::on(&mut response);
            tokio::spawn(async move {
                if let (Ok(a), Ok(b)) = (client.await, upstream.await) {
                    let mut a = TokioIo::new(a);
                    let mut b = TokioIo::new(b);
                    let _ = tokio::io::copy_bidirectional(&mut a, &mut b).await;
                }
            });
            response.headers_mut().insert(UPGRADE, upgrade);
            response.headers_mut().insert(CONNECTION, HeaderValue::from_static("upgrade"));
        }
    }

    Ok(response.map(|body| body.boxed()))
}

mod api;
mod auth;
mod config;
mod connect;
mod handler;
mod mux;
mod qr;
mod serve;
mod tcp;
mod tunnel;

use clap::{Parser, Subcommand};
use console::style;

#[derive(Parser)]
#[command(name = "tunlit", about = "tunlit CLI - expose local ports through your own tunlit server", version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Login,
    Logout,
    Http {
        target: String,
        #[arg(short, long)] name: Option<String>,
        #[arg(long)] keep_host: bool,
        #[arg(long = "allow", value_name = "CIDR")] allow: Vec<String>,
        #[arg(long, value_name = "PASSWORD")] password: Option<String>,
        #[arg(long)] require_login: bool,
    },
    Serve {
        #[arg(default_value = ".")] dir: String,
        #[arg(short, long)] name: Option<String>,
        #[arg(long = "allow", value_name = "CIDR")] allow: Vec<String>,
        #[arg(long, value_name = "PASSWORD")] password: Option<String>,
        #[arg(long)] require_login: bool,
    },
    Tcp {
        target: String,
        #[arg(short, long)] name: Option<String>,
        #[arg(long = "allow", value_name = "CIDR")] allow: Vec<String>,
    },
    Connect {
        target: String,
        #[arg(short, long)] port: Option<u16>,
        #[arg(short, long, default_value = "127.0.0.1")] bind: String,
        #[arg(short, long)] server: Option<String>,
    },
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },
    Links {
        #[command(subcommand)]
        action: LinkAction,
    },
}

#[derive(Subcommand)]
enum LinkAction {
    Register,
    Forget,
}

#[derive(Subcommand)]
enum ConfigAction {
    Set { key: String, value: String },
    Get { key: String },
    Show,
}

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("{} {err:#}", style("✗").red().bold());
        std::process::exit(1);
    }
}

async fn run() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Login => auth::login().await,
        Commands::Logout => auth::logout(),
        Commands::Http { target, name, keep_host, allow, password, require_login } =>
            tunnel::run(tunnel::Options {
                mode: "http", target: tunnel::TargetSpec::parse(&target)?, name, keep_host,
                access: tunnel::Access::new(allow, password, require_login)?,
            }).await,
        Commands::Serve { dir, name, allow, password, require_login } =>
            tunnel::run(tunnel::Options {
                mode: "http", target: tunnel::TargetSpec::dir(&dir)?, name, keep_host: false,
                access: tunnel::Access::new(allow, password, require_login)?,
            }).await,
        Commands::Tcp { target, name, allow } =>
            tunnel::run(tunnel::Options {
                mode: "tcp", target: tunnel::TargetSpec::Addr(tunnel::Target::parse(&target)?), name, keep_host: false,
                access: tunnel::Access::new(allow, None, false)?,
            }).await,
        Commands::Connect { target, port, bind, server } => connect::run(target, port, bind, server).await,
        Commands::Links { action } => match action {
            LinkAction::Register => handler::install(),
            LinkAction::Forget => handler::remove(),
        },
        Commands::Config { action } => match action {
            ConfigAction::Set { key, value } => config::set(&key, &value),
            ConfigAction::Get { key } => config::get(&key),
            ConfigAction::Show => config::show(),
        },
    }
}

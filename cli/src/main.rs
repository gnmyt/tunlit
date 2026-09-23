mod api;
mod auth;
mod cli;
mod config;
mod connect;
#[cfg(feature = "gui")]
mod gui;
mod handler;
mod headless;
mod mux;
mod qr;
mod router;
mod serve;
mod service;
mod session;
mod shape;
mod tcp;
mod tunnel;

use clap::{Parser, Subcommand};
use console::style;
use std::path::PathBuf;

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
        #[arg(long, value_name = "PREFIX=TARGET")] route: Vec<String>,
        #[arg(long)] keep_host: bool,
        #[command(flatten)] rules: RuleArgs,
        #[arg(long, value_name = "PASSWORD")] password: Option<String>,
        #[arg(long)] require_login: bool,
        #[command(flatten)] shape: ShapeArgs,
    },
    Serve {
        #[arg(default_value = ".")] dir: String,
        #[arg(short, long)] name: Option<String>,
        #[command(flatten)] rules: RuleArgs,
        #[arg(long, value_name = "PASSWORD")] password: Option<String>,
        #[arg(long)] require_login: bool,
        #[command(flatten)] shape: ShapeArgs,
    },
    Tcp {
        target: String,
        #[arg(short, long)] name: Option<String>,
        #[command(flatten)] rules: RuleArgs,
        #[command(flatten)] shape: ShapeArgs,
    },
    Connect {
        target: String,
        #[arg(short, long)] port: Option<u16>,
        #[arg(short, long, default_value = "127.0.0.1")] bind: String,
        #[arg(short, long)] server: Option<String>,
    },
    #[command(alias = "status")]
    Ls,
    Start {
        #[arg(short, long, value_name = "FILE")] config: Option<PathBuf>,
    },
    Service {
        #[command(subcommand)]
        action: ServiceAction,
    },
    #[cfg(feature = "gui")]
    Gui {
        link: Option<String>,
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

#[derive(clap::Args)]
struct RuleArgs {
    #[arg(long, value_name = "CIDR")] allow: Vec<String>,
    #[arg(long, value_name = "CODE")] allow_country: Vec<String>,
    #[arg(long, value_name = "CIDR")] block_ip: Vec<String>,
    #[arg(long, value_name = "CODE")] block_country: Vec<String>,
    #[arg(long, value_name = "CATEGORY", help = "tor, vpn, datacenter or blocklist")] block: Vec<String>,
}

impl RuleArgs {
    fn parse(self) -> anyhow::Result<tunnel::Rules> {
        tunnel::Rules::new(self.allow, self.allow_country, self.block_ip, self.block_country, self.block)
    }
}

#[derive(clap::Args)]
struct ShapeArgs {
    #[arg(long, value_name = "DURATION")] latency: Option<String>,
    #[arg(long, value_name = "DURATION")] jitter: Option<String>,
    #[arg(long, value_name = "RATE")] bandwidth: Option<String>,
    #[arg(long, value_name = "PERCENT")] loss: Option<String>,
}

impl ShapeArgs {
    fn parse(&self) -> anyhow::Result<shape::Shape> {
        shape::Shape::parse(self.latency.as_deref(), self.jitter.as_deref(), self.bandwidth.as_deref(), self.loss.as_deref())
    }
}

#[derive(Subcommand)]
enum ServiceAction {
    Install,
    Uninstall,
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

fn main() {
    let cli = Cli::parse();
    let runtime = tokio::runtime::Runtime::new().unwrap_or_else(|err| fail(err.into()));

    #[cfg(feature = "gui")]
    if let Commands::Gui { link } = cli.command {
        gui::launch(runtime.handle().clone(), link).unwrap_or_else(|err| fail(err));
        return;
    }

    runtime.block_on(run(cli)).unwrap_or_else(|err| fail(err));
}

fn fail(err: anyhow::Error) -> ! {
    eprintln!("{} {err:#}", style("✗").red().bold());
    std::process::exit(1)
}

async fn run(cli: Cli) -> anyhow::Result<()> {
    match cli.command {
        Commands::Login => cli::login().await,
        Commands::Logout => cli::logout(),
        Commands::Http { target, name, route, keep_host, rules, password, require_login, shape } =>
            cli::tunnel(tunnel::Options::http(tunnel::TargetSpec::with_routes(&target, &route)?, name, keep_host, tunnel::Access::new(rules.parse()?, password, require_login)?).shaped(shape.parse()?)).await,
        Commands::Serve { dir, name, rules, password, require_login, shape } =>
            cli::tunnel(tunnel::Options::http(tunnel::TargetSpec::dir(&dir)?, name, false, tunnel::Access::new(rules.parse()?, password, require_login)?).shaped(shape.parse()?)).await,
        Commands::Tcp { target, name, rules, shape } =>
            cli::tunnel(tunnel::Options::tcp(tunnel::Target::parse(&target)?, name, tunnel::Access::new(rules.parse()?, None, false)?).shaped(shape.parse()?)).await,
        Commands::Connect { target, port, bind, server } => cli::connect(target, port, bind, server).await,
        Commands::Ls => cli::list().await,
        Commands::Start { config } => headless::run(config).await,
        Commands::Service { action } => match action {
            ServiceAction::Install => service::install(),
            ServiceAction::Uninstall => service::uninstall(),
        },
        #[cfg(feature = "gui")]
        Commands::Gui { .. } => unreachable!("handled before the runtime starts"),
        Commands::Links { action } => match action {
            LinkAction::Register => {
                let where_ = handler::install()?;
                println!("{} {} links now open in this tunlit", style("✓").green().bold(), style(format!("{}://", handler::SCHEME)).cyan().bold());
                println!("  {}", style(where_.to_string_lossy()).dim());
                println!("  Your browser will ask before it opens one.");
                Ok(())
            }
            LinkAction::Forget => {
                handler::remove()?;
                println!("{} {} links are no longer handled by tunlit", style("✓").green().bold(), style(format!("{}://", handler::SCHEME)).bold());
                Ok(())
            }
        },
        Commands::Config { action } => match action {
            ConfigAction::Set { key, value } => config::set(&key, &value),
            ConfigAction::Get { key } => config::get(&key),
            ConfigAction::Show => config::show(),
        },
    }
}

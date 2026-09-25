use anyhow::Result;
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{ring, CryptoProvider};
use rustls::{ClientConfig, DigitallySignedStruct, SignatureScheme};
use rustls_pki_types::{CertificateDer, ServerName, UnixTime};
use rustls_platform_verifier::Verifier;
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio_rustls::client::TlsStream;
use tokio_rustls::TlsConnector;

#[derive(Debug)]
struct Trusting;

impl ServerCertVerifier for Trusting {
    fn verify_server_cert(&self, _: &CertificateDer<'_>, _: &[CertificateDer<'_>], _: &ServerName<'_>, _: &[u8], _: UnixTime) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(&self, _: &[u8], _: &CertificateDer<'_>, _: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(&self, _: &[u8], _: &CertificateDer<'_>, _: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        provider().signature_verification_algorithms.supported_schemes()
    }
}

pub fn install_provider() {
    let _ = ring::default_provider().install_default();
}

fn provider() -> Arc<CryptoProvider> {
    CryptoProvider::get_default().unwrap().clone()
}

pub fn client_config(accept_invalid_certs: bool) -> Result<Arc<ClientConfig>> {
    let verifier: Arc<dyn ServerCertVerifier> = if accept_invalid_certs { Arc::new(Trusting) } else { Arc::new(Verifier::new(provider())?) };
    let config = ClientConfig::builder_with_provider(provider()).with_safe_default_protocol_versions()?
        .dangerous().with_custom_certificate_verifier(verifier).with_no_client_auth();
    Ok(Arc::new(config))
}

pub async fn connect_trusting(host: &str, socket: TcpStream) -> Result<TlsStream<TcpStream>> {
    let name = ServerName::try_from(host.to_string())?;
    Ok(TlsConnector::from(client_config(true)?).connect(name, socket).await?)
}

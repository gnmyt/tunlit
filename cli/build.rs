fn main() {
    println!("cargo:rerun-if-changed=assets/tunlit.ico");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut resource = winresource::WindowsResource::new();
        resource.set_icon("assets/tunlit.ico");
        if let Err(err) = resource.compile() {
            println!("cargo:warning=Could not embed the Windows icon: {err}");
        }
    }
}

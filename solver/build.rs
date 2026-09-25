// The memory is fixed: 512 pages, 32 MiB, initial and maximum equal, and the
// linker refuses to make it growable. These are link arguments for the cdylib
// only, and a build script's link arguments survive the RUSTFLAGS that
// solver/build.mjs sets (measured by the Rust knowledge base on 1.98.1), so
// this file is their one source. The heap inside that memory is src/arena.rs.
// A world denser than the memory holds traps, the same way on every host.

const MEMORY_BYTES: u64 = 512 * 65536;

fn main() {
    println!("cargo::rerun-if-changed=build.rs");
    if std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("wasm32") {
        println!("cargo::rustc-link-arg-cdylib=--initial-memory={}", MEMORY_BYTES);
        println!("cargo::rustc-link-arg-cdylib=--no-growable-memory");
    }
}

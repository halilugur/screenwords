//! # screenwords
//!
//! A from-zero video-story engine in pure Rust (std only): document model,
//! edit engine, package validator, MCP client/server, web editor and an
//! animated renderer — one binary, zero dependencies.
//!
//! - [`project`] — the document model: rational time, tracks / clips /
//!   components / audio events, transcripts with word anchors.
//! - [`edits`] — the edit engine: atomic batches with `ref` chaining,
//!   `ifRevision` conflicts, ripple cuts, transcript correction, undo/redo.
//! - [`swanim`] — the `.swanim` animation-package validator: manifest rules,
//!   path/type/size limits, blocked-API code scan, offline import map.
//! - [`reads`] — transcript views and search, history, chapters, notes,
//!   SRT / WebVTT export, project scans.
//! - [`mcp`] / [`mcp_proxy`] — the Streamable-HTTP MCP client and the stdio
//!   proxy that bridges any MCP-speaking agent to a running editor.
//! - [`server`] / [`ui`] / [`render`] — the editor itself: the MCP server,
//!   the web UI, and the animated HTML renderer.
//! - `json`, `regex`, `http(d)`, `inflate`, `zip` — the in-crate foundations
//!   (JSON, a regex subset, HTTP/1.1 both ways, DEFLATE, ZIP).

pub mod audio;
pub mod catalog;
pub mod edits;
pub mod http;
pub mod httpd;
pub mod inflate;
pub mod json;
pub mod mcp;
pub mod mcp_proxy;
pub mod preview;
pub mod project;
pub mod rational;
pub mod reads;
pub mod regex;
pub mod render;
pub mod server;
pub mod swanim;
pub mod theme;
pub mod tts;
pub mod ui;
pub mod zip;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

//! The stdio MCP proxy: newline-delimited JSON-RPC 2.0 on stdin/stdout,
//! forwarded to a running editor's Streamable-HTTP endpoint under the
//! proxy's own single session.
//!
//! Flow: lazily `initialize` upstream (optionually launching the app first,
//! like the helper's "opens Screenwords when Claude needs it"), then for every
//! downstream request forward the method/params upstream and print the
//! result; notifications are posted without a response.

use crate::json::Value;
use crate::mcp::Client;
use std::io::{BufRead, Write};

pub struct ProxyOptions {
    /// Try `open -a Screenwords` when the port refuses connections, then poll.
    pub launch_app: bool,
    pub launch_timeout: std::time::Duration,
    pub poll_interval: std::time::Duration,
    pub client_name: String,
}

impl Default for ProxyOptions {
    fn default() -> Self {
        ProxyOptions {
            launch_app: true,
            launch_timeout: std::time::Duration::from_secs(30),
            poll_interval: std::time::Duration::from_millis(500),
            client_name: "screenwords-mcp".into(),
        }
    }
}

/// Reads JSON-RPC lines from `input`, writes responses to `output`.
/// Returns the process exit code.
pub fn run<R: BufRead, W: Write>(
    mut client: Client,
    options: &ProxyOptions,
    input: R,
    mut output: W,
    stderr: &mut dyn std::io::Write,
) -> i32 {
    if options.launch_app {
        if let Err(e) = ensure_app_reachable(&mut client, options, stderr) {
            let _ = writeln!(stderr, "screenwords-mcp: {e}");
            return 1;
        }
    }
    let init_result = match client.initialize(&options.client_name) {
        Ok(result) => result,
        Err(e) => {
            let _ = writeln!(stderr, "screenwords-mcp: initialize failed: {e}");
            return 1;
        }
    };

    for line in input.lines() {
        let Ok(line) = line else {
            break; // EOF: the client closed the pipe
        };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(msg) = Value::parse(&line) else {
            let _ = writeln!(stderr, "screenwords-mcp: stdin: not JSON: {}", truncate(&line, 120));
            continue;
        };
        let Some(method) = msg.get("method").and_then(Value::as_str).map(str::to_string) else {
            continue; // a response to nothing we asked; drop it
        };
        let params = msg.get("params").cloned();
        let id = msg.get("id").cloned();
        if id.is_none() {
            // Notification: forward, no response.
            let _ = forward_notification(&mut client, &method, &params);
            continue;
        }
        if method == "initialize" {
            // The helper keeps ONE upstream session; a client initialize is
            // answered from it (forwarding a second initialize is HTTP 400).
            let mut reply = Value::obj();
            reply.set("jsonrpc", Value::str("2.0"));
            reply.set("id", id.unwrap_or(Value::Null));
            reply.set("result", init_result.clone());
            let _ = writeln!(output, "{reply}");
            let _ = output.flush();
            continue;
        }
        let reply = match client.request(&method, params) {
            Ok(result) => {
                let mut r = Value::obj();
                r.set("jsonrpc", Value::str("2.0"));
                r.set("id", id.unwrap_or(Value::Null));
                r.set("result", result);
                r
            }
            Err(e) => {
                let mut r = Value::obj();
                r.set("jsonrpc", Value::str("2.0"));
                r.set("id", id.unwrap_or(Value::Null));
                let mut err = Value::obj();
                err.set("code", Value::Int(-32000));
                err.set("message", Value::str(&e.0));
                r.set("error", err);
                r
            }
        };
        let _ = writeln!(output, "{reply}");
        let _ = output.flush();
    }
    0
}

fn forward_notification(client: &mut Client, method: &str, params: &Option<Value>) -> Result<(), String> {
    // The MCP notifications the app cares about carry no body; anything else
    // is still delivered as a call-less POST through `notify`.
    let _ = params;
    client.notify(method).map_err(|e| e.0)
}

/// Waits for the editor's TCP port; the proxy never launches anything
/// itself — a clear error tells the operator which command starts the
/// editor.
fn ensure_app_reachable(client: &mut Client, options: &ProxyOptions, stderr: &mut dyn std::io::Write) -> Result<(), String> {
    use std::net::TcpStream;
    let mut launched = false;
    let start = std::time::Instant::now();
    loop {
        let addr = format!("127.0.0.1:{}", client.port());
        let reachable = std::net::ToSocketAddrs::to_socket_addrs(&addr)
            .ok()
            .and_then(|mut it| it.next())
            .map(|sa| TcpStream::connect_timeout(&sa, std::time::Duration::from_secs(2)).is_ok())
            .unwrap_or(false);
        if reachable {
            return Ok(());
        }
        if !launched {
            let _ = writeln!(
                stderr,
                "screenwords-mcp: the editor is not running on port {}; start it with `screenwords app <project>` or `screenwords serve <project>`",
                client.port()
            );
            launched = true;
        }
        if start.elapsed() > options.launch_timeout {
            return Err(format!(
                "no editor answered on port {} within {} s",
                client.port(),
                options.launch_timeout.as_secs()
            ));
        }
        std::thread::sleep(options.poll_interval);
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max])
    }
}

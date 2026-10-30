//! The Streamable-HTTP MCP client (the wire protocol the editor speaks:
//! Bearer token on every request, a
//! session id captured from `initialize`, `MCP-Protocol-Version` echoed back,
//! JSON or SSE responses, JSON-RPC 2.0 framing, loopback-only URLs.

use crate::http::{self, HttpResponse};
use crate::json::Value;
use std::time::Duration;

pub const PROTOCOL_VERSION: &str = "2025-06-18";
pub const DEFAULT_PORT: u16 = 47823;
const MIN_PORT: u16 = 1024;

#[derive(Debug)]
pub struct McpError(pub String);

impl std::fmt::Display for McpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for McpError {}

/// Connection settings from the environment, exactly like the helper:
/// `SCREENWORDS_MCP_TOKEN` (required) and `SCREENWORDS_MCP_PORT` (default 47823,
/// must be 1024-65535), or an explicit `SCREENWORDS_MCP_URL`.
pub fn config_from_env() -> Result<Config, McpError> {
    let token = std::env::var("SCREENWORDS_MCP_TOKEN").unwrap_or_default();
    if token.trim().is_empty() {
        return Err(McpError(
            "SCREENWORDS_MCP_TOKEN is not set; start the editor (`screenwords app <project>`) and copy the token from its first output line.".into(),
        ));
    }
    let mut config = Config {
        url: std::env::var("SCREENWORDS_MCP_URL").unwrap_or_default(),
        token,
        port: DEFAULT_PORT,
    };
    if let Ok(port_str) = std::env::var("SCREENWORDS_MCP_PORT") {
        let port: u16 = port_str.trim().parse().map_err(|_| {
            McpError("SCREENWORDS_MCP_PORT must be 1024-65535".to_string())
        })?;
        if !(MIN_PORT..=u16::MAX).contains(&port) {
            return Err(McpError("SCREENWORDS_MCP_PORT must be 1024-65535".into()));
        }
        config.port = port;
    }
    if config.url.trim().is_empty() {
        config.url = format!("http://127.0.0.1:{}/mcp", config.port);
    }
    Ok(config)
}

#[derive(Debug)]
pub struct Config {
    pub url: String,
    pub token: String,
    pub port: u16,
}

pub struct Client {
    host: String,
    port: u16,
    path: String,
    token: String,
    pub session_id: Option<String>,
    pub protocol_version: Option<String>,
    pub server_info: Value,
    pub instructions: String,
    next_id: i64,
    timeout: Duration,
}

impl Client {
    pub fn new(url: &str, token: &str) -> Result<Client, McpError> {
        let rest = url
            .strip_prefix("http://")
            .ok_or_else(|| McpError(format!("only http:// URLs are supported: {url}")))?;
        let (authority, path) = match rest.find('/') {
            Some(p) => (&rest[..p], &rest[p..]),
            None => (rest, ""),
        };
        let (host, port) = match authority.rsplit_once(':') {
            Some((h, p)) => (h.to_string(), p.parse::<u16>().unwrap_or(DEFAULT_PORT)),
            None => (authority.to_string(), DEFAULT_PORT),
        };
        if !matches!(host.as_str(), "127.0.0.1" | "localhost" | "::1" | "[::1]") {
            return Err(McpError(format!(
                "refusing non-loopback MCP URL '{url}' (screenwords only listens on 127.0.0.1)"
            )));
        }
        let host = host.trim_start_matches('[').trim_end_matches(']').to_string();
        Ok(Client {
            host,
            port,
            path: if path.is_empty() { "/mcp".to_string() } else { path.to_string() },
            token: token.to_string(),
            session_id: None,
            protocol_version: None,
            server_info: Value::obj(),
            instructions: String::new(),
            next_id: 1,
            timeout: Duration::from_secs(600),
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    fn post(&self, body: &Value) -> Result<HttpResponse, McpError> {
        let data = body.to_string().into_bytes();
        let mut headers: Vec<(String, String)> = vec![
            ("Accept".into(), "application/json, text/event-stream".into()),
            ("Content-Type".into(), "application/json".into()),
            ("Authorization".into(), format!("Bearer {}", self.token)),
        ];
        if let Some(sid) = &self.session_id {
            headers.push(("Mcp-Session-Id".into(), sid.clone()));
        }
        if let Some(pv) = &self.protocol_version {
            headers.push(("MCP-Protocol-Version".into(), pv.clone()));
        }
        let response = http::post(
            &self.host,
            self.port,
            &self.path,
            &headers,
            &data,
            Duration::from_secs(5),
            self.timeout,
        )
        .map_err(|e| McpError(e.0))?;
        if response.status == 401 || response.status == 403 {
            return Err(McpError(format!(
                "HTTP {}: check the token / URL",
                response.status
            )));
        }
        Ok(response)
    }

    /// Collects JSON-RPC messages from a JSON body or an SSE stream, stopping
    /// after the message that answers `want_id`.
    fn read_messages(response: &HttpResponse, want_id: Option<i64>) -> Result<Vec<Value>, McpError> {
        let content_type = response.header("content-type").unwrap_or("");
        if content_type.starts_with("text/event-stream") {
            let text = String::from_utf8_lossy(&response.body);
            return Ok(parse_sse(&text, want_id));
        }
        if response.body.is_empty() {
            return Ok(Vec::new());
        }
        let text = String::from_utf8_lossy(&response.body);
        match Value::parse(&text) {
            Ok(v) => Ok(vec![v]),
            Err(_) => Ok(Vec::new()),
        }
    }

    pub fn request(&mut self, method: &str, params: Option<Value>) -> Result<Value, McpError> {
        let id = self.next_id;
        self.next_id += 1;
        let mut body = Value::obj();
        body.set("jsonrpc", Value::str("2.0"));
        body.set("id", Value::Int(id));
        body.set("method", Value::str(method));
        if let Some(p) = params {
            body.set("params", p);
        }
        let response = self.post(&body)?;
        if response.status != 200 {
            return Err(McpError(format!("{method}: HTTP {}", response.status)));
        }
        for m in Self::read_messages(&response, Some(id))? {
            if m.get("id").and_then(Value::as_i64) == Some(id) {
                if let Some(err) = m.get("error") {
                    return Err(McpError(format!("{method}: {}", err.to_string())));
                }
                if let Some(sid) = response.header("mcp-session-id") {
                    self.session_id = Some(sid.to_string());
                }
                return Ok(m.get("result").cloned().unwrap_or(Value::Null));
            }
        }
        Err(McpError(format!("{method}: no response")))
    }

    /// A notification (no id, no response expected).
    pub fn notify(&mut self, method: &str) -> Result<(), McpError> {
        let mut body = Value::obj();
        body.set("jsonrpc", Value::str("2.0"));
        body.set("method", Value::str(method));
        let response = self.post(&body)?;
        if response.status != 202 && response.status != 200 {
            return Err(McpError(format!("{method}: HTTP {}", response.status)));
        }
        Ok(())
    }

    pub fn initialize(&mut self, client_name: &str) -> Result<Value, McpError> {
        let mut params = Value::obj();
        params.set("protocolVersion", Value::str(PROTOCOL_VERSION));
        params.set("capabilities", Value::obj());
        let mut info = Value::obj();
        info.set("name", Value::str(client_name));
        info.set("version", Value::str("1"));
        params.set("clientInfo", info);
        let result = self.request("initialize", Some(params))?;
        if let Some(sid) = self.session_id.as_ref() {
            let _ = sid;
        }
        self.protocol_version =
            result.get("protocolVersion").and_then(Value::as_str).map(str::to_string);
        self.server_info = result.get("serverInfo").cloned().unwrap_or_else(Value::obj);
        self.instructions = result
            .get("instructions")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        self.notify("notifications/initialized")?;
        Ok(result)
    }

    pub fn list_tools(&mut self) -> Result<Vec<Value>, McpError> {
        let mut tools = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let mut params = Value::obj();
            if let Some(c) = cursor.clone() {
                params.set("cursor", Value::str(&c));
            }
            let result = self.request("tools/list", Some(params))?;
            if let Some(list) = result.get("tools").and_then(Value::as_array) {
                tools.extend(list.iter().cloned());
            }
            cursor = result.get("nextCursor").and_then(Value::as_str).map(str::to_string);
            if cursor.is_none() {
                return Ok(tools);
            }
        }
    }

    /// `tools/call`: returns (is_error, parsed first text content).
    pub fn call(&mut self, name: &str, arguments: Option<Value>) -> Result<(bool, Value), McpError> {
        let mut params = Value::obj();
        params.set("name", Value::str(name));
        params.set("arguments", arguments.unwrap_or_else(Value::obj));
        let result = self.request("tools/call", Some(params))?;
        let is_error = result.get("isError").and_then(Value::as_bool).unwrap_or(false);
        let mut parsed = Value::Null;
        if let Some(content) = result.get("content").and_then(Value::as_array) {
            for item in content {
                if item.get("type").and_then(Value::as_str) == Some("text") {
                    let text = item.get("text").and_then(Value::as_str).unwrap_or("");
                    parsed = Value::parse(text).unwrap_or_else(|_| Value::str(text));
                    break;
                }
            }
        }
        Ok((is_error, parsed))
    }
}

/// Parses `data:`-line SSE events; stops after the message answering `want_id`
/// when given (the Python client does the same to return early).
pub fn parse_sse(text: &str, want_id: Option<i64>) -> Vec<Value> {
    let mut events = Vec::new();
    let mut lines: Vec<String> = Vec::new();
    for line in text.lines() {
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            if !lines.is_empty() {
                if let Ok(msg) = Value::parse(&lines.join("\n")) {
                    let answers = want_id
                        .zip(msg.get("id").and_then(Value::as_i64))
                        .map(|(want, got)| want == got)
                        .unwrap_or(false)
                        && (msg.get("result").is_some() || msg.get("error").is_some());
                    events.push(msg);
                    if answers {
                        return events;
                    }
                }
                lines.clear();
            }
            continue;
        }
        if let Some(data) = line.strip_prefix("data:") {
            lines.push(data.trim_start_matches(' ').to_string());
        }
    }
    // A final event without a trailing blank line.
    if !lines.is_empty() {
        if let Ok(msg) = Value::parse(&lines.join("\n")) {
            events.push(msg);
        }
    }
    events
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sse_parsing() {
        let stream = concat!(
            "event: message\n",
            "data: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"a\":1}}\n",
            "\n",
            "data: {\"jsonrpc\":\"2.0\",\"method\":\"notify\"}\n",
            "\n"
        );
        let msgs = parse_sse(stream, Some(1));
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].get("id"), Some(&Value::Int(1)));
        let all = parse_sse(stream, None);
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn multi_line_data_events() {
        let stream = "data: {\"a\":\ndata: 1}\n\n";
        let msgs = parse_sse(stream, None);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].get("a"), Some(&Value::Int(1)));
    }

    #[test]
    fn loopback_guard() {
        assert!(Client::new("http://127.0.0.1:47823/mcp", "t").is_ok());
        assert!(Client::new("http://localhost:47823/mcp", "t").is_ok());
        assert!(Client::new("http://[::1]:47823/mcp", "t").is_ok());
        assert!(Client::new("http://example.com:47823/mcp", "t").is_err());
        assert!(Client::new("https://127.0.0.1/mcp", "t").is_err());
    }

    #[test]
    fn url_defaults_path_and_port() {
        let c = Client::new("http://127.0.0.1", "t").unwrap();
        assert_eq!(c.path, "/mcp");
        assert_eq!(c.port(), 47823);
    }

    #[test]
    fn env_config_requires_token() {
        // Without touching the real environment: empty token errors.
        let err = config_from_env();
        let has_token = std::env::var("SCREENWORDS_MCP_TOKEN").map(|t| !t.trim().is_empty()).unwrap_or(false);
        if !has_token {
            assert!(err.is_err());
            assert!(err.unwrap_err().0.contains("SCREENWORDS_MCP_TOKEN is not set"));
        }
    }
}

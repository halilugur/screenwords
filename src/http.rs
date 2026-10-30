//! Minimal HTTP/1.1 client over `std::net::TcpStream` for the loopback MCP
//! endpoint: POST with headers, `Content-Length` and chunked response decoding.
//! TLS is deliberately absent — Screenwords only ever listens on 127.0.0.1.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

#[derive(Debug)]
pub struct HttpError(pub String);

impl std::fmt::Display for HttpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for HttpError {}

pub struct HttpResponse {
    pub status: u16,
    /// Header names lower-cased.
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl HttpResponse {
    pub fn header(&self, name: &str) -> Option<&str> {
        let name = name.to_lowercase();
        self.headers.iter().find(|(k, _)| *k == name).map(|(_, v)| v.as_str())
    }
}

/// One POST. `headers` are sent verbatim (names included).
pub fn post(
    host: &str,
    port: u16,
    path: &str,
    headers: &[(String, String)],
    body: &[u8],
    connect_timeout: Duration,
    read_timeout: Duration,
) -> Result<HttpResponse, HttpError> {
    let addr = format!("{host}:{port}");
    let mut stream = connect(&addr, connect_timeout).map_err(|e| HttpError(format!("cannot reach {addr}: {e}")))?;
    stream.set_read_timeout(Some(read_timeout)).ok();
    stream.set_write_timeout(Some(read_timeout)).ok();

    let mut request = format!("POST {path} HTTP/1.1\r\nHost: {host}:{port}\r\n");
    for (k, v) in headers {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str(&format!("Content-Length: {}\r\n", body.len()));
    request.push_str("Connection: close\r\n\r\n");
    stream
        .write_all(request.as_bytes())
        .and_then(|_| stream.write_all(body))
        .and_then(|_| stream.flush())
        .map_err(|e| HttpError(format!("send failed: {e}")))?;

    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).map_err(|e| HttpError(format!("read failed: {e}")))?;
    parse_response(&raw)
}

fn connect(addr: &str, timeout: Duration) -> std::io::Result<TcpStream> {
    // A happy-path connect with a deadline; falls back to a plain connect for
    // hosts that resolve to several addresses.
    use std::net::ToSocketAddrs;
    let mut last_err: Option<std::io::Error> = None;
    for sock_addr in addr.to_socket_addrs()? {
        match TcpStream::connect_timeout(&sock_addr, timeout) {
            Ok(s) => return Ok(s),
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or_else(|| std::io::Error::other("no addresses resolved")))
}

pub fn parse_response(raw: &[u8]) -> Result<HttpResponse, HttpError> {
    let header_end = raw
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or_else(|| HttpError("malformed HTTP response".into()))?;
    let head = String::from_utf8_lossy(&raw[..header_end]);
    let mut lines = head.lines();
    let status_line = lines.next().ok_or_else(|| HttpError("empty HTTP response".into()))?;
    let status: u16 = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| HttpError(format!("bad status line: {status_line}")))?;
    let mut headers = Vec::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            headers.push((k.trim().to_lowercase(), v.trim().to_string()));
        }
    }
    let mut body = raw[header_end + 4..].to_vec();
    let chunked = headers
        .iter()
        .any(|(k, v)| k == "transfer-encoding" && v.to_lowercase().contains("chunked"));
    if chunked {
        body = decode_chunked(&body)?;
    }
    Ok(HttpResponse { status, headers, body })
}

fn decode_chunked(data: &[u8]) -> Result<Vec<u8>, HttpError> {
    let mut out = Vec::new();
    let mut pos = 0;
    loop {
        let line_end = data[pos..]
            .windows(2)
            .position(|w| w == b"\r\n")
            .ok_or_else(|| HttpError("truncated chunked body".into()))?;
        let size_str = String::from_utf8_lossy(&data[pos..pos + line_end]);
        let size_hex = size_str.split(';').next().unwrap_or("").trim();
        let size = usize::from_str_radix(size_hex, 16)
            .map_err(|_| HttpError(format!("bad chunk size '{size_hex}'")))?;
        pos += line_end + 2;
        if size == 0 {
            return Ok(out);
        }
        if pos + size > data.len() {
            return Err(HttpError("truncated chunk".into()));
        }
        out.extend_from_slice(&data[pos..pos + size]);
        pos += size + 2; // skip the trailing CRLF
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_response() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 5\r\n\r\nhello";
        let r = parse_response(raw).unwrap();
        assert_eq!(r.status, 200);
        assert_eq!(r.header("content-type"), Some("application/json"));
        assert_eq!(r.body, b"hello");
    }

    #[test]
    fn decodes_chunked() {
        let raw = b"HTTP/1.1 200\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n";
        let r = parse_response(raw).unwrap();
        assert_eq!(r.body, b"Wikipedia");
    }

    #[test]
    fn bad_input_errors() {
        assert!(parse_response(b"garbage").is_err());
        assert!(decode_chunked(b"zz\r\n").is_err());
    }
}

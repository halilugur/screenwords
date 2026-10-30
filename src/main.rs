//! The `screenwords` CLI: offline linting, project inspection and anchor math,
//! plus the MCP stdio proxy / direct tool call against the running app.

use screenwords::edits::{Document, EditOp};
use screenwords::swanim;
use screenwords::json::Value;
use screenwords::mcp::{config_from_env, Client};
use screenwords::project::Project;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

const USAGE: &str = "\
screenwords — the engine contracts of the Screenwords macOS video editor, in Rust

Usage:
  screenwords validate <package>... [--json] [--strict] [--quiet]
      Lint .swanim animation packages (folders, .swanim.zip, or a folder of
      packages). Exit 0 = ok, 1 = errors, 2 = unreadable input.
  screenwords project <path> [info|tracks|words|components|audio]
      Read a .screenwords bundle (or a bare project.json). Default: info.
  screenwords anchor <project> <wordId> [--edge start|end] [--offset-ms N]
      Resolve a word anchor to absolute seconds.
  screenwords cut <project> <start> <end> [--label L] [--if-revision N]
                 [--out DIR]
      Apply a ripple cut_range to the document model and write the result
      (project.json + revision.json) to DIR; prints the diff summary. Without
      --out the plan is only printed (dry run).
  screenwords serve <project|--blank> [--port N] [--format 9:16|16:9]
      Host the MCP server (the app's role) on 127.0.0.1; prints the
      ready.json first line with port / project / token / url.
  screenwords app <project> [--port N]
      One process, one document: the web UI AND the MCP server on the same
      port, every committed change autosaved to <project>/ (project.json +
      revision.json). This is the Rust alternative's editor.
  screenwords ui <project> [--port N]
      The web editor UI on 127.0.0.1: overview, timeline, transcript, find,
      chapters, subtitles, dry-run cut.
  screenwords render <project> [--out FILE.html]
      Render the project to a self-contained animated HTML file (kinetic
      words on word timings, title cards, counters, punch-ins, chapters).
  screenwords transcript <project> [--start S] [--end S] [--segment ID]
      get_transcript over the document.
  screenwords find <project> <query> | --kind number|filler|pause
      find_in_transcript: phrase search or the kind sweeps.
  screenwords chapters <project>
      list_chapters with the YouTube description and issues.
  screenwords srt <project> [--format srt|vtt] [--max-chars N] [--out FILE]
      export_subtitles of the edited transcript.
  screenwords mcp
      The stdio MCP proxy (the screenwords-mcp helper's role). Env:
      SCREENWORDS_MCP_TOKEN (required), SCREENWORDS_MCP_PORT (default 47823),
      SCREENWORDS_MCP_URL.
  screenwords call <tool> [json-arguments]
      Call one MCP tool on the running app and print the JSON result.
  screenwords --help | --version
";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(args) {
        Ok(code) => code,
        Err(message) => {
            eprintln!("screenwords: {message}");
            eprintln!("Run `screenwords --help` for usage.");
            ExitCode::from(2)
        }
    }
}

fn run(args: Vec<String>) -> Result<ExitCode, String> {
    let Some(command) = args.first() else {
        print!("{USAGE}");
        return Ok(ExitCode::from(2));
    };
    match command.as_str() {
        "--help" | "-h" | "help" => {
            print!("{USAGE}");
            Ok(ExitCode::SUCCESS)
        }
        "--version" | "-V" => {
            println!("screenwords {}", screenwords::VERSION);
            Ok(ExitCode::SUCCESS)
        }
        "validate" => cmd_validate(&args[1..]),
        "project" => cmd_project(&args[1..]),
        "anchor" => cmd_anchor(&args[1..]),
        "cut" => cmd_cut(&args[1..]),
        "serve" => cmd_serve(&args[1..]),
        "ui" => cmd_ui(&args[1..]),
        "app" => cmd_app(&args[1..]),
        "render" => cmd_render(&args[1..]),
        "transcript" => cmd_transcript(&args[1..]),
        "find" => cmd_find(&args[1..]),
        "chapters" => cmd_chapters(&args[1..]),
        "srt" => cmd_srt(&args[1..]),
        "tts" => cmd_tts(&args[1..]),
        "mcp" => cmd_mcp(),
        "call" => cmd_call(&args[1..]),
        other => Err(format!("unknown command '{other}'")),
    }
}

// --- validate ---------------------------------------------------------------------------

fn cmd_validate(args: &[String]) -> Result<ExitCode, String> {
    let mut json = false;
    let mut strict = false;
    let mut quiet = false;
    let mut packages: Vec<PathBuf> = Vec::new();
    for a in args {
        match a.as_str() {
            "--json" => json = true,
            "--strict" => strict = true,
            "--quiet" => quiet = true,
            _ if a.starts_with('-') => return Err(format!("unknown flag {a}")),
            _ => packages.push(PathBuf::from(a)),
        }
    }
    if packages.is_empty() {
        return Err("validate needs at least one package".into());
    }
    let expanded = swanim::expand(&packages);
    let reports: Vec<swanim::Report> = expanded.iter().map(|p| swanim::check_package(p)).collect();
    if json {
        let out: Vec<Value> = reports
            .iter()
            .map(|r| {
                let mut o = Value::obj();
                o.set("package", Value::str(&r.target));
                o.set("ok", Value::Bool(!r.has_errors()));
                o.set(
                    "items",
                    Value::Array(
                        r.items
                            .iter()
                            .map(|i| {
                                let mut it = Value::obj();
                                it.set("level", Value::str(i.level));
                                it.set("where", Value::str(&i.where_));
                                it.set("message", Value::str(&i.message));
                                it
                            })
                            .collect(),
                    ),
                );
                o
            })
            .collect();
        println!("{}", Value::Array(out).to_string_pretty(false));
    } else {
        for r in &reports {
            let status = if r.has_errors() {
                "FAIL"
            } else if r.has_warnings() {
                "WARN"
            } else {
                "OK"
            };
            let errors = r.items.iter().filter(|i| i.level == "error").count();
            let warnings = r.items.iter().filter(|i| i.level == "warning").count();
            println!("{status}  {}  ({errors} errors, {warnings} warnings)", r.target);
            for item in &r.items {
                if quiet && item.level == "info" {
                    continue;
                }
                println!("  {:<7} {}: {}", item.level, item.where_, item.message);
            }
        }
    }
    let failed =
        reports.iter().any(|r| r.has_errors()) || (strict && reports.iter().any(|r| r.has_warnings()));
    Ok(if failed { ExitCode::from(1) } else { ExitCode::SUCCESS })
}

// --- project ----------------------------------------------------------------------------

fn load_project(path: &Path) -> Result<Project, String> {
    let project_json = if path.is_dir() { path.join("project.json") } else { path.to_path_buf() };
    let text = std::fs::read_to_string(&project_json)
        .map_err(|e| format!("cannot read {}: {e}", project_json.display()))?;
    let revision = project_json
        .parent()
        .map(|d| {
            std::fs::read_to_string(d.join("revision.json"))
                .ok()
                .and_then(|s| Value::parse(&s).ok())
                .and_then(|v| v.get("revision").and_then(Value::as_i64))
                .unwrap_or(1) as u64
        })
        .unwrap_or(1);
    Project::parse(&text)
        .map(|p| p.with_revision(revision))
        .map_err(|e| e.to_string())
}

fn cmd_project(args: &[String]) -> Result<ExitCode, String> {
    let Some(path) = args.first() else {
        return Err("project needs a .screenwords bundle or project.json".into());
    };
    let what = args.get(1).map(String::as_str).unwrap_or("info");
    let p = load_project(Path::new(path))?;
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    match what {
        "info" => {
            let s = p.settings();
            let words = p.words();
            let spoken: f64 =
                words.last().map(|w| w.end().seconds()).unwrap_or(0.0) - words.first().map(|w| w.start().seconds()).unwrap_or(0.0);
            writeln!(out, "name       {}", p.name()).ok();
            writeln!(out, "id         {}", p.id()).ok();
            writeln!(out, "revision   {}", p.revision).ok();
            writeln!(out, "size       {}x{}", s.width(), s.height()).ok();
            writeln!(out, "fps        {}", s.fps()).ok();
            writeln!(out, "assets     {}", p.assets().len()).ok();
            writeln!(out, "tracks     {}", p.tracks().len()).ok();
            writeln!(out, "components {}", p.components().len()).ok();
            writeln!(out, "words      {} ({:.1} s spoken)", words.len(), spoken.max(0.0)).ok();
            writeln!(out, "lufs       {}", s.lufs()).ok();
        }
        "tracks" => {
            for t in p.tracks() {
                let role = t.role().map(|r| format!("  role={r}")).unwrap_or_default();
                writeln!(
                    out,
                    "{:<20} {:<8} {:<14} {} clips, {} components, {} audio{role}",
                    t.id(),
                    t.kind(),
                    t.name(),
                    t.clips().len(),
                    t.components().len(),
                    t.audio_events().len()
                )
                .ok();
            }
        }
        "words" => {
            for w in p.words() {
                writeln!(
                    out, "{:<6} {:>8.3} → {:<8.3}  {}",
                    w.id(), w.start().seconds(), w.end().seconds(), w.text()
                ).ok();
            }
        }
        "components" => {
            for c in p.components() {
                let id = c.get("id").and_then(Value::as_str).unwrap_or("?");
                let cid = c.get("componentId").and_then(Value::as_str).unwrap_or("?");
                let enabled = c.get("isEnabled").and_then(Value::as_bool).unwrap_or(true);
                let window = p
                    .component_window(c)
                    .map(|(s, e)| {
                        format!("{:.3}s–{:.3}s", s.seconds(), e.map(|x| x.seconds()).unwrap_or(f64::NAN))
                    })
                    .unwrap_or_else(|| "unresolved".into());
                writeln!(out, "{:<14} {:<20} {:<24} enabled={enabled}", id, cid, window).ok();
            }
        }
        "audio" => {
            for t in p.tracks() {
                for ev in t.audio_events() {
                    let id = ev.get("id").and_then(Value::as_str).unwrap_or("?");
                    let asset = ev.get("assetId").and_then(Value::as_str).unwrap_or("?");
                    let role = ev.get("role").and_then(Value::as_str).unwrap_or("-");
                    let start = p
                        .resolve_time(ev.get("start").unwrap_or(&Value::Null))
                        .map(|t| format!("{:.3}s", t.seconds()))
                        .unwrap_or_else(|| "?".into());
                    writeln!(out, "{:<14} {:<10} {:<12} start={start} asset={asset}", id, role, t.name()).ok();
                }
            }
        }
        other => return Err(format!("unknown project view '{other}'")),
    }
    Ok(ExitCode::SUCCESS)
}

// --- anchor -----------------------------------------------------------------------------

fn cmd_anchor(args: &[String]) -> Result<ExitCode, String> {
    let mut edge = "start".to_string();
    let mut offset_ms: i64 = 0;
    let mut positional: Vec<String> = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--edge" => {
                i += 1;
                edge = args.get(i).cloned().ok_or("--edge needs start|end")?;
                if edge != "start" && edge != "end" {
                    return Err("--edge must be start or end".into());
                }
            }
            "--offset-ms" => {
                i += 1;
                offset_ms = args
                    .get(i)
                    .and_then(|v| v.parse().ok())
                    .ok_or("--offset-ms needs an integer (may be negative)")?;
            }
            a => positional.push(a.to_string()),
        }
        i += 1;
    }
    let (project_path, word_id) = (
        positional.first().ok_or("anchor needs a project and a wordId")?,
        positional.get(1).ok_or("anchor needs a wordId")?,
    );
    let p = load_project(Path::new(project_path))?;
    let word = p.word(word_id).ok_or_else(|| format!("no word '{word_id}' in any transcript"))?;
    let base = if edge == "end" { word.end() } else { word.start() };
    let resolved = base.add(&screenwords::rational::RationalTime::new(offset_ms, 1000));
    println!(
        "{word_id} {edge} + {offset_ms} ms = {:.3} s ({}) — \"{}\"",
        resolved.seconds(),
        screenwords::rational::format_clock(resolved.seconds().max(0.0)),
        word.text()
    );
    Ok(ExitCode::SUCCESS)
}

// --- cut --------------------------------------------------------------------------------

fn cmd_cut(args: &[String]) -> Result<ExitCode, String> {
    let mut label = None;
    let mut if_revision = None;
    let mut out_dir: Option<PathBuf> = None;
    let mut positional: Vec<String> = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--label" => {
                i += 1;
                label = Some(args.get(i).cloned().ok_or("--label needs a value")?);
            }
            "--if-revision" => {
                i += 1;
                if_revision = Some(
                    args.get(i)
                        .and_then(|v| v.parse().ok())
                        .ok_or("--if-revision needs a number")?,
                );
            }
            "--out" => {
                i += 1;
                out_dir = Some(PathBuf::from(args.get(i).cloned().ok_or("--out needs a directory")?));
            }
            a => positional.push(a.to_string()),
        }
        i += 1;
    }
    if positional.len() < 3 {
        return Err("cut needs <project> <start> <end> (seconds)".into());
    }
    let project_path = PathBuf::from(&positional[0]);
    let start: f64 = positional[1].parse().map_err(|_| "start must be seconds")?;
    let end: f64 = positional[2].parse().map_err(|_| "end must be seconds")?;
    let p = load_project(&project_path)?;
    let mut doc = Document::new(p);
    let before_words = doc.project().words().len();

    let mut arguments = Value::obj();
    arguments.set("start", Value::from_f64(start));
    arguments.set("end", Value::from_f64(end));
    let result = doc
        .apply_edits(label.as_deref(), if_revision, &[EditOp::new("cut_range", arguments)])
        .map_err(|e| format!("{}: {}", e.code(), e.message()))?;

    let after = doc.project();
    println!(
        "✓ cut {:.3}–{:.3} s — {} → {} words, revision {} → {}",
        start,
        end,
        before_words,
        after.words().len(),
        if_revision.unwrap_or(result.revision - 1),
        result.revision
    );
    if let Some(dir) = out_dir {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(dir.join("project.json"), after.to_json_string())
            .map_err(|e| format!("write project.json: {e}"))?;
        let mut rev = Value::obj();
        rev.set("revision", Value::Int(result.revision as i64));
        std::fs::write(dir.join("revision.json"), format!("{}\n", rev.to_string()))
            .map_err(|e| format!("write revision.json: {e}"))?;
        println!("📁 written to {}", dir.display());
    } else {
        println!("(dry run: pass --out DIR to write project.json + revision.json)");
    }
    Ok(ExitCode::SUCCESS)
}

// --- serve & ui --------------------------------------------------------------------

fn parse_port(args: &[String], default: u16) -> Result<u16, String> {
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--port" {
            let port: u16 = args
                .get(i + 1)
                .and_then(|v| v.parse().ok())
                .ok_or_else(|| "--port needs 1024-65535".to_string())?;
            if port < 1024 {
                return Err("--port needs 1024-65535".into());
            }
            return Ok(port);
        }
        i += 1;
    }
    Ok(default)
}

/// The folder a bundle-relative asset path resolves against (None for --blank).
fn bundle_base(target: &str) -> Option<PathBuf> {
    if target == "--blank" || target == "blank" {
        return None;
    }
    let path = Path::new(target);
    Some(if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent().unwrap_or(Path::new(".")).to_path_buf()
    })
}

fn doc_from_arg(arg: &str) -> Result<Document, String> {
    if arg == "--blank" || arg == "blank" {
        return Ok(Document::new(screenwords::server::blank_project("Blank", true)));
    }
    let p = load_project(Path::new(arg))?;
    Ok(Document::new(p))
}

fn cmd_serve(args: &[String]) -> Result<ExitCode, String> {
    let Some(target) = args.first() else {
        return Err("serve needs a project path or --blank".into());
    };
    let mut doc = doc_from_arg(target)?;
    if target == "--blank" || target == "blank" {
        // respect --format
        let vertical = !args.iter().any(|a| a == "--format=16:9");
        doc = Document::new(screenwords::server::blank_project("Blank", vertical));
    }
    let port = parse_port(args, 47999)?;
    let listener = std::net::TcpListener::bind(("127.0.0.1", port))
        .map_err(|e| format!("cannot bind 127.0.0.1:{port}: {e}"))?;
    let (server, ready) = screenwords::server::McpServer::new(doc);
    println!("screenwords {} — MCP server (Ctrl-C to stop)", screenwords::VERSION);
    screenwords::server::run_server(server, listener, ready, None);
    Ok(ExitCode::SUCCESS)
}

fn cmd_ui(args: &[String]) -> Result<ExitCode, String> {
    let Some(target) = args.first() else {
        return Err("ui needs a project path (or --blank)".into());
    };
    let doc = doc_from_arg(target)?;
    let port = parse_port(args, 7846)?;
    let listener = std::net::TcpListener::bind(("127.0.0.1", port))
        .map_err(|e| format!("cannot bind 127.0.0.1:{port}: {e}"))?;
    let addr = listener.local_addr().map_err(|e| e.to_string())?;
    let ui = std::sync::Arc::new(screenwords::ui::Ui {
        document: std::sync::Arc::new(std::sync::Mutex::new(doc)),
        project_path: target.to_string(),
    });
    println!("screenwords {} — web editor (Ctrl-C to stop)", screenwords::VERSION);
    println!("UI: http://127.0.0.1:{}/", addr.port());
    screenwords::httpd::serve(listener, move |request| screenwords::ui::handle(&ui, request));
    Ok(ExitCode::SUCCESS)
}

fn cmd_app(args: &[String]) -> Result<ExitCode, String> {
    let Some(target) = args.first() else {
        return Err("app needs a project path (or --blank)".into());
    };
    // `--create`: a brand-new bundle at the path (like screenwords-server
    // --project X --create --blank --format 9:16).
    let target = target.to_string();
    if args.iter().any(|a| a == "--create") && target != "--blank" && target != "blank" {
        let path = Path::new(&target);
        if !path.join("project.json").exists() {
            std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
            let vertical = !args.iter().any(|a| a == "--format=16:9");
            let doc = screenwords::server::blank_project(
                path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "Blank".into()).as_str(),
                vertical,
            );
            std::fs::write(path.join("project.json"), doc.to_json_string())
                .map_err(|e| format!("write project.json: {e}"))?;
            std::fs::write(path.join("revision.json"), "{\"revision\":1}\n")
                .map_err(|e| format!("write revision.json: {e}"))?;
            println!("created {} (blank, {})", path.display(), if vertical { "9:16" } else { "16:9" });
        }
    }
    let doc = doc_from_arg(&target)?;
    let bundle_path = if target == "--blank" || target == "blank" {
        None
    } else {
        let path = Path::new(&target);
        Some(if path.is_dir() { path.to_path_buf() } else { path.parent().unwrap_or(Path::new(".")).to_path_buf() })
    };
    let port = parse_port(args, 7846)?;
    let listener = std::net::TcpListener::bind(("127.0.0.1", port))
        .map_err(|e| format!("cannot bind 127.0.0.1:{port}: {e}"))?;
    let addr = listener.local_addr().map_err(|e| e.to_string())?;
    let shared = std::sync::Arc::new(std::sync::Mutex::new(doc));
    let (server, mut ready) = screenwords::server::McpServer::new_shared(shared.clone(), bundle_path);
    ready = ready.replace("__PORT__", &addr.port().to_string());
    let ui = std::sync::Arc::new(screenwords::ui::Ui {
        document: shared,
        project_path: target.to_string(),
    });
    println!("screenwords {} — editor (UI + MCP on one document, Ctrl-C to stop)", screenwords::VERSION);
    println!("UI:  http://127.0.0.1:{}/", addr.port());
    println!("MCP: {ready}");
    screenwords::httpd::serve(listener, move |request| {
        if request.path.starts_with("/mcp") {
            return screenwords::server::handle_mcp(&server, request);
        }
        screenwords::ui::handle(&ui, request)
    });
    Ok(ExitCode::SUCCESS)
}

fn cmd_render(args: &[String]) -> Result<ExitCode, String> {
    let Some(target) = args.first() else {
        return Err("render needs a project".into());
    };
    let mut out: Option<String> = None;
    let mut i = 1;
    while i < args.len() {
        if args[i] == "--out" {
            i += 1;
            out = Some(args.get(i).cloned().ok_or("--out needs a path")?);
        }
        i += 1;
    }
    let doc = doc_from_arg(target)?;
    let base = bundle_base(target);
    let html = screenwords::render::render_html_in(doc.project(), base.as_deref());
    match out {
        Some(path) => {
            std::fs::write(&path, &html).map_err(|e| format!("write {path}: {e}"))?;
            let p = doc.project();
            println!(
                "📁 rendered {} — {:.1}s story → {} ({} KB, self-contained)",
                p.name(),
                screenwords::render::render_data_in(p, base.as_deref())
                    .get("duration")
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0),
                path,
                html.len() / 1024
            );
        }
        None => print!("{html}"),
    }
    Ok(ExitCode::SUCCESS)
}

// --- reads -----------------------------------------------------------------------

fn cmd_transcript(args: &[String]) -> Result<ExitCode, String> {
    let Some(path) = args.first() else {
        return Err("transcript needs a project".into());
    };
    let p = load_project(Path::new(path))?;
    let mut a = Value::obj();
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--start" => {
                i += 1;
                a.set("start", Value::from_f64(args.get(i).and_then(|v| v.parse().ok()).ok_or("--start needs seconds")?));
            }
            "--end" => {
                i += 1;
                a.set("end", Value::from_f64(args.get(i).and_then(|v| v.parse().ok()).ok_or("--end needs seconds")?));
            }
            "--segment" => {
                i += 1;
                a.set("segmentId", Value::str(args.get(i).ok_or("--segment needs an id")?));
            }
            other => return Err(format!("unknown flag {other}")),
        }
        i += 1;
    }
    let r = screenwords::reads::get_transcript(&p, &a).map_err(|e| e.to_string())?;
    print!("{}", r.get("transcript").unwrap().as_str().unwrap_or(""));
    Ok(ExitCode::SUCCESS)
}

fn cmd_find(args: &[String]) -> Result<ExitCode, String> {
    let Some(path) = args.first() else {
        return Err("find needs a project".into());
    };
    let p = load_project(Path::new(path))?;
    let mut a = Value::obj();
    if let Some(kind) = args.get(1).and_then(|v| v.strip_prefix("--kind=")) {
        a.set("kind", Value::str(kind));
    } else if let Some(query) = args.get(1) {
        a.set("query", Value::str(query));
    } else {
        return Err("find needs a query or --kind=number|filler|pause".into());
    }
    let r = screenwords::reads::find_in_transcript(&p, &a).map_err(|e| e.to_string())?;
    println!("{}", r.to_string_pretty(false));
    Ok(ExitCode::SUCCESS)
}

fn cmd_chapters(args: &[String]) -> Result<ExitCode, String> {
    let Some(path) = args.first() else {
        return Err("chapters needs a project".into());
    };
    let p = load_project(Path::new(path))?;
    let r = screenwords::reads::list_chapters(&p);
    println!("{}", r.to_string_pretty(false));
    Ok(ExitCode::SUCCESS)
}

fn cmd_srt(args: &[String]) -> Result<ExitCode, String> {
    let Some(path) = args.first() else {
        return Err("srt needs a project".into());
    };
    let p = load_project(Path::new(path))?;
    let mut a = Value::obj();
    let mut out_file: Option<String> = None;
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--format" => {
                i += 1;
                a.set("format", Value::str(args.get(i).ok_or("--format needs srt|vtt")?));
            }
            "--max-chars" => {
                i += 1;
                a.set("maxCharsPerLine", Value::Int(args.get(i).and_then(|v| v.parse().ok()).ok_or("--max-chars needs a number")?));
            }
            "--out" => {
                i += 1;
                out_file = Some(args.get(i).cloned().ok_or("--out needs a path")?);
            }
            other => return Err(format!("unknown flag {other}")),
        }
        i += 1;
    }
    let r = screenwords::reads::export_subtitles(&p, &a).map_err(|e| e.to_string())?;
    let text = r.get("text").unwrap().as_str().unwrap_or("");
    match out_file {
        Some(path) => {
            std::fs::write(&path, text).map_err(|e| format!("write {path}: {e}"))?;
            println!("📁 {} cues → {}", r.get("cueCount").unwrap().as_i64().unwrap_or(0), path);
        }
        None => print!("{text}"),
    }
    Ok(ExitCode::SUCCESS)
}

// --- mcp --------------------------------------------------------------------------------

fn cmd_mcp() -> Result<ExitCode, String> {
    let config = config_from_env().map_err(|e| e.0)?;
    let client = Client::new(&config.url, &config.token).map_err(|e| e.0)?;
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut stderr = std::io::stderr();
    let options = screenwords::mcp_proxy::ProxyOptions::default();
    let code = screenwords::mcp_proxy::run(client, &options, stdin.lock(), stdout.lock(), &mut stderr);
    Ok(ExitCode::from(code as u8))
}

fn cmd_call(args: &[String]) -> Result<ExitCode, String> {
    let Some(tool) = args.first() else {
        return Err("call needs a tool name".into());
    };
    let arguments = match args.get(1) {
        None => Value::obj(),
        Some(text) => Value::parse(text).map_err(|e| format!("arguments are not JSON: {e}"))?,
    };
    let config = config_from_env().map_err(|e| e.0)?;
    let mut client = Client::new(&config.url, &config.token).map_err(|e| e.0)?;
    client.initialize("screenwords-cli").map_err(|e| format!("initialize: {e}"))?;
    let (is_error, result) = client.call(tool, Some(arguments)).map_err(|e| format!("{tool}: {e}"))?;
    println!("{}", result.to_string_pretty(false));
    Ok(if is_error { ExitCode::from(1) } else { ExitCode::SUCCESS })
}

fn cmd_tts(args: &[String]) -> Result<ExitCode, String> {
    let mut lang = "en".to_string();
    let mut voice = "easton".to_string();
    let mut seed = 0u32;
    let mut text = String::new();
    let mut out = std::path::PathBuf::from("speech.wav");
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--lang" => { lang = args.get(i + 1).ok_or("--lang needs a value")?.clone(); i += 2; }
            "--voice" => { voice = args.get(i + 1).ok_or("--voice needs a value")?.clone(); i += 2; }
            "--seed" => { seed = args.get(i + 1).ok_or("--seed needs a value")?.parse().map_err(|_| "--seed: number")?; i += 2; }
            "--out" | "-o" => { out = std::path::PathBuf::from(args.get(i + 1).ok_or("--out needs a value")?); i += 2; }
            other if !other.starts_with("--") => { text = other.to_string(); i += 1; }
            other => return Err(format!("unknown flag {other}")),
        }
    }
    if text.is_empty() {
        return Err("usage: screenwords tts --lang <en|tr|...31 codes> [--voice NAME (e.g. M1)] [--seed N] [--out FILE] \"TEXT\"".into());
    }
    let audio = screenwords::tts::synthesize(&lang, &text, &voice, seed)?;
    screenwords::tts::wav::write_wav(&out, &audio.samples, audio.rate)?;
    println!(
        "{}: {} samples, {:.2}s at {} Hz -> {}",
        lang,
        audio.samples.len(),
        audio.samples.len() as f32 / audio.rate as f32,
        audio.rate,
        out.display()
    );
    Ok(ExitCode::SUCCESS)
}

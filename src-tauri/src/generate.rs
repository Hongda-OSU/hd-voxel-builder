//! Runs one `claude -p` generation. The prompts are compiled in from
//! src/prompts so the repo stays their only source, and every flag is fixed
//! here: the UI can only choose the text, the style and the model.

use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::{Value, json};

const SYSTEM: &str = include_str!("../../src/prompts/system.md");
const SCHEMA: &str = include_str!("../../src/prompts/tool.json");
const EXAMPLE: &str = include_str!("../../src/prompts/examples/hd.json");
const CHIBI: &str = include_str!("../../src/prompts/presets/chibi.md");
const OBJECT: &str = include_str!("../../src/prompts/presets/object.md");

pub const MODELS: [&str; 2] = ["opus", "sonnet"];

/// Opus took up to 135 s for a character in stage 3; this leaves room for
/// slow days without letting a stuck process hold the app forever.
pub const TIMEOUT: Duration = Duration::from_secs(300);

/// The process of the generation in flight, so it can be cancelled.
static RUNNING: Mutex<Option<u32>> = Mutex::new(None);
static CANCELLED: AtomicBool = AtomicBool::new(false);

pub fn system_prompt(style: &str) -> Result<String, String> {
    let preset = match style {
        "chibi" => CHIBI,
        "object" => OBJECT,
        _ => return Err(format!("还没有「{style}」的风格预设")),
    };
    // The UI's choice decides the preset, so the spec must carry the same style.
    let preset = format!("{}\nSet \"style\" to \"{style}\".", preset.trim());
    Ok(SYSTEM
        .replace("{{STYLE_PRESET}}", &preset)
        .replace("{{EXAMPLE_SPEC}}", EXAMPLE.trim()))
}

pub fn args(model: &str, system: &str) -> Vec<String> {
    [
        "-p",
        // Keeps the user's CLAUDE.md, hooks and MCP servers out of the request.
        "--safe-mode",
        "--no-session-persistence",
        "--tools",
        "",
        "--model",
        model,
        "--system-prompt",
        system,
        "--json-schema",
        SCHEMA,
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
    ]
    .map(String::from)
    .to_vec()
}

/// One user message in the stream-json input format.
pub fn input(text: &str) -> String {
    let message = json!({
        "type": "user",
        "message": { "role": "user", "content": [{ "type": "text", "text": text }] },
    });
    format!("{message}\n")
}

/// Pulls the spec out of the last `result` event of the stream-json output.
pub fn parse_output(output: &str) -> Result<Value, String> {
    let result = output
        .lines()
        .rev()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .find(|event| event["type"] == "result")
        .ok_or("Claude Code 没有返回结果")?;
    if result["is_error"] == true {
        let detail = result["result"].as_str().unwrap_or("未知错误");
        return Err(format!("Claude Code 出错：{detail}"));
    }
    if result["structured_output"].is_object() {
        return Ok(result["structured_output"].clone());
    }
    // Older CLI builds put the JSON in the text result instead.
    result["result"]
        .as_str()
        .and_then(|text| serde_json::from_str::<Value>(text).ok())
        .filter(Value::is_object)
        .ok_or_else(|| "Claude Code 的回答里没有 spec".to_owned())
}

/// Records the preset that was actually used, whatever style Claude wrote.
pub fn set_style(spec: &mut Value, style: &str) {
    if let Some(spec) = spec.as_object_mut() {
        spec.insert("style".into(), style.into());
    }
}

fn kill(pid: u32) {
    let _ = Command::new("kill").arg(pid.to_string()).status();
}

pub fn run(claude: &Path, text: &str, style: &str, model: &str) -> Result<Value, String> {
    run_within(claude, text, style, model, TIMEOUT)
}

fn run_within(
    claude: &Path,
    text: &str,
    style: &str,
    model: &str,
    timeout: Duration,
) -> Result<Value, String> {
    if !MODELS.contains(&model) {
        return Err(format!("不支持的模型「{model}」"));
    }
    let system = system_prompt(style)?;
    let mut running = RUNNING
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if running.is_some() {
        return Err("已经有一个生成在进行".into());
    }
    let mut child = Command::new(claude)
        .args(args(model, &system))
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法启动 Claude Code：{error}"))?;
    let pid = child.id();
    *running = Some(pid);
    CANCELLED.store(false, Ordering::SeqCst);
    drop(running);

    // Kills the process if it is still running when the time is up; dropping
    // `finished` after the process exits stops the watchdog.
    let (finished, done) = mpsc::channel::<()>();
    let timed_out = Arc::new(AtomicBool::new(false));
    let watchdog = {
        let timed_out = Arc::clone(&timed_out);
        thread::spawn(move || {
            if done.recv_timeout(timeout) == Err(RecvTimeoutError::Timeout) {
                timed_out.store(true, Ordering::SeqCst);
                kill(pid);
            }
        })
    };

    let outcome = (|| {
        let mut stdin = child.stdin.take().ok_or("无法写入 Claude Code")?;
        stdin
            .write_all(input(text).as_bytes())
            .map_err(|error| format!("无法写入 Claude Code：{error}"))?;
        drop(stdin);
        let mut output = String::new();
        if let Some(mut stdout) = child.stdout.take() {
            stdout
                .read_to_string(&mut output)
                .map_err(|error| format!("读不到 Claude Code 的输出：{error}"))?;
        }
        child.wait().map_err(|error| error.to_string())?;
        if CANCELLED.load(Ordering::SeqCst) {
            return Err("已取消".to_owned());
        }
        let mut spec = parse_output(&output)?;
        set_style(&mut spec, style);
        Ok(spec)
    })();
    drop(finished);
    let _ = watchdog.join();
    let outcome = if timed_out.load(Ordering::SeqCst) {
        Err(format!(
            "超过 {} 分钟没有结果，已停止。可以换 Sonnet 或把描述写短一点再试",
            timeout.as_secs() / 60
        ))
    } else {
        outcome
    };
    *RUNNING
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    outcome
}

/// Stops the generation in flight, if any.
pub fn cancel() {
    let running = RUNNING
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(pid) = *running {
        CANCELLED.store(true, Ordering::SeqCst);
        kill(pid);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_the_system_prompt_from_the_repo_files() {
        let prompt = system_prompt("chibi").unwrap();
        assert!(prompt.contains("Style preset: chibi character."));
        assert!(prompt.contains(r#"Set "style" to "chibi"."#));
        assert!(prompt.contains(r#""name": "hd""#));
        assert!(!prompt.contains("{{"));
        assert!(
            system_prompt("object")
                .unwrap()
                .contains("Style preset: object.")
        );
        assert!(system_prompt("diorama").is_err());
    }

    #[test]
    fn fixes_the_safety_flags() {
        let args = args("opus", "SYSTEM");
        let after = |flag: &str| args[args.iter().position(|a| a == flag).unwrap() + 1].clone();
        assert_eq!(after("--tools"), "");
        assert_eq!(after("--model"), "opus");
        assert_eq!(after("--system-prompt"), "SYSTEM");
        assert!(args.contains(&"--safe-mode".to_owned()));
        assert!(serde_json::from_str::<Value>(&after("--json-schema")).is_ok());
    }

    #[test]
    fn writes_one_user_message_line() {
        let line = input("一个\"篮球\"");
        assert!(line.ends_with('\n'));
        let message: Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(message["message"]["content"][0]["text"], "一个\"篮球\"");
    }

    #[test]
    fn reads_the_structured_output() {
        let output = concat!(
            r#"{"type":"system","subtype":"init"}"#,
            "\n",
            r#"{"type":"result","is_error":false,"structured_output":{"name":"ball"}}"#,
            "\n",
        );
        assert_eq!(parse_output(output).unwrap()["name"], "ball");
    }

    #[test]
    fn falls_back_to_json_in_the_text_result() {
        let output = r#"{"type":"result","is_error":false,"result":"{\"name\":\"ball\"}"}"#;
        assert_eq!(parse_output(output).unwrap()["name"], "ball");
    }

    #[test]
    fn reports_errors_and_missing_results() {
        let failed = r#"{"type":"result","is_error":true,"result":"rate limited"}"#;
        assert!(parse_output(failed).unwrap_err().contains("rate limited"));
        assert!(parse_output("not json").is_err());
        let prose = r#"{"type":"result","is_error":false,"result":"Sure!"}"#;
        assert!(parse_output(prose).is_err());
    }

    #[test]
    fn overwrites_the_style_claude_wrote() {
        let mut spec = json!({ "name": "truck", "style": "object" });
        set_style(&mut spec, "chibi");
        assert_eq!(spec["style"], "chibi");
        let mut not_a_spec = json!("text");
        set_style(&mut not_a_spec, "chibi");
        assert_eq!(not_a_spec, "text");
    }

    /// Writes an executable stand-in for `claude` that runs `body`.
    fn fake_claude(name: &str, body: &str) -> std::path::PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path =
            std::env::temp_dir().join(format!("hd-fake-claude-{}-{name}", std::process::id()));
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    // One test, because only one generation may run at a time.
    #[test]
    fn runs_claude_and_stops_it_after_the_timeout() {
        let quick = fake_claude(
            "quick",
            r#"cat > /dev/null; echo '{"type":"result","is_error":false,"structured_output":{"name":"truck","style":"object"}}'"#,
        );
        let spec = run_within(&quick, "卡车", "chibi", "opus", Duration::from_secs(10)).unwrap();
        assert_eq!(spec["name"], "truck");
        assert_eq!(spec["style"], "chibi");

        let stuck = fake_claude("stuck", "exec sleep 30");
        let started = std::time::Instant::now();
        let error =
            run_within(&stuck, "卡车", "chibi", "opus", Duration::from_millis(300)).unwrap_err();
        assert!(error.contains("没有结果"), "{error}");
        assert!(started.elapsed() < Duration::from_secs(10));

        let _ = std::fs::remove_file(quick);
        let _ = std::fs::remove_file(stuck);
    }

    #[test]
    fn rejects_unknown_models_before_starting() {
        let error = run(Path::new("/nonexistent"), "x", "chibi", "gpt").unwrap_err();
        assert!(error.contains("gpt"));
    }
}

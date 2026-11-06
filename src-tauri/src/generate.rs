//! Runs one `claude -p` request: a spec, or a description drafted from
//! reference images. The prompts are compiled in from src/prompts so the repo
//! stays their only source, and every flag is fixed here: the UI can only
//! choose the text, the style, the model and the images.

use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};

const SYSTEM: &str = include_str!("../../src/prompts/system.md");
const SCHEMA: &str = include_str!("../../src/prompts/tool.json");
const EXAMPLE: &str = include_str!("../../src/prompts/examples/hd.json");
const CHIBI: &str = include_str!("../../src/prompts/presets/chibi.md");
const OBJECT: &str = include_str!("../../src/prompts/presets/object.md");
const REFERENCE: &str = include_str!("../../src/prompts/reference.md");
const DESCRIBE: &str = include_str!("../../src/prompts/describe.md");

pub const MODELS: [&str; 2] = ["opus", "sonnet"];
pub const MAX_IMAGES: usize = 3;
const MEDIA_TYPES: [&str; 2] = ["image/png", "image/jpeg"];

/// A reference image as the UI prepared it: shrunk, metadata stripped, base64.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Image {
    pub media_type: String,
    pub data: String,
}

fn check_images(images: &[Image]) -> Result<(), String> {
    if images.len() > MAX_IMAGES {
        return Err(format!("最多 {MAX_IMAGES} 张参考图"));
    }
    let valid = images.iter().all(|image| {
        MEDIA_TYPES.contains(&image.media_type.as_str())
            && !image.data.is_empty()
            && image
                .data
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'='))
    });
    if valid {
        Ok(())
    } else {
        Err("参考图只能是 PNG 或 JPEG".into())
    }
}

/// Opus took up to 135 s for a character in stage 3; this leaves room for
/// slow days without letting a stuck process hold the app forever.
pub const TIMEOUT: Duration = Duration::from_secs(300);

/// The process of the generation in flight, so it can be cancelled.
static RUNNING: Mutex<Option<u32>> = Mutex::new(None);
static CANCELLED: AtomicBool = AtomicBool::new(false);

/// The generation prompt; with images attached, the reference rules follow the
/// preset and win where they conflict, as in `pnpm gen --image`.
pub fn system_prompt(style: &str, with_images: bool) -> Result<String, String> {
    let preset = match style {
        "chibi" => CHIBI,
        "object" => OBJECT,
        _ => return Err(format!("还没有「{style}」的风格预设")),
    };
    let reference = if with_images {
        format!("\n\n{}", REFERENCE.trim())
    } else {
        String::new()
    };
    // The UI's choice decides the preset, so the spec must carry the same style.
    let preset = format!(
        "{}{reference}\nSet \"style\" to \"{style}\".",
        preset.trim()
    );
    Ok(SYSTEM
        .replace("{{STYLE_PRESET}}", &preset)
        .replace("{{EXAMPLE_SPEC}}", EXAMPLE.trim()))
}

/// `schema` is None for plain text answers, such as a description draft.
pub fn args(model: &str, system: &str, schema: Option<&str>) -> Vec<String> {
    let mut args: Vec<String> = [
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
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
    ]
    .map(String::from)
    .to_vec();
    if let Some(schema) = schema {
        args.extend(["--json-schema".to_owned(), schema.to_owned()]);
    }
    args
}

/// One user message in the stream-json input format: the images, then the text.
pub fn input(text: &str, images: &[Image]) -> String {
    let mut content: Vec<Value> = images
        .iter()
        .map(|image| {
            json!({
                "type": "image",
                "source": { "type": "base64", "media_type": image.media_type, "data": image.data },
            })
        })
        .collect();
    content.push(json!({ "type": "text", "text": text }));
    let message = json!({
        "type": "user",
        "message": { "role": "user", "content": content },
    });
    format!("{message}\n")
}

/// The last `result` event of the stream-json output, unless it is an error.
fn result_event(output: &str) -> Result<Value, String> {
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
    Ok(result)
}

/// Pulls the spec out of the stream-json output.
pub fn parse_output(output: &str) -> Result<Value, String> {
    let result = result_event(output)?;
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

/// Pulls a plain text answer out of the stream-json output.
pub fn parse_text(output: &str) -> Result<String, String> {
    result_event(output)?["result"]
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "Claude Code 没有写出描述".to_owned())
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

/// Asks for a spec in `style`, with any reference images attached.
pub fn run(
    claude: &Path,
    text: &str,
    style: &str,
    model: &str,
    images: &[Image],
) -> Result<Value, String> {
    generate_within(claude, text, style, model, images, TIMEOUT)
}

fn generate_within(
    claude: &Path,
    text: &str,
    style: &str,
    model: &str,
    images: &[Image],
    timeout: Duration,
) -> Result<Value, String> {
    check_images(images)?;
    let system = system_prompt(style, !images.is_empty())?;
    let args = args(model, &system, Some(SCHEMA));
    let output = run_within(claude, model, &args, &input(text, images), timeout)?;
    let mut spec = parse_output(&output)?;
    set_style(&mut spec, style);
    Ok(spec)
}

/// Asks for a description draft of the images, in describe.md's template.
pub fn describe(claude: &Path, model: &str, images: &[Image]) -> Result<String, String> {
    describe_within(claude, model, images, TIMEOUT)
}

fn describe_within(
    claude: &Path,
    model: &str,
    images: &[Image],
    timeout: Duration,
) -> Result<String, String> {
    if images.is_empty() {
        return Err("先加一张参考图".into());
    }
    check_images(images)?;
    let args = args(model, DESCRIBE.trim(), None);
    let output = run_within(
        claude,
        model,
        &args,
        &input("根据图片写描述。", images),
        timeout,
    )?;
    parse_text(&output)
}

/// Runs `claude` with `args`, writes `message` to it and returns what it printed.
/// Only one runs at a time, and it is killed after `timeout` or on `cancel`.
fn run_within(
    claude: &Path,
    model: &str,
    args: &[String],
    message: &str,
    timeout: Duration,
) -> Result<String, String> {
    if !MODELS.contains(&model) {
        return Err(format!("不支持的模型「{model}」"));
    }
    let mut running = RUNNING
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if running.is_some() {
        return Err("已经有一个生成在进行".into());
    }
    let mut child = Command::new(claude)
        .args(args)
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
            .write_all(message.as_bytes())
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
        Ok(output)
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

/// Stops the request in flight, if any.
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
        let prompt = system_prompt("chibi", false).unwrap();
        assert!(prompt.contains("Style preset: chibi character."));
        assert!(prompt.contains(r#"Set "style" to "chibi"."#));
        assert!(prompt.contains(r#""name": "hd""#));
        assert!(!prompt.contains("{{"));
        assert!(!prompt.contains("Reference images are attached."));
        assert!(
            system_prompt("object", false)
                .unwrap()
                .contains("Style preset: object.")
        );
        assert!(system_prompt("diorama", false).is_err());
    }

    #[test]
    fn adds_the_reference_rules_when_images_are_attached() {
        let prompt = system_prompt("object", true).unwrap();
        let preset = prompt.find("Style preset: object.").unwrap();
        let reference = prompt.find("Reference images are attached.").unwrap();
        assert!(preset < reference);
        assert!(prompt.contains(r#"Set "style" to "object"."#));
    }

    #[test]
    fn fixes_the_safety_flags() {
        let args = args("opus", "SYSTEM", Some(SCHEMA));
        let after = |flag: &str| args[args.iter().position(|a| a == flag).unwrap() + 1].clone();
        assert_eq!(after("--tools"), "");
        assert_eq!(after("--model"), "opus");
        assert_eq!(after("--system-prompt"), "SYSTEM");
        assert!(args.contains(&"--safe-mode".to_owned()));
        assert!(serde_json::from_str::<Value>(&after("--json-schema")).is_ok());
        let text_only = super::args("opus", "SYSTEM", None);
        assert!(text_only.contains(&"--safe-mode".to_owned()));
        assert!(!text_only.contains(&"--json-schema".to_owned()));
    }

    fn image(media_type: &str, data: &str) -> Image {
        Image {
            media_type: media_type.into(),
            data: data.into(),
        }
    }

    #[test]
    fn writes_one_user_message_line() {
        let line = input("一个\"篮球\"", &[]);
        assert!(line.ends_with('\n'));
        let message: Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(message["message"]["content"][0]["text"], "一个\"篮球\"");
    }

    #[test]
    fn puts_the_images_before_the_text() {
        let line = input(
            "邮筒",
            &[image("image/png", "iVBO"), image("image/jpeg", "/9j/")],
        );
        let content = &serde_json::from_str::<Value>(line.trim()).unwrap()["message"]["content"];
        assert_eq!(content[0]["source"]["media_type"], "image/png");
        assert_eq!(content[0]["source"]["data"], "iVBO");
        assert_eq!(content[1]["type"], "image");
        assert_eq!(content[2]["text"], "邮筒");
    }

    #[test]
    fn accepts_up_to_three_png_or_jpeg_images() {
        let ok = image("image/png", "iVBORw0KGgo=");
        assert!(check_images(&[]).is_ok());
        assert!(check_images(&[ok]).is_ok());
        let four: Vec<_> = (0..4).map(|_| image("image/png", "iVBO")).collect();
        assert!(check_images(&four).unwrap_err().contains('3'));
        assert!(check_images(&[image("image/gif", "R0lG")]).is_err());
        assert!(check_images(&[image("image/png", "")]).is_err());
        assert!(check_images(&[image("image/png", "data:image/png;base64,iVBO")]).is_err());
    }

    #[test]
    fn reads_a_text_answer() {
        let output = r#"{"type":"result","is_error":false,"result":"\n主体：邮筒\n"}"#;
        assert_eq!(parse_text(output).unwrap(), "主体：邮筒");
        let empty = r#"{"type":"result","is_error":false,"result":"  "}"#;
        assert!(parse_text(empty).is_err());
        let failed = r#"{"type":"result","is_error":true,"result":"overloaded"}"#;
        assert!(parse_text(failed).unwrap_err().contains("overloaded"));
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

    // One test, because only one request may run at a time.
    #[test]
    fn runs_claude_and_stops_it_after_the_timeout() {
        let seconds = Duration::from_secs(10);
        let quick = fake_claude(
            "quick",
            r#"cat > /dev/null; echo '{"type":"result","is_error":false,"structured_output":{"name":"truck","style":"object"}}'"#,
        );
        let spec = generate_within(&quick, "卡车", "chibi", "opus", &[], seconds).unwrap();
        assert_eq!(spec["name"], "truck");
        assert_eq!(spec["style"], "chibi");

        // Records the arguments and the message it was given, then answers in text.
        let log = std::env::temp_dir().join(format!("hd-fake-claude-{}-log", std::process::id()));
        let echo = fake_claude(
            "echo",
            &format!(
                r#"printf '%s\n' "$@" > '{log}.args'; cat > '{log}.stdin'; echo '{{"type":"result","is_error":false,"result":"主体：邮筒"}}'"#,
                log = log.display()
            ),
        );
        let images = [image("image/png", "iVBO")];
        let text = describe_within(&echo, "sonnet", &images, seconds).unwrap();
        assert_eq!(text, "主体：邮筒");
        let args = std::fs::read_to_string(log.with_extension("args")).unwrap();
        let stdin = std::fs::read_to_string(log.with_extension("stdin")).unwrap();
        assert!(args.contains("You write descriptions"));
        assert!(!args.contains("--json-schema"));
        assert!(stdin.contains(r#""data":"iVBO""#));
        assert!(stdin.contains("根据图片写描述"));

        // The spec request with images carries the reference rules and the images.
        let _ = generate_within(&echo, "邮筒", "object", "opus", &images, seconds);
        let args = std::fs::read_to_string(log.with_extension("args")).unwrap();
        assert!(args.contains("Reference images are attached."));
        assert!(args.contains("--json-schema"));
        assert!(
            std::fs::read_to_string(log.with_extension("stdin"))
                .unwrap()
                .contains("iVBO")
        );

        let stuck = fake_claude("stuck", "exec sleep 30");
        let started = std::time::Instant::now();
        let error = generate_within(
            &stuck,
            "卡车",
            "chibi",
            "opus",
            &[],
            Duration::from_millis(300),
        )
        .unwrap_err();
        assert!(error.contains("没有结果"), "{error}");
        assert!(started.elapsed() < Duration::from_secs(10));

        for file in [
            quick,
            echo,
            stuck,
            log.with_extension("args"),
            log.with_extension("stdin"),
        ] {
            let _ = std::fs::remove_file(file);
        }
    }

    #[test]
    fn rejects_bad_requests_before_starting() {
        let nowhere = Path::new("/nonexistent");
        assert!(
            run(nowhere, "x", "chibi", "gpt", &[])
                .unwrap_err()
                .contains("gpt")
        );
        assert!(
            describe(nowhere, "opus", &[])
                .unwrap_err()
                .contains("参考图")
        );
        let gif = [image("image/gif", "R0lG")];
        assert!(describe(nowhere, "opus", &gif).unwrap_err().contains("PNG"));
    }
}

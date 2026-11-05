//! Runs one `claude -p` generation. The prompts are compiled in from
//! src/prompts so the repo stays their only source, and every flag is fixed
//! here: the UI can only choose the text, the style and the model.

use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use serde_json::{Value, json};

const SYSTEM: &str = include_str!("../../src/prompts/system.md");
const SCHEMA: &str = include_str!("../../src/prompts/tool.json");
const EXAMPLE: &str = include_str!("../../src/prompts/examples/hd.json");
const CHIBI: &str = include_str!("../../src/prompts/presets/chibi.md");
const OBJECT: &str = include_str!("../../src/prompts/presets/object.md");

pub const MODELS: [&str; 2] = ["opus", "sonnet"];

/// The process of the generation in flight, so it can be cancelled.
static RUNNING: Mutex<Option<u32>> = Mutex::new(None);
static CANCELLED: AtomicBool = AtomicBool::new(false);

pub fn system_prompt(style: &str) -> Result<String, String> {
    let preset = match style {
        "chibi" => CHIBI,
        "object" => OBJECT,
        _ => return Err(format!("还没有「{style}」的风格预设")),
    };
    Ok(SYSTEM
        .replace("{{STYLE_PRESET}}", preset.trim())
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

pub fn run(claude: &Path, text: &str, style: &str, model: &str) -> Result<Value, String> {
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
    *running = Some(child.id());
    CANCELLED.store(false, Ordering::SeqCst);
    drop(running);

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
        parse_output(&output)
    })();
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
        let _ = Command::new("kill").arg(pid.to_string()).status();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_the_system_prompt_from_the_repo_files() {
        let prompt = system_prompt("chibi").unwrap();
        assert!(prompt.contains("Style preset: chibi character."));
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
    fn rejects_unknown_models_before_starting() {
        let error = run(Path::new("/nonexistent"), "x", "chibi", "gpt").unwrap_err();
        assert!(error.contains("gpt"));
    }
}

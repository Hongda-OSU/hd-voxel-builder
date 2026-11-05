//! Finds the logged-in Claude Code CLI. Apps opened from the Dock or Finder
//! get a bare PATH without Homebrew, so `claude` is looked up through the
//! user's login shell first and then in the usual install folders.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use serde::Serialize;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Ready,
    Missing,
    LoggedOut,
}

/// Remembers a found binary; a miss is retried so installing it later works.
static FOUND: Mutex<Option<PathBuf>> = Mutex::new(None);

/// The usual install folders, in the order to try them.
pub fn candidates(home: Option<&Path>) -> Vec<PathBuf> {
    let mut paths = vec![
        PathBuf::from("/opt/homebrew/bin/claude"),
        PathBuf::from("/usr/local/bin/claude"),
    ];
    if let Some(home) = home {
        for rest in [
            ".local/bin/claude",
            ".claude/local/claude",
            ".npm-global/bin/claude",
        ] {
            paths.push(home.join(rest));
        }
    }
    paths
}

fn from_login_shell() -> Option<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let output = Command::new(shell)
        .args(["-lc", "command -v claude"])
        .output()
        .ok()?;
    let path = String::from_utf8(output.stdout).ok()?;
    let path = PathBuf::from(path.trim());
    path.is_file().then_some(path)
}

pub fn find() -> Option<PathBuf> {
    let mut found = FOUND
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if found.as_ref().is_some_and(|path| path.is_file()) {
        return found.clone();
    }
    let home = std::env::var_os("HOME").map(PathBuf::from);
    *found = from_login_shell().or_else(|| {
        candidates(home.as_deref())
            .into_iter()
            .find(|path| path.is_file())
    });
    found.clone()
}

/// Reads only `loggedIn` from `claude auth status --json`; the rest holds
/// account details the app has no use for.
pub fn parse_logged_in(json: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(json)
        .ok()
        .and_then(|value| value.get("loggedIn")?.as_bool())
        .unwrap_or(false)
}

pub fn status() -> Status {
    let Some(claude) = find() else {
        return Status::Missing;
    };
    let output = Command::new(claude)
        .args(["auth", "status", "--json"])
        .output();
    match output {
        Ok(output) if parse_logged_in(&String::from_utf8_lossy(&output.stdout)) => Status::Ready,
        _ => Status::LoggedOut,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_logged_in() {
        assert!(parse_logged_in(
            r#"{"loggedIn": true, "authMethod": "claude.ai"}"#
        ));
        assert!(!parse_logged_in(r#"{"loggedIn": false}"#));
        assert!(!parse_logged_in("Not logged in"));
        assert!(!parse_logged_in(r#"{"authMethod": "claude.ai"}"#));
    }

    #[test]
    fn tries_homebrew_before_home_folders() {
        let paths = candidates(Some(Path::new("/Users/me")));
        assert_eq!(paths[0], PathBuf::from("/opt/homebrew/bin/claude"));
        assert!(paths.contains(&PathBuf::from("/Users/me/.local/bin/claude")));
        assert_eq!(candidates(None).len(), 2);
    }

    #[test]
    fn status_serializes_for_the_ui() {
        let names: Vec<String> = [Status::Ready, Status::Missing, Status::LoggedOut]
            .iter()
            .map(|status| serde_json::to_string(status).unwrap())
            .collect();
        assert_eq!(names, [r#""ready""#, r#""missing""#, r#""loggedOut""#]);
    }
}

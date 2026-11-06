//! Saved projects under ~/HDVoxel/projects/<id>/. The UI owns the
//! project.json format and validates it; this side only checks ids, reads and
//! writes files, and pulls out the few fields the project list needs.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

const PROJECT_FILE: &str = "project.json";

/// ~/HDVoxel/projects, or None when HOME is not set.
pub fn root(home: Option<&Path>) -> Option<PathBuf> {
    home.map(|home| home.join("HDVoxel").join("projects"))
}

/// Ids name folders and .vox files, so only ASCII letters, digits and dashes.
pub fn check_id(id: &str) -> Result<(), String> {
    let valid = !id.is_empty()
        && id.len() <= 64
        && !id.starts_with('-')
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if valid {
        Ok(())
    } else {
        Err(format!("作品 id「{id}」只能用字母、数字和 -"))
    }
}

/// What the project list shows; the full file is loaded when one is opened.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub id: String,
    pub name: String,
    pub style: String,
    pub updated_at: String,
    pub current: u64,
    pub versions: usize,
    /// The current version's spec, for the list's colour swatch.
    pub spec: Value,
}

fn summarize(id: &str, project: &Value) -> Option<Summary> {
    let versions = project["versions"].as_array()?;
    let current = project["current"].as_u64()?;
    let spec = versions
        .iter()
        .find(|version| version["n"].as_u64() == Some(current))?["spec"]
        .clone();
    Some(Summary {
        id: id.to_owned(),
        name: project["name"].as_str()?.to_owned(),
        style: project["style"].as_str()?.to_owned(),
        updated_at: project["updatedAt"].as_str()?.to_owned(),
        current,
        versions: versions.len(),
        spec,
    })
}

/// Every readable project under `root`, in no particular order. Folders
/// without a valid project.json are skipped rather than failing the list.
pub fn list(root: &Path) -> Vec<Summary> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let id = entry.file_name().into_string().ok()?;
            check_id(&id).ok()?;
            let text = fs::read_to_string(entry.path().join(PROJECT_FILE)).ok()?;
            summarize(&id, &serde_json::from_str(&text).ok()?)
        })
        .collect()
}

pub fn load(root: &Path, id: &str) -> Result<Value, String> {
    check_id(id)?;
    let path = root.join(id).join(PROJECT_FILE);
    let text = fs::read_to_string(&path).map_err(|error| format!("读不到作品「{id}」：{error}"))?;
    serde_json::from_str(&text)
        .map_err(|error| format!("作品「{id}」的 project.json 坏了：{error}"))
}

/// Writes through a temporary file and a rename, so a crash never leaves half a file.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = path.with_extension("tmp");
    fs::write(&temp, bytes)
        .and_then(|()| fs::rename(&temp, path))
        .map_err(|error| format!("写不进 {}：{error}", path.display()))
}

/// The saved .vox of a project, if it exists.
pub fn vox_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    check_id(id)?;
    let path = root.join(id).join(format!("{id}.vox"));
    if path.is_file() {
        Ok(path)
    } else {
        Err(format!("作品「{id}」还没有存下 .vox"))
    }
}

/// Saves project.json and the current version's .vox, named after the id.
pub fn save(root: &Path, id: &str, project: &Value, vox: &[u8]) -> Result<(), String> {
    check_id(id)?;
    if project["id"].as_str() != Some(id) {
        return Err("project.json 里的 id 和文件夹不一致".into());
    }
    let dir = root.join(id);
    fs::create_dir_all(&dir).map_err(|error| format!("建不了作品目录：{error}"))?;
    let text = serde_json::to_string_pretty(project).map_err(|error| error.to_string())?;
    write_atomic(&dir.join(PROJECT_FILE), text.as_bytes())?;
    write_atomic(&dir.join(format!("{id}.vox")), vox)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("hd-projects-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        root
    }

    fn project(id: &str) -> Value {
        json!({
            "format": 1,
            "id": id,
            "name": "红色小卡车",
            "style": "chibi",
            "createdAt": "2026-11-05T14:32:08-05:00",
            "updatedAt": "2026-11-05T14:40:51-05:00",
            "current": 2,
            "versions": [
                { "n": 1, "spec": { "name": "v1" } },
                { "n": 2, "spec": { "name": "v2" } }
            ]
        })
    }

    #[test]
    fn accepts_only_safe_ids() {
        assert!(check_id("20261105-1432").is_ok());
        assert!(check_id("20261105-1432-2").is_ok());
        for bad in ["", "../etc", "a/b", "a.b", "-a", "作品", &"x".repeat(65)] {
            assert!(check_id(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn puts_projects_under_the_home_folder() {
        assert_eq!(
            root(Some(Path::new("/Users/me"))),
            Some(PathBuf::from("/Users/me/HDVoxel/projects"))
        );
        assert_eq!(root(None), None);
    }

    #[test]
    fn saves_loads_and_lists() {
        let root = temp_root("round-trip");
        let id = "20261105-1432";
        save(&root, id, &project(id), b"VOX ").unwrap();

        assert_eq!(load(&root, id).unwrap(), project(id));
        assert_eq!(
            fs::read(root.join(id).join(format!("{id}.vox"))).unwrap(),
            b"VOX "
        );
        assert!(!root.join(id).join("project.tmp").exists());

        let summaries = list(&root);
        assert_eq!(summaries.len(), 1);
        let summary = &summaries[0];
        assert_eq!(summary.name, "红色小卡车");
        assert_eq!(summary.versions, 2);
        assert_eq!(summary.spec["name"], "v2");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn overwrites_a_saved_project() {
        let root = temp_root("overwrite");
        let id = "20261105-1432";
        save(&root, id, &project(id), b"old").unwrap();
        let mut next = project(id);
        next["current"] = json!(1);
        save(&root, id, &next, b"new").unwrap();
        assert_eq!(load(&root, id).unwrap()["current"], 1);
        assert_eq!(list(&root)[0].spec["name"], "v1");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_mismatched_ids_and_skips_broken_folders() {
        let root = temp_root("broken");
        assert!(save(&root, "a", &project("b"), b"").is_err());
        assert!(save(&root, "../x", &project("../x"), b"").is_err());

        fs::create_dir_all(root.join("broken")).unwrap();
        fs::write(root.join("broken").join(PROJECT_FILE), "{").unwrap();
        fs::create_dir_all(root.join("empty")).unwrap();
        save(&root, "good", &project("good"), b"").unwrap();
        let ids: Vec<_> = list(&root).into_iter().map(|s| s.id).collect();
        assert_eq!(ids, ["good"]);
        assert!(load(&root, "broken").unwrap_err().contains("坏了"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn finds_only_saved_vox_files() {
        let root = temp_root("vox-path");
        save(&root, "a", &project("a"), b"VOX ").unwrap();
        assert_eq!(vox_path(&root, "a").unwrap(), root.join("a").join("a.vox"));
        assert!(vox_path(&root, "missing").is_err());
        assert!(vox_path(&root, "../a").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn lists_nothing_when_the_folder_is_missing() {
        assert!(list(&temp_root("missing")).is_empty());
    }
}

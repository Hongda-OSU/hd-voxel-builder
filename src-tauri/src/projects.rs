//! Saved projects under ~/HDVoxel/projects/<id>/. The UI owns the
//! project.json format and validates it; this side only checks ids, reads and
//! writes files, and pulls out the few fields the project list needs.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

const PROJECT_FILE: &str = "project.json";
const REFS_DIR: &str = "refs";

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

/// Reference image names, as the UI gives them: a number and `.png` or `.jpg`.
pub fn check_ref_name(name: &str) -> Result<(), String> {
    let valid = name.split_once('.').is_some_and(|(stem, ext)| {
        (1..=3).contains(&stem.len())
            && stem.chars().all(|c| c.is_ascii_digit())
            && matches!(ext, "png" | "jpg")
    });
    if valid {
        Ok(())
    } else {
        Err(format!("参考图文件名「{name}」不对"))
    }
}

/// One reference image file in refs/, already shrunk by the UI.
#[derive(Debug, Deserialize, Serialize, PartialEq)]
pub struct RefFile {
    pub name: String,
    pub bytes: Vec<u8>,
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

const STARTERS_MARK: &str = ".starters-added";

/// True the first time it is called for `root`: the starter projects are added
/// once, so deleting them for good is possible. The mark is a hidden file, which
/// `list` skips because its name is not a valid id.
pub fn take_first_run(root: &Path) -> Result<bool, String> {
    let mark = root.join(STARTERS_MARK);
    if mark.exists() {
        return Ok(false);
    }
    fs::create_dir_all(root).map_err(|error| format!("建不了作品目录：{error}"))?;
    fs::write(&mark, b"").map_err(|error| format!("写不进 {}：{error}", mark.display()))?;
    Ok(true)
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

/// Moves a project folder to the Trash with `move_to_trash`, so Finder can put it back.
pub fn trash(
    root: &Path,
    id: &str,
    move_to_trash: impl Fn(&Path) -> Result<(), String>,
) -> Result<(), String> {
    check_id(id)?;
    let dir = root.join(id);
    if !dir.is_dir() {
        return Err(format!("找不到作品「{id}」"));
    }
    move_to_trash(&dir)
}

/// macOS's own trash tool (with Put Back), else a plain move into ~/.Trash.
pub fn move_to_trash(path: &Path) -> Result<(), String> {
    let tool = Path::new("/usr/bin/trash");
    if tool.is_file() {
        let status = std::process::Command::new(tool)
            .arg(path)
            .status()
            .map_err(|error| format!("移不到废纸篓：{error}"))?;
        return if status.success() {
            Ok(())
        } else {
            Err("移不到废纸篓".into())
        };
    }
    let home = std::env::var_os("HOME").ok_or("找不到用户目录")?;
    let name = path.file_name().ok_or("路径没有文件名")?;
    let trash = Path::new(&home).join(".Trash");
    let mut target = trash.join(name);
    let mut n = 2;
    while target.exists() {
        target = trash.join(format!("{}-{n}", name.to_string_lossy()));
        n += 1;
    }
    fs::rename(path, &target).map_err(|error| format!("移不到废纸篓：{error}"))
}

/// Saves project.json and the current version's .vox, named after the id,
/// plus any reference images given; images already in refs/ are left alone.
pub fn save(
    root: &Path,
    id: &str,
    project: &Value,
    vox: &[u8],
    refs: &[RefFile],
) -> Result<(), String> {
    check_id(id)?;
    if project["id"].as_str() != Some(id) {
        return Err("project.json 里的 id 和文件夹不一致".into());
    }
    for file in refs {
        check_ref_name(&file.name)?;
    }
    let dir = root.join(id);
    fs::create_dir_all(&dir).map_err(|error| format!("建不了作品目录：{error}"))?;
    if !refs.is_empty() {
        let refs_dir = dir.join(REFS_DIR);
        fs::create_dir_all(&refs_dir).map_err(|error| format!("建不了参考图目录：{error}"))?;
        for file in refs {
            write_atomic(&refs_dir.join(&file.name), &file.bytes)?;
        }
    }
    let text = serde_json::to_string_pretty(project).map_err(|error| error.to_string())?;
    write_atomic(&dir.join(PROJECT_FILE), text.as_bytes())?;
    write_atomic(&dir.join(format!("{id}.vox")), vox)
}

/// The reference images project.json lists, in its order. A listed file that
/// is missing is skipped, so a lost image costs only its thumbnail.
pub fn load_refs(root: &Path, id: &str) -> Result<Vec<RefFile>, String> {
    let project = load(root, id)?;
    let names = project["refs"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    let dir = root.join(id).join(REFS_DIR);
    Ok(names
        .iter()
        .filter_map(Value::as_str)
        .filter(|name| check_ref_name(name).is_ok())
        .filter_map(|name| {
            let bytes = fs::read(dir.join(name)).ok()?;
            Some(RefFile {
                name: name.to_owned(),
                bytes,
            })
        })
        .collect())
}

/// A saved reference image, if it exists.
pub fn ref_path(root: &Path, id: &str, name: &str) -> Result<PathBuf, String> {
    check_id(id)?;
    check_ref_name(name)?;
    let path = root.join(id).join(REFS_DIR).join(name);
    if path.is_file() {
        Ok(path)
    } else {
        Err(format!("找不到参考图「{name}」"))
    }
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
        save(&root, id, &project(id), b"VOX ", &[]).unwrap();

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
        save(&root, id, &project(id), b"old", &[]).unwrap();
        let mut next = project(id);
        next["current"] = json!(1);
        save(&root, id, &next, b"new", &[]).unwrap();
        assert_eq!(load(&root, id).unwrap()["current"], 1);
        assert_eq!(list(&root)[0].spec["name"], "v1");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_mismatched_ids_and_skips_broken_folders() {
        let root = temp_root("broken");
        assert!(save(&root, "a", &project("b"), b"", &[]).is_err());
        assert!(save(&root, "../x", &project("../x"), b"", &[]).is_err());

        fs::create_dir_all(root.join("broken")).unwrap();
        fs::write(root.join("broken").join(PROJECT_FILE), "{").unwrap();
        fs::create_dir_all(root.join("empty")).unwrap();
        save(&root, "good", &project("good"), b"", &[]).unwrap();
        let ids: Vec<_> = list(&root).into_iter().map(|s| s.id).collect();
        assert_eq!(ids, ["good"]);
        assert!(load(&root, "broken").unwrap_err().contains("坏了"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn finds_only_saved_vox_files() {
        let root = temp_root("vox-path");
        save(&root, "a", &project("a"), b"VOX ", &[]).unwrap();
        assert_eq!(vox_path(&root, "a").unwrap(), root.join("a").join("a.vox"));
        assert!(vox_path(&root, "missing").is_err());
        assert!(vox_path(&root, "../a").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn trashes_only_existing_projects() {
        let root = temp_root("trash");
        save(&root, "a", &project("a"), b"", &[]).unwrap();
        let moved = std::cell::RefCell::new(Vec::new());
        let record = |path: &Path| {
            moved.borrow_mut().push(path.to_path_buf());
            Ok(())
        };
        trash(&root, "a", record).unwrap();
        assert_eq!(*moved.borrow(), [root.join("a")]);
        assert!(
            trash(&root, "missing", record)
                .unwrap_err()
                .contains("找不到")
        );
        assert!(trash(&root, "../a", record).is_err());
        assert_eq!(moved.borrow().len(), 1);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn reports_the_first_run_once() {
        let root = temp_root("first-run");
        assert!(take_first_run(&root).unwrap());
        assert!(!take_first_run(&root).unwrap());
        assert!(list(&root).is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn accepts_only_numbered_png_and_jpg_refs() {
        for good in ["1.png", "2.jpg", "123.png"] {
            assert!(check_ref_name(good).is_ok(), "{good}");
        }
        for bad in [
            "",
            "1",
            ".png",
            "a.png",
            "1.gif",
            "1.png.png",
            "../1.png",
            "1234.png",
        ] {
            assert!(check_ref_name(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn saves_and_loads_reference_images() {
        let root = temp_root("refs");
        let id = "a";
        let mut with_refs = project(id);
        with_refs["refs"] = json!(["1.png", "2.jpg", "3.png"]);
        let files = [
            RefFile {
                name: "1.png".into(),
                bytes: b"PNG".to_vec(),
            },
            RefFile {
                name: "2.jpg".into(),
                bytes: b"JPG".to_vec(),
            },
        ];
        save(&root, id, &with_refs, b"", &files).unwrap();
        // A later save without images keeps the ones on disk.
        save(&root, id, &with_refs, b"", &[]).unwrap();

        // 3.png is listed but missing, so it is skipped.
        assert_eq!(load_refs(&root, id).unwrap(), files);
        assert_eq!(
            ref_path(&root, id, "2.jpg").unwrap(),
            root.join(id).join("refs").join("2.jpg")
        );
        assert!(ref_path(&root, id, "3.png").is_err());
        assert!(ref_path(&root, id, "../a.vox").is_err());
        assert!(load_refs(&root, "missing").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_bad_ref_names_before_writing() {
        let root = temp_root("bad-refs");
        let bad = [RefFile {
            name: "../x.png".into(),
            bytes: vec![],
        }];
        assert!(save(&root, "a", &project("a"), b"", &bad).is_err());
        assert!(!root.join("a").exists());
        assert!(load_refs(&root, "a").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn loads_no_refs_for_older_projects() {
        let root = temp_root("no-refs");
        save(&root, "a", &project("a"), b"", &[]).unwrap();
        assert!(load_refs(&root, "a").unwrap().is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn lists_nothing_when_the_folder_is_missing() {
        assert!(list(&temp_root("missing")).is_empty());
    }
}

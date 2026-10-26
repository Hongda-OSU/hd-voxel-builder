//! MagicaVoxel for Mac ignores files passed to it, but lists its model folder
//! (`dir_model` in config.txt) in the Project panel when it starts, so models
//! are written there and the user opens them from that list.

use std::fs;
use std::path::{Path, PathBuf};

pub const APPLICATIONS: &str = "/Applications";

/// MagicaVoxel.app, either directly in `applications` or inside the folder it ships in.
pub fn find_app(applications: &Path) -> Option<PathBuf> {
    let direct = applications.join("MagicaVoxel.app");
    if direct.is_dir() {
        return Some(direct);
    }
    let mut apps: Vec<PathBuf> = fs::read_dir(applications)
        .ok()?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("MagicaVoxel"))
        })
        .map(|folder| folder.join("MagicaVoxel.app"))
        .filter(|app| app.is_dir())
        .collect();
    // Release folders carry the version, so the last name is the newest.
    apps.sort();
    apps.pop()
}

/// Reads `dir_model : [[...]]` from config.txt; `$` stands for the app's folder.
pub fn parse_dir_model(config: &str, folder: &Path) -> Option<PathBuf> {
    config.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        if key.trim() != "dir_model" {
            return None;
        }
        let value = value.trim().strip_prefix("[[")?.strip_suffix("]]")?.trim();
        if value.is_empty() {
            return None;
        }
        Some(match value.strip_prefix('$') {
            Some(rest) => folder.join(rest.trim_start_matches('/')),
            None => PathBuf::from(value),
        })
    })
}

/// The model folder MagicaVoxel lists, falling back to the `vox` folder beside the app.
pub fn model_dir(app: &Path) -> PathBuf {
    let folder = app.parent().unwrap_or(app);
    fs::read_to_string(folder.join("config/config.txt"))
        .ok()
        .and_then(|config| parse_dir_model(&config, folder))
        .unwrap_or_else(|| folder.join("vox"))
}

/// `<id>.vox`, keeping only ASCII letters, digits, `-` and `_` so the 2019 build lists it.
pub fn file_name(id: &str) -> Option<String> {
    let stem: String = id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let stem = stem.trim_matches('-');
    (!stem.is_empty()).then(|| format!("{stem}.vox"))
}

/// Writes the model into `dir` and returns the path it was written to.
pub fn write_model(dir: &Path, id: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let name = file_name(id).ok_or_else(|| format!("模型 id「{id}」不能用作文件名"))?;
    if !dir.is_dir() {
        return Err(format!("模型目录不存在：{}", dir.display()));
    }
    let path = dir.join(name);
    fs::write(&path, bytes).map_err(|error| format!("写入 {} 失败：{error}", path.display()))?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh empty folder under the system temp dir.
    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("hdvb-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reads_dir_model_relative_to_the_app_folder() {
        let config = "{\n\tdir_model\t\t: [[$/vox]]\n\tdir_palette\t: [[$/palette]]\n}";
        let folder = Path::new("/Applications/MagicaVoxel-0.99.4.2-alpha-macos");
        assert_eq!(parse_dir_model(config, folder), Some(folder.join("vox")));
    }

    #[test]
    fn reads_an_absolute_dir_model() {
        let config = "dir_model : [[/Users/me/Voxels]]";
        assert_eq!(
            parse_dir_model(config, Path::new("/x")),
            Some(PathBuf::from("/Users/me/Voxels"))
        );
    }

    #[test]
    fn ignores_a_missing_or_empty_dir_model() {
        assert_eq!(
            parse_dir_model("dir_palette : [[$/palette]]", Path::new("/x")),
            None
        );
        assert_eq!(parse_dir_model("dir_model : [[ ]]", Path::new("/x")), None);
    }

    #[test]
    fn falls_back_to_the_vox_folder_without_a_config() {
        let folder = temp_dir("no-config");
        let app = folder.join("MagicaVoxel.app");
        assert_eq!(model_dir(&app), folder.join("vox"));
    }

    #[test]
    fn finds_the_app_inside_its_release_folder() {
        let applications = temp_dir("applications");
        for release in [
            "MagicaVoxel-0.99.4.2-alpha-macos",
            "MagicaVoxel-0.99.5-macos",
        ] {
            fs::create_dir_all(applications.join(release).join("MagicaVoxel.app")).unwrap();
        }
        fs::create_dir_all(applications.join("Other.app")).unwrap();
        assert_eq!(
            find_app(&applications),
            Some(applications.join("MagicaVoxel-0.99.5-macos/MagicaVoxel.app"))
        );
    }

    #[test]
    fn keeps_file_names_ascii() {
        assert_eq!(file_name("hd-tall").as_deref(), Some("hd-tall.vox"));
        assert_eq!(file_name("篮球 v2").as_deref(), Some("v2.vox"));
        assert_eq!(file_name("篮球"), None);
    }

    #[test]
    fn writes_into_an_existing_folder_only() {
        let dir = temp_dir("write");
        let path = write_model(&dir, "hd", b"VOX ").unwrap();
        assert_eq!(fs::read(path).unwrap(), b"VOX ");
        assert!(write_model(&dir.join("missing"), "hd", b"VOX ").is_err());
    }
}

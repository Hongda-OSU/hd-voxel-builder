//! The one setting the app keeps: a model folder that overrides MagicaVoxel's
//! own, stored as a plain path in the app's config folder.

use std::fs;
use std::path::{Path, PathBuf};

const MODEL_DIR_FILE: &str = "model-dir.txt";

/// Expands a leading `~/` to `home`.
pub fn expand_home(path: &str, home: Option<&Path>) -> PathBuf {
    match (path.strip_prefix("~/"), home) {
        (Some(rest), Some(home)) => home.join(rest),
        _ => PathBuf::from(path),
    }
}

pub fn read_model_dir(config_dir: &Path) -> Option<PathBuf> {
    let saved = fs::read_to_string(config_dir.join(MODEL_DIR_FILE)).ok()?;
    let saved = saved.trim();
    (!saved.is_empty()).then(|| PathBuf::from(saved))
}

/// Saves `dir`, or clears the override when it is None. Only existing folders are saved.
pub fn write_model_dir(config_dir: &Path, dir: Option<&Path>) -> Result<(), String> {
    let file = config_dir.join(MODEL_DIR_FILE);
    let Some(dir) = dir else {
        return match fs::remove_file(&file) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                Err(format!("无法清除设置：{error}"))
            }
            _ => Ok(()),
        };
    };
    if !dir.is_dir() {
        return Err(format!("目录不存在：{}", dir.display()));
    }
    fs::create_dir_all(config_dir).map_err(|error| format!("无法保存设置：{error}"))?;
    fs::write(&file, dir.display().to_string()).map_err(|error| format!("无法保存设置：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("hdvb-settings-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn expands_only_a_leading_tilde() {
        let home = Path::new("/Users/me");
        assert_eq!(
            expand_home("~/Voxels", Some(home)),
            PathBuf::from("/Users/me/Voxels")
        );
        assert_eq!(
            expand_home("/tmp/~/x", Some(home)),
            PathBuf::from("/tmp/~/x")
        );
        assert_eq!(expand_home("~/Voxels", None), PathBuf::from("~/Voxels"));
    }

    #[test]
    fn saves_reads_and_clears_the_override() {
        let root = temp_dir("roundtrip");
        let config = root.join("config");
        assert_eq!(read_model_dir(&config), None);

        write_model_dir(&config, Some(&root)).unwrap();
        assert_eq!(read_model_dir(&config), Some(root.clone()));

        write_model_dir(&config, None).unwrap();
        assert_eq!(read_model_dir(&config), None);
        write_model_dir(&config, None).unwrap();
    }

    #[test]
    fn refuses_a_missing_folder() {
        let root = temp_dir("missing");
        assert!(write_model_dir(&root, Some(&root.join("nope"))).is_err());
        assert_eq!(read_model_dir(&root), None);
    }
}

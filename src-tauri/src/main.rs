mod magicavoxel;

use std::path::{Path, PathBuf};

fn model_dir() -> Option<PathBuf> {
    magicavoxel::find_app(Path::new(magicavoxel::APPLICATIONS))
        .map(|app| magicavoxel::model_dir(&app))
}

/// MagicaVoxel's model folder, or null when the app is not in /Applications.
#[tauri::command]
fn magicavoxel_model_dir() -> Option<String> {
    model_dir().map(|dir| dir.display().to_string())
}

/// Writes the model into MagicaVoxel's model folder and returns the file name.
#[tauri::command]
fn write_to_magicavoxel(id: String, bytes: Vec<u8>) -> Result<String, String> {
    let dir = model_dir().ok_or("在「应用程序」里找不到 MagicaVoxel")?;
    let path = magicavoxel::write_model(&dir, &id, &bytes)?;
    Ok(path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            magicavoxel_model_dir,
            write_to_magicavoxel
        ])
        .run(tauri::generate_context!())
        .expect("failed to run HD Voxel Builder");
}

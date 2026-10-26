mod magicavoxel;

use std::path::{Path, PathBuf};

fn find_app() -> Result<PathBuf, String> {
    magicavoxel::find_app(Path::new(magicavoxel::APPLICATIONS))
        .ok_or_else(|| "在「应用程序」里找不到 MagicaVoxel".to_owned())
}

/// MagicaVoxel's model folder, or null when the app is not in /Applications.
#[tauri::command]
fn magicavoxel_model_dir() -> Option<String> {
    find_app()
        .ok()
        .map(|app| magicavoxel::model_dir(&app).display().to_string())
}

#[tauri::command]
fn magicavoxel_running() -> bool {
    magicavoxel::is_running()
}

/// Writes the model into MagicaVoxel's model folder and returns the file name.
#[tauri::command]
fn write_to_magicavoxel(id: String, bytes: Vec<u8>) -> Result<String, String> {
    let dir = magicavoxel::model_dir(&find_app()?);
    let path = magicavoxel::write_model(&dir, &id, &bytes)?;
    Ok(path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned())
}

/// Restarts MagicaVoxel and points to `file`. The UI confirms first when it is
/// running, since quitting drops unsaved work. Runs off the main thread: it
/// waits seconds for MagicaVoxel to quit and start.
#[tauri::command(async)]
fn restart_magicavoxel(file: String) -> Result<(), String> {
    let stem = file.strip_suffix(".vox").unwrap_or(&file);
    magicavoxel::restart(&find_app()?, stem)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            magicavoxel_model_dir,
            magicavoxel_running,
            write_to_magicavoxel,
            restart_magicavoxel
        ])
        .run(tauri::generate_context!())
        .expect("failed to run HD Voxel Builder");
}

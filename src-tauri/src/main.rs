mod magicavoxel;
mod settings;

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

fn find_app() -> Result<PathBuf, String> {
    magicavoxel::find_app(Path::new(magicavoxel::APPLICATIONS))
        .ok_or_else(|| "在「应用程序」里找不到 MagicaVoxel".to_owned())
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|error| format!("找不到设置目录：{error}"))
}

/// The folder models are written to: the user's override, else MagicaVoxel's own.
fn target_dir(app: &AppHandle) -> Result<PathBuf, String> {
    match settings::read_model_dir(&config_dir(app)?) {
        Some(dir) => Ok(dir),
        None => Ok(magicavoxel::model_dir(&find_app()?)),
    }
}

/// MagicaVoxel's own model folder, or null when the app is not in /Applications.
#[tauri::command]
fn magicavoxel_model_dir() -> Option<String> {
    find_app()
        .ok()
        .map(|app| magicavoxel::model_dir(&app).display().to_string())
}

/// The folder the user chose instead, or null.
#[tauri::command]
fn custom_model_dir(app: AppHandle) -> Result<Option<String>, String> {
    Ok(settings::read_model_dir(&config_dir(&app)?).map(|dir| dir.display().to_string()))
}

/// Saves a folder to write models to; null goes back to MagicaVoxel's own.
#[tauri::command]
fn set_custom_model_dir(app: AppHandle, dir: Option<String>) -> Result<(), String> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let dir = dir.map(|dir| settings::expand_home(dir.trim(), home.as_deref()));
    settings::write_model_dir(&config_dir(&app)?, dir.as_deref())
}

#[tauri::command]
fn magicavoxel_running() -> bool {
    magicavoxel::is_running()
}

/// Writes the model into the model folder and returns the file name.
#[tauri::command]
fn write_to_magicavoxel(app: AppHandle, id: String, bytes: Vec<u8>) -> Result<String, String> {
    let path = magicavoxel::write_model(&target_dir(&app)?, &id, &bytes)?;
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
            custom_model_dir,
            set_custom_model_dir,
            magicavoxel_running,
            write_to_magicavoxel,
            restart_magicavoxel
        ])
        .run(tauri::generate_context!())
        .expect("failed to run HD Voxel Builder");
}

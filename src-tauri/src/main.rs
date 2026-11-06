mod claude;
mod generate;
mod magicavoxel;
mod projects;
mod settings;

use std::path::{Path, PathBuf};

use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem};
use tauri::{AppHandle, Emitter, Manager};

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

fn projects_root() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    projects::root(home.as_deref()).ok_or_else(|| "找不到用户目录".to_owned())
}

/// Every saved project, unsorted; the UI orders them by updatedAt.
#[tauri::command(async)]
fn list_projects() -> Result<Vec<projects::Summary>, String> {
    Ok(projects::list(&projects_root()?))
}

/// One project's full project.json, for the UI to validate.
#[tauri::command(async)]
fn load_project(id: String) -> Result<serde_json::Value, String> {
    projects::load(&projects_root()?, &id)
}

/// Saves project.json, the current version's .vox and any new reference images.
#[tauri::command(async)]
fn save_project(
    id: String,
    project: serde_json::Value,
    vox: Vec<u8>,
    refs: Option<Vec<projects::RefFile>>,
) -> Result<(), String> {
    let refs = refs.unwrap_or_default();
    projects::save(&projects_root()?, &id, &project, &vox, &refs)
}

/// A project's reference images, in the order project.json lists them.
#[tauri::command(async)]
fn load_refs(id: String) -> Result<Vec<projects::RefFile>, String> {
    projects::load_refs(&projects_root()?, &id)
}

/// Opens a saved reference image in Preview.
#[tauri::command]
fn open_ref(id: String, name: String) -> Result<(), String> {
    let path = projects::ref_path(&projects_root()?, &id, &name)?;
    std::process::Command::new("open")
        .arg(&path)
        .status()
        .map_err(|error| format!("打不开参考图：{error}"))
        .map(|_| ())
}

/// True once per projects folder, so the starter projects are added only the first time.
#[tauri::command]
fn take_first_run() -> Result<bool, String> {
    projects::take_first_run(&projects_root()?)
}

/// Moves a project folder to the Trash; Finder can put it back.
#[tauri::command(async)]
fn trash_project(id: String) -> Result<(), String> {
    projects::trash(&projects_root()?, &id, projects::move_to_trash)
}

/// Shows a project's .vox selected in Finder.
#[tauri::command]
fn reveal_project_file(id: String) -> Result<(), String> {
    let path = projects::vox_path(&projects_root()?, &id)?;
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .status()
        .map_err(|error| format!("打不开 Finder：{error}"))
        .map(|_| ())
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

/// Whether the Claude Code CLI is installed and logged in. Runs off the main
/// thread because it starts a login shell and the CLI.
#[tauri::command(async)]
fn claude_status() -> claude::Status {
    claude::status()
}

/// Asks Claude Code for a spec. The UI validates it and may call again with
/// the problems listed in `text`. Runs off the main thread: it takes minutes.
#[tauri::command(async)]
fn generate(text: String, style: String, model: String) -> Result<serde_json::Value, String> {
    let claude = claude::find().ok_or("找不到 Claude Code，请先安装并登录")?;
    generate::run(&claude, &text, &style, &model)
}

#[tauri::command]
fn cancel_generation() {
    generate::cancel();
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

/// Adds 设置… (⌘,) to the default app menu, after About, where Mac apps keep it.
fn add_settings_item(app: &tauri::App) -> tauri::Result<()> {
    let menu = Menu::default(app.handle())?;
    if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
        let settings = MenuItem::with_id(app, "settings", "设置…", true, Some("CmdOrCtrl+,"))?;
        app_menu.insert(&settings, 2)?;
        app_menu.insert(&PredefinedMenuItem::separator(app)?, 3)?;
    }
    app.set_menu(menu)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| Ok(add_settings_item(app)?))
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "settings" {
                let _ = app.emit("open-settings", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            claude_status,
            generate,
            cancel_generation,
            magicavoxel_model_dir,
            custom_model_dir,
            set_custom_model_dir,
            magicavoxel_running,
            write_to_magicavoxel,
            restart_magicavoxel,
            list_projects,
            load_project,
            save_project,
            load_refs,
            open_ref,
            reveal_project_file,
            trash_project,
            take_first_run
        ])
        .run(tauri::generate_context!())
        .expect("failed to run HD Voxel Builder");
}

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// Paths delivered by Open With / document open before (or after) the webview is ready.
static PENDING_OPEN_PATHS: Mutex<Vec<String>> = Mutex::new(Vec::new());
/// Paths the frontend is allowed to read via `read_user_file` (opened docs / drops).
static ALLOWED_READ_PATHS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));
/// Set when Finder / OS hands the app document paths (cold or warm open).
/// Startup chooser must not stay open alongside the editor for those launches.
static DOCUMENT_OPEN_LAUNCH: AtomicBool = AtomicBool::new(false);
/// Process-wide guard for JavaScript initiated shutdown sync from multiple webviews.
static EXIT_SYNC_LOCK: LazyLock<Mutex<Option<(String, Instant)>>> =
  LazyLock::new(|| Mutex::new(None));
static EXIT_SYNC_REVISION: AtomicU64 = AtomicU64::new(0);
static ALLOW_NEXT_EXIT: AtomicBool = AtomicBool::new(false);
static UPDATE_INSTALLING: AtomicBool = AtomicBool::new(false);
// A window may take multiple asynchronous IPC calls to create. Installation
// cannot begin until every such operation has completed, and new operations
// cannot begin once installation holds this gate.
static WINDOW_OPEN_GATE: Mutex<(bool, usize)> = Mutex::new((false, 0));
static WORKSPACE_WINDOW_REVISION: AtomicU64 = AtomicU64::new(0);

/// Opt-in local lifecycle trace for reproducing close/sync failures. No file is
/// opened unless the launching process explicitly supplies a diagnostic path.
fn trace_lifecycle(app: &tauri::AppHandle, event: &str, detail: serde_json::Value) {
  use std::io::Write;
  let Some(path) = std::env::var_os("VIBEGENE_LIFECYCLE_LOG") else { return; };
  let windows: Vec<_> = app.webview_windows().iter().map(|(label, window)| {
    serde_json::json!({ "label": label, "visible": window.is_visible().unwrap_or(false) })
  }).collect();
  let row = serde_json::json!({
    "pid": std::process::id(), "version": app.package_info().version.to_string(),
    "event": event, "detail": detail, "windows": windows,
    "unix_ms": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis(),
  });
  if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
    let _ = writeln!(file, "{row}");
  }
}

#[tauri::command]
fn record_folder_sync_diagnostic(app: tauri::AppHandle, detail: serde_json::Value) {
  trace_lifecycle(&app, "folder-sync", detail);
}

#[tauri::command]
fn authorize_folder_sync(app: tauri::AppHandle, path: String) -> Result<(), String> {
  use tauri_plugin_fs::FsExt;
  let directory = std::fs::canonicalize(&path).map_err(|error| error.to_string())?;
  if !directory.is_dir() || directory.parent().is_none() {
    return Err("Folder sync requires an existing directory below the filesystem root".into());
  }
  // Reconstitute the user's persisted folder mapping after process restart.
  app.fs_scope().allow_directory(&directory, true).map_err(|error| error.to_string())
}

#[tauri::command]
fn acquire_exit_sync_lock(token: String) -> bool {
  let Ok(mut lock) = EXIT_SYNC_LOCK.lock() else { return false; };
  let expired = lock.as_ref().is_some_and(|(_, since)| since.elapsed() > Duration::from_secs(30));
  if lock.is_none() || expired {
    *lock = Some((token, Instant::now()));
    true
  } else {
    false
  }
}

#[tauri::command]
fn refresh_exit_sync_lock(token: String) -> bool {
  let Ok(mut lock) = EXIT_SYNC_LOCK.lock() else { return false; };
  if let Some((owner, since)) = lock.as_mut() {
    if *owner == token {
      *since = Instant::now();
      return true;
    }
  }
  false
}

#[tauri::command]
fn release_exit_sync_lock(token: String) {
  if let Ok(mut lock) = EXIT_SYNC_LOCK.lock() {
    if lock.as_ref().is_some_and(|(owner, _)| owner == &token) {
      *lock = None;
    }
  }
}

#[tauri::command]
fn exit_sync_revision() -> u64 {
  EXIT_SYNC_REVISION.load(Ordering::Acquire)
}

#[tauri::command]
fn mark_exit_sync_complete() -> u64 {
  EXIT_SYNC_REVISION.fetch_add(1, Ordering::AcqRel) + 1
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
  ALLOW_NEXT_EXIT.store(true, Ordering::Release);
  app.exit(0);
}

#[tauri::command]
fn desktop_update_info() -> serde_json::Value {
  let configured = option_env!("VIBEGENE_UPDATER_PUBLIC_KEY")
    .is_some_and(|key| !key.trim().is_empty());
  // Only an explicitly marked Windows installer build may self-update: the
  // portable executable must never be replaced by an NSIS installer.
  let self_update = supports_self_update(
    std::env::consts::OS,
    std::env::var_os("APPIMAGE").is_some(),
    option_env!("VIBEGENE_UPDATER_INSTALL_MODE"),
  );
  serde_json::json!({ "configured": configured, "selfUpdate": self_update })
}

fn supports_self_update(os: &str, appimage: bool, windows_mode: Option<&str>) -> bool {
  match os {
    "macos" => true,
    "linux" => appimage,
    "windows" => windows_mode == Some("installer"),
    _ => false,
  }
}

#[tauri::command]
fn update_install_in_progress() -> bool {
  UPDATE_INSTALLING.load(Ordering::Acquire)
}

#[tauri::command]
fn begin_user_window_open() -> Result<(), String> {
  let mut gate = WINDOW_OPEN_GATE.lock().map_err(|_| "Window gate unavailable")?;
  acquire_window_open(&mut gate)
}

fn acquire_window_open(gate: &mut (bool, usize)) -> Result<(), String> {
  if gate.0 { return Err("A VibeGene update is being installed".into()); }
  gate.1 += 1;
  Ok(())
}

fn acquire_update_install(gate: &mut (bool, usize)) -> Result<(), String> {
  if gate.0 { return Err("An update is already installing".into()); }
  if gate.1 != 0 { return Err("A VibeGene window is still opening; retry the update".into()); }
  gate.0 = true;
  Ok(())
}

#[tauri::command]
fn end_user_window_open() {
  if let Ok(mut gate) = WINDOW_OPEN_GATE.lock() {
    gate.1 = gate.1.saturating_sub(1);
  }
}

struct NativeWindowOpenPermit;
impl Drop for NativeWindowOpenPermit {
  fn drop(&mut self) { end_user_window_open(); }
}

#[tauri::command]
fn begin_update_install(app: tauri::AppHandle) -> Result<(), String> {
  {
    let mut gate = WINDOW_OPEN_GATE.lock().map_err(|_| "Window gate unavailable")?;
    acquire_update_install(&mut gate)?;
    UPDATE_INSTALLING.store(true, Ordering::Release);
  }
  let other_visible = app.webview_windows().iter().any(|(label, window)| {
    label != "hybrid-startup" && window.is_visible().unwrap_or(true)
  });
  if other_visible {
    if let Ok(mut gate) = WINDOW_OPEN_GATE.lock() { gate.0 = false; }
    UPDATE_INSTALLING.store(false, Ordering::Release);
    return Err("Close other VibeGene windows before installing the update".into());
  }
  // The Windows updater starts an installer and exits the application itself.
  ALLOW_NEXT_EXIT.store(true, Ordering::Release);
  Ok(())
}

#[tauri::command]
fn cancel_update_install() {
  ALLOW_NEXT_EXIT.store(false, Ordering::Release);
  UPDATE_INSTALLING.store(false, Ordering::Release);
  if let Ok(mut gate) = WINDOW_OPEN_GATE.lock() { gate.0 = false; }
}

#[tauri::command]
fn restart_after_update(app: tauri::AppHandle) {
  app.restart();
}

/// Hide a retained macOS WebView from the native host process. This avoids
/// asking the closing WKWebView to perform its own final visibility change.
#[tauri::command]
fn hide_desktop_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
  let window = app
    .get_webview_window(&label)
    .ok_or_else(|| format!("Desktop window {label:?} no longer exists"))?;
  let host = app.clone();
  app.run_on_main_thread(move || {
    if let Err(error) = window.hide() {
      log::error!("Could not hide {}: {error}", label);
      return;
    }
    // Exclude the closing window explicitly: hide is dispatched by the host.
    let last = host.webview_windows().iter().all(|(other_label, other)| {
      other_label == &label || !other.is_visible().unwrap_or(true)
    });
    if last {
      let _ = host.emit_to(&label, "vg-last-window-hidden", ());
    }
    trace_lifecycle(&host, "window-hidden", serde_json::json!({ "label": label, "last": last }));
  }).map_err(|error| error.to_string())
}

fn path_keys(path: &str) -> Vec<String> {
  let mut keys = vec![path.to_string()];
  if let Ok(canon) = PathBuf::from(path).canonicalize() {
    let canon_s = canon.to_string_lossy().into_owned();
    if canon_s != path {
      keys.push(canon_s);
    }
  }
  keys
}

fn allow_read_paths(paths: &[String]) {
  if paths.is_empty() {
    return;
  }
  if let Ok(mut allowed) = ALLOWED_READ_PATHS.lock() {
    for path in paths {
      for key in path_keys(path) {
        allowed.insert(key);
      }
    }
  }
}

fn remember_open_paths(paths: &[String]) {
  if paths.is_empty() {
    return;
  }
  DOCUMENT_OPEN_LAUNCH.store(true, Ordering::Release);
  if let Ok(mut pending) = PENDING_OPEN_PATHS.lock() {
    pending.extend(paths.iter().cloned());
  }
  allow_read_paths(paths);
}

fn path_is_allowed(path: &str) -> bool {
  let Ok(allowed) = ALLOWED_READ_PATHS.lock() else {
    return false;
  };
  path_keys(path).iter().any(|key| allowed.contains(key))
}

fn has_pending_open_paths() -> bool {
  PENDING_OPEN_PATHS
    .lock()
    .map(|pending| !pending.is_empty())
    .unwrap_or(false)
}

fn has_workspace_window(app: &tauri::AppHandle) -> bool {
  app
    .webview_windows()
    .into_iter()
    .any(|(label, window)| {
      (label == "main" || label.starts_with("workspace-"))
        && window.is_visible().unwrap_or(true)
    })
}

fn workspace_open_recipient_label(labels: impl IntoIterator<Item = String>) -> Option<String> {
  let mut workspaces: Vec<String> = labels
    .into_iter()
    .filter(|label| label == "main" || label.starts_with("workspace-"))
    .collect();
  workspaces.sort_by_key(|label| if label == "main" { (0, label.clone()) } else { (1, label.clone()) });
  workspaces.into_iter().next()
}

fn visible_workspace_open_recipient_label(app: &tauri::AppHandle) -> Option<String> {
  workspace_open_recipient_label(
    app
      .webview_windows()
      .into_iter()
      .filter_map(|(label, window)| window.is_visible().unwrap_or(true).then_some(label)),
  )
}

fn should_prevent_unrequested_exit(
  is_macos: bool,
  has_exit_code: bool,
  allow_next_exit: bool,
  has_open_windows: bool,
) -> bool {
  if allow_next_exit || has_exit_code {
    return false;
  }
  is_macos || has_open_windows
}

fn dismiss_startup_window(app: &tauri::AppHandle) {
  if let Some(startup) = app.get_webview_window("hybrid-startup") {
    #[cfg(target_os = "macos")]
    let _ = startup.hide();
    #[cfg(not(target_os = "macos"))]
    let _ = startup.destroy();
  }
  let _ = app.emit("vg-dismiss-startup", ());
}

/// Collect file paths from argv (Windows/Linux Open With / shell open).
fn argv_document_paths() -> Vec<String> {
  std::env::args()
    .skip(1)
    .filter(|arg| !arg.starts_with('-'))
    .filter(|arg| {
      let path = Path::new(arg);
      path.is_file()
    })
    .collect()
}

#[tauri::command]
fn take_pending_open_paths() -> Vec<String> {
  let taken = PENDING_OPEN_PATHS
    .lock()
    .map(|mut pending| std::mem::take(&mut *pending))
    .unwrap_or_default();
  // Workspace claimed cold-start docs; allow dock-reopen startup later.
  if !taken.is_empty() {
    DOCUMENT_OPEN_LAUNCH.store(false, Ordering::Release);
  }
  taken
}

/// True when this process launch (or a later Open With) is opening documents.
#[tauri::command]
fn document_open_launch_active() -> bool {
  DOCUMENT_OPEN_LAUNCH.load(Ordering::Acquire) || has_pending_open_paths()
}

/// Allow `read_user_file` for paths the user just dropped onto a window.
#[tauri::command]
fn register_user_file_paths(paths: Vec<String>) {
  allow_read_paths(&paths);
}

#[tauri::command]
fn read_user_file(path: String) -> Result<tauri::ipc::Response, String> {
  if !path_is_allowed(&path) {
    return Err("Path is not an opened document".into());
  }
  let bytes = std::fs::read(Path::new(&path)).map_err(|err| err.to_string())?;
  Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn download_remote_file(url: String) -> Result<tauri::ipc::Response, String> {
  use std::io::Read;

  const MAX_BYTES: u64 = 100 * 1024 * 1024;
  let parsed = reqwest::Url::parse(&url).map_err(|_| "The url launch argument is not a valid URL.".to_string())?;
  if parsed.scheme() != "https" && parsed.scheme() != "http" {
    return Err("The url launch argument must use http:// or https://.".into());
  }
  if !parsed.username().is_empty() || parsed.password().is_some() {
    return Err("The url launch argument must not contain embedded credentials.".into());
  }

  let client = reqwest::blocking::Client::builder()
    .timeout(std::time::Duration::from_secs(30))
    .user_agent("VibeGene/1.0 remote sequence loader")
    .build()
    .map_err(|error| error.to_string())?;
  let response = client.get(parsed).send().map_err(|error| format!("Could not download the remote sequence file: {error}"))?;
  let status = response.status();
  if !status.is_success() {
    return Err(format!("The remote file server returned HTTP {status}."));
  }
  if response.content_length().is_some_and(|length| length > MAX_BYTES) {
    return Err("The remote sequence file exceeds the 100 MB limit.".into());
  }

  let mut bytes = Vec::new();
  response
    .take(MAX_BYTES + 1)
    .read_to_end(&mut bytes)
    .map_err(|error| format!("Could not read the remote sequence file: {error}"))?;
  if bytes.is_empty() {
    return Err("The remote sequence file is empty.".into());
  }
  if bytes.len() as u64 > MAX_BYTES {
    return Err("The remote sequence file exceeds the 100 MB limit.".into());
  }
  Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn ncbi_blast_request(form_body: String) -> Result<String, String> {
  if form_body.is_empty() || form_body.len() > 5 * 1024 * 1024 {
    return Err("BLAST request is empty or too large".into());
  }
  let client = reqwest::blocking::Client::builder()
    .timeout(std::time::Duration::from_secs(60))
    .user_agent("VibeGene/0.8.3 (support@vibe-gene.com)")
    .build()
    .map_err(|error| error.to_string())?;
  let response = client
    .post("https://blast.ncbi.nlm.nih.gov/Blast.cgi")
    .header(reqwest::header::ACCEPT, "text/plain, application/xml")
    .header(reqwest::header::CONTENT_TYPE, "application/x-www-form-urlencoded")
    .body(form_body)
    .send()
    .map_err(|error| format!("Could not reach NCBI BLAST: {error}"))?;
  let status = response.status();
  let text = response.text().map_err(|error| error.to_string())?;
  if !status.is_success() {
    return Err(format!("NCBI BLAST returned HTTP {status}: {}", text.chars().take(500).collect::<String>()));
  }
  Ok(text)
}

/// Default construct-window size: ~75% of the primary monitor work area, centered.
fn workspace_window_geometry(app: &tauri::AppHandle) -> (f64, f64, Option<(f64, f64)>) {
  const FALLBACK_W: f64 = 1440.0;
  const FALLBACK_H: f64 = 900.0;
  const FRACTION: f64 = 0.75;
  const MIN_W: f64 = 960.0;
  const MIN_H: f64 = 640.0;

  let Ok(Some(monitor)) = app.primary_monitor() else {
    return (FALLBACK_W, FALLBACK_H, None);
  };
  let scale = monitor.scale_factor().max(0.1);
  let work = monitor.work_area();
  let work_w = f64::from(work.size.width) / scale;
  let work_h = f64::from(work.size.height) / scale;
  let work_x = f64::from(work.position.x) / scale;
  let work_y = f64::from(work.position.y) / scale;
  let width = (work_w * FRACTION).clamp(MIN_W.min(work_w), work_w);
  let height = (work_h * FRACTION).clamp(MIN_H.min(work_h), work_h);
  let x = work_x + (work_w - width) / 2.0;
  let y = work_y + (work_h - height) / 2.0;
  (width, height, Some((x, y)))
}

/// Recreate a DNA/protein workspace window when opening documents with no editor open.
fn ensure_workspace_window(app: &tauri::AppHandle) {
  if begin_user_window_open().is_err() { return; }
  let _permit = NativeWindowOpenPermit;
  for (label, window) in app.webview_windows() {
    if (label == "main" || label.starts_with("workspace-")) && window.is_visible().unwrap_or(true) {
      let _ = window.show();
      let _ = window.set_focus();
      return;
    }
  }
  let (width, height, position) = workspace_window_geometry(app);
  let label = if app.get_webview_window("main").is_some() {
    format!("workspace-open-{}", WORKSPACE_WINDOW_REVISION.fetch_add(1, Ordering::AcqRel))
  } else {
    "main".to_string()
  };
  let mut builder = WebviewWindowBuilder::new(
    app,
    label,
    // Document Open With / double-click: skip the branding splash so the
    // construct appears immediately. Splash remains for a normal (no-file) launch.
    WebviewUrl::App("index.html?bootSplash=0".into()),
  )
  .title("VibeGene")
  .inner_size(width, height)
  .min_inner_size(960.0, 640.0)
  .resizable(true)
  .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
  .focused(true);
  builder = if let Some((x, y)) = position {
    builder.position(x, y)
  } else {
    builder.center()
  };
  match builder.build() {
    Ok(_) => {}
    Err(error) => log::error!("Failed to open workspace window: {error}"),
  }
}

/// Dock / app-switcher reactivation with no open windows → startup chooser.
fn ensure_startup_window(app: &tauri::AppHandle) {
  if begin_user_window_open().is_err() { return; }
  let _permit = NativeWindowOpenPermit;
  // Suppress only while documents are still waiting (or an editor is already open).
  if has_pending_open_paths() || has_workspace_window(app) {
    dismiss_startup_window(app);
    return;
  }
  if let Some(existing) = app.get_webview_window("hybrid-startup") {
    let _ = existing.show();
    let _ = existing.set_focus();
    return;
  }
  // macOS keeps hidden WebViews alive after their windows are closed. They
  // may still contain the last document, so never use an arbitrary retained
  // window as the Dock-reopen destination. Create or show the startup chooser.
  match WebviewWindowBuilder::new(
    app,
    "hybrid-startup",
    WebviewUrl::App("index.html?vgWindow=startup".into()),
  )
  .title("VibeGene")
  .inner_size(1100.0, 820.0)
  .min_inner_size(960.0, 720.0)
  .resizable(true)
  .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
  .focused(true)
  .center()
  .build()
  {
    Ok(_) => {}
    Err(error) => log::error!("Failed to open startup window: {error}"),
  }
}

/// After the event loop is ready (and any early Opened events), pick the first window.
fn bootstrap_initial_window(app: &tauri::AppHandle) {
  if DOCUMENT_OPEN_LAUNCH.load(Ordering::Acquire) || has_pending_open_paths() {
    ensure_workspace_window(app);
    dismiss_startup_window(app);
    return;
  }
  if has_workspace_window(app) {
    dismiss_startup_window(app);
    return;
  }
  if app.webview_windows().is_empty() {
    ensure_startup_window(app);
  }
}

fn handle_opened_document_paths(app_handle: &tauri::AppHandle, paths: Vec<String>) {
  if paths.is_empty() {
    return;
  }
  let recipient = visible_workspace_open_recipient_label(app_handle);
  if recipient.is_some() {
    DOCUMENT_OPEN_LAUNCH.store(true, Ordering::Release);
    allow_read_paths(&paths);
  } else {
    remember_open_paths(&paths);
  }
  // Documents need a workspace editor, not the startup chooser. Only create a
  // workspace when none exists; a warm Open With event is delivered to one
  // frontend, which decides whether its current document is pristine enough to
  // replace or whether it must open a separate document window.
  if recipient.is_none() {
    ensure_workspace_window(app_handle);
  }
  dismiss_startup_window(app_handle);
  // Warm start: deliver to exactly one workspace. Broadcasting to every
  // WebView made each open construct replace or duplicate itself in all windows.
  if let Some(label) = recipient {
    let _ = app_handle.emit_to(label, "opened-files", paths);
    DOCUMENT_OPEN_LAUNCH.store(false, Ordering::Release);
  }
}

#[cfg(target_os = "windows")]
fn remove_legacy_service_worker() {
  let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") else {
    return;
  };
  // Remove only WebView2's old service-worker store, preserving IndexedDB,
  // local storage, projects, and preferences on the existing app origin.
  let service_worker = PathBuf::from(local_app_data)
    .join("com.example.vibegene")
    .join("EBWebView")
    .join("Default")
    .join("Service Worker");
  let _ = std::fs::remove_dir_all(service_worker);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(target_os = "windows")]
  remove_legacy_service_worker();

  tauri::Builder::default()
    .on_window_event(|window, event| {
      #[cfg(target_os = "macos")]
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        // Keep the WKWebView alive before macOS can deliver a queued WebKit
        // inset callback into a disposed page proxy.
        api.prevent_close();
        trace_lifecycle(window.app_handle(), "close-requested", serde_json::json!({ "label": window.label() }));
        let _ = window.app_handle().emit_to(window.label(), "vg-native-window-close-requested", ());
      }
    })
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .invoke_handler(tauri::generate_handler![
      take_pending_open_paths,
      document_open_launch_active,
      register_user_file_paths,
      read_user_file,
      download_remote_file,
      acquire_exit_sync_lock,
      refresh_exit_sync_lock,
      release_exit_sync_lock,
      exit_sync_revision,
      mark_exit_sync_complete,
      quit_app,
      desktop_update_info,
      update_install_in_progress,
      begin_user_window_open,
      end_user_window_open,
      begin_update_install,
      cancel_update_install,
      restart_after_update,
      hide_desktop_window,
      record_folder_sync_diagnostic,
      authorize_folder_sync,
      ncbi_blast_request
    ])
    .setup(|app| {
      // An unconfigured build must never trust a development key. Release
      // builds opt in by embedding a public key at compile time.
      if let Some(key) = option_env!("VIBEGENE_UPDATER_PUBLIC_KEY").filter(|key| !key.trim().is_empty()) {
        app.handle().plugin(tauri_plugin_updater::Builder::new().pubkey(key).build())?;
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Windows / Linux Open With usually passes the path on argv before Ready.
      let argv_paths = argv_document_paths();
      if !argv_paths.is_empty() {
        remember_open_paths(&argv_paths);
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      match event {
        tauri::RunEvent::Ready => {
          bootstrap_initial_window(app_handle);
        }
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        tauri::RunEvent::Opened { urls } => {
          let paths: Vec<String> = urls
            .into_iter()
            .filter_map(|url| url.to_file_path().ok())
            .map(|path| path.to_string_lossy().into_owned())
            .collect();
          handle_opened_document_paths(app_handle, paths);
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { has_visible_windows, .. } => {
          // Dock / app switcher activation with no open constructs → startup chooser.
          if !has_visible_windows {
            ensure_startup_window(app_handle);
          }
        }
        tauri::RunEvent::ExitRequested { api, code, .. } => {
          let allow_next_exit = ALLOW_NEXT_EXIT.swap(false, Ordering::AcqRel);
          if allow_next_exit { return; }
          if code.is_some() {
            // Native Quit paths are held until a frontend coordinator finishes
            // its database flush. Prefer an editor, then Database/startup-only.
            api.prevent_exit();
            let mut labels: Vec<String> = app_handle.webview_windows().keys().cloned().collect();
            labels.sort_by_key(|label| {
              if label == "main" { 0 }
              else if label.starts_with("workspace-") { 1 }
              else if label == "hybrid-database" { 2 }
              else if label == "hybrid-startup" { 3 }
              else { 4 }
            });
            if let Some(label) = labels.first() {
              let _ = app_handle.emit_to(label, "vg-native-exit-requested", ());
            }
            return;
          }
          // Window-close triggered exits have no code:
          // On macOS Tauri turns the final window close into an application
          // exit. Preventing that exit alone leaves the final window visible.
          // Hide native windows here (outside WebKit's JS close callback),
          // then retain the process so Dock activation can reopen Startup.
          if cfg!(target_os = "macos") && code.is_none() {
            for window in app_handle.webview_windows().values() {
              if window.is_visible().unwrap_or(false) {
                let _ = window.hide();
              }
            }
            api.prevent_exit();
            return;
          }
          // Other platforms only block while any webview is still open.
          if should_prevent_unrequested_exit(
            false,
            code.is_some(),
            allow_next_exit,
            !app_handle.webview_windows().is_empty(),
          ) {
            api.prevent_exit();
          }
        }
        _ => {}
      }
    });
}

#[cfg(test)]
mod lifecycle_policy_tests {
  use super::{acquire_update_install, acquire_window_open, should_prevent_unrequested_exit, supports_self_update, workspace_open_recipient_label};

  #[test]
  fn update_and_window_open_gate_cannot_overlap() {
    let mut gate = (false, 0);
    assert!(acquire_window_open(&mut gate).is_ok());
    assert!(acquire_update_install(&mut gate).is_err());
    gate.1 -= 1;
    assert!(acquire_update_install(&mut gate).is_ok());
    assert!(acquire_window_open(&mut gate).is_err());
    assert!(acquire_update_install(&mut gate).is_err());
  }

  #[test]
  fn update_installation_is_limited_to_supported_package_types() {
    assert!(supports_self_update("macos", false, None));
    assert!(supports_self_update("linux", true, None));
    assert!(!supports_self_update("linux", false, None));
    assert!(supports_self_update("windows", false, Some("installer")));
    assert!(!supports_self_update("windows", false, None));
    assert!(!supports_self_update("windows", false, Some("portable")));
    assert!(!supports_self_update("other", false, None));
  }

  #[test]
  fn warm_document_open_selects_only_one_workspace_and_prefers_main() {
    assert_eq!(
      workspace_open_recipient_label(vec![
        "workspace-b".to_string(),
        "hybrid-database".to_string(),
        "main".to_string(),
        "workspace-a".to_string(),
      ]),
      Some("main".to_string()),
    );
    assert_eq!(
      workspace_open_recipient_label(vec!["hybrid-database".to_string(), "workspace-a".to_string()]),
      Some("workspace-a".to_string()),
    );
    assert_eq!(workspace_open_recipient_label(vec!["hybrid-database".to_string()]), None);
  }

  #[test]
  fn macos_window_close_keeps_the_application_process_alive() {
    assert!(should_prevent_unrequested_exit(true, false, false, false));
    assert!(!should_prevent_unrequested_exit(true, true, false, false));
    assert!(!should_prevent_unrequested_exit(true, false, true, false));
    assert!(!should_prevent_unrequested_exit(false, false, false, false));
    assert!(should_prevent_unrequested_exit(false, false, false, true));
  }
}

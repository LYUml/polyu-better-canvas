#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod ai;
mod canvas;
mod core;
mod materials;
mod native;
use core::*;
use serde_json::{json, Value};
use std::{
    fs,
    path::PathBuf,
    sync::{atomic::Ordering, Arc},
    time::Duration,
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
#[tauri::command]
async fn dispatch(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Core>>,
    action: String,
    input: Value,
) -> Result<Value> {
    let core = state.inner().clone();
    match action.as_str() {
        "state" => {
            let settings = core.settings()?;
            let workspace = core.workspace()?;
            let jobs = core.job.lock().unwrap().clone();
            Ok(
                json!({"settings":settings,"workspace":workspace,"workspaces":core.list("workspace")?,"files":core.scoped("file")?.into_iter().filter(|f|f["available"]==true).collect::<Vec<_>>(),"tasks":core.scoped("task")?,"findings":core.scoped("finding")?,"courses":core.scoped("course")?,"job":jobs,"version":env!("CARGO_PKG_VERSION")}),
            )
        }
        "file_icon" => {
            let file = core.file(&s(&input, "id"))?;
            let path = core.file_path(&file)?;
            native::helper(
                &app,
                &core,
                "NativeBridge",
                json!({"version":1,"operation":"file-icon","path":path}),
            )
            .await
        }
        "default_folder" => {
            let mut ws = core.workspace()?;
            fs::create_dir_all(s(&ws, "root")).map_err(err)?;
            ws["configured"] = json!(true);
            core.put("workspace", &ws)?;
            core.scan()
        }
        "choose_folder" => {
            if core.job.lock().unwrap()["running"] == true {
                return Err("Cannot change the folder during syncing".into());
            }
            let picker_app = app.clone();
            let selected = tauri::async_runtime::spawn_blocking(move || {
                picker_app
                    .dialog()
                    .file()
                    .set_title("Choose a course library folder")
                    .blocking_pick_folder()
            })
            .await
            .map_err(err)?;
            let Some(selected) = selected else {
                return Ok(json!({"cancelled":true}));
            };
            let selected = selected
                .into_path()
                .map_err(|_| "Invalid folder path".to_string())?;
            let root = selected.canonicalize().map_err(err)?;
            if root == PathBuf::from("/") || Some(root.clone()) == app.path().home_dir().ok() {
                return Err("Choose a dedicated library folder".into());
            }
            canvas::stop(&core);
            let mut ws = core.workspace()?;
            if s(&ws, "root") != root.to_string_lossy() {
                for file in core.scoped("file")? {
                    if file["demo"] != true {
                        core.remove("file", &s(&file, "id"))?
                    }
                }
            }
            ws["root"] = json!(root);
            ws["configured"] = json!(true);
            core.put("workspace", &ws)?;
            core.scan()
        }
        "scan" => {
            let c = core.clone();
            tauri::async_runtime::spawn_blocking(move || c.scan())
                .await
                .map_err(err)?
        }
        "connect" => {
            canvas::stop(&core);
            let generation = core.generation.load(Ordering::SeqCst);
            let login = native::helper(
                &app,
                &core,
                "NativeBridge",
                json!({"version":1,"operation":"login"}),
            )
            .await?;
            core.check(generation)?;
            if login["cancelled"] == true {
                return Ok(login);
            }
            let user = &login["user"];
            let uid = s(user, "id");
            if uid.is_empty() || !uid.chars().all(|c| c.is_ascii_digit()) {
                return Err("Canvas identity could not be verified".into());
            }
            canvas::verify(&core, generation, &login).await?;
            core.check(generation)?;
            let old = core.workspace()?;
            let wsid = format!("canvas-{uid}");
            let existing = core
                .list("workspace")?
                .into_iter()
                .find(|w| s(&w["user"], "id") == uid);
            let mut ws = if let Some(ws) = existing {
                ws
            } else if old["user"].is_null() {
                let mut ws = old;
                ws["user"] = user.clone();
                ws
            } else {
                let root = app
                    .path()
                    .document_dir()
                    .map_err(err)?
                    .join("PolyU Better Canvas")
                    .join(&wsid);
                fs::create_dir_all(&root).map_err(err)?;
                json!({"id":wsid,"name":s(user,"name"),"root":root,"configured":true,"user":user})
            };
            native::key(
                &app,
                &core,
                "set",
                &format!("canvas-{uid}"),
                &login.to_string(),
            )
            .await?;
            if core.check(generation).is_err() {
                let _ = native::key(&app, &core, "delete", &format!("canvas-{uid}"), "").await;
                return Err("Sign-in was cancelled".into());
            }
            ws["user"] = user.clone();
            ws["connected"] = json!(true);
            ws["name"] = json!(format!("{}'s workspace", s(user, "name")));
            core.put("workspace", &ws)?;
            let mut settings = core.settings()?;
            settings["active"] = ws["id"].clone();
            core.put("settings", &settings)?;
            Ok(json!({"ok":true}))
        }
        "logout" => {
            canvas::stop(&core);
            let mut ws = core.workspace()?;
            let uid = s(&ws["user"], "id");
            if !uid.is_empty() {
                native::key(&app, &core, "delete", &format!("canvas-{uid}"), "").await?;
            }
            ws["connected"] = json!(false);
            core.put("workspace", &ws)?;
            let cache = core.data.join("cache").join(core.active()?);
            if cache.exists() {
                fs::remove_dir_all(cache).map_err(err)?
            }
            Ok(json!({"ok":true}))
        }
        "switch_workspace" => {
            canvas::stop(&core);
            let id = s(&input, "id");
            if core.get("workspace", &id)?.is_none() {
                return Err("Workspace not found".into());
            }
            let mut settings = core.settings()?;
            settings["active"] = json!(id);
            core.put("settings", &settings)
        }
        "sync" => {
            start_sync(app.clone(), core.clone(), input["restore"] == true)?;
            Ok(json!({"ok":true}))
        }
        "cancel" => {
            canvas::stop(&core);
            Ok(json!({"ok":true}))
        }
        "settings" => {
            let mut settings = core.settings()?;
            for field in ["provider", "endpoint", "model"] {
                if let Some(v) = input.get(field) {
                    settings[field] = v.clone()
                }
            }
            if !["compatible", "anthropic", "ollama"].contains(&s(&settings, "provider").as_str()) {
                return Err("Invalid provider".into());
            }
            let endpoint = reqwest::Url::parse(&s(&settings, "endpoint"))
                .map_err(|_| "Invalid AI endpoint".to_string())?;
            if endpoint.scheme() != "https"
                && !(endpoint.scheme() == "http"
                    && [Some("127.0.0.1"), Some("localhost"), Some("[::1]")]
                        .contains(&endpoint.host_str()))
            {
                return Err("Remote AI endpoints require HTTPS".into());
            }
            let key = s(&input, "apiKey");
            if input["clearKey"] == true {
                native::key(&app, &core, "delete", "ai-key", "").await?;
                settings["hasKey"] = json!(false)
            } else if !key.trim().is_empty() {
                native::key(&app, &core, "set", "ai-key", key.trim()).await?;
                settings["hasKey"] = json!(true)
            }
            core.put("settings", &settings)
        }
        "read_file" => {
            let file = core.file(&s(&input, "id"))?;
            native::read(&app, &core, &file).await
        }
        "open_file" | "reveal_file" => {
            let file = core.file(&s(&input, "id"))?;
            let path = core.file_path(&file)?;
            let mut cmd = std::process::Command::new("/usr/bin/open");
            if action == "reveal_file" {
                cmd.arg("-R");
            }
            cmd.arg(path).spawn().map_err(err)?;
            Ok(json!({"ok":true}))
        }
        "category" => {
            let mut file = core.file(&s(&input, "id"))?;
            let category = s(&input, "category");
            let category = materials::normalize_category(&category);
            if !category.is_empty() && !materials::TYPES.contains(&category) {
                return Err("Unsupported material type".into());
            }
            file["category"] = json!(category);
            file["suggestedName"] = json!(s(&input, "suggestedName")
                .chars()
                .take(200)
                .collect::<String>());
            core.put("file", &file)
        }
        "analyze" => ai::analyze(&app, &core, &input).await,
        "task_save" => {
            let id = s(&input, "id");
            let old = if id.is_empty() {
                None
            } else {
                let t = core.get("task", &id)?.ok_or("Task not found")?;
                if s(&t, "workspace") != core.active()? {
                    return Err("Task is not in the current workspace".into());
                }
                Some(t)
            };
            core.task(&input, old)
        }
        "task_delete" => {
            let task = core
                .get("task", &s(&input, "id"))?
                .ok_or("Task not found")?;
            if s(&task, "workspace") != core.active()? {
                return Err("Task is not in the current workspace".into());
            }
            core.remove("task", &s(&task, "id"))?;
            Ok(json!({"ok":true}))
        }
        "finding_accept" | "finding_dismiss" => {
            let mut finding = core
                .get("finding", &s(&input, "id"))?
                .ok_or("Suggestion not found")?;
            if s(&finding, "workspace") != core.active()? {
                return Err("Suggestion is not in the current workspace".into());
            }
            if finding["status"] != "pending" {
                return Ok(json!({"ok":true}));
            }
            if action == "finding_dismiss" {
                finding["status"] = json!("dismissed");
                core.put("finding", &finding)
            } else {
                let mut task = finding.clone();
                task["id"] = json!(format!("finding-{}", s(&finding, "id")));
                task["source"] = json!({"filename":finding["filename"],"fileId":finding["fileId"],"page":finding["page"],"excerpt":finding["excerpt"],"method":finding["method"],"url":finding["url"]});
                task["completed"] = json!(false);
                core.task(&input, Some(task))?;
                finding["status"] = json!("accepted");
                core.put("finding", &finding)
            }
        }
        "export" => {
            let content = calendar(&core.scoped("task")?)?;
            let picker_app = app.clone();
            let selected = tauri::async_runtime::spawn_blocking(move || {
                picker_app
                    .dialog()
                    .file()
                    .set_title("Export study calendar")
                    .set_file_name("polyu-better-canvas.ics")
                    .add_filter("iCalendar", &["ics"])
                    .blocking_save_file()
            })
            .await
            .map_err(err)?;
            let Some(selected) = selected else {
                return Ok(json!({"cancelled":true}));
            };
            let selected = selected
                .into_path()
                .map_err(|_| "Invalid export path".to_string())?;
            fs::write(selected, content).map_err(err)?;
            Ok(json!({"ok":true}))
        }
        "clear_cache" => {
            let path = core.data.join("cache").join(core.active()?);
            if path.exists() {
                fs::remove_dir_all(path).map_err(err)?
            }
            Ok(json!({"ok":true}))
        }
        "demo" => {
            let root = core.data.join("demo");
            fs::create_dir_all(&root).map_err(err)?;
            let today = chrono::Utc::now() + chrono::Duration::hours(8);
            let due = (today + chrono::Duration::days(3))
                .format("%Y-%m-%d")
                .to_string();
            let exam = (today + chrono::Duration::days(9))
                .format("%Y-%m-%d")
                .to_string();
            let text=format!("# Synthetic demo course · Human–Computer Interaction\nThis is not a real course document.\nAssignment 1 — Interface critique — Due {due} 23:59\nMidterm exam — {exam} 14:00\nFinal project — Week 7 (date to be announced)\n");
            fs::write(root.join("Demo syllabus.md"), &text).map_err(err)?;
            let id = format!("demo-{}", core.active()?);
            core.put("file",&json!({"id":id,"workspace":core.active()?,"relative":"Demo syllabus.md","name":"Demo syllabus.md","course":"Demo · Human–Computer Interaction","ext":"md","size":text.len(),"hash":hash(text.as_bytes()),"available":true,"demo":true,"category":"Overview"}))?;
            let id = format!("demo-task-{}", core.active()?);
            if core.get("task", &id)?.is_none() {
                core.task(&json!({"title":"Draft the interface critique","date":due,"kind":"assignment","course":"Demo · Human–Computer Interaction"}),Some(json!({"id":id,"workspace":core.active()?,"demo":true,"completed":false})))?;
            }
            Ok(json!({"ok":true}))
        }
        "clear_demo" => {
            for kind in ["file", "task", "finding"] {
                for v in core.scoped(kind)? {
                    if v["demo"] == true {
                        core.remove(kind, &s(&v, "id"))?
                    }
                }
            }
            Ok(json!({"ok":true}))
        }
        _ => Err("Unknown operation".into()),
    }
}
fn start_sync(app: tauri::AppHandle, core: Arc<Core>, restore: bool) -> Result<()> {
    if core.workspace()?["connected"] != true {
        return Err("Connect Canvas first".into());
    }
    {
        let mut job = core.job.lock().unwrap();
        if job["running"] == true {
            return Err("A sync is already running".into());
        }
        *job = json!({"running":true,"stage":"Starting sync","downloaded":0,"failed":0,"skipped":0,"error":""});
    }
    let generation = core.generation.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        let result = canvas::run(app.clone(), core.clone(), generation, restore).await;
        if core.check(generation).is_ok() {
            let mut job = core.job.lock().unwrap();
            job["running"] = json!(false);
            job["lastFinished"] = json!(chrono::Utc::now().to_rfc3339());
            if let Err(e) = result {
                job["stage"] = json!("Sync did not finish");
                job["error"] = json!(e)
            }
            let _ = app.emit("workspace-progress", job.clone());
        }
    });
    Ok(())
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data = if let Some(v) = std::env::var_os("POLYU_TEST_DATA_DIR") {
                PathBuf::from(v)
            } else {
                app.path().app_data_dir()?
            };
            let default = if std::env::var_os("POLYU_TEST_DATA_DIR").is_some() {
                data.join("library")
            } else {
                app.path()
                    .document_dir()?
                    .join("PolyU Better Canvas")
                    .join("Local")
            };
            let core = Arc::new(Core::new(data, default).map_err(std::io::Error::other)?);
            let handle = app.handle().clone();
            app.manage(core.clone());
            let scan_core = core.clone();
            let scan_app = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                if scan_core
                    .workspace()
                    .map(|w| w["configured"] == true)
                    .unwrap_or(false)
                {
                    let _ = scan_core.scan();
                    let _ = scan_app.emit("workspace-updated", ());
                }
            });
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(3600)).await;
                    if core
                        .workspace()
                        .map(|w| w["connected"] == true)
                        .unwrap_or(false)
                    {
                        let _ = start_sync(handle.clone(), core.clone(), false);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![dispatch])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let core = window.state::<Arc<Core>>();
                canvas::stop(&core);
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("Unable to start PolyU Better Canvas");
}

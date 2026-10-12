use crate::core::*;
use serde_json::{json, Value};
use std::{process::Stdio, sync::Arc, time::Duration};
use tauri::Manager;
use tokio::{io::AsyncWriteExt, process::Command};
struct TrackedPid {
    core: Arc<Core>,
    pid: u32,
}
impl Drop for TrackedPid {
    fn drop(&mut self) {
        self.core.pids.lock().unwrap().retain(|p| *p != self.pid);
    }
}
pub async fn helper(
    app: &tauri::AppHandle,
    core: &Arc<Core>,
    name: &str,
    request: Value,
) -> Result<Value> {
    let relative = if name == "NativeBridge" {
        "NativeBridge.app/Contents/MacOS/NativeBridge"
    } else {
        name
    };
    let resource = app
        .path()
        .resource_dir()
        .map_err(err)?
        .join("resources")
        .join(relative);
    let executable = resource;
    #[cfg(debug_assertions)]
    let executable = if executable.exists() {
        executable
    } else {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(relative)
    };
    let mut child = Command::new(executable)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| "Cannot start the native helper. Reinstall the app.".to_string())?;
    let pid = child.id().unwrap_or(0);
    core.pids.lock().unwrap().push(pid);
    let _tracked = TrackedPid {
        core: core.clone(),
        pid,
    };
    let mut stdin = child.stdin.take().ok_or("Native communication failed")?;
    stdin
        .write_all(request.to_string().as_bytes())
        .await
        .map_err(err)?;
    drop(stdin);
    let output = tokio::time::timeout(
        Duration::from_secs(if name == "DocumentReader" { 300 } else { 900 }),
        child.wait_with_output(),
    )
    .await
    .map_err(|_| "Native operation timed out".to_string())?
    .map_err(err)?;

    let value: Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| "Native helper returned an invalid response".to_string())?;
    if value["version"] != 1 {
        return Err("Native protocol version mismatch".into());
    }
    if let Some(message) = value["error"].as_str() {
        return Err(message.into());
    }
    if !output.status.success() {
        return Err("Native operation did not finish".into());
    }
    Ok(value)
}
pub async fn key(
    app: &tauri::AppHandle,
    core: &Arc<Core>,
    op: &str,
    account: &str,
    value: &str,
) -> Result<String> {
    let result = helper(
        app,
        core,
        "NativeBridge",
        json!({"version":1,"operation":format!("key-{op}"),"account":account,"value":value}),
    )
    .await?;
    Ok(s(&result, "value"))
}
pub async fn read(app: &tauri::AppHandle, core: &Arc<Core>, file: &Value) -> Result<Value> {
    let path = core.file_path(file)?;
    let ext = s(file, "ext");
    let cache = core.data.join("cache").join(s(file, "workspace"));
    std::fs::create_dir_all(&cache).map_err(err)?;
    let cachefile = cache.join(format!("{}-reader2.json", s(file, "hash")));
    if cachefile.exists() {
        let bytes = std::fs::read(&cachefile).map_err(err)?;
        return serde_json::from_slice(&bytes).map_err(err);
    }
    let result = if ext == "pdf" {
        let mut result = helper(
            app,
            core,
            "DocumentReader",
            json!({"version":1,"path":path,"textOnly":false}),
        )
        .await?;
        if let Some(pages) = result["pages"].as_array_mut() {
            for page in pages {
                let base = s(page, "text");
                let ocr = page["ocrRows"]
                    .as_array()
                    .map(|r| {
                        r.iter()
                            .filter_map(Value::as_str)
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
                    .unwrap_or_default();
                if base.trim().is_empty() {
                    page["text"] = json!(ocr)
                } else if !ocr.is_empty() {
                    page["text"] = json!(format!("{}\n\n[OCR]\n{}", base, ocr))
                }
            }
        }
        result
    } else if ["txt", "md", "html", "htm"].contains(&ext.as_str()) {
        let bytes = std::fs::read(path).map_err(err)?;
        if bytes.len() > 4 * 1024 * 1024 {
            return Err("Text exceeds 4 MB. Split it before analysis.".into());
        }
        let raw = String::from_utf8_lossy(&bytes).to_string();
        let text = if ext == "html" || ext == "htm" {
            crate::canvas::html_text(&raw)
        } else {
            raw
        };
        json!({"version":1,"pages":[{"page":1,"text":text,"method":"Local text"}]})
    } else {
        return Err(
            "Supports PDF, TXT, Markdown and HTML. Convert Office documents to PDF first.".into(),
        );
    };
    std::fs::write(cachefile, result.to_string()).map_err(err)?;
    Ok(result)
}

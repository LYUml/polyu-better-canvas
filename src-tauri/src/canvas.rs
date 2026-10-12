// Rust port of course/web discovery and isolated Canvas transport patterns from
// Andre-HUANG/polyu-study-console (author permission recorded in NOTICE.md).
use crate::{core::*, native};
use regex::Regex;
use reqwest::{Client, Url};
use scraper::{Html, Selector};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::Arc,
    time::Duration,
};
use tauri::Emitter;
const BASE: &str = "https://canvas.polyu.edu.hk";
pub fn html_text(html: &str) -> String {
    let unsafe_content =
        Regex::new(r"(?is)<(?:script|style|noscript)\b[^>]*>.*?</(?:script|style|noscript)>")
            .unwrap();
    let clean = unsafe_content.replace_all(html, "");
    let document = Html::parse_document(&clean);
    let selector =
        Selector::parse(".user_content, #wiki_page_show, #course_syllabus, main, #content, body")
            .unwrap();
    let root = document
        .select(&selector)
        .next()
        .unwrap_or(document.root_element());
    root.text()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}
pub fn links(html: &str) -> Vec<(String, String)> {
    let doc = Html::parse_document(html);
    let sel = Selector::parse("a[href]").unwrap();
    doc.select(&sel)
        .filter_map(|a| {
            Some((
                a.value().attr("href")?.to_string(),
                a.text().collect::<Vec<_>>().join(" ").trim().to_string(),
            ))
        })
        .collect()
}
fn allowed(url: &Url) -> bool {
    let host = url.host_str().unwrap_or("");
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && (host == "canvas.polyu.edu.hk"
            || [
                "instructure.com",
                "instructuremedia.com",
                "canvas-user-content.com",
                "inscloudgate.net",
                "amazonaws.com",
                "cloudfront.net",
            ]
            .iter()
            .any(|d| host == *d || host.ends_with(&format!(".{d}"))))
}
fn cookie_header(cookies: &Value, url: &Url) -> String {
    if url.host_str() != Some("canvas.polyu.edu.hk") {
        return String::new();
    }
    cookies
        .as_array()
        .map(|rows| {
            rows.iter()
                .filter(|c| {
                    c["expires"].as_f64().unwrap_or(-1.0) < 0.0
                        || c["expires"].as_f64().unwrap_or(0.0)
                            > chrono::Utc::now().timestamp() as f64
                })
                .filter(|c| url.path().starts_with(&s(c, "path")))
                .filter_map(|c| {
                    let n = s(c, "name");
                    let v = s(c, "value");
                    if n.is_empty()
                        || n.contains(['\r', '\n', ';'])
                        || v.contains(['\r', '\n', ';'])
                    {
                        None
                    } else {
                        Some(format!("{n}={v}"))
                    }
                })
                .collect::<Vec<_>>()
                .join("; ")
        })
        .unwrap_or_default()
}
struct Transport {
    client: Client,
    cookies: Value,
}
impl Transport {
    async fn get(&self, url: &str, core: &Core, g: u64) -> Result<reqwest::Response> {
        let mut url = Url::parse(url).map_err(err)?;
        for _ in 0..10 {
            core.check(g)?;
            if !allowed(&url) {
                return Err("Download host is not supported. Request stopped.".into());
            }
            let mut response = None;
            for attempt in 0..3 {
                core.check(g)?;
                let cookie = cookie_header(&self.cookies, &url);
                let mut request = self.client.get(url.clone()).header(
                    "Accept",
                    if url.path().starts_with("/api/v1/") {
                        "application/json"
                    } else {
                        "*/*"
                    },
                );
                if !cookie.is_empty() {
                    request = request.header("Cookie", cookie)
                }
                match request.send().await {
                    Ok(r) => {
                        if (r.status().as_u16() == 429 || r.status().is_server_error())
                            && attempt < 2
                        {
                            let delay = r
                                .headers()
                                .get("retry-after")
                                .and_then(|v| v.to_str().ok())
                                .and_then(|s| s.parse::<u64>().ok())
                                .unwrap_or(1 << attempt)
                                .min(30);
                            tokio::time::sleep(Duration::from_secs(delay)).await;
                            continue;
                        }
                        response = Some(r);
                        break;
                    }
                    Err(_) => {
                        if attempt == 2 {
                            return Err("Canvas request failed or timed out".into());
                        }
                        tokio::time::sleep(Duration::from_secs(1 << attempt)).await;
                    }
                }
            }
            let r = response.ok_or("Request did not finish")?;
            if r.status().is_redirection() {
                let location = r
                    .headers()
                    .get("location")
                    .and_then(|v| v.to_str().ok())
                    .ok_or("Invalid redirect")?;
                url = url.join(location).map_err(err)?;
                continue;
            }
            if r.status().as_u16() == 401 {
                return Err("Session expired. Reconnect Canvas.".into());
            }
            if !r.status().is_success() {
                return Err(format!("Canvas HTTP {}", r.status().as_u16()));
            }
            return Ok(r);
        }
        Err("Too many redirects".into())
    }
    async fn pages(&self, url: &str, core: &Core, g: u64) -> Result<Vec<Value>> {
        let mut url = url.to_string();
        let mut rows = vec![];
        let mut seen = HashSet::new();
        for _ in 0..100 {
            if !seen.insert(url.clone()) {
                return Err("Canvas pagination loop".into());
            }
            let r = self.get(&url, core, g).await?;
            let next = r
                .headers()
                .get("link")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| {
                    s.split(',')
                        .find(|x| x.contains("rel=\"next\""))
                        .and_then(|s| s.split('<').nth(1))
                        .and_then(|s| s.split('>').next())
                })
                .map(str::to_string);
            let data: Value = r
                .json()
                .await
                .map_err(|_| "Canvas returned an unreadable response".to_string())?;
            let items = data.as_array().ok_or("Canvas response is not a list")?;
            rows.extend(items.clone());
            match next {
                Some(next) => {
                    if Url::parse(&next).map_err(err)?.host_str() != Some("canvas.polyu.edu.hk") {
                        return Err("Pagination URL is outside Canvas".into());
                    }
                    url = next
                }
                None => return Ok(rows),
            }
        }
        Err("Course pagination limit exceeded".into())
    }
}
pub async fn verify(core: &Core, g: u64, login: &Value) -> Result<()> {
    let t = Transport {
        client: http_client(Duration::from_secs(25))?,
        cookies: login["cookies"].clone(),
    };
    let expected = s(&login["user"], "id");
    if let Ok(response) = t.get(&format!("{BASE}/api/v1/users/self"), core, g).await {
        if let Ok(user) = response.json::<Value>().await {
            if value_id(&user["id"]) == expected {
                return Ok(());
            }
            return Err("Canvas identity does not match the sign-in window".into());
        }
    }
    core.check(g)?;
    let response = t.get(BASE, core, g).await?;
    let html = response
        .text()
        .await
        .map_err(|_| "Cannot verify Canvas identity".to_string())?;
    let re = Regex::new(r#""current_user_id"\s*:\s*"?(\d+)"#).unwrap();
    if html.contains("global_nav_dashboard_link")
        && re
            .captures(&html)
            .map(|m| m[1].to_string() == expected)
            .unwrap_or(false)
    {
        Ok(())
    } else {
        Err("School Canvas sign-in was not verified. Sign in again.".into())
    }
}
pub fn progress(app: &tauri::AppHandle, core: &Core, stage: &str) {
    let mut job = core.job.lock().unwrap();
    job["stage"] = json!(stage);
    let _ = app.emit("workspace-progress", job.clone());
}
pub async fn run(app: tauri::AppHandle, core: Arc<Core>, g: u64, restore: bool) -> Result<()> {
    let workspace = core.workspace()?;
    let wid = s(&workspace, "id");
    let account = format!("canvas-{}", s(&workspace["user"], "id"));
    let raw = native::key(&app, &core, "get", &account, "").await?;
    if raw.is_empty() {
        return Err("Connect Canvas first".into());
    }
    let session: Value = serde_json::from_str(&raw)
        .map_err(|_| "Cannot read the session. Sign in again.".to_string())?;
    let t = Transport {
        client: http_client(Duration::from_secs(25))?,
        cookies: session["cookies"].clone(),
    };
    progress(&app, &core, "Reading courses");
    let roster = t
        .pages(
            &format!("{BASE}/api/v1/courses?per_page=100&enrollment_state=active"),
            &core,
            g,
        )
        .await;
    let mut courses = roster.unwrap_or_default();
    if let Ok(r) = t.get(&format!("{BASE}/courses"), &core, g).await {
        if let Ok(html) = r.text().await {
            let re = Regex::new(r"^/courses/(\d+)/?$").unwrap();
            for (href, title) in links(&html) {
                if let Some(m) = re.captures(&href) {
                    let id = m[1].to_string();
                    if !title.is_empty() && !courses.iter().any(|c| value_id(&c["id"]) == id) {
                        courses.push(json!({"id":id,"name":title}))
                    }
                }
            }
        }
    }
    if courses.is_empty() {
        return Err("No courses found. Check your Canvas session and course visibility.".into());
    }
    let root = PathBuf::from(s(&workspace, "root"));
    fs::create_dir_all(&root).map_err(err)?;
    let filere = Regex::new(r"(?:/(?:api/v1/)?files/|Attachment_)(\d+)").unwrap();
    let mut total_fail = 0;
    let mut downloaded = 0;
    let mut skipped = 0;
    for (index, course) in courses.iter().enumerate() {
        core.check(g)?;
        let cid = value_id(&course["id"]);
        let name = s(course, "name");
        if name.is_empty() {
            continue;
        }
        let dirname = format!("{} [{}]", safe_name(&name), cid);
        let course_dir = root.join(&dirname);
        ensure_dir(&root, &course_dir)?;
        core.put(
            "course",
            &json!({"id":format!("{wid}:{cid}"),"workspace":wid,"canvasId":cid,"name":name}),
        )?;
        progress(
            &app,
            &core,
            &format!("Syncing course {}/{} · {}", index + 1, courses.len(), name),
        );
        let mut found: HashMap<String, (String, String)> = HashMap::new();
        let mut visible_downloads: HashMap<String, String> = HashMap::new();
        let mut web_routes = vec![format!("/courses/{cid}/modules")];
        for (route, label) in [
            (
                format!("/api/v1/courses/{cid}/files?per_page=100"),
                "Course files",
            ),
            (
                format!("/api/v1/courses/{cid}/modules?include[]=items&per_page=100"),
                "Modules",
            ),
            (
                format!("/api/v1/courses/{cid}/assignments?per_page=100"),
                "Assignments",
            ),
            (format!("/api/v1/courses/{cid}/pages?per_page=100"), "Pages"),
            (
                format!("/api/v1/announcements?context_codes[]=course_{cid}&per_page=100"),
                "Announcements",
            ),
        ] {
            match t.pages(&format!("{BASE}{route}"), &core, g).await {
                Ok(items) => {
                    for item in items {
                        if label == "Course files" {
                            found.insert(
                                value_id(&item["id"]),
                                (s(&item, "display_name"), label.into()),
                            );
                        }
                        if label == "Modules" {
                            let section = s(&item, "name");
                            let module_items = if let Some(items) = item["items"].as_array() {
                                items.clone()
                            } else {
                                t.pages(
                                    &format!(
                                        "{BASE}/api/v1/courses/{cid}/modules/{}/items?per_page=100",
                                        value_id(&item["id"])
                                    ),
                                    &core,
                                    g,
                                )
                                .await
                                .unwrap_or_else(|_| {
                                    total_fail += 1;
                                    vec![]
                                })
                            };
                            for mi in module_items {
                                if mi["type"] == "File" {
                                    found.insert(
                                        value_id(&mi["content_id"]),
                                        (s(&mi, "title"), section.clone()),
                                    );
                                }
                                if mi["type"] == "Page" {
                                    web_routes.push(format!(
                                        "/courses/{cid}/pages/{}",
                                        s(&mi, "page_url")
                                    ));
                                }
                                discover(&mi.to_string(), &filere, &mut found, &section);
                            }
                        }
                        if label == "Pages" {
                            web_routes.push(format!("/courses/{cid}/pages/{}", s(&item, "url")));
                        }
                        if label == "Assignments" && !item["due_at"].is_null() {
                            if let Some(d) = item["due_at"]
                                .as_str()
                                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                            {
                                let hk = d.with_timezone(
                                    &chrono::FixedOffset::east_opt(8 * 3600).unwrap(),
                                );
                                let fid = hash(
                                    format!("canvas:{wid}:{cid}:{}:{}", value_id(&item["id"]), d)
                                        .as_bytes(),
                                );
                                if core.get("finding", &fid)?.is_none() {
                                    core.check(g)?;
                                    core.put("finding",&json!({"id":fid,"workspace":wid,"title":s(&item,"name"),"date":hk.format("%Y-%m-%d").to_string(),"time":hk.format("%H:%M").to_string(),"kind":"assignment","course":name,"status":"pending","filename":"Canvas Assignments","page":1,"excerpt":format!("Canvas due_at: {}",s(&item,"due_at")),"url":s(&item,"html_url"),"method":"Canvas","reason":"Canvas deadline. Please review.","demo":false}))?;
                                }
                            }
                        }
                        discover(&item.to_string(), &filere, &mut found, label);
                    }
                }
                Err(_) => {
                    total_fail += 1;
                }
            }
        }
        // Read syllabus and visible module/page links when API routes are restricted.
        if let Ok(r) = t
            .get(
                &format!("{BASE}/api/v1/courses/{cid}?include[]=syllabus_body"),
                &core,
                g,
            )
            .await
        {
            if let Ok(v) = r.json::<Value>().await {
                discover(&s(&v, "syllabus_body"), &filere, &mut found, "Syllabus");
            }
        }
        let mut visited = HashSet::new();
        let mut n = 0;
        while let Some(route) = web_routes.pop() {
            if n >= 150 {
                total_fail += 1;
                break;
            }
            if !visited.insert(route.clone()) {
                continue;
            }
            n += 1;
            core.check(g)?;
            match t.get(&format!("{BASE}{route}"), &core, g).await {
                Ok(r) => {
                    if let Ok(html) = r.text().await {
                        discover(&html, &filere, &mut found, "Visible pages");
                        for (href, _) in links(&html) {
                            if let Ok(mut link) = Url::parse(BASE).unwrap().join(&href) {
                                if link.host_str() == Some("canvas.polyu.edu.hk") {
                                    if let Some(m) = filere.captures(link.path()) {
                                        let fileid = m[1].to_string();
                                        if !link.path().ends_with("/download") {
                                            let p = format!("{}/download", link.path());
                                            link.set_path(&p);
                                        }
                                        link.query_pairs_mut().append_pair("download_frd", "1");
                                        visible_downloads.insert(fileid, link.to_string());
                                    }
                                }
                            }
                            let route = href.split('?').next().unwrap_or(&href).to_string();
                            if route.starts_with(&format!("/courses/{cid}/pages/"))
                                && !visited.contains(&route)
                            {
                                web_routes.push(route);
                            }
                        }
                        if route.contains("/pages/") {
                            core.check(g)?;
                            let text = html_text(&html);
                            let dir = course_dir.join("Pages");
                            ensure_dir(&root, &dir)?;
                            let filename = format!(
                                "{}.md",
                                safe_name(route.split('/').next_back().unwrap_or("page"))
                            );
                            let contents = format!("Source: {BASE}{route}\n\n{text}");
                            save_download(
                                &core,
                                &root,
                                &wid,
                                &format!("page:{cid}:{}", hash(route.as_bytes())),
                                &dir.join(filename),
                                &hash(contents.as_bytes()),
                                contents.as_bytes(),
                                restore,
                            )?;
                        }
                    }
                }
                Err(_) => {
                    total_fail += 1;
                }
            }
        }
        for (id, (label, section)) in found {
            if id.is_empty() {
                continue;
            }
            core.check(g)?;
            let meta = match t.get(&format!("{BASE}/api/v1/files/{id}"), &core, g).await {
                Ok(r) => r.json::<Value>().await.unwrap_or(Value::Null),
                Err(_) => Value::Null,
            };
            let name = if !s(&meta, "display_name").is_empty() {
                s(&meta, "display_name")
            } else if !label.is_empty() {
                label
            } else {
                format!("file-{id}")
            };
            let section_dir = course_dir.join(safe_name(&section));
            ensure_dir(&root, &section_dir)?;
            let target = section_dir.join(format!("{id}-{}", safe_name(&name)));
            let stamp = format!("{}:{}", s(&meta, "updated_at"), meta["size"]);
            let download_url = if s(&meta, "url").is_empty() {
                visible_downloads
                    .get(&id)
                    .cloned()
                    .unwrap_or_else(|| format!("{BASE}/files/{id}/download?download_frd=1"))
            } else {
                s(&meta, "url")
            };
            let key = format!("file:{cid}:{id}");
            let mid = format!("{wid}:{key}");
            if let Some(prior) = core
                .get("download", &mid)?
                .filter(|v| s(v, "library") == root.to_string_lossy())
            {
                let p = root.join(s(&prior, "relative"));
                if !p.exists() && !restore {
                    skipped += 1;
                    continue;
                }
                if p.exists()
                    && s(&prior, "stamp") == stamp
                    && fs::read(&p)
                        .map(|b| hash(&b) == s(&prior, "hash"))
                        .unwrap_or(false)
                {
                    skipped += 1;
                    continue;
                }
            }
            match t.get(&download_url, &core, g).await {
                Ok(mut r) => {
                    let too_large = r
                        .content_length()
                        .map(|s| s > 100 * 1024 * 1024)
                        .unwrap_or(false);
                    let html = r
                        .headers()
                        .get("content-type")
                        .and_then(|h| h.to_str().ok())
                        .map(|s| s.contains("text/html"))
                        .unwrap_or(false);
                    if too_large || html {
                        total_fail += 1;
                        continue;
                    }
                    let mut bytes = Vec::new();
                    let mut failed = false;
                    loop {
                        core.check(g)?;
                        match r.chunk().await {
                            Ok(Some(chunk)) => {
                                if bytes.len() + chunk.len() > 100 * 1024 * 1024 {
                                    failed = true;
                                    break;
                                }
                                bytes.extend_from_slice(&chunk);
                            }
                            Ok(None) => break,
                            Err(_) => {
                                failed = true;
                                break;
                            }
                        }
                    }
                    if failed {
                        total_fail += 1;
                    } else {
                        core.check(g)?;
                        save_download(&core, &root, &wid, &key, &target, &stamp, &bytes, restore)?;
                        downloaded += 1;
                    }
                }
                Err(_) => total_fail += 1,
            }
            {
                let mut job = core.job.lock().unwrap();
                job["downloaded"] = json!(downloaded);
                job["skipped"] = json!(skipped);
                job["failed"] = json!(total_fail);
                let _ = app.emit("workspace-progress", job.clone());
            }
        }
    }
    core.check(g)?;
    core.scan()?;
    let mut ws = core.workspace()?;
    ws["lastSync"] = json!(chrono::Utc::now().to_rfc3339());
    core.put("workspace", &ws)?;
    progress(
        &app,
        &core,
        if total_fail > 0 {
            "Sync finished with unreadable sources or files"
        } else {
            "Sync complete"
        },
    );
    Ok(())
}
fn discover(text: &str, re: &Regex, found: &mut HashMap<String, (String, String)>, section: &str) {
    for m in re.captures_iter(text) {
        found
            .entry(m[1].to_string())
            .or_insert((String::new(), section.into()));
    }
}
fn value_id(v: &Value) -> String {
    v.as_str().map(str::to_string).unwrap_or_else(|| {
        if v.is_number() {
            v.to_string()
        } else {
            String::new()
        }
    })
}
pub fn save_download(
    core: &Core,
    root: &std::path::Path,
    wid: &str,
    key: &str,
    target: &std::path::Path,
    stamp: &str,
    bytes: &[u8],
    restore: bool,
) -> Result<String> {
    validate_write(root, target)?;
    let id = format!("{wid}:{key}");
    let prior = core
        .get("download", &id)?
        .filter(|v| s(v, "library") == root.to_string_lossy());
    let mut destination = target.to_path_buf();
    if let Some(prior) = &prior {
        let saved = root.join(s(prior, "relative"));
        if !saved.exists() && !restore {
            return Ok("deleted".into());
        }
        if saved.exists() {
            let unchanged = fs::read(&saved)
                .map(|b| hash(&b) == s(prior, "hash"))
                .unwrap_or(false);
            if unchanged {
                destination = saved;
            } else {
                let stem = target.file_stem().unwrap_or_default().to_string_lossy();
                let ext = target.extension().unwrap_or_default().to_string_lossy();
                destination =
                    target.with_file_name(format!("{stem}.canvas-{}.{}", &hash(bytes)[..10], ext));
            }
        }
    } else if target.exists() {
        destination = target.with_file_name(format!(
            "{}-{}",
            &hash(bytes)[..10],
            target.file_name().unwrap_or_default().to_string_lossy()
        ));
    }
    if destination.exists()
        && fs::read(&destination)
            .map(|b| hash(&b) != hash(bytes))
            .unwrap_or(true)
        && destination != target
    {
        destination = destination.with_file_name(format!(
            "{}-{}",
            uuid::Uuid::new_v4(),
            destination
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
        ));
    }
    let relative = destination
        .strip_prefix(root)
        .map_err(err)?
        .to_string_lossy()
        .to_string();
    validate_write(root, &destination)?;
    let temp = destination.with_extension(format!("{}.part", uuid::Uuid::new_v4()));
    fs::write(&temp, bytes).map_err(err)?;
    fs::rename(&temp, &destination).map_err(err)?;
    core.put("download",&json!({"id":id,"workspace":wid,"relative":relative,"stamp":stamp,"hash":hash(bytes),"canvasKey":key,"library":root}))?;
    Ok(relative)
}
pub fn stop(core: &Core) {
    core.cancel();
    for pid in core.pids.lock().unwrap().drain(..) {
        if pid > 0 {
            let _ = std::process::Command::new("/bin/kill")
                .arg("-TERM")
                .arg(pid.to_string())
                .status();
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cookie_isolation() {
        let cookies = json!([{"name":"a","value":"secret","path":"/","expires":-1}]);
        assert_eq!(
            cookie_header(
                &cookies,
                &Url::parse("https://canvas.polyu.edu.hk/courses").unwrap()
            ),
            "a=secret"
        );
        assert_eq!(
            cookie_header(
                &cookies,
                &Url::parse("https://example.amazonaws.com/x").unwrap()
            ),
            ""
        );
        assert!(!allowed(
            &Url::parse("https://canvas.polyu.edu.hk.evil.com").unwrap()
        ));
    }
    #[test]
    fn preserve_edits() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        let core = Core::new(root.join("data"), root.clone()).unwrap();
        let target = root.join("a.pdf");
        save_download(
            &core,
            &root,
            "local",
            "one",
            &target,
            "v1",
            b"original",
            false,
        )
        .unwrap();
        fs::write(&target, b"my annotation").unwrap();
        let new = save_download(
            &core, &root, "local", "one", &target, "v2", b"updated", false,
        )
        .unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"my annotation");
        assert_eq!(fs::read(root.join(new)).unwrap(), b"updated");
        fs::remove_dir_all(root).unwrap();
    }
}
#[cfg(test)]
mod extra_download_tests {
    use super::*;
    #[test]
    fn local_deletion_requires_restore() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let core = Core::new(dir.join("data"), root.clone()).unwrap();
        let path = root.join("lecture.pdf");
        save_download(
            &core,
            &root,
            "local",
            "one",
            &path,
            "v1",
            b"original",
            false,
        )
        .unwrap();
        fs::remove_file(&path).unwrap();
        assert_eq!(
            save_download(&core, &root, "local", "one", &path, "v2", b"updated", false).unwrap(),
            "deleted"
        );
        assert!(!path.exists());
        save_download(&core, &root, "local", "one", &path, "v2", b"updated", true).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"updated");
        drop(core);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn same_name_preserves_distinct_files() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let core = Core::new(dir.join("data"), root.clone()).unwrap();
        let path = root.join("lecture.pdf");
        save_download(
            &core,
            &root,
            "local",
            "one",
            &path,
            "v1",
            b"course one",
            false,
        )
        .unwrap();
        let second = save_download(
            &core,
            &root,
            "local",
            "two",
            &path,
            "v1",
            b"course two",
            false,
        )
        .unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"course one");
        assert_eq!(fs::read(root.join(second)).unwrap(), b"course two");
        drop(core);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn page_text_excludes_scripts() {
        let text=html_text("<body><main><p>Deadline 2026-11-20</p><script>secret_session_token</script></main></body>");
        assert!(text.contains("Deadline"));
        assert!(!text.contains("secret_session_token"));
    }
}

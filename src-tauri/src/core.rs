use chrono::{NaiveDate, NaiveTime, Utc};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use uuid::Uuid;
pub type Result<T> = std::result::Result<T, String>;
pub struct Core {
    pub db: Mutex<Connection>,
    pub data: PathBuf,
    pub job: Mutex<Value>,
    pub generation: AtomicU64,
    pub pids: Mutex<Vec<u32>>,
}
impl Core {
    pub fn new(data: PathBuf, default: PathBuf) -> Result<Self> {
        fs::create_dir_all(&data).map_err(err)?;
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&data, fs::Permissions::from_mode(0o700)).map_err(err)?;
        }
        let db = Connection::open(data.join("workspace.sqlite")).map_err(err)?;
        db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));").map_err(err)?;
        let c = Self {
            db: Mutex::new(db),
            data,
            job: Mutex::new(
                json!({"running":false,"stage":"尚未同步","downloaded":0,"failed":0,"skipped":0}),
            ),
            generation: AtomicU64::new(0),
            pids: Mutex::new(vec![]),
        };
        if c.get("settings", "main")?.is_none() {
            c.put("settings",&json!({"id":"main","provider":"compatible","endpoint":"https://api.openai.com/v1","model":"","hasKey":false,"active":"local"}))?;
            c.put("workspace",&json!({"id":"local","name":"本地工作区","root":default,"user":null,"connected":false,"configured":false}))?;
        }
        Ok(c)
    }
    pub fn get(&self, kind: &str, id: &str) -> Result<Option<Value>> {
        let db = self.db.lock().unwrap();
        let mut stmt = db
            .prepare("SELECT data FROM records WHERE kind=? AND id=?")
            .map_err(err)?;
        let mut rows = stmt.query(params![kind, id]).map_err(err)?;
        match rows.next().map_err(err)? {
            Some(r) => Ok(Some(
                serde_json::from_str(&r.get::<_, String>(0).map_err(err)?).map_err(err)?,
            )),
            None => Ok(None),
        }
    }
    pub fn list(&self, kind: &str) -> Result<Vec<Value>> {
        let db = self.db.lock().unwrap();
        let mut stmt = db
            .prepare("SELECT data FROM records WHERE kind=? ORDER BY rowid DESC")
            .map_err(err)?;
        let rows = stmt
            .query_map([kind], |r| r.get::<_, String>(0))
            .map_err(err)?;
        rows.map(|r| serde_json::from_str(&r.map_err(err)?).map_err(err))
            .collect()
    }
    pub fn put(&self, kind: &str, value: &Value) -> Result<Value> {
        let id = s(value, "id");
        if id.is_empty() {
            return Err("记录缺少 ID".into());
        }
        self.db.lock().unwrap().execute("INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",params![kind,id,value.to_string()]).map_err(err)?;
        Ok(value.clone())
    }
    pub fn remove(&self, kind: &str, id: &str) -> Result<()> {
        self.db
            .lock()
            .unwrap()
            .execute(
                "DELETE FROM records WHERE kind=? AND id=?",
                params![kind, id],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn settings(&self) -> Result<Value> {
        self.get("settings", "main")?.ok_or("设置缺失".into())
    }
    pub fn workspace(&self) -> Result<Value> {
        self.get("workspace", &s(&self.settings()?, "active"))?
            .ok_or("工作区缺失".into())
    }
    pub fn active(&self) -> Result<String> {
        Ok(s(&self.workspace()?, "id"))
    }
    pub fn scoped(&self, kind: &str) -> Result<Vec<Value>> {
        let id = self.active()?;
        Ok(self
            .list(kind)?
            .into_iter()
            .filter(|v| s(v, "workspace") == id)
            .collect())
    }
    pub fn file(&self, id: &str) -> Result<Value> {
        let v = self.get("file", id)?.ok_or("文件不存在")?;
        if s(&v, "workspace") != self.active()? || v["available"] != true {
            return Err("文件不在当前工作区".into());
        }
        Ok(v)
    }
    pub fn file_path(&self, file: &Value) -> Result<PathBuf> {
        let root = if file["demo"] == true {
            self.data.join("demo")
        } else {
            PathBuf::from(s(
                &self
                    .get("workspace", &s(file, "workspace"))?
                    .ok_or("文件工作区不存在")?,
                "root",
            ))
        };
        contained(&root, &root.join(s(file, "relative")))
    }
    pub fn scan(&self) -> Result<Value> {
        let workspace = self.workspace()?;
        let root = PathBuf::from(s(&workspace, "root"));
        fs::create_dir_all(&root).map_err(err)?;
        let root = root.canonicalize().map_err(err)?;
        let prior = self
            .list("file")?
            .into_iter()
            .filter(|f| f["workspace"] == workspace["id"])
            .collect::<Vec<_>>();
        let mut files = vec![];
        let mut failures = vec![];
        walk(&root, 0, &mut files, &mut failures);
        let mut seen = std::collections::HashSet::new();
        let mut count = 0;
        for path in files {
            let meta = match fs::metadata(&path) {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.len() > 100 * 1024 * 1024 {
                failures.push("有文件超过 100 MB，未索引".into());
                continue;
            }
            let relative = path
                .strip_prefix(&root)
                .map_err(err)?
                .to_string_lossy()
                .to_string();
            let bytes = match fs::read(&path) {
                Ok(b) => b,
                Err(_) => {
                    failures.push("有文件无法读取".into());
                    continue;
                }
            };
            let hash = hash(&bytes);
            let existing = prior
                .iter()
                .find(|v| v["demo"] != true && s(v, "relative") == relative)
                .or_else(|| {
                    prior.iter().find(|v| {
                        v["demo"] != true
                            && s(v, "hash") == hash
                            && !root.join(s(v, "relative")).exists()
                            && !seen.contains(&s(v, "id"))
                    })
                });
            let mut file = existing
                .cloned()
                .unwrap_or(json!({"id":Uuid::new_v4().to_string(),"category":""}));
            file["workspace"] = workspace["id"].clone();
            file["relative"] = json!(relative);
            file["name"] = json!(path.file_name().unwrap_or_default().to_string_lossy());
            file["course"] = json!(relative.split('/').next().unwrap_or("本地资料"));
            file["ext"] = json!(path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase());
            file["size"] = json!(meta.len());
            file["hash"] = json!(hash);
            file["available"] = json!(true);
            file["demo"] = json!(false);
            seen.insert(s(&file, "id"));
            self.put("file", &file)?;
            count += 1;
        }
        for mut f in prior {
            if f["demo"] != true && !seen.contains(&s(&f, "id")) {
                f["available"] = json!(false);
                self.put("file", &f)?;
            }
        }
        let result = json!({"id":workspace["id"],"count":count,"errors":failures,"at":Utc::now().to_rfc3339()});
        self.put("scan", &result)?;
        Ok(result)
    }
    pub fn task(&self, input: &Value, prior: Option<Value>) -> Result<Value> {
        let mut task=prior.unwrap_or(json!({"id":Uuid::new_v4().to_string(),"workspace":self.active()?,"completed":false,"demo":false,"source":null}));
        for key in [
            "title",
            "date",
            "time",
            "kind",
            "course",
            "notes",
            "completed",
        ] {
            if let Some(v) = input.get(key) {
                task[key] = v.clone()
            }
        }
        if s(&task, "title").trim().is_empty() || s(&task, "title").len() > 800 {
            return Err("请填写有效任务标题".into());
        }
        let date = s(&task, "date");
        let time = s(&task, "time");
        if !date.is_empty() && !valid_date(&date) {
            return Err("日期无效".into());
        }
        if !time.is_empty() && (date.is_empty() || !valid_time(&time)) {
            return Err("时间无效或缺少日期".into());
        }
        if !["assignment", "exam", "study", "lecture", "other"].contains(&s(&task, "kind").as_str())
        {
            return Err("任务类型无效".into());
        }
        task["updatedAt"] = json!(Utc::now().to_rfc3339());
        self.put("task", &task)
    }
    pub fn check(&self, g: u64) -> Result<()> {
        if self.generation.load(Ordering::SeqCst) != g {
            Err("已取消".into())
        } else {
            Ok(())
        }
    }
    pub fn cancel(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        let mut job = self.job.lock().unwrap();
        job["running"] = json!(false);
        job["stage"] = json!("已取消，已下载的资料保留");
    }
}
pub fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub fn s(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or("").to_string()
}
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn valid_date(d: &str) -> bool {
    d.len() == 10
        && NaiveDate::parse_from_str(d, "%Y-%m-%d")
            .map(|v| v.format("%Y-%m-%d").to_string() == d)
            .unwrap_or(false)
}
pub fn valid_time(t: &str) -> bool {
    t.len() == 5 && NaiveTime::parse_from_str(t, "%H:%M").is_ok()
}
pub fn safe_name(name: &str) -> String {
    let name: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(150)
        .collect();
    let name = name.trim().trim_end_matches(['.', ' ']);
    if name.is_empty() || name == ".." {
        "unnamed".into()
    } else {
        name.into()
    }
}
pub fn contained(root: &Path, target: &Path) -> Result<PathBuf> {
    let root = root.canonicalize().map_err(err)?;
    let target = target.canonicalize().map_err(err)?;
    if !target.starts_with(&root) || target == root || !target.is_file() {
        return Err("文件路径越出资料库".into());
    }
    Ok(target)
}
fn walk(root: &Path, depth: usize, files: &mut Vec<PathBuf>, errors: &mut Vec<String>) {
    if depth > 16 || files.len() >= 6000 {
        return;
    }
    let entries = match fs::read_dir(root) {
        Ok(v) => v,
        Err(_) => {
            errors.push("有目录不可读".into());
            return;
        }
    };
    for e in entries.flatten() {
        if files.len() >= 6000 {
            errors.push("本次扫描上限 6000 个文件".into());
            return;
        }
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || ["node_modules", "target"].contains(&name.as_str()) {
            continue;
        }
        let ty = match e.file_type() {
            Ok(v) => v,
            Err(_) => continue,
        };
        if ty.is_symlink() {
            continue;
        }
        if ty.is_dir() {
            walk(&e.path(), depth + 1, files, errors)
        } else if ty.is_file() && !name.ends_with(".part") {
            files.push(e.path())
        }
    }
}
fn escape_ics(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('\r', "")
        .replace('\n', "\\n")
        .replace(';', "\\;")
        .replace(',', "\\,")
}
fn fold(s: &str) -> String {
    let mut result = String::new();
    let mut bytes = 0;
    for c in s.chars() {
        if bytes + c.len_utf8() > 75 {
            result.push_str("\r\n ");
            bytes = 1
        }
        result.push(c);
        bytes += c.len_utf8()
    }
    result
}
pub fn calendar(tasks: &[Value]) -> Result<String> {
    let mut lines = vec![
        "BEGIN:VCALENDAR".into(),
        "VERSION:2.0".into(),
        "PRODID:-//PolyU Canvas Localized//Study Workspace//EN".into(),
        "CALSCALE:GREGORIAN".into(),
        "X-WR-CALNAME:PolyU 学习安排".into(),
        "X-WR-TIMEZONE:Asia/Hong_Kong".into(),
    ];
    for task in tasks {
        let date = s(task, "date");
        if task["completed"] == true || date.is_empty() {
            continue;
        }
        if !valid_date(&date) {
            return Err("导出遇到无效日期".into());
        }
        lines.push("BEGIN:VEVENT".into());
        lines.push(format!(
            "UID:{}@polyu-canvas-localized",
            escape_ics(&s(task, "id"))
        ));
        lines.push(format!("DTSTAMP:{}", Utc::now().format("%Y%m%dT%H%M%SZ")));
        let d = NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(err)?;
        let time = s(task, "time");
        if time.is_empty() {
            lines.push(format!("DTSTART;VALUE=DATE:{}", d.format("%Y%m%d")));
            lines.push(format!(
                "DTEND;VALUE=DATE:{}",
                d.succ_opt().ok_or("日期溢出")?.format("%Y%m%d")
            ));
        } else {
            let t = NaiveTime::parse_from_str(&time, "%H:%M").map_err(err)?;
            let utc = d.and_time(t) - chrono::Duration::hours(8);
            lines.push(format!("DTSTART:{}Z", utc.format("%Y%m%dT%H%M%S")));
        }
        lines.push(format!(
            "SUMMARY:{}",
            escape_ics(&format!(
                "{}{}",
                if s(task, "course").is_empty() {
                    String::new()
                } else {
                    format!("[{}] ", s(task, "course"))
                },
                s(task, "title")
            ))
        ));
        let source = &task["source"];
        let desc = format!(
            "{}\n{}",
            s(task, "notes"),
            if source.is_object() {
                format!(
                    "来源：{} 第 {} 页\n{}",
                    s(source, "filename"),
                    source["page"],
                    s(source, "excerpt")
                )
            } else {
                String::new()
            }
        );
        lines.push(format!("DESCRIPTION:{}", escape_ics(&desc)));
        lines.push("END:VEVENT".into());
    }
    lines.push("END:VCALENDAR".into());
    Ok(lines
        .iter()
        .map(|l| fold(l))
        .collect::<Vec<_>>()
        .join("\r\n")
        + "\r\n")
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dates() {
        assert!(valid_date("2026-10-12"));
        assert!(!valid_date("2026-02-30"));
        assert!(!valid_date("2026-1-2"));
        assert!(!valid_time("25:00"));
    }
    #[test]
    fn ics_timezone() {
        let v = calendar(&[
            json!({"id":"abc","title":"考试,测试","date":"2026-10-12","time":"09:00"}),
            json!({"id":"all","title":"作业","date":"2026-10-12"}),
        ])
        .unwrap();
        assert!(v.contains("DTSTART:20261012T010000Z"));
        assert!(v.contains("DTEND;VALUE=DATE:20261013"));
        assert!(v.contains("考试\\,测试"));
    }
    #[test]
    fn fold_unicode() {
        let v = fold(&"学".repeat(90));
        assert!(v.split("\r\n").all(|s| s.len() <= 75));
        assert_eq!(v.replace("\r\n ", ""), "学".repeat(90));
    }
    #[test]
    fn traversal() {
        assert_eq!(safe_name("../../x"), ".._.._x");
    }
}
#[cfg(test)]
mod store_tests {
    use super::*;
    fn fixture() -> (Core, PathBuf) {
        let dir = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let library = dir.join("library");
        fs::create_dir_all(&library).unwrap();
        (Core::new(dir.join("data"), library).unwrap(), dir)
    }
    #[test]
    fn account_isolation() {
        let (c, dir) = fixture();
        c.task(&json!({"title":"local task","kind":"assignment"}), None)
            .unwrap();
        c.put("workspace", &json!({"id":"other","root":dir.join("other")}))
            .unwrap();
        let mut conf = c.settings().unwrap();
        conf["active"] = json!("other");
        c.put("settings", &conf).unwrap();
        assert!(c.scoped("task").unwrap().is_empty());
        assert_eq!(c.list("task").unwrap().len(), 1);
        drop(c);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn tasks_are_idempotent() {
        let (c, dir) = fixture();
        let prior = json!({"id":"stable","workspace":"local","source":{"excerpt":"Original"}});
        c.task(
            &json!({"title":"task","kind":"exam","date":"2026-11-20"}),
            Some(prior.clone()),
        )
        .unwrap();
        c.task(
            &json!({"title":"task","kind":"exam","date":"2026-11-20"}),
            Some(prior),
        )
        .unwrap();
        assert_eq!(c.list("task").unwrap().len(), 1);
        assert_eq!(c.list("task").unwrap()[0]["source"]["excerpt"], "Original");
        drop(c);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn scan_preserves_category_after_move() {
        let (c, dir) = fixture();
        let library = dir.join("library");
        fs::write(library.join("one.md"), "synthetic syllabus").unwrap();
        c.scan().unwrap();
        let mut f = c.scoped("file").unwrap()[0].clone();
        f["category"] = json!("课程大纲");
        c.put("file", &f).unwrap();
        fs::rename(library.join("one.md"), library.join("two.md")).unwrap();
        c.scan().unwrap();
        let files = c.scoped("file").unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0]["id"], f["id"]);
        assert_eq!(files[0]["category"], "课程大纲");
        drop(c);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn cancellation_generation() {
        let (c, dir) = fixture();
        let generation = c.generation.load(Ordering::SeqCst);
        c.cancel();
        assert!(c.check(generation).is_err());
        assert_eq!(c.job.lock().unwrap()["running"], false);
        drop(c);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn no_symlink_access() {
        use std::os::unix::fs::symlink;
        let (c, dir) = fixture();
        let library = dir.join("library");
        let outside = dir.join("outside.md");
        fs::write(&outside, "secret fixture").unwrap();
        symlink(&outside, library.join("link.md")).unwrap();
        c.scan().unwrap();
        assert!(c.scoped("file").unwrap().is_empty());
        assert!(contained(&library, &library.join("link.md")).is_err());
        drop(c);
        fs::remove_dir_all(dir).unwrap();
    }
}
/// Respect the user's existing macOS HTTPS proxy settings, like WebKit does.
/// Keep TLS verification enabled; never copy Canvas headers to other hosts.
pub fn http_client(timeout: std::time::Duration) -> Result<reqwest::Client> {
    let mut builder = reqwest::Client::builder()
        .user_agent("PolyUCanvasLocalized/0.1.0 (read-only)")
        .redirect(reqwest::redirect::Policy::none())
        .timeout(timeout);
    if let Ok(output) = std::process::Command::new("/usr/sbin/scutil")
        .arg("--proxy")
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        let field = |key: &str| {
            text.lines().find_map(|line| {
                line.trim()
                    .strip_prefix(&format!("{key} : "))
                    .map(str::to_string)
            })
        };
        if field("HTTPSEnable").as_deref() == Some("1") {
            if let (Some(host), Some(port)) = (field("HTTPSProxy"), field("HTTPSPort")) {
                if let Ok(port) = port.parse::<u16>() {
                    let proxy =
                        reqwest::Proxy::https(format!("http://{host}:{port}")).map_err(err)?;
                    builder =
                        builder
                            .proxy(proxy.no_proxy(reqwest::NoProxy::from_string(
                                "localhost,127.0.0.1,::1",
                            )));
                }
            }
        }
    }
    builder.build().map_err(err)
}
pub fn ensure_dir(root: &Path, target: &Path) -> Result<()> {
    let mut current = root.to_path_buf();
    for component in target.strip_prefix(root).map_err(err)?.components() {
        if !matches!(component, std::path::Component::Normal(_)) {
            return Err("资料目录路径无效".into());
        }
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(meta) if meta.file_type().is_symlink() || !meta.is_dir() => {
                return Err("资料目录含链接或非目录，已停止写入".into())
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&current).map_err(err)?;
            }
            Err(e) => return Err(err(e)),
        }
    }
    Ok(())
}
pub fn validate_write(root: &Path, target: &Path) -> Result<()> {
    let parent = target
        .parent()
        .ok_or("下载路径无效")?
        .canonicalize()
        .map_err(err)?;
    if !parent.starts_with(root.canonicalize().map_err(err)?)
        || fs::symlink_metadata(target)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false)
    {
        return Err("下载路径含链接或越出资料库".into());
    }
    Ok(())
}
#[cfg(test)]
mod write_path_tests {
    use super::*;
    #[test]
    fn reject_symlink_directory() {
        use std::os::unix::fs::symlink;
        let root = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let library = root.join("library");
        let outside = root.join("outside");
        fs::create_dir_all(&library).unwrap();
        fs::create_dir_all(&outside).unwrap();
        symlink(&outside, library.join("course")).unwrap();
        assert!(ensure_dir(&library, &library.join("course/Pages")).is_err());
        assert!(!outside.join("Pages").exists());
        assert!(validate_write(&library, &library.join("course/file.pdf")).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}

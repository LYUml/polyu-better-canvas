/// <reference types="vite/client" />
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Sparkles,
  Search,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Plus,
  X,
  ShieldCheck,
  FileText,
  Clock,
  Check,
  LogIn,
  MoreHorizontal,
  CircleHelp,
} from "lucide-react";
import "./style.css";

type Item = {
  id: string;
  title?: string;
  name?: string;
  date?: string;
  time?: string;
  kind?: string;
  course?: string;
  notes?: string;
  completed?: boolean;
  demo?: boolean;
  category?: string;
  suggestedName?: string;
  relative?: string;
  ext?: string;
  size?: number;
  filename?: string;
  page?: number;
  excerpt?: string;
  reason?: string;
  method?: string;
  status?: string;
  fileId?: string;
  source?: Item;
  url?: string;
  root?: string;
  configured?: boolean;
  connected?: boolean;
  user?: { id: string; name: string };
  lastSync?: string;
};
type Config = {
  provider: string;
  endpoint: string;
  model: string;
  hasKey: boolean;
  active: string;
};
type Job = {
  running: boolean;
  stage: string;
  downloaded: number;
  failed: number;
  skipped: number;
  error?: string;
};
type State = {
  settings: Config;
  workspace: Item;
  workspaces: Item[];
  files: Item[];
  tasks: Item[];
  findings: Item[];
  courses: Item[];
  job: Job;
  version: string;
};
type Page = "home" | "files" | "review" | "calendar" | "tasks" | "settings";
type Doc = { pages: { page: number; text: string; method?: string }[] };
const native = isTauri();
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const kinds: Record<string, string> = {
  assignment: "作业",
  exam: "考试",
  study: "学习时段",
  lecture: "课程",
  other: "其他",
};
const routes: { id: Page; name: string; icon: typeof BookOpen }[] = [
  { id: "home", name: "启动台", icon: LayoutDashboard },
  { id: "files", name: "资料库", icon: FolderOpen },
  { id: "review", name: "待确认", icon: Sparkles },
  { id: "calendar", name: "日历", icon: CalendarDays },
  { id: "tasks", name: "任务清单", icon: CheckSquare },
  { id: "settings", name: "设置", icon: Settings },
];
const empty: State = {
  settings: {
    provider: "compatible",
    endpoint: "https://api.openai.com/v1",
    model: "",
    hasKey: false,
    active: "local",
  },
  workspace: {
    id: "local",
    name: "本地工作区",
    configured: false,
    connected: false,
    root: "Documents/PolyU Canvas Localized/Local",
  },
  workspaces: [],
  files: [],
  tasks: [],
  findings: [],
  courses: [],
  job: {
    running: false,
    stage: "尚未同步",
    downloaded: 0,
    failed: 0,
    skipped: 0,
  },
  version: "0.1.1",
};
const previewMode =
  !native &&
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has("preview");
const previewDate = (offset: number) => {
  const d = new Date(today() + "T12:00:00+08:00");
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const previewState: State = previewMode
  ? {
      ...empty,
      workspace: {
        ...empty.workspace,
        configured: true,
        name: "合成演示工作区",
        user: { id: "preview-user", name: "演示用户" },
        connected: true,
      },
      files: [
        "BSE3125 · Optics and Lighting",
        "AMA2111 · Mathematics I",
        "BSE3322 · Fire Safety Systems",
      ].flatMap((course, c) =>
        [
          "Course syllabus.pdf",
          "Lecture 01 — Introduction.pdf",
          "Teaching schedule.pdf",
          "Assignment 1.pdf",
          "Reading notes.md",
        ].map((name, i) => ({
          id: `preview-${c}-${i}`,
          name,
          course,
          category: ["课程大纲", "讲义", "课程大纲", "作业", "参考资料"][i],
          ext: i === 4 ? "md" : "pdf",
          size: (i + 1) * 184320,
          relative: `${course}/${name}`,
          demo: true,
        })),
      ),
      tasks: [
        {
          id: "p-task-1",
          title: "Assignment 1 · Lighting analysis",
          course: "BSE3125 · Optics and Lighting",
          date: previewDate(2),
          time: "23:59",
          kind: "assignment",
          demo: true,
        },
        {
          id: "p-task-2",
          title: "Midterm examination",
          course: "AMA2111 · Mathematics I",
          date: previewDate(8),
          time: "14:00",
          kind: "exam",
          demo: true,
        },
        {
          id: "p-task-3",
          title: "整理本周课堂笔记",
          kind: "study",
          demo: true,
        },
        {
          id: "p-task-4",
          title: "复习光学基础",
          kind: "study",
          date: today(),
          time: "16:00",
          demo: true,
        },
      ],
      findings: [
        {
          id: "p-finding",
          title: "Final report submission",
          kind: "assignment",
          status: "pending",
          filename: "Course syllabus.pdf",
          fileId: "preview-0-0",
          page: 3,
          excerpt:
            "Final report submission: 30 October 2026, 23:59 (Hong Kong time).",
          date: "2026-10-30",
          time: "23:59",
          course: "BSE3125 · Optics and Lighting",
          method: "合成演示 · PDF 文字",
          demo: true,
        },
      ],
    }
  : empty;
const size = (n = 0) =>
  n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;
const dateLabel = (d?: string) =>
  !d
    ? "日期待定"
    : d === today()
      ? "今天"
      : new Date(d + "T12:00:00+08:00").toLocaleDateString("zh-CN", {
          month: "short",
          day: "numeric",
          timeZone: "Asia/Hong_Kong",
        });
const sortTasks = (a: Item, b: Item) =>
  (a.date || "9999").localeCompare(b.date || "9999") ||
  (a.time || "").localeCompare(b.time || "");
function Badge({
  kind = "other",
  demo = false,
}: {
  kind?: string;
  demo?: boolean;
}) {
  return (
    <span className={`badge ${demo ? "demo" : kind}`}>
      {demo ? "演示" : kinds[kind] || kind}
    </span>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const focus = document.activeElement as HTMLElement;
    ref.current?.showModal();
    ref.current
      ?.querySelector<HTMLInputElement>("input,textarea,select")
      ?.focus();
    return () => focus?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-btn" aria-label="关闭" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function TaskForm({
  task,
  submit,
  remove,
  close,
}: {
  task?: Item;
  submit: (v: Record<string, unknown>) => Promise<void>;
  remove?: () => void;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={task?.id ? "编辑学习安排" : "添加学习安排"} onClose={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const data = Object.fromEntries(new FormData(e.currentTarget));
            await submit({ ...data, id: task?.id });
            close();
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="field-grid">
            <label className="field field-full">
              标题
              <input
                name="title"
                required
                maxLength={200}
                defaultValue={task?.title || ""}
                placeholder="例如：提交课程报告"
                autoFocus
              />
            </label>
            <label className="field">
              类型
              <select name="kind" defaultValue={task?.kind || "assignment"}>
                {Object.entries(kinds).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              课程
              <input
                name="course"
                defaultValue={task?.course || ""}
                placeholder="可留空"
              />
            </label>
            <label className="field">
              日期
              <input type="date" name="date" defaultValue={task?.date || ""} />
            </label>
            <label className="field">
              时间 · 香港
              <input type="time" name="time" defaultValue={task?.time || ""} />
            </label>
            <label className="field field-full">
              备注
              <textarea
                name="notes"
                defaultValue={task?.notes || ""}
                placeholder="步骤、地点或学习目标"
              />
            </label>
          </div>
          <p className="form-help">
            无日期的任务保留在清单中。时间为空时，日历显示为全天安排；有时间的
            DDL 标记截止时刻。
          </p>
          {task?.source && (
            <details className="detail-source">
              <summary>查看来源</summary>
              <div className="quote">
                {task.source.filename || "Canvas 作业"}
                {task.source.page ? ` · 第 ${task.source.page} 页` : ""}
                <br />
                {task.source.excerpt}
              </div>
            </details>
          )}
          <p className="form-error" role="alert">
            {error}
          </p>
        </div>
        <div className="modal-foot">
          {remove && (
            <button type="button" className="btn danger" onClick={remove}>
              删除任务
            </button>
          )}
          <button type="button" className="btn" onClick={close}>
            取消
          </button>
          <button disabled={busy} className="btn primary">
            {busy ? "正在保存…" : "保存安排"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function App() {
  const [state, setState] = useState<State>(previewMode ? previewState : empty);
  const [page, setPage] = useState<Page>("home");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("");
  const [taskFilter, setTaskFilter] = useState("pending");
  const [filePage, setFilePage] = useState(0);
  const [month, setMonth] = useState(() => new Date(today() + "T12:00:00"));
  const [edit, setEdit] = useState<Item | null>(null);
  const [inspectorTab, setInspectorTab] = useState("preview");
  const [selected, setSelected] = useState<Item | null>(null);
  const [documentText, setDocumentText] = useState<Doc | null>(null);
  const [docError, setDocError] = useState("");
  const [consent, setConsent] = useState<"deadlines" | "organize" | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    body: string;
    action: () => Promise<void>;
  } | null>(null);
  const [categorySuggestion, setCategorySuggestion] = useState<{
    category: string;
    suggestedName: string;
    reason: string;
  } | null>(null);
  const call = async <T,>(
    action: string,
    input: Record<string, unknown> = {},
  ): Promise<T> => {
    if (previewMode && action === "read_file")
      return {
        pages: [
          {
            page: 1,
            method: "合成预览 · PDF 文字",
            text: "Course syllabus\n\nOptics and Lighting\n\nCourse overview\nThis course introduces lighting principles and visual comfort.\n\nAssessment\nAssignment 1: lighting analysis.\nFinal report submission: 30 October 2026, 23:59 (Hong Kong time).\n\n此内容为界面验收用合成资料。",
          },
        ],
      } as T;
    if (!native)
      throw new Error("浏览器仅用于界面预览，请在打包的 Mac App 中操作");
    return invoke<T>("dispatch", { action, input });
  };
  const refresh = async () => {
    if (native) setState(await call<State>("state"));
  };
  const act = async (
    action: string,
    input: Record<string, unknown> = {},
    notice = "",
  ) => {
    setBusy(action);
    setError("");
    try {
      const result = await call<Record<string, unknown>>(action, input);
      await refresh();
      if (result.cancelled !== true && notice) setMessage(notice);
      return result;
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setBusy("");
    }
  };
  const run = (
    action: string,
    input: Record<string, unknown> = {},
    notice = "",
  ) => {
    void act(action, input, notice).catch(() => {});
  };
  useEffect(() => {
    void refresh()
      .catch((e) => setError(String(e)))
      .finally(() => setReady(true));
    if (!native) return;
    const updated = listen("workspace-updated", () => void refresh());
    const unsub = listen<Job>("workspace-progress", (e) => {
      setState((s) => ({ ...s, job: e.payload }));
      if (!e.payload.running) void refresh();
    });
    return () => {
      void unsub.then((f) => f());
      void updated.then((f) => f());
    };
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    setQuery("");
    setFilePage(0);
  }, [page]);
  useEffect(() => {
    setInspectorTab("preview");
    setDocumentText(null);
    setDocError("");
    setCategorySuggestion(null);
    if (!selected) return;
    let valid = true;
    void call<Doc>("read_file", { id: selected.id })
      .then((d) => {
        if (valid) setDocumentText(d);
      })
      .catch((e) => {
        if (valid) setDocError(String(e));
      });
    return () => {
      valid = false;
    };
  }, [selected?.id]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPage("files");
        setTimeout(() => document.getElementById("file-search")?.focus(), 50);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const pending = state.findings.filter((f) => f.status === "pending");
  const todo = state.tasks.filter((t) => !t.completed).sort(sortTasks);
  const courses = [...new Set(state.files.map((f) => f.course || "本地资料"))];
  const upcoming = todo.filter((t) => t.date).slice(0, 5);
  const fileMatches = state.files.filter(
    (f) =>
      (!course || f.course === course) &&
      `${f.name} ${f.course} ${f.category} ${f.relative}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const visibleTasks = state.tasks
    .filter(
      (t) =>
        taskFilter === "all" ||
        (taskFilter === "completed" ? t.completed : !t.completed),
    )
    .filter((t) =>
      `${t.title} ${t.course}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort(sortTasks);
  const title = routes.find((r) => r.id === page)!.name;
  const changePage = (p: Page) => {
    if (p !== "files") setSelected(null);
    setPage(p);
    setError("");
  };
  const analyze = async (mode: "ai" | "local", purpose = "deadlines") => {
    if (!selected) return;
    try {
      const result = await act("analyze", {
        id: selected.id,
        mode,
        purpose,
        consent: mode === "ai",
      });
      setConsent(null);
      if (purpose === "organize") {
        setCategorySuggestion(
          result as unknown as {
            category: string;
            suggestedName: string;
            reason: string;
          },
        );
        setMessage("分类建议已生成，尚未修改文件");
      } else {
        setMessage(
          `新增 ${result.added || 0} 条待确认安排${result.rejected ? `，${result.rejected} 条未通过原文校验` : ""}${result.truncated ? "；仅分析前 60,000 字符" : ""}`,
        );
        setSelected(null);
        setPage("review");
      }
    } catch {
      setConsent(null);
    }
  };
  const fileDetail = selected ? (
    <div className="modal-body file-detail">
      <div className="file-preview">
        {docError ? (
          <div className="result-error">
            {docError}
            <br />
            可以用系统默认应用打开原文件。
          </div>
        ) : documentText ? (
          documentText.pages.map((p) => (
            <div className="page-text" key={p.page}>
              <strong>
                第 {p.page} 页 · {p.method || "文字"}
              </strong>
              <pre>{p.text || "本页没有可读文字"}</pre>
            </div>
          ))
        ) : (
          <div className="loading">
            <RefreshCw aria-hidden="true" />
            正在本地读取文字与 OCR…
          </div>
        )}
      </div>
      <div className="file-info">
        <Badge demo={selected.demo} kind={selected.category || "未分类"} />
        <small>
          {selected.course}
          <br />
          {selected.relative}
          <br />
          {size(selected.size)}
        </small>
        <button
          className="btn"
          onClick={() => run("open_file", { id: selected.id })}
        >
          <ArrowUpRight aria-hidden="true" />
          打开原文件
        </button>
        <button
          className="btn"
          onClick={() => run("reveal_file", { id: selected.id })}
        >
          <FolderOpen aria-hidden="true" />在 Finder 中显示
        </button>
        <p className="form-error" role="alert">
          {error}
        </p>
        <h3>发现学习安排</h3>
        <button
          className="btn soft"
          disabled={!!busy || !documentText}
          onClick={() => void analyze("local")}
        >
          <Search aria-hidden="true" />
          {busy === "analyze" ? "正在分析…" : "本地规则提取日期"}
        </button>
        <button
          className="btn primary"
          disabled={!!busy || !documentText}
          onClick={() => setConsent("deadlines")}
        >
          <Sparkles aria-hidden="true" />
          用我的 AI 分析
        </button>
        <p className="ai-disclosure">
          结果先进入待确认。AI 只在你主动确认后接收正文，不会收到 Canvas 会话。
        </p>
        <h3>整理资料</h3>
        <label className="field">
          分类标签
          <select
            value={selected.category || ""}
            onChange={async (e) => {
              const category = e.target.value;
              try {
                await act("category", { id: selected.id, category });
                setSelected({ ...selected, category });
              } catch {}
            }}
          >
            <option value="">未分类</option>
            {["课程大纲", "讲义", "练习", "作业", "考试", "参考资料"].map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </label>
        <button
          className="btn small"
          disabled={!documentText || !!busy}
          onClick={() => setConsent("organize")}
        >
          <Sparkles aria-hidden="true" />
          生成 AI 整理建议
        </button>
        {categorySuggestion && (
          <div className="category-result">
            <strong>{categorySuggestion.category}</strong>
            <br />
            建议名称：{categorySuggestion.suggestedName}
            <br />
            {categorySuggestion.reason}
            <br />
            <button
              className="btn small"
              onClick={() => {
                run(
                  "category",
                  {
                    id: selected.id,
                    category: categorySuggestion.category,
                    suggestedName: categorySuggestion.suggestedName,
                  },
                  "分类已应用，原文件名保持不变",
                );
                setSelected({
                  ...selected,
                  category: categorySuggestion.category,
                });
              }}
            >
              应用分类标签
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null;
  const taskRows = (tasks: Item[]) => (
    <div className="task-list">
      {tasks.length ? (
        tasks.map((t) => (
          <div className={`task-row ${t.completed ? "done" : ""}`} key={t.id}>
            <input
              className="task-check"
              type="checkbox"
              aria-label={`完成：${t.title}`}
              checked={!!t.completed}
              onChange={() =>
                run("task_save", { ...t, completed: !t.completed })
              }
            />
            <div className="task-copy">
              <button className="task-title" onClick={() => setEdit(t)}>
                {t.title}
              </button>
              <div className="task-meta">
                <Badge kind={t.kind} />
                <span>{t.course || "个人安排"}</span>
                {t.demo && <Badge demo />}
              </div>
            </div>
            <div
              className={`task-date ${t.date && t.date < today() && !t.completed ? "overdue" : ""}`}
            >
              {dateLabel(t.date)}
              <small className="muted">
                {t.time && (
                  <>
                    <br />
                    {t.time}
                  </>
                )}
              </small>
            </div>
          </div>
        ))
      ) : (
        <div className="empty">
          <CheckSquare aria-hidden="true" />
          <strong>清单里还没有安排</strong>添加任务，或从课程文件中提取 DDL。
          <br />
          <button className="btn small" onClick={() => setEdit({ id: "" })}>
            <Plus aria-hidden="true" />
            添加任务
          </button>
        </div>
      )}
    </div>
  );
  const days = (date: Date) => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
    const offset = (first.getDay() + 6) % 7;
    return Array.from(
      { length: 42 },
      (_, i) =>
        new Date(date.getFullYear(), date.getMonth(), 1 - offset + i, 12),
    );
  };
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return (
    <>
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      {!native && (
        <div className="native-preview">
          {previewMode
            ? "合成资料预览 · 所有数据均为虚构"
            : "界面预览 · 文件、Canvas 和 AI 操作请在 Mac App 中使用"}
        </div>
      )}
      <div className={`shell page-${page}`}>
        <aside className="sidebar">
          <div className="brand">
            <span className="brandmark">
              <BookOpen aria-hidden="true" />
            </span>
            <div>
              <strong>PolyU Localized</strong>
              <small>CANVAS · LOCAL</small>
            </div>
          </div>
          <div className="nav-caption">学习工作台</div>
          <nav className="nav" aria-label="主导航">
            {routes.map((r) => (
              <button
                key={r.id}
                className={page === r.id ? "active" : ""}
                aria-current={page === r.id ? "page" : undefined}
                onClick={() => changePage(r.id)}
              >
                <r.icon aria-hidden="true" />
                {r.name}
                {r.id === "review" && pending.length > 0 && (
                  <span className="count">{pending.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="local-card">
              <span className="online-dot" />
              <span>
                {state.workspace.connected ? "Canvas 已连接" : "本地工作区"}
              </span>
            </div>
            <button
              className="demo-link"
              onClick={() => run("demo", {}, "演示资料已载入")}
            >
              <Sparkles aria-hidden="true" />
              　体验合成演示
            </button>
            {state.files.some((f) => f.demo) && (
              <button
                className="demo-link"
                onClick={() => run("clear_demo", {}, "演示资料已移除")}
              >
                移除演示数据
              </button>
            )}
            <div className="sidebar-version">
              <span>资料保存在本机</span>
              <span>v{state.version}</span>
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              <strong>{title}</strong>
              <span className="toolbar-context">
                {page === "files"
                  ? `${fileMatches.length} 份资料`
                  : "学习工作区"}
              </span>
            </div>
            <div className="top-actions">
              <button
                className="top-search"
                aria-label="查找课程资料，快捷键 Command K"
                onClick={() => {
                  changePage("files");
                  setTimeout(
                    () => document.getElementById("file-search")?.focus(),
                    50,
                  );
                }}
              >
                <Search aria-hidden="true" />
                <span>查找课程资料</span>
                <span className="kbd">⌘ K</span>
              </button>
              <button
                className="btn small"
                onClick={() => run("export", {}, "日历已导出")}
              >
                <Download aria-hidden="true" />
                导出日历
              </button>
              <span
                className="avatar"
                title={state.workspace.user?.name || "本地用户"}
              >
                {state.workspace.user?.name?.slice(0, 1) || "本地"}
              </span>
            </div>
          </header>
          <main id="main" className="main">
            <div className="page-heading">
              <div>
                {page === "home" && (
                  <div className="date-label">
                    {new Date(today() + "T12:00:00+08:00").toLocaleDateString(
                      "zh-CN",
                      {
                        month: "long",
                        day: "numeric",
                        weekday: "long",
                        timeZone: "Asia/Hong_Kong",
                      },
                    )}{" "}
                    · 香港时间
                  </div>
                )}
                <h1>{page === "home" ? "今天" : title}</h1>
                <p>
                  {
                    {
                      home: "查看近期安排，继续你的学习。",
                      files: "原始资料保存在文件夹，分类与索引由工作台管理。",
                      review: "每一个日期，都应该有可以核对的出处。",
                      calendar: "看见截止日期，也为学习留出时间。",
                      tasks: "把课程要求，变成可以完成的下一步。",
                      settings: "选择自己的资料位置和 AI 服务。",
                    }[page]
                  }
                </p>
              </div>
              <div className="heading-actions">
                {["home", "files"].includes(page) && (
                  <>
                    <button
                      className="btn"
                      disabled={!!busy || state.job.running}
                      onClick={() => run("scan", {}, "资料索引已更新")}
                    >
                      <RefreshCw aria-hidden="true" />
                      重新扫描
                    </button>
                    <button
                      className="btn primary"
                      disabled={state.job.running || !!busy}
                      onClick={() =>
                        state.workspace.connected
                          ? run("sync")
                          : run("connect", {}, "Canvas 已连接，可以开始同步")
                      }
                    >
                      <RefreshCw aria-hidden="true" />
                      {state.workspace.connected
                        ? "同步 Canvas"
                        : "连接 Canvas"}
                    </button>
                  </>
                )}
                {["tasks", "calendar"].includes(page) && (
                  <button
                    className="btn primary"
                    onClick={() => setEdit({ id: "" })}
                  >
                    <Plus aria-hidden="true" />
                    添加安排
                  </button>
                )}
              </div>
            </div>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            {state.job.running && (
              <div className="notice">
                <span className="busy-dot" />
                <p>
                  {state.job.stage}
                  <br />
                  <small>
                    已下载 {state.job.downloaded} · 跳过 {state.job.skipped} ·
                    未完成 {state.job.failed}
                  </small>
                </p>
                <button className="btn small" onClick={() => run("cancel")}>
                  取消同步
                </button>
              </div>
            )}
            {state.job.error && !state.job.running && (
              <div className="notice warn">{state.job.error}</div>
            )}
            {!ready ? (
              <div className="loading">
                <RefreshCw aria-hidden="true" />
                正在打开本地工作区…
              </div>
            ) : !state.workspace.configured && page === "home" ? (
              <section className="onboard panel">
                <div className="panel-body">
                  <div className="step">WELCOME · 第一次使用</div>
                  <h2>给课程资料一个家。</h2>
                  <p>
                    选择已有的课程文件夹，或创建一个新的资料库。工作台只建立索引，不移动或删除现有文件。之后可以在
                    App 内登录 Canvas，下载资料并接入自己的 AI。
                  </p>
                  <button
                    className="btn primary"
                    disabled={!!busy}
                    onClick={() => run("choose_folder", {}, "资料文件夹已接入")}
                  >
                    <FolderOpen aria-hidden="true" />
                    使用已有资料文件夹
                  </button>
                  <button
                    className="btn"
                    disabled={!!busy}
                    onClick={() =>
                      run("default_folder", {}, "默认资料库已创建")
                    }
                  >
                    创建默认资料库
                  </button>
                  <p className="form-help">
                    也可以先从左侧载入合成演示，了解文件分析和日期核对。
                  </p>
                </div>
              </section>
            ) : (
              <>
                {page === "home" && (
                  <>
                    <section className="workspace-brief">
                      <div className="brief-icon">
                        <Sparkles aria-hidden="true" />
                      </div>
                      <div>
                        <h2>
                          {pending.length
                            ? `${pending.length} 条安排等待核对`
                            : "从课程资料开始"}
                        </h2>
                        <p>
                          {pending.length
                            ? "查看来源和日期，确认后加入你的任务与日历。"
                            : "选择 syllabus，让自己的 AI 帮你发现考试和截止日期。"}
                        </p>
                      </div>
                      <button
                        className="btn"
                        onClick={() =>
                          changePage(pending.length ? "review" : "files")
                        }
                      >
                        {pending.length ? "核对安排" : "浏览资料"}
                        <ChevronRight aria-hidden="true" />
                      </button>
                    </section>
                    <div className="stats">
                      {[
                        {
                          icon: BookOpen,
                          label: "课程与资料夹",
                          value: courses.length,
                          help: "连接你的学习资料",
                          page: "files",
                        },
                        {
                          icon: FileText,
                          label: "本地资料",
                          value: state.files.length,
                          help: "文件始终在本机",
                          page: "files",
                        },
                        {
                          icon: Clock,
                          label: "待完成安排",
                          value: todo.length,
                          help: "按自己的节奏完成",
                          page: "tasks",
                        },
                        {
                          icon: Sparkles,
                          label: "等待核对",
                          value: pending.length,
                          help: "确认后加入日历",
                          page: "review",
                        },
                      ].map((s) => (
                        <button
                          className="stat"
                          key={s.label}
                          onClick={() => changePage(s.page as Page)}
                        >
                          <div className="stat-icon">
                            <s.icon aria-hidden="true" />
                          </div>
                          <div>
                            <p>{s.label}</p>
                            <strong>
                              {s.value.toString().padStart(2, "0")}
                            </strong>
                            <small>{s.help}</small>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="columns">
                      <section className="panel">
                        <div className="panel-head">
                          <h2>接下来的安排</h2>
                          <button
                            className="plain"
                            onClick={() => changePage("tasks")}
                          >
                            全部任务
                            <ArrowUpRight aria-hidden="true" />
                          </button>
                        </div>
                        {taskRows(upcoming)}
                      </section>
                      <section className="panel">
                        <div className="panel-head">
                          <h2>这个月</h2>
                          <button
                            className="plain"
                            onClick={() => changePage("calendar")}
                            aria-label="打开日历"
                          >
                            <ArrowUpRight aria-hidden="true" />
                          </button>
                        </div>
                        <div className="panel-body">
                          <div className="mini-top">
                            <span>
                              {month.getFullYear()} 年 {month.getMonth() + 1} 月
                            </span>
                            <CalendarDays aria-hidden="true" />
                          </div>
                          <div className="mini-grid">
                            {"一二三四五六日".split("").map((d) => (
                              <div key={d} className="mini-week">
                                {d}
                              </div>
                            ))}
                            {days(month).map((d) => (
                              <span
                                key={dayKey(d)}
                                className={`mini-day ${dayKey(d) === today() ? "today" : ""} ${d.getMonth() !== month.getMonth() ? "outside" : ""} ${todo.some((t) => t.date === dayKey(d)) ? "has-event" : ""}`}
                              >
                                {d.getDate()}
                              </span>
                            ))}
                          </div>
                          <div className="legend">
                            <span>作业 / 学习</span>
                            <span>考试</span>
                          </div>
                        </div>
                      </section>
                    </div>
                    <section className="course-section">
                      <div className="section-head">
                        <h2>我的课程资料</h2>
                        <button
                          className="plain"
                          onClick={() => changePage("files")}
                        >
                          查看全部
                          <ArrowUpRight aria-hidden="true" />
                        </button>
                      </div>
                      <div className="course-grid">
                        {courses.slice(0, 6).map((c) => (
                          <button
                            className="course-card"
                            key={c}
                            onClick={() => {
                              setCourse(c);
                              changePage("files");
                            }}
                          >
                            <span className="course-symbol">
                              <BookOpen aria-hidden="true" />
                            </span>
                            <div>
                              <h3>{c}</h3>
                              <small>
                                {
                                  state.files.filter((f) => f.course === c)
                                    .length
                                }{" "}
                                份本地资料
                              </small>
                            </div>
                            <ArrowUpRight
                              aria-hidden="true"
                              className="arrow"
                            />
                          </button>
                        ))}
                      </div>
                      {!courses.length && (
                        <div className="panel empty">
                          连接 Canvas 或选择已有文件夹，让课程资料出现在这里。
                        </div>
                      )}
                    </section>
                  </>
                )}
                {page === "files" && (
                  <section
                    className={`finder ${selected ? "has-selection" : ""}`}
                  >
                    <aside className="finder-courses" aria-label="课程文件夹">
                      <div className="rail-caption">课程文件夹</div>
                      <button
                        className={!course ? "active" : ""}
                        aria-pressed={!course}
                        onClick={() => {
                          setCourse("");
                          setFilePage(0);
                          setSelected(null);
                        }}
                      >
                        <FolderOpen aria-hidden="true" />
                        <span>所有资料</span>
                        <small>{state.files.length}</small>
                      </button>
                      {courses.map((c) => (
                        <button
                          key={c}
                          title={c}
                          className={course === c ? "active" : ""}
                          aria-pressed={course === c}
                          onClick={() => {
                            setCourse(c);
                            setFilePage(0);
                            setSelected(null);
                          }}
                        >
                          <BookOpen aria-hidden="true" />
                          <span>{c}</span>
                          <small>
                            {state.files.filter((f) => f.course === c).length}
                          </small>
                        </button>
                      ))}
                      <div className="rail-note">
                        <ShieldCheck aria-hidden="true" />
                        <span>原始文件保存在你的文件夹</span>
                      </div>
                    </aside>
                    <div className="finder-list">
                      <div className="toolbar">
                        <div className="search-field">
                          <Search aria-hidden="true" />
                          <input
                            id="file-search"
                            aria-label="搜索资料"
                            placeholder="搜索文件名、课程或分类…"
                            value={query}
                            onChange={(e) => {
                              setQuery(e.target.value);
                              setFilePage(0);
                            }}
                          />
                        </div>
                        <button
                          className="btn small"
                          onClick={() =>
                            run("choose_folder", {}, "已切换资料目录")
                          }
                        >
                          <FolderOpen aria-hidden="true" />
                          选择文件夹
                        </button>
                      </div>
                      <div className="file-table-scroll">
                        <table className="file-table">
                          <thead>
                            <tr>
                              <th>文件</th>

                              <th>分类</th>
                              <th>大小</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fileMatches
                              .slice(filePage * 40, filePage * 40 + 40)
                              .map((f) => (
                                <tr
                                  key={f.id}
                                  className={
                                    selected?.id === f.id ? "selected" : ""
                                  }
                                >
                                  <td>
                                    <button
                                      aria-pressed={selected?.id === f.id}
                                      className="file-name"
                                      title={f.name}
                                      onClick={() => setSelected(f)}
                                    >
                                      <span className={`ext ${f.ext}`}>
                                        {f.ext?.toUpperCase() || "FILE"}
                                      </span>
                                      <span>
                                        {f.name}
                                        {f.demo && " · 演示"}
                                        <small>{f.course}</small>
                                      </span>
                                    </button>
                                  </td>
                                  <td>{f.category || "未分类"}</td>
                                  <td>{size(f.size)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {!fileMatches.length && (
                        <div className="empty">
                          <FolderOpen aria-hidden="true" />
                          <strong>
                            {query || course
                              ? "没有找到匹配的资料"
                              : "这里还没有资料"}
                          </strong>
                          {query || course
                            ? "试试其他关键词，或查看所有课程。"
                            : "接入已有资料文件夹，开始建立你的资料库。"}
                          <br />
                          <button
                            className="btn small"
                            onClick={() => {
                              if (query || course) {
                                setQuery("");
                                setCourse("");
                                setFilePage(0);
                                setSelected(null);
                              } else
                                run("choose_folder", {}, "资料文件夹已接入");
                            }}
                          >
                            {query || course ? "清除筛选" : "选择资料文件夹"}
                          </button>
                        </div>
                      )}
                      <div className="pagination">
                        <span>
                          {fileMatches.length} 份资料 · 第 {filePage + 1} 页
                        </span>
                        <div>
                          <button
                            className="icon-btn"
                            aria-label="上一页"
                            disabled={filePage === 0}
                            onClick={() => setFilePage((p) => p - 1)}
                          >
                            <ChevronLeft aria-hidden="true" />
                          </button>{" "}
                          <button
                            className="icon-btn"
                            aria-label="下一页"
                            disabled={(filePage + 1) * 40 >= fileMatches.length}
                            onClick={() => setFilePage((p) => p + 1)}
                          >
                            <ChevronRight aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <aside
                      className="finder-inspector"
                      aria-label="文件检查器"
                      data-inspector-tab={inspectorTab}
                    >
                      <div className="inspector-head">
                        <h2>文件检查器</h2>
                        {selected && (
                          <button
                            className="icon-btn"
                            aria-label="关闭文件检查器"
                            onClick={() => setSelected(null)}
                          >
                            <X aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {selected ? (
                        <>
                          <div className="inspector-title">
                            <FileText aria-hidden="true" />
                            <h3>{selected.name}</h3>
                          </div>
                          <div
                            className="inspector-tabs filter-pills"
                            aria-label="检查器视图"
                          >
                            {[
                              ["preview", "正文预览"],
                              ["actions", "文件与 AI"],
                            ].map(([id, label]) => (
                              <button
                                key={id}
                                aria-pressed={inspectorTab === id}
                                className={inspectorTab === id ? "active" : ""}
                                onClick={() => setInspectorTab(id)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          {fileDetail}
                        </>
                      ) : (
                        <div className="inspector-empty">
                          <FileText aria-hidden="true" />
                          <h3>选择一份资料</h3>
                          <p>查看正文与来源，提取安排，或添加分类标签。</p>
                        </div>
                      )}
                    </aside>
                  </section>
                )}
                {page === "review" && (
                  <>
                    {pending.length > 0 && (
                      <div className="notice">
                        <ShieldCheck aria-hidden="true" />
                        <p>
                          请核对标题、日期、类型及原文。只有确认后的安排才会进入任务和导出日历；仅有周次时可以先保留无日期任务。
                        </p>
                      </div>
                    )}
                    <div className="review-grid">
                      {pending.map((f) => (
                        <Review
                          key={f.id}
                          finding={f}
                          accept={async (input) => {
                            await act(
                              "finding_accept",
                              { ...input, id: f.id },
                              "已加入任务清单",
                            );
                          }}
                          dismiss={() => run("finding_dismiss", { id: f.id })}
                          open={() => {
                            const file = state.files.find(
                              (x) => x.id === f.fileId,
                            );
                            if (file) setSelected(file);
                            else setMessage("这条安排来自 Canvas 作业信息");
                          }}
                        />
                      ))}
                    </div>
                    {!pending.length && (
                      <section className="panel empty">
                        <Sparkles aria-hidden="true" />
                        <strong>没有等待核对的发现</strong>在资料库选择
                        syllabus，使用本地规则或自己的 AI 提取安排。
                        <br />
                        <button
                          className="btn"
                          onClick={() => changePage("files")}
                        >
                          去资料库
                        </button>
                      </section>
                    )}
                  </>
                )}
                {page === "tasks" && (
                  <section className="panel reminders-panel">
                    <div className="reminders-overview">
                      <div>
                        <CheckSquare aria-hidden="true" />
                        <span>
                          待完成<strong>{todo.length}</strong>
                        </span>
                      </div>
                      <div>
                        <CalendarDays aria-hidden="true" />
                        <span>
                          今天
                          <strong>
                            {todo.filter((t) => t.date === today()).length}
                          </strong>
                        </span>
                      </div>
                      <div>
                        <Clock aria-hidden="true" />
                        <span>
                          日期待定
                          <strong>{todo.filter((t) => !t.date).length}</strong>
                        </span>
                      </div>
                    </div>
                    <div className="toolbar">
                      <div className="filter-pills">
                        {[
                          ["pending", "待完成"],
                          ["completed", "已完成"],
                          ["all", "全部"],
                        ].map(([id, label]) => (
                          <button
                            key={id}
                            className={taskFilter === id ? "active" : ""}
                            aria-pressed={taskFilter === id}
                            onClick={() => setTaskFilter(id)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="search-field">
                        <Search aria-hidden="true" />
                        <input
                          aria-label="搜索任务"
                          placeholder="搜索任务或课程…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </div>
                    </div>
                    {taskRows(visibleTasks)}
                  </section>
                )}
                {page === "calendar" && (
                  <div className="calendar-layout">
                    <section className="panel calendar-panel">
                      <div className="calendar-title">
                        <h2>
                          {month.getFullYear()} 年 {month.getMonth() + 1} 月
                        </h2>
                        <div className="calendar-controls">
                          <button
                            className="icon-btn"
                            aria-label="上个月"
                            onClick={() =>
                              setMonth(
                                new Date(
                                  month.getFullYear(),
                                  month.getMonth() - 1,
                                  1,
                                  12,
                                ),
                              )
                            }
                          >
                            <ChevronLeft aria-hidden="true" />
                          </button>
                          <button
                            className="btn small"
                            onClick={() =>
                              setMonth(new Date(today() + "T12:00:00"))
                            }
                          >
                            今天
                          </button>
                          <button
                            className="icon-btn"
                            aria-label="下个月"
                            onClick={() =>
                              setMonth(
                                new Date(
                                  month.getFullYear(),
                                  month.getMonth() + 1,
                                  1,
                                  12,
                                ),
                              )
                            }
                          >
                            <ChevronRight aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <div className="calendar-grid">
                        {"一二三四五六日".split("").map((d) => (
                          <div className="weekday" key={d}>
                            周{d}
                          </div>
                        ))}
                        {days(month).map((d) => (
                          <div
                            key={dayKey(d)}
                            className={`day-cell ${d.getMonth() !== month.getMonth() ? "outside" : ""} ${dayKey(d) === today() ? "today" : ""}`}
                          >
                            <button
                              className="plain day-num"
                              aria-label={`在 ${dayKey(d)} 添加安排`}
                              onClick={() =>
                                setEdit({ id: "", date: dayKey(d) })
                              }
                            >
                              {d.getDate()}
                            </button>
                            {state.tasks
                              .filter((t) => t.date === dayKey(d))
                              .sort(sortTasks)
                              .map((t) => (
                                <button
                                  className={`cal-event ${t.kind} ${t.completed ? "done" : ""}`}
                                  key={t.id}
                                  title={`${t.time || "全天"} ${t.title}`}
                                  onClick={() => setEdit(t)}
                                >
                                  {t.time && `${t.time} `}
                                  {t.title}
                                </button>
                              ))}
                          </div>
                        ))}
                      </div>
                      <p className="cal-summary">
                        香港时间 · 无日期任务仅在任务清单中显示 ·
                        导出包含有日期的未完成安排
                      </p>
                    </section>
                    <aside className="panel agenda">
                      <div className="panel-head">
                        <h2>本月安排</h2>
                        <small>香港时间</small>
                      </div>
                      {taskRows(
                        todo.filter((t) =>
                          t.date?.startsWith(
                            `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`,
                          ),
                        ),
                      )}
                    </aside>
                  </div>
                )}
                {page === "settings" && (
                  <SettingsPage
                    state={state}
                    save={async (input) => {
                      await act("settings", input, "AI 设置已保存");
                    }}
                    action={run}
                    confirm={setConfirmAction}
                    busy={busy}
                  />
                )}
              </>
            )}
            <div className="footer-note">
              <span>
                <span className="online-dot" />
                本地工作区 · {state.workspace.name}
              </span>
              <span>学生制作 · 非学校官方应用</span>
            </div>
          </main>
        </div>
      </div>
      {edit && (
        <TaskForm
          task={edit}
          close={() => setEdit(null)}
          submit={async (input) => {
            await act("task_save", input, "安排已保存");
          }}
          remove={
            edit.id
              ? () =>
                  setConfirmAction({
                    title: "删除这条任务？",
                    body: "只删除工作台中的任务，不删除课程文件。",
                    action: async () => {
                      await act("task_delete", { id: edit.id });
                      setEdit(null);
                    },
                  })
              : undefined
          }
        />
      )}
      {selected && page !== "files" && !consent && (
        <Modal
          wide
          title={selected.name || "课程资料"}
          onClose={() => setSelected(null)}
        >
          {fileDetail}
        </Modal>
      )}
      {consent && selected && (
        <Consent
          title={selected.name || ""}
          settings={state.settings}
          purpose={consent}
          busy={busy === "analyze"}
          onClose={() => setConsent(null)}
          submit={() => void analyze("ai", consent)}
        />
      )}
      {confirmAction && (
        <Modal
          title={confirmAction.title}
          onClose={() => setConfirmAction(null)}
        >
          <div className="modal-body">
            <p>{confirmAction.body}</p>
          </div>
          <div className="modal-foot">
            <button className="btn" onClick={() => setConfirmAction(null)}>
              取消
            </button>
            <button
              className="btn primary"
              onClick={() =>
                void confirmAction
                  .action()
                  .then(() => setConfirmAction(null))
                  .catch(() => setConfirmAction(null))
              }
            >
              确认
            </button>
          </div>
        </Modal>
      )}
      {message && (
        <div id="toast" className="visible" role="status">
          {message}
        </div>
      )}
      {busy && (
        <div className="operation-status" role="status">
          {busy === "connect"
            ? "请在学校窗口完成登录…"
            : busy === "analyze"
              ? "正在分析文件，请稍候…"
              : "正在处理…"}
        </div>
      )}
    </>
  );
}
function Review({
  finding: f,
  accept,
  dismiss,
  open,
}: {
  finding: Item;
  accept: (v: Record<string, unknown>) => Promise<void>;
  dismiss: () => void;
  open: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <article className="review-card">
      <div className="review-top">
        <Badge kind={f.kind} />
        <small>
          {f.method}
          {f.demo ? " · 演示" : ""}
        </small>
      </div>
      <div className="source">
        <FileText aria-hidden="true" />
        <button className="plain" onClick={open}>
          {f.filename || "Canvas 作业"}
          {f.page ? ` · 第 ${f.page} 页` : ""}
        </button>
      </div>
      <blockquote className="quote">{f.excerpt}</blockquote>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await accept(Object.fromEntries(new FormData(e.currentTarget)));
          } catch (e) {
            setError(String(e));
            setBusy(false);
          }
        }}
      >
        <label className="field">
          安排标题
          <input name="title" required defaultValue={f.title} />
        </label>
        <div className="field-grid">
          <label className="field">
            日期
            <input type="date" name="date" defaultValue={f.date || ""} />
          </label>
          <label className="field">
            时间 · 香港
            <input type="time" name="time" defaultValue={f.time || ""} />
          </label>
          <label className="field">
            类型
            <select name="kind" defaultValue={f.kind}>
              {Object.entries(kinds).map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            课程
            <input name="course" defaultValue={f.course} />
          </label>
        </div>
        <p className="review-reason">
          {f.reason}
          {!f.date ? " · 日期待定，不会导出至日历" : ""}
        </p>
        <p className="form-error" role="alert">
          {error}
        </p>
        <div className="card-actions">
          <button type="button" className="plain" onClick={dismiss}>
            忽略这条
          </button>
          <button className="btn primary small" disabled={busy}>
            <Check aria-hidden="true" />
            确认并加入任务
          </button>
        </div>
      </form>
    </article>
  );
}
function Consent({
  title,
  settings,
  purpose,
  busy,
  onClose,
  submit,
}: {
  title: string;
  settings: Config;
  purpose: string;
  busy: boolean;
  onClose: () => void;
  submit: () => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <Modal title="确认发送给我的 AI" onClose={onClose}>
      <div className="modal-body">
        <p>
          文件：<strong>{title}</strong>
          <br />
          服务地址：{settings.endpoint}
          <br />
          模型：{settings.model || "尚未设置"}
          <br />
          用途：
          {purpose === "organize" ? "生成分类和改名建议" : "提取考试与截止日期"}
        </p>
        <div className="notice warn">
          将发送本地提取的正文（含 OCR），最多前 60,000 字符。原始文件和 Canvas
          登录会话不会随请求发送。
        </div>
        <label className="consent-check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          我确认将这份文件正文发送给以上服务。
        </label>
        <p className="form-help">
          结果需要核对；文件分类建议不会自动移动或改名原文件。
        </p>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          取消
        </button>
        <button
          className="btn primary"
          disabled={!checked || busy || !settings.model}
          onClick={submit}
        >
          {busy ? "正在分析…" : "发送并分析"}
        </button>
      </div>
    </Modal>
  );
}
function SettingsPage({
  state,
  save,
  action,
  confirm,
  busy,
}: {
  state: State;
  save: (v: Record<string, unknown>) => Promise<void>;
  action: (a: string, i?: Record<string, unknown>, n?: string) => void;
  confirm: (v: {
    title: string;
    body: string;
    action: () => Promise<void>;
  }) => void;
  busy: string;
}) {
  const [provider, setProvider] = useState(state.settings.provider);
  const [endpoint, setEndpoint] = useState(state.settings.endpoint);
  const [error, setError] = useState("");
  return (
    <div className="settings-layout">
      <section className="panel">
        <div className="settings-section">
          <h2>资料与工作区</h2>
          <p>
            原始文件在用户可见的文件夹中，索引和任务保存在 App 的本地数据库。
          </p>
          <div className="path-display">{state.workspace.root}</div>
          <button
            className="btn small"
            disabled={!!busy || state.job.running}
            onClick={() => action("choose_folder", {}, "资料目录已更新")}
          >
            <FolderOpen aria-hidden="true" />
            更换资料文件夹
          </button>
          {state.workspaces.length > 1 && (
            <label className="field">
              工作区
              <select
                value={state.workspace.id}
                onChange={(e) =>
                  action("switch_workspace", { id: e.target.value })
                }
              >
                {state.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="settings-section">
          <h2>Canvas 账号</h2>
          <p>
            {state.workspace.connected
              ? `已连接：${state.workspace.user?.name}`
              : "尚未连接。已有本地资料和手动任务仍可使用。"}
            <br />
            App 打开期间每小时检查一次；关闭 App 后停止同步。
          </p>
          <div className="heading-actions">
            <button
              className="btn small"
              disabled={!!busy || state.job.running}
              onClick={() => action("connect", {}, "Canvas 已连接")}
            >
              <LogIn aria-hidden="true" />
              {state.workspace.connected ? "重新登录" : "登录并授权 Canvas"}
            </button>
            {state.workspace.connected && (
              <button
                className="btn small"
                onClick={() =>
                  confirm({
                    title: "退出 Canvas 登录？",
                    body: "停止同步并清除会话与读取缓存。已下载文件和学习安排会保留。",
                    action: async () => {
                      action("logout", {}, "已退出 Canvas 登录");
                    },
                  })
                }
              >
                退出登录
              </button>
            )}
            <button
              className="btn small"
              disabled={!state.workspace.connected || state.job.running}
              onClick={() =>
                action("sync", { restore: true }, "正在重新下载可见资料")
              }
            >
              恢复本地删除的下载
            </button>
          </div>
          <p className="form-help">
            {state.job.stage} · 下载 {state.job.downloaded} · 跳过{" "}
            {state.job.skipped} · 未完成 {state.job.failed}
          </p>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            const form = e.currentTarget;
            try {
              await save({
                ...Object.fromEntries(new FormData(form)),
                provider,
                endpoint,
              });
              (form.elements.namedItem("apiKey") as HTMLInputElement).value =
                "";
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          <div className="settings-section">
            <h2>我的 AI</h2>
            <p>
              聊天订阅不一定包含 API。配置你的接口，或连接本机 Ollama；没有 AI
              也可以使用本地规则和手动安排。
            </p>
            <div className="field-grid">
              <label className="field field-full">
                接口类型
                <select
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setEndpoint(
                      (
                        {
                          compatible: "https://api.openai.com/v1",
                          anthropic: "https://api.anthropic.com/v1",
                          ollama: "http://127.0.0.1:11434",
                        } as Record<string, string>
                      )[e.target.value],
                    );
                  }}
                >
                  <option value="compatible">兼容 OpenAI 风格接口</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="ollama">本地 Ollama</option>
                </select>
              </label>
              <label className="field field-full">
                API 基础地址
                <input
                  required
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://…/v1"
                />
              </label>
              <label className="field">
                模型名称
                <input
                  name="model"
                  defaultValue={state.settings.model}
                  placeholder="服务商提供的模型 ID"
                />
              </label>
              <label className="field">
                API 密钥
                <input
                  name="apiKey"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    state.settings.hasKey
                      ? "已保存在 Keychain，留空保留"
                      : "本地 Ollama 无需密钥"
                  }
                />
              </label>
            </div>
            <p className="form-help">
              密钥保存于 macOS Keychain，不写入数据库、文件或日志。云端使用
              HTTPS，本机服务可使用 HTTP。
            </p>
            <p className="form-error" role="alert">
              {error}
            </p>
          </div>
          <div className="settings-actions">
            <button className="btn primary" disabled={!!busy}>
              保存 AI 设置
            </button>
          </div>
        </form>
        <div className="settings-section">
          <h2>缓存与密钥</h2>
          <div className="heading-actions">
            <button
              className="btn small"
              onClick={() => action("clear_cache", {}, "文字和 OCR 缓存已清理")}
            >
              清理读取缓存
            </button>
            <button
              className="btn small"
              onClick={() =>
                confirm({
                  title: "移除 AI 密钥？",
                  body: "删除本 App 的 AI Keychain 项目，保留其他设置。",
                  action: async () => {
                    action("settings", { clearKey: true }, "AI 密钥已移除");
                  },
                })
              }
            >
              移除 AI 密钥
            </button>
          </div>
        </div>
      </section>
      <aside className="panel">
        <div className="panel-head">
          <h2>为本地学习设计</h2>
        </div>
        <div className="panel-body">
          <ul className="detail-list">
            <li>
              <ShieldCheck aria-hidden="true" />
              <div>
                <strong>原文件始终在本机</strong>云端 AI
                仅在你主动确认后收到选定文件的正文。
              </div>
            </li>
            <li>
              <Sparkles aria-hidden="true" />
              <div>
                <strong>每一个发现都有来源</strong>AI
                提取结果先核对，未知日期和周次保留待确认。
              </div>
            </li>
            <li>
              <CalendarDays aria-hidden="true" />
              <div>
                <strong>安排可以带走</strong>导出 ICS 到日历。Apple
                提醒事项和自动同步将在后续版本接入。
              </div>
            </li>
            <li>
              <CircleHelp aria-hidden="true" />
              <div>
                <strong>Prototype v{state.version}</strong>Apple Silicon · macOS
                13+
                <br />
                原型未进行 Apple 公证。
              </div>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(<App />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());

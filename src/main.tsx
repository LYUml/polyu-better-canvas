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

import type { Item } from "./types";
import { Library, canonicalCourse } from "./components/Library";
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
  assignment: "Assignment",
  exam: "Exam",
  study: "Study session",
  lecture: "Course",
  other: "Other",
};
const routes: { id: Page; name: string; icon: typeof BookOpen }[] = [
  { id: "home", name: "Home", icon: LayoutDashboard },
  { id: "files", name: "Library", icon: FolderOpen },
  { id: "review", name: "Review", icon: Sparkles },
  { id: "calendar", name: "Calendar", icon: CalendarDays },
  { id: "tasks", name: "Tasks", icon: CheckSquare },
  { id: "settings", name: "Settings", icon: Settings },
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
    name: "Local workspace",
    configured: false,
    connected: false,
    root: "Documents/PolyU Better Canvas/Local",
  },
  workspaces: [],
  files: [],
  tasks: [],
  findings: [],
  courses: [],
  job: {
    running: false,
    stage: "Not synced yet",
    downloaded: 0,
    failed: 0,
    skipped: 0,
  },
  version: "0.2.0",
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
        name: "Demo workspace",
        user: { id: "preview-user", name: "Demo user" },
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
          "Tutorial 01 — Exercises.pdf",
          "Teaching schedule.pdf",
          "Assignment 1.pdf",
          "Reading notes.md",
        ].map((name, i) => ({
          id: `preview-${c}-${i}`,
          name,
          course,
          category: [
            "Overview",
            "Lectures",
            "Tutorials",
            "Overview",
            "Assignments",
            "Readings",
          ][i],
          ext: i === 5 ? "md" : "pdf",
          size: (i + 1) * 184320,
          relative: `${course}/${name}`,
          demo: true,
          module: [
            "Course overview",
            "Week 1 · Fundamentals",
            "Week 1 · Fundamentals",
            "Course overview",
            "Assessments",
            "Readings",
          ][i],
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
          title: "Organize this week’s notes",
          kind: "study",
          demo: true,
        },
        {
          id: "p-task-4",
          title: "Review optical fundamentals",
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
          method: "Synthetic demo · PDF text",
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
    ? "Undated"
    : d === today()
      ? "Today"
      : new Date(d + "T12:00:00+08:00").toLocaleDateString("en-HK", {
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
      {demo ? "Demo" : kinds[kind] || kind}
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
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
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
    <Modal title={task?.id ? "Edit task" : "Add a task"} onClose={close}>
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
              Title
              <input
                name="title"
                required
                maxLength={200}
                defaultValue={task?.title || ""}
                placeholder="For example: Submit the course report"
                autoFocus
              />
            </label>
            <label className="field">
              Type
              <select name="kind" defaultValue={task?.kind || "assignment"}>
                {Object.entries(kinds).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Course
              <input
                name="course"
                defaultValue={task?.course || ""}
                placeholder="Optional"
              />
            </label>
            <label className="field">
              Date
              <input type="date" name="date" defaultValue={task?.date || ""} />
            </label>
            <label className="field">
              Time · Hong Kong
              <input type="time" name="time" defaultValue={task?.time || ""} />
            </label>
            <label className="field field-full">
              Notes
              <textarea
                name="notes"
                defaultValue={task?.notes || ""}
                placeholder="Steps, location or study goals"
              />
            </label>
          </div>
          <p className="form-help">
            Undated tasks stay in the list. Dates without times are all-day
            events; a timed deadline marks the submission cutoff.
          </p>
          {task?.source && (
            <details className="detail-source">
              <summary>View source</summary>
              <div className="quote">
                {task.source.filename || "Canvas assignment"}
                {task.source.page ? ` · Page ${task.source.page}` : ""}
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
              Delete task
            </button>
          )}
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button disabled={busy} className="btn primary">
            {busy ? "Saving…" : "Save task"}
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
            method: "Synthetic preview · PDF text",
            text: "Course syllabus\n\nOptics and Lighting\n\nCourse overview\nThis course introduces lighting principles and visual comfort.\n\nAssessment\nAssignment 1: lighting analysis.\nFinal report submission: 30 October 2026, 23:59 (Hong Kong time).\n\nSynthetic content for interface testing.",
          },
        ],
      } as T;
    if (!native)
      throw new Error(
        "This browser is a UI preview. Use the Mac app for files, Canvas and AI.",
      );
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
  const courses = [
    ...new Set(
      state.files.map((f) => canonicalCourse(f.course || "Local materials")),
    ),
  ];
  const upcoming = todo.filter((t) => t.date).slice(0, 5);
  const fileMatches = state.files.filter(
    (f) =>
      (!course || canonicalCourse(f.course || "Local materials") === course) &&
      `${f.name} ${f.course} ${f.category} ${f.materialType} ${f.module} ${f.relative}`
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
        setMessage("Classification suggested. No file changes made.");
      } else {
        setMessage(
          `Added ${result.added || 0}  suggestions to review${result.rejected ? `, ${result.rejected}  rejected by source validation` : ""}${result.truncated ? "; analyzed the first 60,000 characters only" : ""}`,
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
            You can open the original file in its default app.
          </div>
        ) : documentText ? (
          documentText.pages.map((p) => (
            <div className="page-text" key={p.page}>
              <strong>
                Page {p.page} · {p.method || "Text"}
              </strong>
              <pre>{p.text || "No readable text on this page"}</pre>
            </div>
          ))
        ) : (
          <div className="loading">
            <RefreshCw aria-hidden="true" />
            Reading text and OCR locally…
          </div>
        )}
      </div>
      <div className="file-info">
        <Badge
          demo={selected.demo}
          kind={selected.category || selected.materialType || "Unsorted"}
        />
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
          Open original
        </button>
        <button
          className="btn"
          onClick={() => run("reveal_file", { id: selected.id })}
        >
          <FolderOpen aria-hidden="true" />
          Show in Finder
        </button>
        <p className="form-error" role="alert">
          {error}
        </p>
        <h3>Extract study dates</h3>
        <button
          className="btn soft"
          disabled={!!busy || !documentText}
          onClick={() => void analyze("local")}
        >
          <Search aria-hidden="true" />
          {busy === "analyze" ? "Analyzing…" : "Extract dates locally"}
        </button>
        <button
          className="btn primary"
          disabled={!!busy || !documentText}
          onClick={() => setConsent("deadlines")}
        >
          <Sparkles aria-hidden="true" />
          Analyze with my AI
        </button>
        <p className="ai-disclosure">
          Suggestions go to Review. AI receives text only with your approval;
          your Canvas session stays private.
        </p>
        <h3>Organize material</h3>
        <label className="field">
          Material type
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
            <option value="">
              Automatic ({selected.materialType || "Unsorted"})
            </option>
            {[
              "Overview",
              "Lectures",
              "Tutorials",
              "Assignments",
              "Exams",
              "Labs",
              "Readings",
              "Pages",
              "Unsorted",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button
          className="btn small"
          disabled={!documentText || !!busy}
          onClick={() => setConsent("organize")}
        >
          <Sparkles aria-hidden="true" />
          Suggest classification with AI
        </button>
        {categorySuggestion && (
          <div className="category-result">
            <strong>{categorySuggestion.category}</strong>
            <br />
            Suggested name: {categorySuggestion.suggestedName}
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
                  "Material type updated. Original filename kept.",
                );
                setSelected({
                  ...selected,
                  category: categorySuggestion.category,
                });
              }}
            >
              Apply material type
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
              aria-label={`Complete: ${t.title}`}
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
                <span>{t.course || "Personal"}</span>
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
          <strong>No tasks here yet</strong>Add a task or extract deadlines from
          course files.
          <br />
          <button className="btn small" onClick={() => setEdit({ id: "" })}>
            <Plus aria-hidden="true" />
            Add task
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
        Skip to content
      </a>
      {!native && (
        <div className="native-preview">
          {previewMode
            ? "Synthetic preview · All content is fictional"
            : "UI preview · Use the Mac app for files, Canvas and AI"}
        </div>
      )}
      <div className={`shell page-${page}`}>
        <aside className="sidebar">
          <div className="brand">
            <span className="brandmark">
              <BookOpen aria-hidden="true" />
            </span>
            <div>
              <strong>Better Canvas</strong>
              <small>CANVAS · LOCAL</small>
            </div>
          </div>
          <div className="nav-caption">Workspace</div>
          <nav className="nav" aria-label="Main navigation">
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
                {state.workspace.connected
                  ? "Canvas connected"
                  : "Local workspace"}
              </span>
            </div>
            <button
              className="demo-link"
              onClick={() => run("demo", {}, "Demo loaded")}
            >
              <Sparkles aria-hidden="true" />
              Load demo
            </button>
            {state.files.some((f) => f.demo) && (
              <button
                className="demo-link"
                onClick={() => run("clear_demo", {}, "Demo removed")}
              >
                Remove demo
              </button>
            )}
            <div className="sidebar-version">
              <span>Files stay on your Mac</span>
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
                  ? `${fileMatches.length}  files`
                  : "Study workspace"}
              </span>
            </div>
            <div className="top-actions">
              <button
                className="top-search"
                aria-label="Search materials, Command K"
                onClick={() => {
                  changePage("files");
                  setTimeout(
                    () => document.getElementById("file-search")?.focus(),
                    50,
                  );
                }}
              >
                <Search aria-hidden="true" />
                <span>Search materials</span>
                <span className="kbd">⌘ K</span>
              </button>
              <button
                className="btn small"
                onClick={() => run("export", {}, "Calendar exported")}
              >
                <Download aria-hidden="true" />
                Export calendar
              </button>
              <span
                className="avatar"
                title={state.workspace.user?.name || "Local user"}
              >
                {state.workspace.user?.name?.slice(0, 1) || "Local"}
              </span>
            </div>
          </header>
          <main id="main" className="main">
            <div className="page-heading">
              <div>
                {page === "home" && (
                  <div className="date-label">
                    {new Date(today() + "T12:00:00+08:00").toLocaleDateString(
                      "en-HK",
                      {
                        month: "long",
                        day: "numeric",
                        weekday: "long",
                        timeZone: "Asia/Hong_Kong",
                      },
                    )}{" "}
                    · Hong Kong time
                  </div>
                )}
                <h1>{page === "home" ? "Today" : title}</h1>
                <p>
                  {
                    {
                      home: "See what is coming up and continue your work.",
                      files:
                        "Browse course materials by type or Canvas module. Original files stay in your folder.",
                      review: "Review each suggestion against its source.",
                      calendar:
                        "Keep deadlines and planned study time in one place.",
                      tasks: "Turn course requirements into clear next steps.",
                      settings:
                        "Manage your library, Canvas account and AI provider.",
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
                      onClick={() => run("scan", {}, "Library index updated")}
                    >
                      <RefreshCw aria-hidden="true" />
                      Rescan
                    </button>
                    <button
                      className="btn primary"
                      disabled={state.job.running || !!busy}
                      onClick={() =>
                        state.workspace.connected
                          ? run("sync")
                          : run(
                              "connect",
                              {},
                              "Canvas connected. Ready to sync.",
                            )
                      }
                    >
                      <RefreshCw aria-hidden="true" />
                      {state.workspace.connected
                        ? "Sync Canvas"
                        : "Connect Canvas"}
                    </button>
                  </>
                )}
                {["tasks", "calendar"].includes(page) && (
                  <button
                    className="btn primary"
                    onClick={() => setEdit({ id: "" })}
                  >
                    <Plus aria-hidden="true" />
                    Add task
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
                    Downloaded {state.job.downloaded} · Skipped{" "}
                    {state.job.skipped} · Failed {state.job.failed}
                  </small>
                </p>
                <button className="btn small" onClick={() => run("cancel")}>
                  Cancel sync
                </button>
              </div>
            )}
            {state.job.error && !state.job.running && (
              <div className="notice warn">{state.job.error}</div>
            )}
            {!ready ? (
              <div className="loading">
                <RefreshCw aria-hidden="true" />
                Opening your workspace…
              </div>
            ) : !state.workspace.configured && page === "home" ? (
              <section className="onboard panel">
                <div className="panel-body">
                  <div className="step">WELCOME</div>
                  <h2>Choose your library.</h2>
                  <p>
                    Choose an existing course folder or create a library.
                    Existing files stay in place. Connect Canvas and your own AI
                    when you are ready.
                  </p>
                  <button
                    className="btn primary"
                    disabled={!!busy}
                    onClick={() =>
                      run("choose_folder", {}, "Library folder connected")
                    }
                  >
                    <FolderOpen aria-hidden="true" />
                    Use an existing folder
                  </button>
                  <button
                    className="btn"
                    disabled={!!busy}
                    onClick={() =>
                      run("default_folder", {}, "Default library created")
                    }
                  >
                    Create a default library
                  </button>
                  <p className="form-help">
                    You can load synthetic demo materials from the sidebar
                    first.
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
                            ? `${pending.length} ${pending.length === 1 ? "suggestion" : "suggestions"} to review`
                            : "Start with course materials"}
                        </h2>
                        <p>
                          {pending.length
                            ? "Check the source and dates before adding tasks."
                            : "Select a syllabus to extract exams and deadlines with your AI."}
                        </p>
                      </div>
                      <button
                        className="btn"
                        onClick={() =>
                          changePage(pending.length ? "review" : "files")
                        }
                      >
                        {pending.length
                          ? "Review suggestions"
                          : "Browse materials"}
                        <ChevronRight aria-hidden="true" />
                      </button>
                    </section>
                    <div className="stats">
                      {[
                        {
                          icon: BookOpen,
                          label: "Courses",
                          value: courses.length,
                          help: "Connect your materials",
                          page: "files",
                        },
                        {
                          icon: FileText,
                          label: "Local materials",
                          value: state.files.length,
                          help: "Files stay local",
                          page: "files",
                        },
                        {
                          icon: Clock,
                          label: "Open tasks",
                          value: todo.length,
                          help: "Work at your own pace",
                          page: "tasks",
                        },
                        {
                          icon: Sparkles,
                          label: "To review",
                          value: pending.length,
                          help: "Accept before adding to calendar",
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
                          <h2>Coming up</h2>
                          <button
                            className="plain"
                            onClick={() => changePage("tasks")}
                          >
                            All tasks
                            <ArrowUpRight aria-hidden="true" />
                          </button>
                        </div>
                        {taskRows(upcoming)}
                      </section>
                      <section className="panel">
                        <div className="panel-head">
                          <h2>This month</h2>
                          <button
                            className="plain"
                            onClick={() => changePage("calendar")}
                            aria-label="Open calendar"
                          >
                            <ArrowUpRight aria-hidden="true" />
                          </button>
                        </div>
                        <div className="panel-body">
                          <div className="mini-top">
                            <span>
                              {month.toLocaleDateString("en-HK", {
                                month: "long",
                                year: "numeric",
                              })}
                            </span>
                            <CalendarDays aria-hidden="true" />
                          </div>
                          <div className="mini-grid">
                            {[
                              "Mon",
                              "Tue",
                              "Wed",
                              "Thu",
                              "Fri",
                              "Sat",
                              "Sun",
                            ].map((d) => (
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
                            <span>Assignments / Study</span>
                            <span>Exams</span>
                          </div>
                        </div>
                      </section>
                    </div>
                    <section className="course-section">
                      <div className="section-head">
                        <h2>My courses</h2>
                        <button
                          className="plain"
                          onClick={() => changePage("files")}
                        >
                          View all
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
                                  state.files.filter(
                                    (f) =>
                                      canonicalCourse(
                                        f.course || "Local materials",
                                      ) === c,
                                  ).length
                                }{" "}
                                local files
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
                          Connect Canvas or choose an existing folder to see
                          course materials.
                        </div>
                      )}
                    </section>
                  </>
                )}
                {page === "files" && (
                  <Library
                    files={state.files}
                    course={course}
                    setCourse={setCourse}
                    query={query}
                    setQuery={setQuery}
                    selected={selected}
                    onSelect={setSelected}
                    inspector={fileDetail}
                    inspectorTab={inspectorTab}
                    setInspectorTab={setInspectorTab}
                    chooseFolder={() =>
                      run("choose_folder", {}, "Library folder connected")
                    }
                  />
                )}
                {page === "review" && (
                  <>
                    {pending.length > 0 && (
                      <div className="notice">
                        <ShieldCheck aria-hidden="true" />
                        <p>
                          Check the title, date, type and source. Only accepted
                          suggestions become tasks or calendar exports.
                          Week-only items can remain undated.
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
                              "Added to tasks",
                            );
                          }}
                          dismiss={() => run("finding_dismiss", { id: f.id })}
                          open={() => {
                            const file = state.files.find(
                              (x) => x.id === f.fileId,
                            );
                            if (file) setSelected(file);
                            else
                              setMessage(
                                "This suggestion comes from a Canvas assignment.",
                              );
                          }}
                        />
                      ))}
                    </div>
                    {!pending.length && (
                      <section className="panel empty">
                        <Sparkles aria-hidden="true" />
                        <strong>No suggestions to review</strong>Select a
                        syllabus in the library and extract dates with local
                        rules or your AI.
                        <br />
                        <button
                          className="btn"
                          onClick={() => changePage("files")}
                        >
                          Open library
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
                          Open<strong>{todo.length}</strong>
                        </span>
                      </div>
                      <div>
                        <CalendarDays aria-hidden="true" />
                        <span>
                          Today
                          <strong>
                            {todo.filter((t) => t.date === today()).length}
                          </strong>
                        </span>
                      </div>
                      <div>
                        <Clock aria-hidden="true" />
                        <span>
                          Undated
                          <strong>{todo.filter((t) => !t.date).length}</strong>
                        </span>
                      </div>
                    </div>
                    <div className="toolbar">
                      <div className="filter-pills">
                        {[
                          ["pending", "Open"],
                          ["completed", "Completed"],
                          ["all", "All"],
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
                          aria-label="Search tasks"
                          placeholder="Search tasks or courses…"
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
                          {month.toLocaleDateString("en-HK", {
                            month: "long",
                            year: "numeric",
                          })}
                        </h2>
                        <div className="calendar-controls">
                          <button
                            className="icon-btn"
                            aria-label="Previous month"
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
                            Today
                          </button>
                          <button
                            className="icon-btn"
                            aria-label="Next month"
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
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                          (d) => (
                            <div className="weekday" key={d}>
                              {d}
                            </div>
                          ),
                        )}
                        {days(month).map((d) => (
                          <div
                            key={dayKey(d)}
                            className={`day-cell ${d.getMonth() !== month.getMonth() ? "outside" : ""} ${dayKey(d) === today() ? "today" : ""}`}
                          >
                            <button
                              className="plain day-num"
                              aria-label={`Add a task on ${dayKey(d)}`}
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
                                  title={`${t.time || "All day"} ${t.title}`}
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
                        Hong Kong time · Undated tasks stay in the task list ·
                        Export includes dated, incomplete items
                      </p>
                    </section>
                    <aside className="panel agenda">
                      <div className="panel-head">
                        <h2>This month</h2>
                        <small>Hong Kong time</small>
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
                      await act("settings", input, "AI settings saved");
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
                Local workspace · {state.workspace.name}
              </span>
              <span>Student-built · Not an official PolyU app</span>
            </div>
          </main>
        </div>
      </div>
      {edit && (
        <TaskForm
          task={edit}
          close={() => setEdit(null)}
          submit={async (input) => {
            await act("task_save", input, "Task saved");
          }}
          remove={
            edit.id
              ? () =>
                  setConfirmAction({
                    title: "Delete this task?",
                    body: "Delete this task. Course files are kept.",
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
          title={selected.name || "Course material"}
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
              Cancel
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
              Confirm
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
            ? "Complete sign-in in the school window…"
            : busy === "analyze"
              ? "Analyzing the file…"
              : "Working…"}
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
          {f.demo ? " · Demo" : ""}
        </small>
      </div>
      <div className="source">
        <FileText aria-hidden="true" />
        <button className="plain" onClick={open}>
          {f.filename || "Canvas assignment"}
          {f.page ? ` · Page ${f.page}` : ""}
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
          Task title
          <input name="title" required defaultValue={f.title} />
        </label>
        <div className="field-grid">
          <label className="field">
            Date
            <input type="date" name="date" defaultValue={f.date || ""} />
          </label>
          <label className="field">
            Time · Hong Kong
            <input type="time" name="time" defaultValue={f.time || ""} />
          </label>
          <label className="field">
            Type
            <select name="kind" defaultValue={f.kind}>
              {Object.entries(kinds).map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Course
            <input name="course" defaultValue={f.course} />
          </label>
        </div>
        <p className="review-reason">
          {f.reason}
          {!f.date ? " · Undated; excluded from calendar export" : ""}
        </p>
        <p className="form-error" role="alert">
          {error}
        </p>
        <div className="card-actions">
          <button type="button" className="plain" onClick={dismiss}>
            Dismiss
          </button>
          <button className="btn primary small" disabled={busy}>
            <Check aria-hidden="true" />
            Accept and add task
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
    <Modal title="Confirm sending to AI" onClose={onClose}>
      <div className="modal-body">
        <p>
          File: <strong>{title}</strong>
          <br />
          Provider: {settings.endpoint}
          <br />
          Model: {settings.model || "Not configured"}
          <br />
          Purpose:
          {purpose === "organize"
            ? "Suggest a material type and display name"
            : "Extract exams and deadlines"}
        </p>
        <div className="notice warn">
          This sends up to 60,000 characters of locally extracted text,
          including OCR. It does not send the original file or Canvas session.
        </div>
        <label className="consent-check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          I approve sending this document text to the provider above.
        </label>
        <p className="form-help">
          Review the results. Classification suggestions do not move or rename
          original files.
        </p>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!checked || busy || !settings.model}
          onClick={submit}
        >
          {busy ? "Analyzing…" : "Send and analyze"}
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
          <h2>Library and workspace</h2>
          <p>
            Files live in your chosen folder. The app stores its index and tasks
            locally.
          </p>
          <div className="path-display">{state.workspace.root}</div>
          <button
            className="btn small"
            disabled={!!busy || state.job.running}
            onClick={() =>
              action("choose_folder", {}, "Library folder updated")
            }
          >
            <FolderOpen aria-hidden="true" />
            Change library folder
          </button>
          {state.workspaces.length > 1 && (
            <label className="field">
              Workspace
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
          <h2>Canvas account</h2>
          <p>
            {state.workspace.connected
              ? `Connected: ${state.workspace.user?.name}`
              : "Not connected. Local files and manual tasks are still available."}
            <br />
            Checks once an hour while the app is open. Closing the app stops
            syncing.
          </p>
          <div className="heading-actions">
            <button
              className="btn small"
              disabled={!!busy || state.job.running}
              onClick={() => action("connect", {}, "Canvas connected")}
            >
              <LogIn aria-hidden="true" />
              {state.workspace.connected
                ? "Sign in again"
                : "Sign in to Canvas"}
            </button>
            {state.workspace.connected && (
              <button
                className="btn small"
                onClick={() =>
                  confirm({
                    title: "Sign out of Canvas?",
                    body: "Stop syncing and clear this session and reading cache. Keep downloaded files and tasks.",
                    action: async () => {
                      action("logout", {}, "Signed out of Canvas");
                    },
                  })
                }
              >
                Sign out
              </button>
            )}
            <button
              className="btn small"
              disabled={!state.workspace.connected || state.job.running}
              onClick={() =>
                action(
                  "sync",
                  { restore: true },
                  "Re-downloading visible materials",
                )
              }
            >
              Restore deleted downloads
            </button>
          </div>
          <p className="form-help">
            {state.job.stage} · Downloaded {state.job.downloaded} · Skipped{" "}
            {state.job.skipped} · Failed {state.job.failed}
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
            <h2>My AI</h2>
            <p>
              A chat subscription may not include API access. Connect your
              provider or local Ollama, or use local rules and manual tasks.
            </p>
            <div className="field-grid">
              <label className="field field-full">
                Provider type
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
                  <option value="compatible">OpenAI-compatible</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="ollama">Local Ollama</option>
                </select>
              </label>
              <label className="field field-full">
                API base URL
                <input
                  required
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://…/v1"
                />
              </label>
              <label className="field">
                Model name
                <input
                  name="model"
                  defaultValue={state.settings.model}
                  placeholder="Model ID from your provider"
                />
              </label>
              <label className="field">
                API key
                <input
                  name="apiKey"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    state.settings.hasKey
                      ? "Saved in Keychain; leave blank to keep it"
                      : "Local Ollama does not need a key"
                  }
                />
              </label>
            </div>
            <p className="form-help">
              Keys are stored in macOS Keychain, not the database or logs.
              Remote providers require HTTPS; local services can use HTTP.
            </p>
            <p className="form-error" role="alert">
              {error}
            </p>
          </div>
          <div className="settings-actions">
            <button className="btn primary" disabled={!!busy}>
              Save AI settings
            </button>
          </div>
        </form>
        <div className="settings-section">
          <h2>Cache and keys</h2>
          <div className="heading-actions">
            <button
              className="btn small"
              onClick={() =>
                action("clear_cache", {}, "Text and OCR cache cleared")
              }
            >
              Clear reading cache
            </button>
            <button
              className="btn small"
              onClick={() =>
                confirm({
                  title: "Remove your AI key?",
                  body: "Remove this app's AI key from Keychain and keep other settings.",
                  action: async () => {
                    action("settings", { clearKey: true }, "AI key removed");
                  },
                })
              }
            >
              Remove AI key
            </button>
          </div>
        </div>
      </section>
      <aside className="panel">
        <div className="panel-head">
          <h2>Built for local study</h2>
        </div>
        <div className="panel-body">
          <ul className="detail-list">
            <li>
              <ShieldCheck aria-hidden="true" />
              <div>
                <strong>Original files stay local</strong>Cloud AI receives
                selected text only after you approve sending it.
              </div>
            </li>
            <li>
              <Sparkles aria-hidden="true" />
              <div>
                <strong>Suggestions include their sources</strong>AI suggestions
                require review; unclear dates and week numbers stay unresolved.
              </div>
            </li>
            <li>
              <CalendarDays aria-hidden="true" />
              <div>
                <strong>Take your schedule with you</strong>Export an ICS file
                to your calendar. Apple Reminders integration and automatic
                calendar sync are planned for a later release.
              </div>
            </li>
            <li>
              <CircleHelp aria-hidden="true" />
              <div>
                <strong>Prototype v{state.version}</strong>Apple Silicon · macOS
                13+
                <br />
                This prototype is not notarized by Apple.
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

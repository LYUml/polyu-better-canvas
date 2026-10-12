import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  FolderOpen,
  Folder,
  FileText,
  GraduationCap,
  List,
  LayoutGrid,
  Columns3,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  ShieldCheck,
} from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Item } from "../types";

export const canonicalCourse = (course: string) =>
  course.replace(/\s+\[\d+\]$/, "").trim();
const materialTypes = [
  "Overview",
  "Lectures",
  "Tutorials",
  "Assignments",
  "Exams",
  "Labs",
  "Readings",
  "Pages",
  "Unsorted",
];
const descriptions: Record<string, string> = {
  Overview: "Syllabi and teaching schedules",
  Lectures: "Lecture notes and slides",
  Tutorials: "Exercises and worked solutions",
  Assignments: "Briefs, projects and submissions",
  Exams: "Past papers and revision",
  Labs: "Lab sheets and practical work",
  Readings: "References and supplementary notes",
  Pages: "Canvas pages and announcements",
  Unsorted: "Needs a material type",
};
function kindOf(file: Item): string {
  if (file.category && materialTypes.includes(file.category))
    return file.category;
  if (file.materialType && materialTypes.includes(file.materialType))
    return file.materialType;
  const name = file.name || "";
  const path = file.relative || "";
  if (
    /\/(pages|announcements)\//i.test(path) &&
    /^(md|html?)$/.test(file.ext || "")
  )
    return "Pages";
  for (const [type, re] of [
    [
      "Overview",
      /syllabus|course.?outline|teaching.?schedule|assessment.?rubric/i,
    ],
    ["Exams", /exam|midterm|past.?test|revision|\bquiz\b/i],
    [
      "Assignments",
      /assignment|\bassign\d*|\bassessment\b|\bproject\b|homework/i,
    ],
    [
      "Tutorials",
      /tutorial|(?:^|[ _.-])tut(?:\b|[_ -]|\d)|\bexercise|\bpractice/i,
    ],
    ["Labs", /\blab(?:oratory|sheet|\b|[_ -]|\d)|\bexperiment/i],
    ["Lectures", /lecture|(?:^|[ _.-])lec(?:\b|[_ -]|\d)|\bslides\b/i],
    ["Readings", /\breading|\breference|\btextbook|\barticle|\bsupplementary/i],
  ] as [string, RegExp][])
    if (re.test(name)) return type;
  return "Unsorted";
}
function moduleOf(file: Item): string {
  if (file.module) return file.module;
  const parts = (file.relative || "").split("/");
  return parts.length > 2 ? parts[1] : "General";
}
function displayName(file: Item) {
  if (file.suggestedName) return file.suggestedName;
  const name = file.name || "Untitled file";
  return /\[\d+\]\//.test(file.relative || "")
    ? name.replace(/^\d+-/, "")
    : name;
}
function readableSize(n = 0) {
  return n >= 1048576
    ? `${(n / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;
}
function stored(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
const iconCache = new Map<string, string>();
const pendingIcons = new Map<string, Promise<{ dataUrl?: string }>>();
function FileIcon({ file }: { file: Item }) {
  const ext = file.ext || "file";
  const [icon, setIcon] = useState(iconCache.get(ext));
  useEffect(() => {
    if (!isTauri() || iconCache.has(ext)) {
      setIcon(iconCache.get(ext));
      return;
    }
    let active = true;
    if (!pendingIcons.has(ext))
      pendingIcons.set(
        ext,
        invoke<{ dataUrl?: string }>("dispatch", {
          action: "file_icon",
          input: { id: file.id },
        }).finally(() => pendingIcons.delete(ext)),
      );
    pendingIcons
      .get(ext)!
      .then((result) => {
        if (result.dataUrl) {
          iconCache.set(ext, result.dataUrl);
          if (active) setIcon(result.dataUrl);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [ext, file.id]);
  return icon ? (
    <img className="system-file-icon" src={icon} alt="" />
  ) : (
    <FileText aria-hidden="true" />
  );
}

type Props = {
  files: Item[];
  course: string;
  setCourse: (value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  selected: Item | null;
  onSelect: (value: Item | null) => void;
  inspector: ReactNode;
  inspectorTab: string;
  setInspectorTab: (value: string) => void;
  chooseFolder: () => void;
};
export function Library({
  files,
  course,
  setCourse,
  query,
  setQuery,
  selected,
  onSelect,
  inspector,
  inspectorTab,
  setInspectorTab,
  chooseFolder,
}: Props) {
  const [view, setView] = useState(() => {
    const v = stored("better-canvas.library.view", "grid");
    return ["grid", "list", "columns"].includes(v) ? v : "grid";
  });
  const [grouping, setGrouping] = useState("type");
  const [section, setSection] = useState("");
  const [page, setPage] = useState(0);
  const courses = [
    ...new Set(
      files.map((f) => canonicalCourse(f.course || "Local materials")),
    ),
  ];
  const scoped = files.filter(
    (f) => !course || canonicalCourse(f.course || "Local materials") === course,
  );
  const matching = scoped.filter((f) =>
    `${f.name} ${f.course} ${kindOf(f)} ${moduleOf(f)}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const sectionFor = (f: Item) =>
    grouping === "type"
      ? kindOf(f)
      : course
        ? moduleOf(f)
        : `${canonicalCourse(f.course || "Local materials")} · ${moduleOf(f)}`;
  const sections =
    grouping === "type"
      ? materialTypes.filter((type) => scoped.some((f) => kindOf(f) === type))
      : [...new Set(scoped.map(sectionFor))].sort((a, b) => a.localeCompare(b));
  const effectiveSection =
    section && sections.includes(section)
      ? section
      : view === "columns" && !query
        ? sections[0] || ""
        : "";
  const results = matching.filter(
    (f) => !effectiveSection || sectionFor(f) === effectiveSection,
  );
  const maxPage = Math.max(0, Math.ceil(results.length / 40) - 1);
  const currentPage = Math.min(page, maxPage);
  const visible = results.slice(currentPage * 40, currentPage * 40 + 40);
  const showingFolders = !effectiveSection && !query && view !== "columns";
  const chooseSection = (value: string) => {
    setSection(value);
    setPage(0);
    onSelect(null);
  };
  const setMode = (mode: string) => {
    setView(mode);
    try {
      localStorage.setItem("better-canvas.library.view", mode);
    } catch {}
  };
  const folderItems = sections.filter((s) =>
    matching.some((f) => sectionFor(f) === s),
  );
  const folderRows = folderItems.map((s) => (
    <tr key={s}>
      <td>
        <button className="file-name" onClick={() => chooseSection(s)}>
          <Folder aria-hidden="true" />
          <span>{s}</span>
        </button>
      </td>
      <td>{scoped.filter((f) => sectionFor(f) === s).length} materials</td>
      <td>{descriptions[s] || "Canvas module"}</td>
    </tr>
  ));
  const row = (f: Item) => (
    <tr key={f.id} className={selected?.id === f.id ? "selected" : ""}>
      <td>
        <button
          className="file-name"
          title={f.name}
          aria-pressed={selected?.id === f.id}
          onClick={() => onSelect(f)}
        >
          <FileIcon file={f} />
          <span>
            {displayName(f)}
            <small>
              {f.demo ? "Demo · " : ""}
              {canonicalCourse(f.course || "Local materials")}
            </small>
          </span>
        </button>
      </td>
      <td>{kindOf(f)}</td>
      <td>{readableSize(f.size)}</td>
    </tr>
  );
  return (
    <section
      className={`finder modular-library ${selected ? "has-selection" : ""} view-${view}`}
    >
      <aside className="finder-courses" aria-label="Courses">
        <div className="rail-caption">Courses</div>
        <button
          className={!course ? "active" : ""}
          aria-pressed={!course}
          onClick={() => {
            setCourse("");
            chooseSection("");
          }}
        >
          <FolderOpen aria-hidden="true" />
          <span>All materials</span>
          <small>{files.length}</small>
        </button>
        {courses.map((c) => (
          <button
            key={c}
            title={c}
            className={course === c ? "active" : ""}
            aria-pressed={course === c}
            onClick={() => {
              setCourse(c);
              chooseSection("");
            }}
          >
            <GraduationCap aria-hidden="true" />
            <span>{c}</span>
            <small>
              {
                files.filter(
                  (f) => canonicalCourse(f.course || "Local materials") === c,
                ).length
              }
            </small>
          </button>
        ))}
        <div className="rail-note">
          <ShieldCheck aria-hidden="true" />
          <span>Virtual sections. Original files stay in place.</span>
        </div>
      </aside>
      <div className="finder-list">
        <div className="library-title">
          <div>
            <h2>{course || "All materials"}</h2>
            <small>
              {scoped.length} materials · {sections.length}{" "}
              {grouping === "type" ? "sections" : "modules"}
            </small>
          </div>
          <div className="view-switch" aria-label="Library view">
            {[
              ["grid", "Icons", LayoutGrid],
              ["list", "List", List],
              ["columns", "Columns", Columns3],
            ].map(([id, label, Icon]) => {
              const Glyph = Icon as typeof List;
              return (
                <button
                  key={id as string}
                  className="icon-btn"
                  aria-label={`${label} view`}
                  title={label as string}
                  aria-pressed={view === id}
                  onClick={() => setMode(id as string)}
                >
                  <Glyph aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
        <div className="toolbar">
          <div className="search-field">
            <Search aria-hidden="true" />
            <input
              id="file-search"
              aria-label="Search materials"
              placeholder="Search materials…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <label className="grouping-label">
            <span>Group</span>
            <select
              aria-label="Group materials by"
              value={grouping}
              onChange={(e) => {
                setGrouping(e.target.value);
                chooseSection("");
              }}
            >
              <option value="type">Material type</option>
              <option value="module">Canvas module</option>
            </select>
          </label>
          <button
            className="icon-btn"
            aria-label="Choose library folder"
            title="Choose library folder"
            onClick={chooseFolder}
          >
            <FolderOpen aria-hidden="true" />
          </button>
        </div>
        <div className="library-path">
          <button onClick={() => chooseSection("")}>
            {grouping === "type" ? "Material sections" : "Canvas modules"}
          </button>
          {effectiveSection && (
            <>
              <ChevronRight aria-hidden="true" />
              <span>{effectiveSection}</span>
            </>
          )}
        </div>
        <div className="library-content-view">
          {view === "columns" && (
            <div className="section-rail" aria-label="Material sections">
              {sections.map((s) => (
                <button
                  key={s}
                  aria-pressed={effectiveSection === s}
                  className={effectiveSection === s ? "active" : ""}
                  onClick={() => chooseSection(s)}
                >
                  <Folder aria-hidden="true" />
                  <span>{s}</span>
                  <small>
                    {scoped.filter((f) => sectionFor(f) === s).length}
                  </small>
                </button>
              ))}
            </div>
          )}
          <div className="file-table-scroll">
            {showingFolders && view === "grid" ? (
              <div className="section-folder-grid">
                {folderItems.map((s) => (
                  <button
                    className="section-folder"
                    key={s}
                    onClick={() => chooseSection(s)}
                  >
                    <Folder aria-hidden="true" />
                    <strong>{s}</strong>
                    <small>
                      {scoped.filter((f) => sectionFor(f) === s).length}{" "}
                      materials
                    </small>
                    <p>{descriptions[s] || "Canvas module"}</p>
                  </button>
                ))}
              </div>
            ) : showingFolders ? (
              <table className="file-table section-table">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Materials</th>
                    <th>Contains</th>
                  </tr>
                </thead>
                <tbody>{folderRows}</tbody>
              </table>
            ) : view === "grid" ? (
              <div className="material-grid">
                {visible.map((f) => (
                  <button
                    key={f.id}
                    className={`material-tile ${selected?.id === f.id ? "active" : ""}`}
                    aria-pressed={selected?.id === f.id}
                    title={f.name}
                    onClick={() => onSelect(f)}
                  >
                    <FileIcon file={f} />
                    <span>{displayName(f)}</span>
                    <small>
                      {kindOf(f)} · {readableSize(f.size)}
                    </small>
                    <small>
                      {f.demo ? "Demo · " : ""}
                      {moduleOf(f)}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <table className="file-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Type</th>
                    <th>Size</th>
                  </tr>
                </thead>
                <tbody>{visible.map(row)}</tbody>
              </table>
            )}
            {!matching.length && (
              <div className="empty">
                <FolderOpen aria-hidden="true" />
                <strong>
                  {query ? "No matching materials" : "No materials yet"}
                </strong>
                <p>
                  {query
                    ? "Try another search or clear your filters."
                    : "Choose a folder or connect Canvas to start."}
                </p>
                <button
                  className="btn small"
                  onClick={() => (query ? setQuery("") : chooseFolder())}
                >
                  {query ? "Clear search" : "Choose folder"}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="pagination">
          <span>
            {showingFolders
              ? `${folderItems.length} sections`
              : `${results.length} materials · Page ${currentPage + 1}`}
          </span>
          {!showingFolders && results.length > 40 && (
            <div>
              <button
                className="icon-btn"
                aria-label="Previous page"
                disabled={!currentPage}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft aria-hidden="true" />
              </button>{" "}
              <button
                className="icon-btn"
                aria-label="Next page"
                disabled={currentPage === maxPage}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
      <aside
        className="finder-inspector"
        aria-label="Inspector"
        data-inspector-tab={inspectorTab}
      >
        <div className="inspector-head">
          <h2>Inspector</h2>
          {selected && (
            <button
              className="icon-btn"
              aria-label="Close inspector"
              onClick={() => onSelect(null)}
            >
              <X aria-hidden="true" />
            </button>
          )}
        </div>
        {selected ? (
          <>
            <div className="inspector-title">
              <FileIcon file={selected} />
              <h3>{displayName(selected)}</h3>
            </div>
            <div className="inspector-context">
              <span>{kindOf(selected)}</span>
              <small>{moduleOf(selected)}</small>
            </div>
            <div
              className="inspector-tabs filter-pills"
              aria-label="Inspector view"
            >
              {[
                ["preview", "Text preview"],
                ["actions", "File and AI"],
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
            {inspector}
          </>
        ) : (
          <div className="inspector-empty">
            <FileText aria-hidden="true" />
            <h3>Select a material</h3>
            <p>
              Browse a section, then select a file to read its source or analyze
              it.
            </p>
          </div>
        )}
      </aside>
    </section>
  );
}

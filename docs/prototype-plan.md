# PolyU Better Canvas · Prototype scope

## Workflow

Sign in to Canvas → download locally → browse material sections → select a document → use your AI or local date rules → review evidence → manage tasks and calendar → export ICS.

## Implementation

- Tauri 2 desktop container, React/TypeScript interface, Rust core, SQLite index.
- Swift school sign-in, Keychain, system file icons, PDFKit and Vision OCR.
- Original files remain in a user-selected folder. Account workspaces are isolated.
- Material sections: Overview, Lectures, Tutorials, Assignments, Exams, Labs, Readings, Pages and Unsorted. Filename/folder rules initialize classification; manual labels override it. Canvas source folders provide module grouping.
- Icons, List and Columns views reuse the same indexed files. No physical reorganization is performed.
- Manual Canvas sync and hourly checks only while the app is running. Preserve local edits and local deletions.
- AI supports OpenAI-compatible, Anthropic and Ollama interfaces. Users approve sending text. Dates require source evidence and acceptance; week numbers are not guessed.
- Tasks and calendar share one data model. Stable UID ICS export covers confirmed, dated, incomplete items in Hong Kong time.

The app targets Apple Silicon macOS 13+. Native Apple Calendar/Reminders writing, cross-device sync, Office parsing, videos, grades and broader platforms are outside the prototype scope.

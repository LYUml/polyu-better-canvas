# Sources and permission

PolyU Better Canvas is a student-built local study tool, not an official Hong Kong Polytechnic University application.

Original implementation is covered by the root LICENSE. Borrowed implementation retains the independent source and permission described below; inclusion does not automatically relicense it under MIT.

## PolyU Study Console

Source: https://github.com/Andre-HUANG/polyu-study-console

Inspected revision: `11a17fb15e58d2c741db6f75b974457683bccf77`.

On 2026-10-12, this project's owner confirmed in the development conversation that they had privately contacted the original author and obtained permission to reuse, reference and modify implementation. This notice records that permission source; it does not claim the upstream repository grants a general public open-source license.

- `src-tauri/native/DocumentReader.swift`: adapted from `MacApp/DocumentReader.swift`, retaining PDFKit/Vision text, layout row ordering and OCR, with versioned private JSON communication.
- `src-tauri/native/NativeBridge.swift`: school sign-in, cookie filtering and Keychain patterns adapted from `MacApp/App.swift` and `SessionVault.swift`. System file icon rendering is an addition in this project.
- Rust collection and evidence flows reference and port relevant behavior from `native_canvas.py`, `canvas_sync.py`, `canvas_web.py`, `canvas_archive.py` and `course_evidence.py`.

No upstream accounts, course data, credentials, installation packages or school logos are copied.

## Other references

File Harbor, Canvas Course Downloader and Super Productivity informed architectural research. No GPL/AGPL implementation from those projects is copied. macOS Web, Konsta UI and Framework7 are visual references, not component dependencies. Design sources are recorded in DESIGN.md.

Third-party Rust and JavaScript dependencies are locked in Cargo.lock and package-lock.json and retain their respective licenses. Distribution includes this notice and a third-party license report.

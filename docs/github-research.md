# Repository references

This record distinguishes implementation reuse from architectural and visual references.

## Implementation source

[PolyU Study Console](https://github.com/Andre-HUANG/polyu-study-console), inspected at revision `11a17fb15e58d2c741db6f75b974457683bccf77`, informs school WebKit sign-in, cookie filtering, Keychain protection, document reading, Canvas discovery and evidence handling. The project owner confirmed the author's private permission on 2026-10-12. Scope and attribution are preserved in [NOTICE.md](../NOTICE.md).

## Architecture references

Canvas downloaders informed course/module attachment discovery and incremental sync behavior. File-management tools informed hash manifests and protection for local edits. Task-management tools informed stable task identity and separation between AI suggestions and accepted plans. No GPL/AGPL implementation was copied from File Harbor, Canvas Course Downloader or Super Productivity.

## Interface references

- [macOS Web](https://github.com/PuruVJ/macos-web): desktop organization and restrained chrome.
- [Konsta UI](https://github.com/konstaui/konsta): grouped forms and settings.
- [Framework7](https://github.com/framework7io/framework7): lists and controls.
- [Liquid Glass React](https://github.com/rdev/liquid-glass-react): evaluated as an effect reference; not adopted because its documented Safari refraction limitations affect the Mac WebKit runtime.
- [PolyU homepage](https://www.polyu.edu.hk/): red palette observed in the site's stylesheet, as recorded in [DESIGN.md](../DESIGN.md).

The interface references are not copied component dependencies. The app keeps React, native HTML controls and Tauri, with system-rendered file icons on Mac.

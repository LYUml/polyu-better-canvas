# PolyU Better Canvas · Interface

## Direction

macOS learning workspace: Finder-style library, Reminders-style tasks, Calendar-style month and agenda. Prioritize local files, source evidence and the next action. Avoid promotional hero artwork, decorative dashboards and simulated desktop docks.

## Visual references

- [PolyU homepage](https://www.polyu.edu.hk/) and its [stylesheet](https://www.polyu.edu.hk/assets/css/style.css?v=20260915141154), inspected 2026-10-13. The stylesheet repeatedly uses `#A02337` and `#C80F2E`. These are observed web colors, not a claim about an official brand specification.
- [macOS Web](https://github.com/PuruVJ/macos-web): desktop visual organization.
- [Konsta UI](https://github.com/konstaui/konsta): grouped settings and compact controls.
- [Framework7](https://github.com/framework7io/framework7): lists and forms.

These are visual references; no component code from those three projects is copied. Keep React, native HTML controls and Tauri. Liquid Glass React is not a dependency: its documented Safari effect limitations matter for the Mac WebKit runtime.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| Brand | `#A02337` | Primary action, selected navigation, today |
| Brand hover | `#861E2E` | Primary button hover |
| Brand soft | `#F7E9ED` | Selected rows and secondary actions |
| Bright red | `#C80F2E` | Reserved emphasis from site reference |
| Text | `#252528` | Primary labels |
| Secondary text | `#6D6D75` | Metadata and help |
| Canvas | `#F5F5F7` | Workspace |
| Sidebar | `#EFEFF2` | App navigation |
| Surface | `#FFFFFF` | Content and dialogs |
| Divider | `#E4E4E8` | Separation |

Use macOS system typography through `-apple-system`, with PingFang SC for Chinese. Body base is 13 px, page headings 28 px, section headings 15 px, dense metadata 10–11 px. Numeric data uses tabular figures. Primary controls use 6–7 px radii, content surfaces 9–11 px. Use subtle borders and small shadows.

## Layout and behavior

- Sidebar 202 px; compact 180 px below 1200 px. Toolbar 64 px. Content inset 30 px, compact 22 px.
- Library has an independently scrolling course rail, file list and inspector. Selecting a file opens its inspector without a blocking dialog. Inspector switches between source text and file/AI actions. Below 1000 px, selecting a file hides the course rail to preserve usable column widths; closing restores it.
- Tasks share the calendar data. Task controls are real checkboxes; date-free tasks remain visible in the list.
- Calendar uses month navigation, a today marker and an adjacent monthly agenda; smaller windows prioritize the month.
- AI consent and task editing retain native dialog focus trapping, Escape dismissal and focus restoration.
- Red should guide attention, not fill the entire interface. Status and event-type colors may have restrained semantic hues.
- Maintain visible keyboard focus, named icon buttons, source evidence and user confirmation before AI transmission.

## Material organization

Default to material sections: Overview, Lectures, Tutorials, Assignments, Exams, Labs, Readings, Pages and Unsorted. Keep Canvas module grouping as a separate view. Use source filenames and directories for initial inference; user overrides take precedence. Uncertain files stay Unsorted. Do not move original files to implement virtual folders.

Offer Icons, List and Columns in a compact segmented toolbar. Icons show section folders first, then material icons. List shows section rows or file metadata. Columns exposes section navigation beside the file list and inspector. Persist the view preference. Use system file icons in the Mac app and a lightweight placeholder in the browser preview.

Course names should omit trailing download IDs; downloaded display names omit the app-added Canvas ID prefix. Original paths remain available in the inspector. All built-in copy is English; user and course content remains in its source language.

## Preview and verification

`npm run dev`, then `http://127.0.0.1:1420/?preview=1` loads explicitly synthetic UI fixtures. This mode requires a development build and a browser; it cannot alter files, sync Canvas or call AI. Production App reads its actual workspace.

[Synthetic home screenshot](docs/screenshots/home.jpg) · [Synthetic library screenshot](docs/screenshots/library.jpg). Verify all six pages, the 900 px minimum desktop width, library selection/search, dialog focus and empty states before changing shared components.

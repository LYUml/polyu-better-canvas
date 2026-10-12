# PolyU Better Canvas · User guide

For Apple Silicon Macs running macOS 13 or later.

## Getting started

1. Install the app from its DMG. This prototype is ad-hoc signed and not notarized; macOS may require permission in Privacy & Security.
2. Use an existing library folder or create the default one. Existing files stay in place.
3. Connect Canvas in the school sign-in window and complete MFA, then start a sync.
4. In Library, select a course and browse Overview, Lectures, Tutorials, Assignments or another section. Switch between Icons, List and Columns in the toolbar.
5. Change **Group** to **Canvas module** to follow source folders instead of material types.
6. Select a file. The inspector separates **Text preview** from **File and AI**. You can open the original, show it in Finder, override its type or extract dates.
7. Configure your provider, endpoint, model and key in Settings if you want AI analysis. Confirm the selected text and destination before sending it.
8. Accept suggestions in Review after checking source excerpts, pages and dates. Accepted items appear in Tasks and Calendar.
9. Export an ICS file for dated, incomplete tasks. Undated items remain in Tasks.

## Classification

Classification is inferred from filenames and folders, so it can be wrong. Use the material type control in the inspector to correct it. Source module names are retained where the library has module folders. Imported flat folders appear under General in module grouping. Uncertain resources stay Unsorted.

Sections are index views, not physical moves. The same file can be browsed by material type or module without creating copies. Canvas page snapshots and announcements appear under Pages by default.

## Sync and AI

- Sync checks run once an hour while the app is open; closing the app stops them.
- Remote updates preserve local edits. Deleted downloads stay deleted unless you explicitly restore them.
- Signing out keeps files and tasks but clears the account session and reading cache.
- AI results stay in Review until accepted. Week numbers and unknown dates are not guessed.
- Cloud AI receives up to 60,000 characters of extracted text after approval. It does not receive Canvas credentials.
- Use the sidebar to load or remove fictional demo materials.

ICS is a file export. Native Apple Calendar/Reminders writing and cross-device synchronization are not available yet.

# Validation record

## v0.2.0 · 2026-10-13

Platform: Apple Silicon Mac.

- Repository and project folder renamed to `polyu-better-canvas`. The workspace database was backed up before updating library paths; existing downloads and account identity are retained.
- English interface, native helper copy, errors, calendar metadata, AI instructions, README and user guide.
- Modular library with material-type sections, source module grouping, manual overrides and Icons/List/Columns views.
- All 27 core tests passed. Classification checks cover Lecture/Lec, Tutorial/Tut, assignments, exams, syllabi, labs, module folder inference, page snapshots and uncertain files.
- Upgrade test checks stable IDs, connected account state, legacy category conversion and preservation of user-authored text.
- Synthetic browser fixtures provide Lectures, Tutorials, Assignments and other sections. Preview mode does not call AI or modify files.

- Synthetic text/scanned PDF, isolated Keychain CRUD and native system file icon checks passed.
- English copy and layout checked across all six browser pages. Icons, List and Columns, inspector, AI consent and Escape dismissal were verified. No overflow at the 900 px desktop minimum.
- The packaged Mac app opens with the 326 existing entries and account state retained. Real course sections and native file icons were checked; a tutorial PDF was read locally. All 269 tracked downloads still match their on-disk hashes.
- App deep-signature verification and DMG verification passed. Installation artifacts remain ad-hoc signed.

## Previous acceptance · 2026-10-12

- 25 core tests passed for file protection, workspace isolation, cancellation, source evidence, three mock AI adapters, task deduplication, Hong Kong dates and ICS formatting.
- Synthetic text and scanned PDF page/OCR checks passed.
- Isolated Keychain create/read/update/delete checks passed.
- Native app launch, file reading, suggestion review, task editing, completion and calendar were checked.
- Real PolyU sign-in succeeded. Ten courses were traversed, and the final download manifest had 269 entries with matching on-disk SHA-256 hashes. The library had 326 entries including existing materials and synthetic demo content.
- Some sources or files could not be read. The last observed failure count was 23; per-source reporting still needs work.

Real syllabus AI accuracy and external calendar import remain unverified. The app is ad-hoc signed, not notarized. Developer ID signing, Windows and Intel Mac support are deferred.

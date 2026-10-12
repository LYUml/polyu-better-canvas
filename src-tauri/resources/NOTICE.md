# 来源与授权

本项目是学生制作的本地学习工具，不是香港理工大学官方应用。

本项目原创实现适用根目录 LICENSE；下列借用实现保留独立的来源与授权说明，不因合入本项目而自动重新授权为 MIT。

## PolyU Study Console

来源：https://github.com/Andre-HUANG/polyu-study-console
读取版本：11a17fb15e58d2c741db6f75b974457683bccf77。

项目所有者于 2026-10-12 在本项目开发会话中确认：已经私下联系并获得原作者同意复用、借鉴并修改实现。本文件记录该授权来源，不声称上游已经公开授予通用开源许可证。

- `src-tauri/native/DocumentReader.swift`：改编自 MacApp/DocumentReader.swift，保留原文读取、版面行排序、PDFKit/Vision OCR 实现；将输入输出改为版本化 JSON 私有管道。
- `src-tauri/native/NativeBridge.swift`：登录窗口、Cookie 筛选和 Keychain 模式改编自 MacApp/App.swift / SessionVault.swift。
- Rust Canvas 采集和文档证据流程参考并移植学习控制台中的 native_canvas.py、canvas_sync.py、canvas_web.py、canvas_archive.py 与 course_evidence.py 的相关行为。

不复制上游账号数据、课程资料、登录凭据、安装包或学校标识。

## 其他项目

File Harbor、Canvas Course Downloader、Super Productivity 等仅作为模块设计参考；未复制 GPL/AGPL 项目实现。原始调研及提交位置见 docs/github-research.md。

第三方 Rust/JavaScript 依赖由 Cargo.lock 与 package-lock.json 锁定，适用各自许可证。发行包随附本文件及第三方依赖清单。

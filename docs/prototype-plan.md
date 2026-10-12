# Mac Desktop Prototype v0.1

按用户确认的桌面计划实现，替换早期未完成的 Node/web 草稿。

## 技术

Tauri 2 + React/TypeScript/Vite；Rust 核心、SQLite、reqwest。Swift 原生组件处理学校登录、Keychain、PDFKit/Vision 读取；目录与导出路径由 Tauri 原生对话框处理。发布版无 Node/Python/Chrome 依赖，无 localhost 服务。

## 首版

- 选择已有资料目录或创建默认目录；只索引，不移动旧文件。
- 连接学校 Canvas；课程 API 与网页双路径，模块/页面附件发现，保存可读页面正文。
- 手动同步、运行期间每小时检查；关闭、取消或退出登录后停止写入。
- 文件修改和本地删除保护；不同账号独立工作区。
- 启动台、资料库、待确认、日历、任务、设置。
- 兼容接口、Anthropic、Ollama 的可选 AI 分析；发送前确认正文范围，密钥保存在 Keychain。
- 本地规则或 AI 产生待确认结果，保留原文与页码；未知日期/周次不推断。
- 文件分类标签和改名建议，不物理整理；确认后的安排支持编辑、完成和 ICS 导出。
- 合成演示资料可载入和移除。

## 边界

仅 Apple Silicon、macOS 13+。真实 syllabus AI 准确率后续验证。Apple 日历/提醒事项写入、双向同步、成绩和视频下载后置。旧下载器的文件无 Canvas ID 映射，只作本地资料；新同步可能追加有身份标识的副本，不覆盖原文件。

作者许可来源及借用组件见 NOTICE.md；验收结果见 validation.md。交付 ad-hoc 签名的 .app/.dmg，尚未 Apple 公证。

# PolyU Canvas Localized：GitHub 调研与借鉴方案

后续更新：用户已确认获得 PolyU Study Console 作者授权；桌面版复用与修改范围见根目录 NOTICE.md。下文保留最初调研时的状态。

调研日期：2026-10-12。范围为仓库说明、许可证、关键源码与少量静态检查；未运行第三方应用，未连接真实 Canvas、AI 或系统日历。以下结论不构成运行验收。

## 结论

找到覆盖各子问题的项目，未在本轮候选中发现一个经过验证、同时满足 PolyU 登录、本地资料管理、用户自选 AI、syllabus 日期证据、日历及 Apple Reminders 的现成项目。建议保持自己的产品和数据模型，按模块参考，MIT 组件优先评估复用。

## 项目与源码证据

| 项目 | 许可证 | 已查看的实现及可借鉴点 | 应用于本项目 |
|---|---|---|---|
| [Canvas Course Downloader](https://github.com/jasp-nerd/canvas-course-downloader) | MIT | `canvas-api.js` 分页、超时、429/5xx 重试；`downloader.js` 从作业、公告、syllabus 等正文发现附件，按 Canvas ID 去重 | 扩展目前附件发现范围；明确报告部分分页失败，不能将部分结果当成完整同步 |
| [Canvas Downloader](https://github.com/BrkBuilds/Canvas-Downloader) | GPL-3.0 | `sync/analysis.py` 区分本地编辑、远端更新、本地删除，快速同步跳过需要用户审阅的项 | 自行实现同步清单和内容哈希，远端更新不覆盖本地编辑；记录用户删除意图 |
| [File Harbor](https://github.com/adamgoth/file-harbor) | MIT | `src/shared/schema.ts` 分开原始文件名、存储路径、哈希、分类建议和接受结果；`watcher-service.ts` 等待写入稳定并去重；`llm-suggester.ts` 解析分类 JSON | 学习文件夹＋SQLite 索引＋待整理收件箱；建议和实际执行分离 |
| [AI File Sorter](https://github.com/hyperfield/ai-file-sorter) | AGPL-3.0 | README 的本地/远端模型、自带密钥、预览、分类白名单和已批准决策学习 | 参考交互与流程，自行实现整理计划、预览、操作日志及撤销 |
| [Course Outline to Calendar](https://github.com/cloverzer0/course-outline-to-calendar) | 未发现许可证 | PDF→事件→编辑预览→ICS 的模块划分；`backend/services/event_validator.py` 第 123 行静态解析报未闭合字符串 | 仅参考流程，不复制源码；日期校验、页码原文、周次转换和来源冲突自行实现 |
| [Canvas Learning Agent Extension](https://github.com/zijinz456/learning-agent-canvas-extension) | MIT | 浏览器扩展＋本地 FastAPI；`backend/app/core/file_export.py` 将课程信息和作业正文归档到文件夹 | 保留本地后端架构；若 PolyU 的 API 受限，可考虑浏览器适配作为后续备选 |
| [Super Productivity](https://github.com/super-productivity/super-productivity) | MIT | 日历和任务结合；`generate-calendar-task-id.ts` 使用来源生成稳定 ID；`time-block-sync.effects.ts` 合并连续编辑并串行处理同一任务的写入 | 分开任务截止日期和学习时段；本地稳定 ID＋外部 ID 映射＋同步写队列，避免重复和竞态 |
| [ical-generator](https://github.com/sebbo2002/ical-generator) | MIT | TypeScript/Node 的 ICS 生成组件 | 作为日历导出候选依赖，验证香港时区、全天事件、提醒及稳定 UID；重复导入是否更新仍取决于目标日历 |
| [Apple EventKit CLI](https://github.com/23grach/apple-eventkit-cli) | MIT | macOS 公开 EventKit、JSON 输出和部分变更预览；README 明确说明权限及公开 API 的限制 | Apple 日历/提醒事项桥接候选；优先考虑小型原生辅助程序，需在目标 macOS 上验收 |

## 借鉴后建议的数据流

Canvas 同步 → 本地原始文件及网页正文 → 文本/表格提取 → AI 结构化建议 → 程序校验与来源核对 → 用户确认 → 日历/任务 → ICS 或平台桥接。

文件管理采用用户可见的课程目录；数据库保存稳定文件 ID、Canvas ID、哈希、路径和来源。外部移动/重命名通过扫描和哈希尽力恢复关联，不能只按文件名识别。原始版本与用户编辑版本分别保存；文本、OCR、摘要属于可重建的派生内容。

AI 输出包含事件类型、原文日期、解析日期或周次、时区、文件与页码、原文片段、冲突/待确认状态。模型自报 confidence 不能当作经过校准的可靠性，主要依据原文匹配、日期完整性和来源一致性判断。File Harbor 只取前 2000 字的简单策略不适合 syllabus 后部的 schedule；应先按页读取并寻找考核和时间表章节。

## 第一版优先级

1. 启动器、本地服务、课程资料目录、同步状态和文件索引。
2. 用户自选 AI 接口，PDF/syllabus 提取及逐条来源确认。
3. 日历和任务共用数据模型，确认后 ICS 导出。
4. 文件整理计划与执行记录，保护用户改动。
5. Apple 日历/提醒事项桥接及稳定外部 ID 映射；完整双向同步后置。

## 复用边界

MIT 仓库可进入代码复用评估，实际复制时保留适用的版权与许可证，并另查依赖许可证。GPL/AGPL 项目本轮仅参考设计，不把代码直接放入当前 MIT 项目。未声明许可证的项目，包括最初提供的 PolyU Study Console，本轮只借鉴功能与架构。当前未复制第三方实现、未新增依赖、未安装系统桥接、未修改日历或提醒事项。

## 调研快照

以下为本轮浅克隆所读取的提交，方便后续定位同一份证据。

- [BrkBuilds/Canvas-Downloader](https://github.com/BrkBuilds/Canvas-Downloader/tree/3360dfb91a8a99cbd9d33c7c200bd0a545fce7f6)：`3360dfb91a8a99cbd9d33c7c200bd0a545fce7f6`
- [jasp-nerd/canvas-course-downloader](https://github.com/jasp-nerd/canvas-course-downloader/tree/331a73eb89035a8f040c7ca3b9fb857f89f5f972)：`331a73eb89035a8f040c7ca3b9fb857f89f5f972`
- [cloverzer0/course-outline-to-calendar](https://github.com/cloverzer0/course-outline-to-calendar/tree/eaf619b22cf884b5e853d9ca6eb67d53f85b3143)：`eaf619b22cf884b5e853d9ca6eb67d53f85b3143`
- [adamgoth/file-harbor](https://github.com/adamgoth/file-harbor/tree/3078b0732dac6c1872c6fb4e2a8ab6268be46a6d)：`3078b0732dac6c1872c6fb4e2a8ab6268be46a6d`
- [zijinz456/learning-agent-canvas-extension](https://github.com/zijinz456/learning-agent-canvas-extension/tree/b0baa17986fc42d41941098700a8c0817962f965)：`b0baa17986fc42d41941098700a8c0817962f965`
- [super-productivity/super-productivity](https://github.com/super-productivity/super-productivity/tree/8033e9a841dd8712d4baa43088094bd74a20485e)：`8033e9a841dd8712d4baa43088094bd74a20485e`
- [hyperfield/ai-file-sorter](https://github.com/hyperfield/ai-file-sorter/tree/4eaccb878b09af198392f23b2fc1144640293a1a)：`4eaccb878b09af198392f23b2fc1144640293a1a`
- [sebbo2002/ical-generator](https://github.com/sebbo2002/ical-generator/tree/942ed44031853742a11d6e99ad9a1139a6fdc8c9)：`942ed44031853742a11d6e99ad9a1139a6fdc8c9`
- [23grach/apple-eventkit-cli](https://github.com/23grach/apple-eventkit-cli/tree/fdd3df85338152d98ab4ae6ee45bd7a8b927c97d)：`fdd3df85338152d98ab4ae6ee45bd7a8b927c97d`

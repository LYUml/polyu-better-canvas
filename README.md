# PolyU Canvas Localized

面向 Apple Silicon Mac 的本地学习工作台。连接 PolyU Canvas，把课程资料下载到自己的文件夹，再用自己的 AI 提取考试、作业 DDL 和学习安排。所有建议经过核对后才进入任务与日历。

当前版本：**v0.1.1 桌面原型**，支持 **macOS 13+**。学生制作，非香港理工大学官方应用。

## 界面

采用 macOS 风格的侧边栏、文件检查器、任务列表和月历，红色系参考 PolyU 官网。界面规范见 [DESIGN.md](DESIGN.md)。以下截图使用合成资料。

![启动台](docs/screenshots/home.jpg)

![资料库与文件检查器](docs/screenshots/library.jpg)

## 可以做什么

- **Canvas 同步**：学校原生登录窗口及 MFA；发现课程、模块和页面附件并下载到本地。支持手动同步，App 打开期间每小时检查一次。
- **资料库**：接入已有资料文件夹，搜索、预览、打开文件和分类。PDF 本地提取文字与页码，扫描页使用 OCR；支持 TXT、Markdown、HTML。
- **自己的 AI**：兼容 OpenAI 风格接口、Anthropic、Ollama。选择文件并确认发送范围后才调用服务。
- **待确认**：保留来源原文、页码或文本位置；编辑、确认或忽略日期与整理建议。周次、未知年份和冲突需要人工核对。
- **任务与日历**：管理有日期或无日期的任务，查看月历，导出已确认、有日期且未完成的安排为 `.ics`。
- **合成演示**：可主动载入和移除，便于不连接账号时体验流程。

文件整理目前使用分类标签与改名建议，不自动移动或改名原文件。老师更新资料时保留用户修改过的副本，远端新版另存；自动同步不恢复用户已经删除的下载文件。

## 安装与使用

使用打包的 `.dmg`，将 App 拖到 Applications 后启动。运行安装包无需 Node、Rust、Python 或 Chrome。

1. 选择已有资料文件夹，或创建默认资料库。已有文件只建立索引。
2. 点击「连接 Canvas」，在学校窗口完成登录与 MFA，再点击「同步 Canvas」。
3. 在资料库选择文件，本地读取后使用日期规则，或在设置中配置自己的 AI 并确认发送正文。
4. 到「待确认」核对来源与日期，确认后加入任务和日历。
5. 点击「导出日历」保存 ICS，再在日历应用中导入。

无需 AI 密钥也可以手动管理任务。聊天产品订阅不一定包含 API，请使用服务商提供的 API 凭据。

原型使用 ad-hoc 签名，尚未 Apple 公证，首次打开可能出现开发者验证提示。正式公开分发仍需 Developer ID 签名与公证。详细步骤见 [使用说明](docs/使用说明.md)。安装包由本地 `npm run bundle` 生成，不提交到源码仓库。

## 数据与隐私

| 数据 | 保存位置 |
| --- | --- |
| 默认资料目录 | `~/Documents/PolyU Canvas Localized/Local/`，也可自行选择 |
| 索引、安排、设置与缓存 | `~/Library/Application Support/local.polyu.canvas.localized/` |
| Canvas 会话与 AI 密钥 | macOS Keychain，服务名 `local.polyu.canvas.localized.v1` |

不同 Canvas 账号使用独立工作区。退出登录停止采集、清除该账号会话和读取缓存，保留资料及学习安排。关闭 App 后停止检查，不安装常驻后台服务。

AI 分析前会要求确认发送文件正文；云端请求最多使用 60,000 字符。课程资料、账号数据、密钥及本地数据库不进入源码或安装包。

## 技术栈

| 部分 | 实现 |
| --- | --- |
| 桌面容器 | Tauri 2 |
| 界面 | React、TypeScript、Vite |
| 核心 | Rust：Canvas、文件管理、AI 调用、后台作业与 ICS |
| 索引与安排 | SQLite |
| Mac 原生组件 | Swift：WebKit 登录、Keychain、PDFKit/Vision |
| 通信 | Tauri commands/events；Swift 通过版本化 JSON 私有管道通信 |

发布版不依赖本地 HTTP 服务。

## 开发与打包

需要 Apple Silicon Mac、Node.js、Rust stable 和 Xcode Command Line Tools。

```sh
npm ci
npm run desktop
```

原生组件和应用图标会在启动、打包前自动生成。用 `npm run dev` 启动浏览器预览后，访问 `http://127.0.0.1:1420/?preview=1` 可查看合成资料界面；文件、Canvas 和 AI 操作需在桌面 App 中使用。

```sh
npm run bundle
```

输出：

- App：`src-tauri/target/release/bundle/macos/PolyU Canvas Localized.app`
- DMG：`src-tauri/target/release/bundle/dmg/`

核心目录：`src/` 为界面，`src-tauri/src/` 为 Rust 核心，`src-tauri/native/` 为 Swift 组件，`scripts/` 为构建与测试工具。

## 验证与当前限制

```sh
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run native
python3 scripts/test-native.py
python3 scripts/test-keychain.py
```

Keychain 测试使用临时隔离的测试钥匙串。自动测试使用合成资料和模拟 AI 服务。

本机验收已通过 25 项核心测试、PDF/OCR、Keychain、应用签名与 DMG 校验；真实 PolyU 登录及首次课程同步已完成。存在部分不可读来源，目前只显示失败计数，逐项失败报告仍需补充。详细结果见 [验收记录](docs/validation.md)。

以下功能后置：真实 syllabus 的 AI 准确率验收、外部日历实际导入验收、Apple Calendar/Reminders 原生写入、手机双向同步、Office 直接解析、视频下载、成绩折算、Windows 与 Intel Mac。ICS 为文件导出，重复导入是否更新取决于目标日历应用。

## 来源与授权

原生登录和文档读取等实现复用、改编自 [PolyU Study Console](https://github.com/Andre-HUANG/polyu-study-console)，作者授权来源和改编范围见 [NOTICE.md](NOTICE.md)。借用部分不因合入而自动重新授权为 MIT；原创部分适用 [LICENSE](LICENSE)。第三方依赖适用各自许可证，清单随发行包提供。

[原型方案](docs/prototype-plan.md) · [项目调研](docs/github-research.md)

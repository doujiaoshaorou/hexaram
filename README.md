# 海斗助手 Hexaram｜海克斯大乱斗助手

![WY 标志](rank-analysis-app/src/assets/wy-logo.svg)

**查战绩、选海克斯、复盘每一局。**

面向国服玩家的海克斯大乱斗助手，支持 Windows。

[下载最新版](https://github.com/doujiaoshaorou/hexaram/releases/latest) · [更新记录](https://github.com/doujiaoshaorou/hexaram/releases) · [问题反馈](https://github.com/doujiaoshaorou/hexaram/issues)

## 使用

在 Release 下载 `Hexaram-版本号-win-x64.exe`，放在可写目录运行。需要 Windows x64、WebView2 和已登录的英雄联盟客户端。

旧版用户将新版放在原目录，保留 `hexaram-data/` 和 `hexaram-config.yaml`。0.8.1 及更早版本需要手动下载一次 0.9.0；从 0.9.0 起，可以在「设置 → 关于我们」检查更新、查看更新记录和设置自动下载。下载完成后点击确认重启安装，程序不会在对局中自动重启。

## 功能

- **我的战绩 / 查询**：本人归档、他人近期战绩、十人详情、每页 10 场及最近 100 场分页。
- **英雄表现**：按模式、日期、英雄和海克斯查看场数、胜率与 KDA；默认排除重开局。
- **对局与推荐**：实时阵容、英雄池推荐、OP.GG 海克斯梯队及强化推荐。
- **海斗表现与标签**：基于近期正常对局的 WY 表现分，以及结合出装和实际作用的玩法标签。
- **AI 复盘**：支持 DeepSeek、通义千问，需自己的 API Key；调用会发送相应对局数据并消耗服务额度。

历史覆盖取决于客户端接口与本机可恢复记录，不保证全生涯完整。WY 表现分是本项目的实验性评分，**不是官方隐藏分**；MVP / SVP 沿用 RA 七维评分。AI 分析没有录像，仅供参考。

## 来源与作者

基于 [wnzzer/Rank Analysis](https://github.com/wnzzer/rank-analysis) 二次开发，沿用 Vue / Tauri / Rust 架构与客户端、战绩等能力。作者 **doujiaoshaorou**，使用 **GPT-6 Astra** 辅助开发。本项目是独立衍生版本，不是 RA 官方发行版，亦非 Riot Games 或 OP.GG 官方产品。

保留原作者版权与 [MIT 许可证](LICENSE)，详见 [第三方说明](THIRD_PARTY_NOTICES.md)。

## 开发

源码在 `rank-analysis-app/`，需要 Node.js、Rust stable MSVC、Windows C++ Build Tools 和 WebView2。

```powershell
cd rank-analysis-app
npm ci
npm run dev
# 桌面开发 / 正式构建
npm run tauri dev
npm run tauri build -- --no-bundle
```

应用采用当前程序目录保存本机配置与归档。分享时仅分发 Release 附件，不要上传自己的配置、API Key 或战绩目录。

[开发与发布](docs/development/publishing.md) · [验证记录](docs/validation/README.md) · [历史开发笔记](docs/history/development-notes.md)

# 0.9.2 GitHub 发布验证（2026-10-11）

正式发布：<https://github.com/doujiaoshaorou/hexaram/releases/tag/v0.9.2>。

- GitHub API 确认 v0.9.2 为最新正式版，草稿标志为 false；tag 指向源码提交 `11540ffd9c1e7fd7d9087cc6c21cd98cbb0b6461`。
- 10 个公开附件包括安装包、裸 EXE、两份 minisign 签名、源码 ZIP、SHA256SUMS、`latest.json`、`hexaram-releases.json`、LICENSE 和 THIRD_PARTY_NOTICES。
- 发布脚本在草稿阶段重新下载全部附件，逐项核对本地与下载字节的 SHA256，成功后才发布。源码 ZIP 检查无本地工具、更新私钥、用户配置或战绩目录。
- `tests/release-smoke.ps1` 在独立合成 Git 仓库使用真实成品及更新私钥、模拟 GitHub，验证签名清单分别指向安装包和便携包、临时草稿 URL 转为最终 tag URL，以及损坏的下载附件阻止正式发布。没有对模拟流程调用真实 GitHub。
- 正式发布后，设置 `HEXARAM_TEST_RELEASE_VERSION=0.9.2` 并执行 Rust `live_release_signature_check -- --ignored`，通过客户端的实际 Releases 查询、下载和验签代码验证最新版本的安装包及便携包；1 项通过。
- 新发布工作流通过 actionlint 静态检查。本次使用本地私钥发布，未向 Actions 上传私钥。创建 tag 触发了一个重复发布任务，该任务因未配置签名 secret 失败；后续在 main 加入既有 Release 检查，让本地发布触发的重复任务直接跳过，不再次构建或覆盖附件。

这里的联网验证证明当前公开附件可识别、下载和验签，不能等同于真实安装版从 0.9.2 更新到尚未发布的下一版。原目录升级、资料和快捷方式保留的验证仍见 [安装版验证](installer-0.9.2.md)。

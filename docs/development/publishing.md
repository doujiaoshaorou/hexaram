# 发布 Hexaram

公开仓库：<https://github.com/doujiaoshaorou/hexaram>。用户更新说明写在 Releases，不再堆放在 README 或关于页。

## 常规构建

在 `rank-analysis-app` 执行 `npm ci`、`npm run typecheck`、针对性测试及 `npm run tauri build -- --no-bundle`。正式 Windows 程序位于 `src-tauri/target/release/hexaram.exe`。

统一修改 package.json、package-lock.json、Cargo.toml、Cargo.lock 和 tauri.conf.json 的应用版本号。只修改项目版本，不批量替换依赖版本。验证记录放在 `docs/validation/`。

## 签名与发布

0.9.0 起使用独立的 minisign 更新密钥，公钥写在 `tauri.conf.json`。私钥仅由维护者本地保管，**不可提交到 Git、源码包或 Release**；请离线备份，丢失后旧客户端将无法验证新密钥签署的更新。此签名用于应用更新验证，不等同 Windows Authenticode 证书。

在已提交且干净的发布仓库运行：

```powershell
./scripts/publish-release.ps1 -Version 0.9.0 -ExePath 'D:/build/hexaram.exe' -PrivateKeyPath 'D:/private/hexaram-signing.key' -NotesPath 'D:/build/release-notes.md' -OutputDirectory 'D:/build/release-0.9.0'
```

脚本检查版本、源码与私钥排除项，打包 Git 跟踪源码，生成 EXE 签名和 SHA256SUMS，再建立 GitHub Release 草稿。核对附件后使用 `gh release edit v0.9.0 --draft=false --latest` 发布。后续正式版本使用递增的三段版本号，不能修改已发布 tag 或覆盖旧版本附件。

自动更新必须同时存在以下附件，名称区分大小写：

- `Hexaram-版本-win-x64.exe`
- `Hexaram-版本-win-x64.exe.sig`（Tauri signer 生成的原始签名文件）

应用只接受本仓库的正式 Release，后台下载后校验内置公钥签名；安装前再次校验。默认自动检查开启、自动下载关闭。后台只下载，不自动重启。选人/游戏进行中拒绝安装。0.8.1 及更早版本尚未接入，需要先手动升级。

发布附件同时保留源码 ZIP、SHA256SUMS、LICENSE 和 THIRD_PARTY_NOTICES.md。下载 EXE 不包含个人配置、战绩或 AI Key。GitHub Actions 的手动构建工作流只生成构建产物，未配置私钥时不会生成可自动更新的签名包，也不会自动发布。

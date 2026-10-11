# 发布 Hexaram

公开仓库：<https://github.com/doujiaoshaorou/hexaram>。用户更新说明写在 Releases，不再堆放在 README 或关于页。

## 常规构建

在 `rank-analysis-app` 执行 `npm ci`、`npm run typecheck`、针对性测试，然后在仓库根目录执行 `./scripts/build-windows.ps1 -OutputDirectory 'D:/build/release-0.9.2'`。脚本先构建并保存裸便携 EXE，再打包 NSIS 安装版；不得将经过 bundler 补丁的 EXE 当作便携附件发布。开发环境可用 `-ConfigPath` 指定本地构建命令覆盖配置。

安装版使用当前用户安装、默认英文文件夹 `Hexaram`、固定的 `hexaram.exe` 和「海斗助手」快捷方式。`windows/installer.nsi` 基于 Tauri CLI 2.11.4 官方模板，仅将目录名与中文显示名分开；升级 Tauri CLI 时需核对模板变化。`productName`、包标识和二进制名需在后续版本保持稳定。首次安装可复制安装包所在旧便携目录的数据；后续更新采用 NSIS `/UPDATE` 覆盖安装，保留快捷方式和安装目录数据。已有安装沿用注册的原路径，用户指定的 `/D` 路径优先于首次安装默认值。

统一修改 package.json、package-lock.json、Cargo.toml、Cargo.lock 和 tauri.conf.json 的应用版本号。只修改项目版本，不批量替换依赖版本。验证记录放在 `docs/validation/`。

## 签名与发布

0.9.0 起使用独立的 minisign 更新密钥，公钥写在 `tauri.conf.json`。私钥仅由维护者本地保管，**不可提交到 Git、源码包或 Release**；请离线备份，丢失后旧客户端将无法验证新密钥签署的更新。此签名用于应用更新验证，不等同 Windows Authenticode 证书。

在已提交且干净的发布仓库运行：

```powershell
./scripts/publish-release.ps1 -Version 0.9.2 -ExePath 'D:/build/release-0.9.2/Hexaram-0.9.2-win-x64.exe' -InstallerPath 'D:/build/release-0.9.2/Hexaram-0.9.2-win-x64-setup.exe' -PrivateKeyPath 'D:/private/hexaram-signing.key' -NotesPath 'D:/build/release-notes.md' -OutputDirectory 'D:/build/publish-0.9.2' -Publish
```

先将源码提交推送到公开仓库。脚本检查版本、源码与私钥排除项，打包 Git 跟踪源码，签署便携 EXE 和安装包，生成 SHA256SUMS 与两份更新清单，再建立 GitHub Release 草稿。它会重新下载全部附件逐个核对 SHA256；带 `-Publish` 时校验通过才转为最新正式版，否则保留已验证草稿供检查。上传或验证失败保留草稿，需检查后处理，不覆盖既有正式版本。后续正式版本使用递增的三段版本号，不能修改已发布 tag 或覆盖旧版本附件。

自动更新必须同时存在以下附件，名称区分大小写：

- `Hexaram-版本-win-x64.exe`
- `Hexaram-版本-win-x64.exe.sig`（Tauri signer 生成的原始签名文件）
- `Hexaram-版本-win-x64-setup.exe`
- `Hexaram-版本-win-x64-setup.exe.sig`

安装版和便携版按安装形态分别选包，不互相降级或转换。更新缓存记录安装形态，旧缓存缺少此字段时视为便携包。已安装程序不会用裸 EXE 替换自身，以免丢失 bundler 的安装形态标记或让卸载信息停在旧版本。

应用只接受本仓库的正式 Release，后台下载后校验内置公钥签名；安装前再次校验。默认自动检查开启、自动下载关闭。后台只下载，不自动重启。选人/游戏进行中拒绝安装。0.8.1 及更早版本尚未接入，需要先手动升级。

发布附件同时保留源码 ZIP、SHA256SUMS、LICENSE 和 THIRD_PARTY_NOTICES.md。下载 EXE 不包含个人配置、战绩或 AI Key。

### 与 RA 的关系及 GitHub Actions

安装版沿用 RA / Tauri 的签名 NSIS 更新方式：校验安装包，使用 `/P /R /UPDATE` 覆盖原安装目录后重启；便携版继续原地替换裸 EXE。Hexaram 当前客户端读取自己的 GitHub Releases API，失败后读取 `hexaram-releases.json`，继续兼容 0.9.0 / 0.9.1 便携客户端。发布时同时生成 RA 格式的 `latest.json`：`platforms.windows-x86_64` 对应签名安装包，扩展 `portable.windows-x86_64` 对应签名裸 EXE。当前客户端未改用官方 updater 的 `check()`，仅提供协议兼容清单，避免破坏已有更新通道。不会读取 RA 仓库或使用 RA 的签名密钥。

`.github/workflows/release.yml` 已替换上游发布流程，只向 `doujiaoshaorou/hexaram` 发布 Windows 两类包。推送 `v*` tag 会构建、签名、验证上传附件后发布；手动运行默认生成草稿，可显式选择发布。使用它之前需由维护者配置**既有 Hexaram 私钥**为仓库 Actions secret `TAURI_SIGNING_PRIVATE_KEY`，如有密码则另设 `TAURI_SIGNING_KEY_PASSWORD`。不能临时生成新密钥，否则旧客户端无法更新。本次仍使用本地保管的私钥发布；没有将私钥上传到 GitHub。未配置 secret 的 tag 发布会明确失败，不能生成缺签名的正式版。发布说明读取 `docs/releases/<版本>.md` 或手动输入。

`.github/workflows/hexaram-windows.yml` 可在不配置签名密钥时生成构建附件，供开发验证。本仓库不运行上游 GitCode 镜像和公告定时发布任务。

`tests/release-smoke.ps1` 使用合成 Git 仓库、真实本地成品和签名密钥以及模拟 GitHub，验证两种包的更新清单、最终 tag URL、完整上传校验和附件损坏时阻止发布。它不会向 GitHub 发请求。正式发布后，可设置 `HEXARAM_TEST_RELEASE_VERSION`，执行被忽略的 Rust `live_release_signature_check`，检查最新公开版本的两种包都能下载并通过客户端签名校验。

### 生产资源校验

不要把普通 `cargo build --release` 的结果当成便携包：未启用 `tauri/custom-protocol` 时，它仍会连接 `devUrl`。`build.rs` 会拒绝这种 release 构建。使用上述 Tauri CLI 命令，之后关闭 Vite，启动实际 EXE，确认界面及设置页能够加载，再交付。

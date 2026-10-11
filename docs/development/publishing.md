# 发布 Hexaram

公开仓库：<https://github.com/doujiaoshaorou/hexaram>。从 0.9.3 起统一发布 Windows NSIS 安装版。构建产生的裸 EXE 仅为安装器内部输入，不能作为 Release 附件或用户交付文件。用户更新说明写在 docs/releases/<版本>.md 和 GitHub Releases。

## 构建与版本

在 rank-analysis-app 执行 npm ci、npm run typecheck 和相关测试，然后在仓库根目录执行：

```powershell
./scripts/build-windows.ps1 -OutputDirectory 'D:/build/release-0.9.3'
```

脚本通过 Tauri CLI 构建生产资源并打包 NSIS，只导出 Hexaram-版本-win-x64-setup.exe。开发环境可用 -ConfigPath 指定本地构建命令覆盖配置。普通 cargo build --release 未启用生产资源时会被 build.rs 拒绝，不能交付依赖 devUrl 的程序。

同步修改 package.json、package-lock.json、Cargo.toml、Cargo.lock 和 tauri.conf.json 的应用版本号，只修改项目版本，不批量替换依赖版本。使用递增的三段版本号，不修改已发布 tag 或覆盖旧版附件。验证记录放在 docs/validation/。

安装版采用当前用户安装、默认英文文件夹 Hexaram、固定的 hexaram.exe 和「海斗助手」快捷方式。保持 productName、包标识和二进制名稳定。windows/installer.nsi 基于 Tauri CLI 2.11.4 官方模板，仅将目录名与中文显示名分开；升级 CLI 时核对模板变化。

旧便携用户把安装包放在旧 EXE 所在目录并运行一次，安装器复制旧配置和战绩，保留原文件，不覆盖安装目录已有资料。后续更新使用 NSIS /P /R /UPDATE /D=原安装目录，保留数据与快捷方式，成功后重启。用户指定 /D 路径优先于首次安装默认值。

## 签名与发布

继续使用既有 Hexaram minisign 更新密钥，公钥位于 tauri.conf.json。私钥不得提交到 Git、源码包或 Release，也不能临时生成新密钥。此签名用于应用更新验证，不等同 Windows Authenticode 证书。

源码提交推送后，在干净的发布仓库执行：

```powershell
./scripts/publish-release.ps1 -Version 0.9.3 -InstallerPath 'D:/build/release-0.9.3/Hexaram-0.9.3-win-x64-setup.exe' -PrivateKeyPath 'D:/private/hexaram-signing.key' -NotesPath 'docs/releases/0.9.3.md' -OutputDirectory 'D:/build/publish-0.9.3' -Publish
```

脚本检查版本、源码与私钥排除项，生成 Git 跟踪源码 ZIP，签署安装包，生成 SHA256SUMS、latest.json 和 hexaram-releases.json。只上传安装包及其签名、源码、更新清单、校验文件、LICENSE 与 THIRD_PARTY_NOTICES.md。创建草稿后重新下载全部附件逐个比对 SHA256，带 -Publish 时校验通过才设为最新正式版，失败保留草稿供检查。

应用更新只接受本仓库正式 Release 中的 Hexaram-版本-win-x64-setup.exe 和 Hexaram-版本-win-x64-setup.exe.sig。latest.json 的 platforms.windows-x86_64 只指向签名安装包，不再生成 portable 条目。旧更新缓存未记录安装形态时仍识别为便携包并拒绝安装，要求重新下载。新版本只启动校验后的安装器，不再使用裸 EXE 原地替换程序。

默认自动检查开启、自动下载关闭。后台只下载，安装需用户确认；选人或游戏进行中拒绝安装。0.9.2 及更早便携用户需手动运行一次安装包迁移。保留旧版公开附件供历史查阅，后续不再分发便携版。

## GitHub Actions 与验证

.github/workflows/release.yml 只向 doujiaoshaorou/hexaram 发布安装版。推送 v* tag 后构建、签名、验证并发布；手动运行默认生成草稿。已有草稿或正式 Release 时跳过重复构建，不覆盖本地已上传附件。Actions 需配置既有密钥 secret TAURI_SIGNING_PRIVATE_KEY 和可选 TAURI_SIGNING_KEY_PASSWORD，不提交密钥文件。

.github/workflows/hexaram-windows.yml 在不配置密钥时生成安装包供构建验证。本仓库不运行上游镜像和公告定时任务。

tests/installer-smoke.ps1 在隔离目录与身份下验证安装、旧数据迁移、覆盖升级、快捷方式和卸载保留数据。tests/release-smoke.ps1 使用合成 Git 仓库、真实安装包与本地签名密钥、模拟 GitHub 验证仅安装包发布、签名更新清单、附件回下载校验及损坏附件阻止发布，不向 GitHub 发请求。正式发布后，设置 HEXARAM_TEST_RELEASE_VERSION，运行被忽略的 Rust live_release_signature_check，验证最新公开安装包可以下载并通过客户端签名校验。

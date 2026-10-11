# Windows 发布约定

- 从 0.9.3 起，Windows 正式交付统一使用 NSIS 安装版，后续不生成或分发便携版附件。
- 使用 `scripts/build-windows.ps1` 构建安装包；裸 EXE 仅作为安装器内部输入，不能作为下载、更新或交付文件。
- 发布脚本和 GitHub Actions 只上传 `Hexaram-版本-win-x64-setup.exe`、其签名、源码及校验／说明文件。更新清单只指向签名安装包。
- 安装升级保留已有配置、战绩和快捷方式；旧便携用户手动运行一次安装包迁移。
- 更新应用版本时同步 package.json、package-lock.json、Cargo.toml、Cargo.lock 与 tauri.conf.json。保留既有签名密钥，不得把私钥、用户配置或战绩提交到仓库。

# 发布到 GitHub

建议仓库：`doujiaoshaorou/hexaram`（此处是拟定名称，尚未创建或上传）。

1. 登录自己的 GitHub，在 New repository 中建立 Public 仓库 `hexaram`。如果使用已准备的源码目录，不要额外勾选初始化 README/许可证。
2. 解压 `Hexaram-0.8.1-source.zip`。公开源码包已经排除用户归档、配置、密钥、缓存、.tools、依赖和构建目录；不要直接上传整份本机工作目录。
3. 在解压后的源码根目录执行以下命令，GitHub 登录由你在 Git 的授权流程中完成。不要把密码或 Token 发到聊天中。

```powershell
git init
git add .
git commit -m "Release Hexaram 0.8.1 based on Rank Analysis"
git branch -M main
git remote add origin https://github.com/doujiaoshaorou/hexaram.git
git push -u origin main
```

4. GitHub 仓库 → Releases → Draft a new release，创建标签 `v0.8.1`，标题 `海克斯战绩本 0.8.1`。上传 `Hexaram-0.8.1-win-x64.exe`、源码包和 SHA-256 文件后发布。程序不要通过 git 提交到源码目录。
5. 发行说明中保留：基于 wnzzer/Rank Analysis 二次开发，作者 doujiaoshaorou，使用 GPT-6 Astra 辅助开发，保留 MIT 许可证。说明历史可能不完整、AI 需要自己的 API Key，以及当前实测范围。

正式仓库建立后，再将应用里的项目/下载入口接到实际地址。此版只链接作者主页和上游，不使用尚不存在的下载链接，也不安装 RA 官方更新。

可选：Actions 中手动运行 “Build Hexaram Windows”，其产物供下载或附到 Release。工作流不自动发布、不需要 AI 密钥，也不使用 RA 上游签名密钥。

GitHub 文档：https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository
Release 文档：https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository

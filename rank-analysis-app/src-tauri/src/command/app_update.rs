//! Hexaram Releases: bounded downloads, independent signatures, explicit restart.
use super::portable_update::verify_portable_signature;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, time::Duration};
use tauri::ipc::Channel;
use tokio::sync::Mutex;

const REPO: &str = "https://github.com/doujiaoshaorou/hexaram";
const API: &str = "https://api.github.com/repos/doujiaoshaorou/hexaram/releases";
const MAX_EXE: usize = 100 * 1024 * 1024;
static TRANSFER: Mutex<()> = Mutex::const_new(());

#[derive(Clone, Debug, Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}
#[derive(Clone, Debug, Deserialize)]
struct Release {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    version: String,
    title: String,
    notes: String,
    url: String,
    published_at: String,
    downloadable: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    current_version: String,
    latest: Option<ReleaseInfo>,
    releases: Vec<ReleaseInfo>,
    ready_version: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    received: usize,
    total: Option<u64>,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum UpdateKind {
    #[default]
    Portable,
    Installer,
}
fn update_kind() -> UpdateKind {
    // All new Windows releases and updates use the signed NSIS installer.
    UpdateKind::Installer
}
#[derive(Serialize, Deserialize)]
struct Cached {
    version: String,
    signature: String,
    // Old portable clients did not record the kind. Never interpret their raw exe as setup.
    #[serde(default)]
    kind: UpdateKind,
}

fn version_parts(s: &str) -> Option<[u32; 3]> {
    let p: Vec<_> = s.strip_prefix('v').unwrap_or(s).split('.').collect();
    if p.len() != 3
        || p.iter()
            .any(|v| v.is_empty() || !v.bytes().all(|c| c.is_ascii_digit()))
    {
        return None;
    }
    Some([p[0].parse().ok()?, p[1].parse().ok()?, p[2].parse().ok()?])
}
fn newer(candidate: &str, current: &str) -> bool {
    matches!((version_parts(candidate), version_parts(current)), (Some(a), Some(b)) if a > b)
}
fn trusted_release_url(s: &str, tag: &str, file: Option<&str>) -> bool {
    let expected = match file {
        Some(f) => format!("{REPO}/releases/download/{tag}/{f}"),
        None => format!("{REPO}/releases/tag/{tag}"),
    };
    s == expected
}
fn assets(r: &Release, kind: UpdateKind) -> Option<(&Asset, &Asset)> {
    let v = r.tag_name.strip_prefix('v')?;
    version_parts(v)?;
    let filename = match kind {
        UpdateKind::Portable => format!("Hexaram-{v}-win-x64.exe"),
        UpdateKind::Installer => format!("Hexaram-{v}-win-x64-setup.exe"),
    };
    let signature = format!("{filename}.sig");
    let exe = r.assets.iter().find(|a| {
        a.name == filename
            && trusted_release_url(&a.browser_download_url, &r.tag_name, Some(&filename))
    })?;
    let sig = r.assets.iter().find(|a| {
        a.name == signature
            && trusted_release_url(&a.browser_download_url, &r.tag_name, Some(&signature))
    })?;
    Some((exe, sig))
}
fn info(r: &Release, kind: UpdateKind) -> Option<ReleaseInfo> {
    if r.draft
        || r.prerelease
        || !r.tag_name.starts_with('v')
        || version_parts(&r.tag_name).is_none()
        || !trusted_release_url(&r.html_url, &r.tag_name, None)
    {
        return None;
    }
    Some(ReleaseInfo {
        version: r.tag_name[1..].into(),
        title: r.name.clone().unwrap_or(r.tag_name.clone()),
        notes: r.body.clone().unwrap_or_default(),
        url: r.html_url.clone(),
        published_at: r.published_at.clone().unwrap_or_default(),
        downloadable: assets(r, kind).is_some(),
    })
}
fn client() -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .user_agent("Hexaram-updater")
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let u = attempt.url();
            if attempt.previous().len() > 5
                || u.scheme() != "https"
                || !matches!(
                    u.host_str(),
                    Some(
                        "github.com"
                            | "api.github.com"
                            | "release-assets.githubusercontent.com"
                            | "objects.githubusercontent.com"
                    )
                )
            {
                attempt.error("更新地址重定向不可信")
            } else {
                attempt.follow()
            }
        }));
    // Match Windows Internet Settings; reqwest otherwise only observes proxy environment variables.
    #[cfg(windows)]
    if let Ok(settings) = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
    {
        if settings.get_value::<u32, _>("ProxyEnable").unwrap_or(0) == 1 {
            if let Ok(server) = settings.get_value::<String, _>("ProxyServer") {
                let proxy = if server.contains('=') {
                    server
                        .split(';')
                        .find_map(|s| s.strip_prefix("https="))
                        .map(str::to_owned)
                } else {
                    Some(server)
                };
                if let Some(proxy) = proxy {
                    let url = if proxy.contains("://") {
                        proxy
                    } else {
                        format!("http://{proxy}")
                    };
                    if let Ok(p) = reqwest::Proxy::https(url) {
                        builder = builder.proxy(p);
                    }
                }
            }
        }
    }
    builder.build().map_err(|_| "无法初始化更新连接".into())
}
async fn fetch(
    url: &str,
    limit: usize,
    progress: Option<&Channel<Progress>>,
) -> Result<Vec<u8>, String> {
    let response = client()?
        .get(url)
        .timeout(Duration::from_secs(if progress.is_some() {
            180
        } else {
            20
        }))
        .send()
        .await
        .map_err(|_| "连接 GitHub 超时或失败，请稍后重试或查看 Release".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "GitHub 返回 {}，请稍后重试或查看 Release",
            response.status()
        ));
    }
    let total = response.content_length();
    if total.is_some_and(|s| s > limit as u64) {
        return Err("更新文件超过大小限制".into());
    }
    let mut result = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "更新下载中断，请重试".to_string())?;
        if result.len() + chunk.len() > limit {
            return Err("更新文件超过大小限制".into());
        }
        result.extend_from_slice(&chunk);
        if let Some(p) = progress {
            let _ = p.send(Progress {
                received: result.len(),
                total,
            });
        }
    }
    Ok(result)
}
fn cache_dir() -> PathBuf {
    crate::paths::data_file("updates")
}
fn read_cached() -> Option<Cached> {
    serde_json::from_slice(&std::fs::read(cache_dir().join("ready.json")).ok()?).ok()
}
fn pubkey(app: &tauri::AppHandle) -> Result<String, String> {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|v| v.get("pubkey"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "未配置本项目更新公钥".into())
}

async fn fetch_releases() -> Result<Vec<Release>, String> {
    // Release attachment fallback needs no API token and is not subject to the REST anonymous quota.
    let urls = [
        format!("{API}?per_page=20"),
        format!("{REPO}/releases/latest/download/hexaram-releases.json"),
    ];
    let mut error = String::new();
    for url in urls {
        match fetch(&url, 2 * 1024 * 1024, None).await {
            Ok(bytes) => match serde_json::from_slice::<Vec<Release>>(&bytes) {
                Ok(list) if list.len() <= 100 => return Ok(list),
                _ => error = "版本索引格式不正确".into(),
            },
            Err(e) => error = e,
        }
    }
    Err(error)
}

#[tauri::command]
pub async fn hex_check_updates(app: tauri::AppHandle) -> Result<Overview, String> {
    let current = app.package_info().version.to_string();
    let releases = fetch_releases().await?;
    let kind = update_kind();
    let mut list: Vec<_> = releases.iter().filter_map(|r| info(r, kind)).collect();
    list.sort_by(|a, b| version_parts(&b.version).cmp(&version_parts(&a.version)));
    let latest = list.first().cloned();
    let ready_version = read_cached()
        .filter(|c| {
            c.kind == kind && newer(&c.version, &current) && cache_dir().join("ready.exe").is_file()
        })
        .map(|c| c.version);
    Ok(Overview {
        current_version: current,
        latest,
        releases: list,
        ready_version,
    })
}

#[tauri::command]
pub async fn hex_download_update(
    app: tauri::AppHandle,
    version: String,
    on_event: Channel<Progress>,
) -> Result<String, String> {
    let _guard = TRANSFER
        .try_lock()
        .map_err(|_| "更新任务已在进行".to_string())?;
    if !newer(&version, &app.package_info().version.to_string()) {
        return Err("只能下载比当前版本更新的正式版本".into());
    }
    let release = fetch_releases()
        .await?
        .into_iter()
        .find(|r| r.tag_name == format!("v{version}"))
        .ok_or("未找到此正式版本，请重新检查更新")?;
    let kind = update_kind();
    if info(&release, kind).is_none() || release.tag_name != format!("v{version}") {
        return Err("不是本项目的正式版本".into());
    }
    let (exe, sig) =
        assets(&release, kind).ok_or("此版本没有对应的签名更新包，请查看 Release 手动下载")?;
    let signature = String::from_utf8(fetch(&sig.browser_download_url, 16384, None).await?)
        .map_err(|_| "签名格式错误")?;
    let bytes = fetch(&exe.browser_download_url, MAX_EXE, Some(&on_event)).await?;
    verify_portable_signature(&bytes, &signature, &pubkey(&app)?)?;
    if !bytes.starts_with(b"MZ") {
        return Err("更新包不是 Windows 程序".into());
    }
    let dir = cache_dir();
    std::fs::create_dir_all(&dir).map_err(|_| "更新目录不可写")?;
    // The marker is written last. A failed transfer can never be treated as ready.
    let _ = std::fs::remove_file(dir.join("ready.json"));
    std::fs::write(dir.join("ready.exe"), bytes).map_err(|_| "保存更新文件失败")?;
    std::fs::write(
        dir.join("ready.json"),
        serde_json::to_vec(&Cached {
            version: version.clone(),
            signature,
            kind,
        })
        .map_err(|e| e.to_string())?,
    )
    .map_err(|_| "保存更新状态失败")?;
    Ok(version)
}

#[tauri::command]
pub async fn hex_install_update(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = TRANSFER
        .try_lock()
        .map_err(|_| "更新任务已在进行".to_string())?;
    if !cfg!(windows) {
        return Err("自动安装仅支持 Windows".into());
    }
    if matches!(
        crate::lcu::api::phase::cached_phase().as_str(),
        "ChampSelect" | "GameStart" | "InProgress" | "Reconnect"
    ) {
        return Err("选人或游戏进行中，请对局结束后再重启更新".into());
    }
    let cached = read_cached().ok_or("请先下载新版本")?;
    if cached.kind != update_kind() {
        return Err("更新包与当前安装方式不匹配，请重新下载".into());
    }
    if !newer(&cached.version, &app.package_info().version.to_string()) {
        return Err("缓存不是更新版本，请重新检查".into());
    }
    let bytes =
        std::fs::read(cache_dir().join("ready.exe")).map_err(|_| "更新文件不存在，请重新下载")?;
    verify_portable_signature(&bytes, &cached.signature, &pubkey(&app)?)?;
    let exe = std::env::current_exe().map_err(|_| "无法定位当前程序")?;
    launch_installer(&cache_dir().join("ready.exe"), &exe)?;
    // Keep the cache so a cancelled/failed installer can be retried.
    app.exit(0);
    Ok(())
}

fn launch_installer(
    installer: &std::path::Path,
    current_exe: &std::path::Path,
) -> Result<(), String> {
    let dir = current_exe.parent().ok_or("无法定位安装目录")?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // NSIS requires /D last and unquoted, including paths containing spaces.
        // /UPDATE preserves shortcuts and user data; /R restarts only after success.
        let mut args = std::ffi::OsString::from("/P /R /UPDATE /D=");
        args.push(dir);
        std::process::Command::new(installer)
            .raw_arg(args)
            .spawn()
            .map_err(|_| "安装程序启动失败，请重试或手动运行安装包".to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (installer, dir);
        Err("自动安装仅支持 Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "local signed release fixture required"]
    fn local_release_signature_and_tamper_check() {
        let file = std::env::var("HEXARAM_TEST_SIGNED_FILE").expect("fixture path");
        let mut bytes = std::fs::read(&file).unwrap();
        let signature = std::fs::read_to_string(format!("{file}.sig")).unwrap();
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        let key = config["plugins"]["updater"]["pubkey"].as_str().unwrap();
        verify_portable_signature(&bytes, &signature, key).unwrap();
        bytes[0] ^= 1;
        assert!(verify_portable_signature(&bytes, &signature, key).is_err());
    }
    #[tokio::test]
    #[ignore = "requires published signed release and network"]
    async fn live_release_signature_check() {
        let releases = fetch_releases().await.unwrap();
        let r = releases
            .iter()
            .filter(|r| info(r, update_kind()).is_some())
            .max_by_key(|r| version_parts(&r.tag_name))
            .expect("latest stable release");
        if let Ok(expected) = std::env::var("HEXARAM_TEST_RELEASE_VERSION") {
            assert_eq!(r.tag_name, format!("v{expected}"));
        }
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        for kind in [update_kind()] {
            let (exe, sig) = assets(r, kind).expect("latest release must have a signed installer");
            let signature =
                String::from_utf8(fetch(&sig.browser_download_url, 16384, None).await.unwrap())
                    .unwrap();
            let bytes = fetch(&exe.browser_download_url, MAX_EXE, None)
                .await
                .unwrap();
            verify_portable_signature(
                &bytes,
                &signature,
                config["plugins"]["updater"]["pubkey"].as_str().unwrap(),
            )
            .unwrap();
            assert!(bytes.starts_with(b"MZ"));
        }
    }
    #[test]
    fn versions_are_numeric_and_stable_only() {
        assert!(newer("0.10.0", "0.9.9"));
        assert!(!newer("0.9.0", "0.9.0"));
        assert!(!newer("0.8.1", "0.9.0"));
        for v in ["../x", "0.9", "0.9.1-rc1", "0.9.1/../x", "0.9.1?x", "0.9.a"] {
            assert!(version_parts(v).is_none());
        }
    }
    #[test]
    fn rejects_upstream_and_lookalike_links() {
        assert!(trusted_release_url(
            &format!("{REPO}/releases/download/v0.9.0/Hexaram-0.9.0-win-x64.exe"),
            "v0.9.0",
            Some("Hexaram-0.9.0-win-x64.exe")
        ));
        for url in [
            "https://github.com/wnzzer/rank-analysis/releases/tag/v0.9.0",
            "https://github.com.evil/doujiaoshaorou/hexaram/releases/tag/v0.9.0",
            "http://github.com/doujiaoshaorou/hexaram/releases/tag/v0.9.0",
        ] {
            assert!(!trusted_release_url(url, "v0.9.0", None));
        }
    }
    #[test]
    fn unsigned_release_is_visible_but_not_downloadable() {
        let mut r = Release {
            tag_name: "v0.9.0".into(),
            name: None,
            body: None,
            html_url: format!("{REPO}/releases/tag/v0.9.0"),
            published_at: None,
            draft: false,
            prerelease: false,
            assets: vec![],
        };
        assert!(!info(&r, UpdateKind::Portable).unwrap().downloadable);
        r.prerelease = true;
        assert!(info(&r, UpdateKind::Portable).is_none());
        r.prerelease = false;
        r.draft = true;
        assert!(info(&r, UpdateKind::Portable).is_none());
    }

    #[test]
    fn selects_only_signed_assets_for_the_current_install_form() {
        let mut release = Release {
            tag_name: "v0.9.2".into(),
            name: None,
            body: None,
            html_url: format!("{REPO}/releases/tag/v0.9.2"),
            published_at: None,
            draft: false,
            prerelease: false,
            assets: vec![],
        };
        let asset = |name: &str| Asset {
            name: name.into(),
            browser_download_url: format!("{REPO}/releases/download/v0.9.2/{name}"),
        };
        release.assets = vec![
            asset("Hexaram-0.9.2-win-x64.exe"),
            asset("Hexaram-0.9.2-win-x64.exe.sig"),
        ];
        assert_eq!(update_kind(), UpdateKind::Installer);
        assert!(!info(&release, update_kind()).unwrap().downloadable);
        assert!(assets(&release, UpdateKind::Installer).is_none());
        release
            .assets
            .push(asset("Hexaram-0.9.2-win-x64-setup.exe"));
        assert!(assets(&release, UpdateKind::Installer).is_none());
        release
            .assets
            .push(asset("Hexaram-0.9.2-win-x64-setup.exe.sig"));
        assert!(info(&release, update_kind()).unwrap().downloadable);
        assert!(assets(&release, UpdateKind::Portable)
            .unwrap()
            .0
            .name
            .ends_with("-x64.exe"));
        assert!(assets(&release, UpdateKind::Installer)
            .unwrap()
            .0
            .name
            .ends_with("-setup.exe"));
        release.assets.last_mut().unwrap().browser_download_url =
            "https://example.com/setup.sig".into();
        assert!(assets(&release, UpdateKind::Installer).is_none());
    }

    #[test]
    fn legacy_cache_is_portable_and_installer_cache_round_trips() {
        let legacy: Cached =
            serde_json::from_str(r#"{"version":"0.9.2","signature":"test"}"#).unwrap();
        assert_eq!(legacy.kind, UpdateKind::Portable);
        assert_ne!(legacy.kind, update_kind());
        let installer = Cached {
            kind: UpdateKind::Installer,
            ..legacy
        };
        let loaded: Cached =
            serde_json::from_slice(&serde_json::to_vec(&installer).unwrap()).unwrap();
        assert_eq!(loaded.kind, UpdateKind::Installer);
        assert_eq!(loaded.kind, update_kind());
    }

    #[test]
    fn installer_only_release_is_downloadable() {
        let release = Release {
            tag_name: "v0.9.3".into(),
            name: None,
            body: None,
            html_url: format!("{REPO}/releases/tag/v0.9.3"),
            published_at: None,
            draft: false,
            prerelease: false,
            assets: [
                "Hexaram-0.9.3-win-x64-setup.exe",
                "Hexaram-0.9.3-win-x64-setup.exe.sig",
            ]
            .iter()
            .map(|name| Asset {
                name: (*name).into(),
                browser_download_url: format!("{REPO}/releases/download/v0.9.3/{name}"),
            })
            .collect(),
        };
        assert!(info(&release, update_kind()).unwrap().downloadable);
        assert!(assets(&release, update_kind())
            .unwrap()
            .0
            .name
            .ends_with("-setup.exe"));
    }
}

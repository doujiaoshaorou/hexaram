//! Hexaram additions to Rank Analysis. Reuses the upstream SGP mapper and JSON storage.
use crate::lcu::api::{match_history::MatchHistory, sgp, summoner::Summoner};
use serde_json::{json, Value};
use std::{collections::BTreeMap, sync::LazyLock};
use tokio::sync::Mutex;

static SYNC_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
static MAYHEM: LazyLock<Mutex<Option<(u64, Value)>>> = LazyLock::new(|| Mutex::new(None));

/// Read-only review evidence. Never execute paths supplied by a model or return raw client data.
#[tauri::command]
pub async fn get_mayhem_review_context(game_id: i64, champion_ids: Vec<i32>) -> Result<Value, String> {
    if game_id <= 0 || champion_ids.len() > 10 || champion_ids.iter().any(|id| *id <= 0 || *id > 10000) {
        return Err("无效的复盘对局或英雄".into());
    }
    async fn read(path: String) -> Option<Value> {
        tokio::time::timeout(std::time::Duration::from_secs(4), crate::lcu::util::http::lcu_get::<Value>(&path)).await.ok()?.ok()
    }
    let timeline_job = read(format!("lol-match-history/v1/game-timelines/{game_id}"));
    let champions_job = async {
        let mut champions = Vec::new();
        for chunk in champion_ids.chunks(5) {
            let mut jobs = tokio::task::JoinSet::new();
            for &id in chunk {
                jobs.spawn(async move {
                    let data = read(format!("lol-game-data/assets/v1/champions/{id}.json")).await?;
                    let spells: Vec<Value> = data["spells"].as_array()?.iter().map(|s| json!({"name":s["name"], "description":s["description"]})).collect();
                    Some(json!({"id":id,"name":data["name"],"roles":data["roles"],"passive":{"name":data["passive"]["name"],"description":data["passive"]["description"]},"spells":spells}))
                });
            }
            while let Some(result) = jobs.join_next().await { if let Ok(Some(value)) = result { champions.push(value); } }
        }
        champions
    };
    let (timeline, champions) = tokio::join!(timeline_job, champions_job);
    let mut events = Vec::new();
    if let Some(frames) = timeline.as_ref().and_then(|t| t["frames"].as_array()) {
        for frame in frames {
            for event in frame["events"].as_array().into_iter().flatten() {
                let kind = event["type"].as_str().unwrap_or("");
                if !["CHAMPION_KILL", "BUILDING_KILL", "ITEM_PURCHASED", "ITEM_SOLD", "ITEM_UNDO"].contains(&kind) { continue; }
                if event["timestamp"].as_i64().is_none() { continue; }
                let mut filtered = serde_json::Map::new();
                for key in ["type", "timestamp", "killerId", "victimId", "assistingParticipantIds", "participantId", "itemId", "teamId", "buildingType", "towerType", "beforeId", "afterId"] {
                    if let Some(value) = event.get(key) { filtered.insert(key.into(), value.clone()); }
                }
                filtered.insert("id".into(), json!(events.len()+1));
                events.push(Value::Object(filtered));
                if events.len() >= 600 { break; }
            }
            if events.len() >= 600 { break; }
        }
    }
    Ok(json!({"champions":champions,"events":events,"timelineAvailable":!events.is_empty(),"timelineTruncated":events.len()>=600}))
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// Parse only JSON in Next's server-rendered data stream; never execute remote scripts.
pub fn parse_mayhem(html: &str) -> Result<Value, String> {
    let re = regex::Regex::new(r"(?s)self\.__next_f\.push\((\[.*?\])\)</script>").unwrap();
    let mut stream = String::new();
    for cap in re.captures_iter(html) {
        if let Ok(v) = serde_json::from_str::<Value>(&cap[1]) {
            if let Some(s) = v.get(1).and_then(Value::as_str) {
                stream.push_str(s);
            }
        }
    }
    fn walk(v: &Value, champions: &mut Vec<Value>, augments: &mut Vec<Value>) {
        match v {
            Value::Array(a) => {
                if let Some(first) = a.first() {
                    if first.get("champion_id").is_some() && first.get("tier").is_some() {
                        *champions = a.clone();
                        return;
                    }
                    if first.get("champion_ids").is_some() && first.get("smallIcon").is_some() {
                        *augments = a.clone();
                        return;
                    }
                }
                for x in a {
                    walk(x, champions, augments);
                }
            }
            Value::Object(m) => {
                for (k, x) in m {
                    if k != "messages" {
                        walk(x, champions, augments);
                    }
                }
            }
            _ => (),
        }
    }
    let (mut champions, mut augments) = (Vec::new(), Vec::new());
    for line in stream.lines() {
        if let Some((_, data)) = line.split_once(':') {
            if let Ok(v) = serde_json::from_str::<Value>(data) {
                walk(&v, &mut champions, &mut augments);
            }
        }
    }
    if champions.is_empty() || augments.is_empty() {
        return Err("OP.GG 海克斯页面结构已变化，无法读取榜单".into());
    }
    let patch_re = regex::Regex::new(r#""game_patch_version":"([0-9.]+)""#).unwrap();
    let patch = patch_re
        .captures(&stream)
        .map(|c| c[1].to_string())
        .unwrap_or_default();
    Ok(
        json!({"champions":champions,"augments":augments,"patch":patch,"fetchedAt":now(),"stale":false,"source":"https://op.gg/zh-cn/lol/modes/aram-mayhem"}),
    )
}

#[tauri::command]
pub async fn get_mayhem_data() -> Result<Value, String> {
    let mut cache = MAYHEM.lock().await;
    if let Some((at, v)) = cache.as_ref() {
        if now().saturating_sub(*at) < 3600 {
            return Ok(v.clone());
        }
    }
    let result = async {
        let client = reqwest::Client::builder()
            .user_agent(crate::opgg::api::USER_AGENT)
            .timeout(std::time::Duration::from_secs(25))
            .build()
            .map_err(|e| e.to_string())?;
        let body = client
            .get("https://op.gg/zh-cn/lol/modes/aram-mayhem")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;
        parse_mayhem(&body)
    }
    .await;
    match result {
        Ok(v) => {
            *cache = Some((now(), v.clone()));
            Ok(v)
        }
        Err(e) => {
            if let Some((_, v)) = cache.as_ref() {
                let mut v = v.clone();
                v["stale"] = json!(true);
                Ok(v)
            } else {
                Err(e)
            }
        }
    }
}

fn archive_path(region: &str, puuid: &str) -> Result<std::path::PathBuf, String> {
    if crate::constant::game::get_sgp_host(region).is_none() {
        return Err("无效的大区".into());
    }
    if puuid.is_empty()
        || !puuid
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("无效的账号标识".into());
    }
    Ok(crate::paths::data_file(&format!(
        "hexaram-data/{region}-{puuid}.json"
    )))
}

fn mapped(doc: &Value) -> Result<Value, String> {
    let puuid = doc["account"]["puuid"].as_str().ok_or("归档缺少账号")?;
    let region = doc["account"]["region"].as_str().ok_or("归档缺少大区")?;
    let games = doc["games"].as_array().ok_or("归档格式错误")?;
    let raw = json!({"games":games.iter().map(|g|json!({"json":g})).collect::<Vec<_>>()});
    let mut mh = sgp::map_sgp_to_match_history(&raw, region, puuid);
    mh.enrich_info_cn().ok();
    Ok(json!({"account":doc["account"],"games":mh.games.games,"sync":doc["sync"],"clientSummary":doc["clientSummary"],"recovery":doc["recovery"]}))
}

#[tauri::command]
pub async fn load_hex_history(region: String, puuid: String) -> Result<Option<Value>, String> {
    let path = archive_path(&region, &puuid)?;
    if !path.exists() {
        return Ok(None);
    }
    let doc: Value = serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    mapped(&doc).map(Some)
}

#[tauri::command]
pub async fn hex_season_reference(region: String, puuid: String, values: Option<Value>) -> Result<Value, String> {
    let path = archive_path(&region, &puuid)?.with_extension("reference.json");
    if let Some(values) = values {
        let object = values.as_object().ok_or("无效赛段参考")?;
        if object.len() > 20 || object.iter().any(|(key,value)| key.len()>64 || !value.as_u64().is_some_and(|n|n<=100000)) { return Err("无效赛段或场数".into()); }
        let _guard = SYNC_LOCK.lock().await;
        save_doc(&path, &values)?;
        return Ok(values);
    }
    if !path.exists() { return Ok(json!({})); }
    serde_json::from_slice(&std::fs::read(path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())
}

#[tauri::command]
pub async fn sync_hex_history() -> Result<Value, String> {
    let _guard = SYNC_LOCK.lock().await;
    let me = Summoner::get_my_summoner().await?;
    let region = sgp::get_current_platform_id().await?;
    let path = archive_path(&region, &me.puuid)?;
    let mut records = BTreeMap::<String, Value>::new();
    let mut client_summary = Value::Null;
    let mut recovery = Value::Null;
    let mut prior_window_checked = false;
    let mut prior_boundary = 0;
    // Import adjacent v0.2 JSON archives read-only; originals remain intact.
    let legacy = crate::paths::data_file("user-data/archives");
    let mut sources = vec![path.clone()];
    if let Ok(entries) = std::fs::read_dir(legacy) {
        sources.extend(
            entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().is_some_and(|e| e == "json")),
        );
    }
    for source in sources {
        if !source.exists() {
            continue;
        }
        let doc: Value = serde_json::from_slice(&std::fs::read(&source).map_err(|e| e.to_string())?)
            .map_err(|e| format!("归档损坏，已保留原文件：{e}"))?;
        if doc["account"]["puuid"].as_str() != Some(&me.puuid)
            || doc["account"]["region"].as_str() != Some(&region)
        {
            continue;
        }
        if source == path { client_summary = doc["clientSummary"].clone(); recovery=doc["recovery"].clone(); prior_window_checked=doc["sync"]["coverage"]=="available-window" || doc["sync"]["windowChecked"]==true; prior_boundary=doc["sync"]["boundaryOffset"].as_i64().unwrap_or(0); }
        if let Some(games) = doc["games"].as_array() {
            for g in games {
                records.insert(format!("{}:{}", g["platformId"], g["gameId"]), g.clone());
            }
        }
    }
    // End-of-game counters are independent from match-history pagination.
    let eog = crate::lcu::util::http::lcu_get::<Value>("lol-end-of-game/v1/eog-stats-block").await.ok();
    if let Some(eog) = &eog {
        if let Some(counter) = verified_client_summary(eog, &me.puuid, &records) { client_summary = counter; }
    }
    let account = json!({"puuid":me.puuid,"region":region,"riotId":format!("{}#{}",me.game_name,me.tag_line),"profileIconId":me.profile_icon_id,"summonerLevel":me.summoner_level});
    let mut boundary = 0;
    let mut complete = false;
    let mut seen_pages = std::collections::HashSet::new();
    let mut warning = String::new();
    for start in (0..10000).step_by(100) {
        let raw = match sgp::fetch_match_history_summary(&region, &me.puuid, start, 100).await {
            Ok(v) => v,
            Err(e) => {
                warning = e;
                break;
            }
        };
        let page = raw
            .get("games")
            .and_then(Value::as_array)
            .ok_or("战绩响应格式异常")?;
        boundary = start;
        if page.is_empty() {
            complete = true;
            break;
        }
        if prior_window_checked && page.iter().all(|w| records.contains_key(&format!("{}:{}",w["json"]["platformId"],w["json"]["gameId"]))) {
            complete=true;
            boundary=prior_boundary as i32;
            break;
        }
        let fingerprint = page
            .iter()
            .map(|g| g["json"]["gameId"].to_string())
            .collect::<Vec<_>>()
            .join(",");
        if !seen_pages.insert(fingerprint) {
            warning = "接口返回重复页，历史可能不完整".into();
            break;
        }
        for wrapper in page {
            if let Some(g) = wrapper.get("json") {
                if g["gameId"].as_i64().is_some() {
                    records.insert(format!("{}:{}", g["platformId"], g["gameId"]), g.clone());
                }
            }
        }
        if let Some(eog) = &eog {
            if let Some(counter) = verified_client_summary(eog, &me.puuid, &records) { client_summary = counter; }
        }
        // Every fetched page is retained, including when a later page fails.
        let doc = json!({"schema":1,"account":account,"clientSummary":client_summary,"recovery":recovery,"games":records.values().collect::<Vec<_>>(),"sync":{"coverage":"partial","windowChecked":prior_window_checked,"boundaryOffset":start}});
        save_doc(&path, &doc)?;
    }
    if records.is_empty() && !warning.is_empty() {
        return Err(warning);
    }
    let doc = json!({"schema":1,"account":account,"clientSummary":client_summary,"recovery":recovery,"games":records.values().collect::<Vec<_>>(),"sync":{"coverage":if complete{"available-window"}else{"partial"},"boundaryOffset":boundary,"warning":warning,"at":now()}});
    save_doc(&path, &doc)?;
    mapped(&doc)
}

fn verified_client_summary(eog: &Value, puuid: &str, records: &BTreeMap<String, Value>) -> Option<Value> {
    let player = &eog["localPlayer"];
    if player["puuid"].as_str() != Some(puuid) { return None; }
    let game_id = eog["gameId"].as_i64()?;
    let game = records.values().find(|g| g["gameId"].as_i64() == Some(game_id))?;
    let queue = game["queueId"].as_i64()?;
    if !matches!(queue, 2400 | 2410 | 2450) { return None; }
    let wins = player["wins"].as_u64()?;
    let losses = player["losses"].as_u64()?;
    if wins + losses == 0 { return None; }
    Some(json!({"queueId":queue,"wins":wins,"losses":losses,"gameId":game_id,"gameCreation":game["gameCreation"],"observedAt":now()}))
}

fn save_doc(path: &std::path::Path, doc: &Value) -> Result<(), String> {
    std::fs::create_dir_all(path.parent().ok_or("无效路径")?).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, serde_json::to_vec(doc).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(temp, path).map_err(|e| e.to_string())
}

// The history list has a server-side window, but older games can still be read
// by ID. Local game logs provide those IDs without inspecting game memory.
fn game_id_from_log(text: &str, region: &str) -> Option<i64> {
    static ID: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"(?:-GameID=|GameStartData::GameID=)(\d+)").unwrap());
    static PLATFORM: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"-PlatformID=([A-Za-z0-9]+)").unwrap());
    if PLATFORM.captures(text)?.get(1)?.as_str() != region { return None; }
    ID.captures(text)?.get(1)?.as_str().parse().ok()
}

/// Convert nested LCU data to the existing raw archive format, after validating
/// game, region and account. Never substitute the first player for a missing me.
fn archive_game_from_lcu(game: &Value, game_id: i64, region: &str, puuid: &str) -> Result<Option<Value>, String> {
    if game["gameId"].as_i64() != Some(game_id) || game["platformId"].as_str() != Some(region) {
        return Err("对局 ID 或大区不匹配".into());
    }
    let identities = game["participantIdentities"].as_array().ok_or("缺少玩家身份")?;
    if !identities.iter().any(|p| p["player"]["puuid"].as_str() == Some(puuid)) {
        return Ok(None);
    }
    if !matches!(game["queueId"].as_i64(), Some(2400 | 2410 | 2450)) { return Ok(None); }
    let participants = game["participants"].as_array().ok_or("缺少结算数据")?;
    if participants.len() != 10 || game["gameCreation"].as_i64().unwrap_or(0) <= 0 {
        return Err("对局结算数据不完整".into());
    }
    let mut flat = Vec::new();
    for p in participants {
        let id = identities.iter().find(|id| id["participantId"] == p["participantId"]).ok_or("玩家身份无法匹配")?;
        let mut row = p["stats"].as_object().ok_or("缺少结算统计")?.clone();
        if row.get("win").and_then(Value::as_bool).is_none() { return Err("缺少胜负结果".into()); }
        for key in ["participantId", "teamId", "championId", "spell1Id", "spell2Id"] { row.insert(key.into(), p[key].clone()); }
        let player = &id["player"];
        for key in ["puuid", "summonerId", "summonerName"] { row.insert(key.into(), player[key].clone()); }
        row.insert("riotIdGameName".into(), player["gameName"].clone());
        row.insert("riotIdTagline".into(), player["tagLine"].clone());
        flat.push(Value::Object(row));
    }
    let mut raw = game.clone();
    raw["participants"] = json!(flat);
    raw["archiveSource"] = json!("local-log-lcu-detail");
    raw.as_object_mut().unwrap().remove("participantIdentities");
    Ok(Some(raw))
}

fn scan_local_game_ids(root: &std::path::Path, region: &str) -> Result<Vec<i64>, String> {
    use std::io::Read;
    let mut ids = std::collections::BTreeSet::new();
    let mut found_directory = false;
    for base in [root.join("Game/Logs/GameLogs"), root.join("Logs/GameLogs")] {
        let Ok(dirs) = std::fs::read_dir(&base) else { continue; };
        found_directory = true;
        for dir in dirs.flatten() {
            if !dir.file_type().is_ok_and(|t| t.is_dir()) { continue; }
            // Mayhem did not exist before the global 25.21 release (CN: Oct 23).
            // Keep unknown directory formats; only skip a verified earlier date.
            if log_predates_mayhem(&dir.file_name().to_string_lossy()) { continue; }
            let Ok(files) = std::fs::read_dir(dir.path()) else { continue; };
            for file in files.flatten() {
                if !file.file_type().is_ok_and(|t| t.is_file()) || !file.file_name().to_string_lossy().ends_with("_r3dlog.txt") { continue; }
                let Ok(f) = std::fs::File::open(file.path()) else { continue; };
                let mut header = Vec::new();
                // The ID is in the header. Never persist or log raw command lines
                // (they can contain the game connection key).
                if f.take(64 * 1024).read_to_end(&mut header).is_err() { continue; }
                if let Some(id) = game_id_from_log(&String::from_utf8_lossy(&header), region) { ids.insert(id); }
            }
        }
    }
    if !found_directory { return Err("未找到本机游戏日志，请在保存旧日志的电脑上补齐历史".into()); }
    Ok(ids.into_iter().collect())
}

fn log_predates_mayhem(name: &str) -> bool {
    let Some(date) = name.get(..10) else { return false; };
    let parts: Vec<_> = date.split('-').collect();
    if parts.len()!=3 || parts[0].len()!=4 || parts[1].len()!=2 || parts[2].len()!=2 { return false; }
    let (Ok(year),Ok(month),Ok(day)) = (parts[0].parse::<u32>(),parts[1].parse::<u32>(),parts[2].parse::<u32>()) else { return false; };
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let max_day = match month { 2 => if leap {29}else{28}, 4|6|9|11=>30, 1|3|5|7|8|10|12=>31, _=>0 };
    (2009..=9999).contains(&year) && day > 0 && day <= max_day && date < "2025-10-22"
}

#[tauri::command]
pub async fn recover_hex_history(app: tauri::AppHandle) -> Result<Value, String> {
    use tauri::Emitter;
    let _guard = SYNC_LOCK.lock().await;
    let me = Summoner::get_my_summoner().await?;
    let region = sgp::get_current_platform_id().await?;
    let root = crate::lcu::util::token::get_client_install_root().ok_or("请先连接英雄联盟客户端")?;
    let scan_region = region.clone();
    let ids = tokio::task::spawn_blocking(move || scan_local_game_ids(&root, &scan_region)).await.map_err(|e| e.to_string())??;
    let path = archive_path(&region, &me.puuid)?;
    let mut doc: Value = if path.exists() {
        serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?).map_err(|_| "归档损坏，已保留原文件")?
    } else {
        json!({"schema":1,"account":{"puuid":me.puuid,"region":region,"riotId":format!("{}#{}",me.game_name,me.tag_line),"profileIconId":me.profile_icon_id,"summonerLevel":me.summoner_level},"games":[],"sync":{"coverage":"partial","at":now()}})
    };
    if doc["account"]["puuid"].as_str() != Some(&me.puuid) || doc["account"]["region"].as_str() != Some(&region) { return Err("归档账号不匹配，已停止补录".into()); }
    let mut records: BTreeMap<i64,Value> = doc["games"].as_array().ok_or("归档格式错误")?.iter().filter_map(|g| Some((g["gameId"].as_i64()?,g.clone()))).collect();
    let mut excluded: std::collections::BTreeSet<i64> = doc["recovery"]["excludedIds"].as_array().into_iter().flatten().filter_map(Value::as_i64).collect();
    let pending: Vec<i64> = ids.iter().rev().copied().filter(|id| !records.contains_key(id) && !excluded.contains(id)).collect();
    let (mut processed, mut added, mut failures, mut consecutive_failures) = (0,0,0,0);
    let mut warning = String::new();
    for id in &pending {
        let response = tokio::time::timeout(std::time::Duration::from_secs(15), crate::lcu::util::http::lcu_get_with_status(&format!("lol-match-history/v1/games/{id}"))).await;
        let not_found = matches!(&response, Ok(Ok((404,_))));
        let fetched: Result<Value,String> = match response {
            Ok(Ok((200,body))) => serde_json::from_str(&body).map_err(|_| "无效对局数据".into()),
            _ => Err("对局暂时不可读取".into())
        };
        match fetched.and_then(|g| archive_game_from_lcu(&g,*id,&region,&me.puuid)) {
            Ok(Some(g)) => { records.insert(*id,g); added += 1; consecutive_failures=0; }
            Ok(None) => { excluded.insert(*id); consecutive_failures=0; }
            Err(_) => { failures+=1; if !not_found { consecutive_failures+=1; } else { consecutive_failures=0; } }
        }
        processed+=1;
        let progress=json!({"processed":processed,"total":pending.len(),"added":added,"failures":failures});
        let _=app.emit("hex-history-recovery-progress",&progress);
        if processed % 20 == 0 || processed == pending.len() || consecutive_failures >= 5 {
            doc["games"]=json!(records.values().collect::<Vec<_>>());
            doc["recovery"]=json!({"logIds":ids.len(),"processed":processed,"total":pending.len(),"added":added,"failures":failures,"excludedIds":excluded,"at":now()});
            save_doc(&path,&doc)?;
        }
        if consecutive_failures >= 5 { warning="连续读取失败，已保存成功补录的对局；稍后可继续补齐".into(); break; }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    doc["games"]=json!(records.values().collect::<Vec<_>>());
    let recovered_total = records.values().filter(|g| g["archiveSource"]=="local-log-lcu-detail").count();
    doc["recovery"]=json!({"logIds":ids.len(),"processed":processed,"total":pending.len(),"added":added,"recoveredTotal":recovered_total,"failures":failures,"excludedIds":excluded,"warning":warning,"at":now()});
    save_doc(&path,&doc)?;
    mapped(&doc)
}

/// LCU's existing history cache is reused; filter before taking the requested count.
static RECENT:LazyLock<moka::future::Cache<String,MatchHistory>>=LazyLock::new(||moka::future::Cache::builder().max_capacity(100).expire_after(crate::game_cache::GameScopedExpiry).build());
pub fn invalidate_recent(){RECENT.invalidate_all();}
pub async fn recent_hex(puuid:&str,count:usize,queue:i32)->Result<MatchHistory,String>{
    let region=sgp::get_current_platform_id().await?;
    let limit=if count>100 {200} else {100};
    let mut mh=RECENT.try_get_with(format!("{region}:{puuid}:{limit}"),async {
        let mut result=MatchHistory::default();
        result.platform_id=region.clone();
        // Prefer complete local archive for the owner, merge with fresh server summaries.
        if let Ok(path)=archive_path(&region,puuid) {
            if let Ok(bytes)=std::fs::read(path) {
                if let Ok(doc)=serde_json::from_slice::<Value>(&bytes) {
                    if doc["account"]["puuid"].as_str()==Some(puuid) {
                        if let Some(records)=doc["games"].as_array() {
                            let raw=json!({"games":records.iter().map(|g|json!({"json":g})).collect::<Vec<_>>()});
                            result=sgp::map_sgp_to_match_history(&raw,&region,puuid);
                        }
                    }
                }
            }
        }
        let mut seen:std::collections::HashSet<_>=result.games.games.iter().map(|g|g.game_id).collect();
        for offset in (0..limit).step_by(100) {
            match sgp::fetch_match_history_summary(&region,puuid,offset,100).await {
                Ok(raw)=> {
                    let page=sgp::map_sgp_to_match_history(&raw,&region,puuid);
                    let n=page.games.games.len();
                    for g in page.games.games {if seen.insert(g.game_id){result.games.games.push(g);}}
                    if n<100 {break;}
                },
                Err(_) => {
                    if result.games.games.is_empty(){result=MatchHistory::get_match_history_by_puuid(puuid,0,49).await?;}
                    break;
                }
            }
        }
        result.games.games.sort_by(|a,b|b.game_creation_date.cmp(&a.game_creation_date));
        Ok::<MatchHistory,String>(result)
    }).await.map_err(|e|e.to_string())?;
    mh.games.games.retain(|g|matches!(g.queue_id,2400|2410|2450)&&(queue==0||queue==g.queue_id) && !g.participants.iter().chain(g.game_detail.participants.iter()).any(|p|p.stats.game_ended_in_early_surrender));
    mh.games.games.truncate(count);Ok(mh)
}

#[tauri::command]
pub async fn query_hex_history(
    region: String,
    name: String,
    beg_index: i32,
    queue: i32,
    champion: i32,
    page_size: Option<usize>,
) -> Result<MatchHistory, String> {
    let page_size = page_size.unwrap_or(10).clamp(1, 100);
    let region = if region.is_empty() {
        sgp::get_current_platform_id().await?
    } else {
        region
    };
    let (game_name, tag) = name.rsplit_once('#').ok_or("请填写完整的 名字#TAG")?;
    let puuid = sgp::resolve_puuid_by_riot_id(game_name, tag).await?;
    let mut result = MatchHistory::default();
    result.platform_id = region.clone();
    result.beg_index = beg_index;
    result.end_index = beg_index;
    let mut seen = std::collections::HashSet::new();
    for start in (beg_index.max(0)..10000).step_by(100) {
        let raw = sgp::fetch_match_history_summary(&region, &puuid, start, 100).await?;
        let page = sgp::map_sgp_to_match_history(&raw, &region, &puuid);
        if page.games.games.is_empty() {
            break;
        }
        let fingerprint = page
            .games
            .games
            .iter()
            .map(|g| g.game_id.to_string())
            .collect::<Vec<_>>()
            .join(",");
        if !seen.insert(fingerprint) {
            return Err("接口返回重复页，请稍后重试".into());
        }
        for (i, g) in page.games.games.into_iter().enumerate() {
            result.end_index = start + i as i32;
            if matches!(g.queue_id, 2400 | 2410 | 2450)
                && (queue == 0 || g.queue_id == queue)
                && (champion <= 0
                    || g.participants
                        .first()
                        .is_some_and(|p| p.champion_id == champion))
            {
                result.games.games.push(g);
                if result.games.games.len() == page_size {
                    result.enrich_info_cn().ok();
                    return Ok(result);
                }
            }
        }
    }
    result.enrich_info_cn().ok();
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn log_index_only_accepts_game_id_in_matching_region() {
        assert_eq!(game_id_from_log("-GameID=901234567890 -PlatformID=NJ100", "NJ100"),Some(901234567890));
        assert_eq!(game_id_from_log("-GameID=901234567890 -PlatformID=TJ100", "NJ100"),None);
        assert_eq!(game_id_from_log("-GameID=wrong -PlatformID=NJ100", "NJ100"),None);
        assert!(log_predates_mayhem("2025-10-01T22-31-03"));
        assert!(!log_predates_mayhem("2025-10-23T20-17-19"));
        assert!(!log_predates_mayhem("unknown-old-logs"));
    }
    #[test]
    fn recovered_details_preserve_stats_and_require_the_actual_player() {
        let identities:Vec<Value>=(1..=10).map(|i|json!({"participantId":i,"player":{"puuid":if i==7{"me"}else{"other"},"gameName":"player","tagLine":"1"}})).collect();
        let participants:Vec<Value>=(1..=10).map(|i|json!({"participantId":i,"teamId":if i<=5{100}else{200},"championId":22,"stats":{"win":i<=5,"kills":i,"playerAugment1":1058,"item0":3006,"totalDamageDealtToChampions":2000}})).collect();
        let raw=json!({"gameId":42,"platformId":"NJ100","queueId":2400,"gameCreation":1700000000000_i64,"participants":participants,"participantIdentities":identities});
        let recovered=archive_game_from_lcu(&raw,42,"NJ100","me").unwrap().unwrap();
        assert_eq!(recovered["participants"][6]["puuid"],"me");
        assert_eq!(recovered["participants"][6]["kills"],7);
        assert_eq!(recovered["participants"][6]["playerAugment1"],1058);
        assert_eq!(recovered["participants"][6]["item0"],3006);
        assert!(archive_game_from_lcu(&raw,42,"NJ100","absent").unwrap().is_none());
        assert!(archive_game_from_lcu(&raw,43,"NJ100","me").is_err());
        assert!(archive_game_from_lcu(&raw,42,"TJ100","me").is_err());
        let mut non_mayhem=raw.clone();non_mayhem["queueId"]=json!(450);
        assert!(archive_game_from_lcu(&non_mayhem,42,"NJ100","me").unwrap().is_none());
        let mut partial=raw.clone();partial["participants"].as_array_mut().unwrap().pop();
        assert!(archive_game_from_lcu(&partial,42,"NJ100","me").is_err());
    }
    #[test]
    fn client_counter_requires_matching_identity_game_and_mayhem_queue() {
        let eog=json!({"gameId":42,"localPlayer":{"puuid":"me","wins":552,"losses":559}});
        let mut records=BTreeMap::from([("42".into(),json!({"gameId":42,"queueId":2400,"gameCreation":1}))]);
        let c=verified_client_summary(&eog,"me",&records).unwrap();
        assert_eq!(c["wins"],552); assert_eq!(c["losses"],559); assert_eq!(c["queueId"],2400);
        assert!(verified_client_summary(&eog,"other",&records).is_none());
        records.get_mut("42").unwrap()["queueId"]=json!(420);
        assert!(verified_client_summary(&eog,"me",&records).is_none());
        assert!(verified_client_summary(&eog,"me",&BTreeMap::new()).is_none());
    }
    #[test]
    fn parses_split_flight_without_executing_scripts() {
        let data = json!({"champions":[{"champion_id":57,"tier":2,"rank":20}],"data":[{"id":1068,"champion_ids":[],"smallIcon":"icon","performance":84.84}]});
        let stream = format!("13:{}\n", data);
        let (a, b) = stream.split_at(20);
        let html = format!(
            "<script>self.__next_f.push({})</script><script>self.__next_f.push({})</script>",
            json!([1, a]),
            json!([1, b])
        );
        let out = parse_mayhem(&html).unwrap();
        assert_eq!(out["champions"][0]["champion_id"], 57);
        assert!(out["augments"][0].get("winRate").is_none());
        assert!(parse_mayhem("<html>blocked</html>").is_err());
    }
    #[test]
    fn accounts_are_isolated_by_region_and_paths_are_validated() {
        assert_ne!(
            archive_path("NJ100", "abc").unwrap(),
            archive_path("HN1", "abc").unwrap()
        );
        assert!(archive_path("NJ100", "../account").is_err());
        assert!(archive_path("../../", "abc").is_err());
    }
}

#[tauri::command]
pub async fn get_hex_champion_pool() -> Result<Value, String> {
    use crate::lcu::util::http::lcu_get;
    let flow: Value = lcu_get("/lol-gameflow/v1/session").await?;
    let queue = flow.pointer("/gameData/queue/id").and_then(Value::as_i64).unwrap_or(0);
    let phase = flow["phase"].as_str().unwrap_or("");
    if phase != "ChampSelect" || ![2400,2410,2450].contains(&queue) {
        return Ok(json!({"phase":phase,"queue":queue,"current":0,"bench":[],"allies":[]}));
    }
    let session: Value = lcu_get("/lol-champ-select/v1/session").await?;
    let local = session["localPlayerCellId"].as_i64().unwrap_or(-1);
    let mut current = 0;
    let mut allies = Vec::new();
    if let Some(team) = session["myTeam"].as_array() {
        for player in team {
            let id = player["championId"].as_i64().unwrap_or(0);
            if player["cellId"].as_i64() == Some(local) { current = id; }
            else if id > 0 { allies.push(id); }
        }
    }
    let bench: Vec<i64> = session["benchChampions"].as_array().map(|a| a.iter().filter_map(|v|v["championId"].as_i64()).filter(|id|*id>0).collect()).unwrap_or_default();
    Ok(json!({"phase":phase,"queue":queue,"current":current,"bench":bench,"allies":allies}))
}


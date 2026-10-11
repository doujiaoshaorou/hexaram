//! Fixed, auditable primary classes: Riot Data Dragon tags[0], one class per champion.
use serde::Deserialize;
use std::sync::LazyLock;

#[derive(Deserialize)]
struct Champion { id: i32, role: String }
#[derive(Deserialize)]
struct Snapshot { champions: Vec<Champion> }
static ROLES: LazyLock<Snapshot> = LazyLock::new(|| serde_json::from_str(
    include_str!("../../../src/champion-primary-roles.json")
).expect("valid primary champion roles"));

pub fn primary_role(id: i32) -> Option<&'static str> {
    ROLES.champions.iter().find(|c| c.id == id).map(|c| c.role.as_str())
}

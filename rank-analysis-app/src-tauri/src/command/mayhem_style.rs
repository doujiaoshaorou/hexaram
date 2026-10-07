//! Observable Mayhem playstyle signals. Curated final-item IDs, no intent inference.
use crate::lcu::api::match_history::Game;
const TANK: &[i32] = &[3083,3084,3065,3068,3075,3143,3110,2502,2504,6665,6667,3109,3190];
const SUPPORT: &[i32] = &[3107,6617,6620,3504,6616,4005,3109,3190];
const FRONT: &[i32] = &[12,14,20,27,31,32,36,54,57,72,78,89,98,111,113,154,201,223,516,526];
const HEALER: &[i32] = &[16,37,40,43,117,267,350,427,147];
pub fn metric(g:&Game, key:&str)->f64 {
    let Some(p)=g.participants.first() else{return f64::NAN};
    let s=&p.stats;
    let items=[s.item0,s.item1,s.item2,s.item3,s.item4,s.item5];
    let tank_items=items.iter().filter(|x|TANK.contains(x)).count();
    let support_items=items.iter().filter(|x|SUPPORT.contains(x)).count();
    let tank=tank_items>=2 || (FRONT.contains(&p.champion_id)&&tank_items>=1);
    let support=support_items>=2 || (HEALER.contains(&p.champion_id)&&support_items>=1);
    if key=="hexTankBuild" {return if tank{1.0}else{0.0}}
    if key=="hexSupportBuild" {return if support{1.0}else{0.0}}
    let team:Vec<_>=g.game_detail.participants.iter().filter(|x|x.team_id==p.team_id).collect();
    if team.len()!=5 || g.game_duration<=0 {return f64::NAN}
    let mins=g.game_duration as f64/60.0;
    let sum_damage:i32=team.iter().map(|x|x.stats.total_damage_dealt_to_champions).sum();
    let sum_taken:i32=team.iter().map(|x|x.stats.total_damage_taken).sum();
    let sum_gold:i32=team.iter().map(|x|x.stats.gold_earned).sum();
    let sum_kills:i32=team.iter().map(|x|x.stats.kills).sum();
    let damage=s.total_damage_dealt_to_champions as f64/sum_damage.max(1) as f64;
    let taken=s.total_damage_taken as f64/sum_taken.max(1) as f64;
    let gold=s.gold_earned as f64/sum_gold.max(1) as f64;
    let kp=(s.kills+s.assists) as f64/sum_kills.max(1) as f64;
    let dpm=s.deaths as f64/mins;
    let hit=match key {
        "hexFrontDetached"=>tank && taken>=0.25 && kp<0.5 && dpm>0.8,
        "hexGoldConversion"=>damage>=0.25 && damage/gold.max(0.01)>=1.3 && kp>=0.6,
        "hexRescueSupport"|"hexIneffectiveSupport"=> {
            let (Some(heal),Some(shield),Some(cc))=(s.total_heals_on_teammates,s.total_damage_shielded_on_teammates,s.time_ccing_others) else{return f64::NAN};
            let help=(heal+shield) as f64/mins;
            if key=="hexRescueSupport" {support && help>=600.0 && kp>=0.65 && dpm<=0.65}
            else {support && help<200.0 && cc as f64/mins<1.0 && damage<0.12 && kp<0.55 && dpm>0.65}
        },
        _=>return f64::NAN,
    };
    if hit{1.0}else{0.0}
}
#[cfg(test)]
mod tests {
 use super::*;
 fn game()->Game { let mut g=Game::default();g.game_duration=1200;
 let mut p=crate::lcu::api::model::Participant::default();p.team_id=100;p.champion_id=16;p.stats.item0=6617;p.stats.item1=3107;
 p.stats.kills=2;p.stats.assists=1;p.stats.deaths=18;p.stats.total_damage_dealt_to_champions=500;p.stats.total_heals_on_teammates=Some(0);p.stats.total_damage_shielded_on_teammates=Some(0);p.stats.time_ccing_others=Some(0);
 g.participants=vec![p.clone()];let mut team=vec![p;5];for x in &mut team[1..]{x.stats.kills=10;x.stats.total_damage_dealt_to_champions=10000;}
 std::sync::Arc::make_mut(&mut g.game_detail).participants=team;g }
 #[test] fn support_is_not_automatically_bad(){let mut g=game();assert_eq!(metric(&g,"hexSupportBuild"),1.0);assert_eq!(metric(&g,"hexIneffectiveSupport"),1.0);g.participants[0].stats.total_heals_on_teammates=Some(20000);g.participants[0].stats.assists=35;g.participants[0].stats.deaths=5;assert_eq!(metric(&g,"hexIneffectiveSupport"),0.0);assert_eq!(metric(&g,"hexRescueSupport"),1.0);}
 #[test] fn missing_support_never_labels_low_contribution(){let mut g=game();g.participants[0].stats.total_heals_on_teammates=None;assert!(metric(&g,"hexIneffectiveSupport").is_nan());}
 #[test] fn tank_champion_needs_build_evidence(){let mut g=game();g.participants[0].champion_id=57;g.participants[0].stats.item0=3089;g.participants[0].stats.item1=6653;assert_eq!(metric(&g,"hexTankBuild"),0.0);g.participants[0].stats.item0=3084;assert_eq!(metric(&g,"hexTankBuild"),1.0);}
}

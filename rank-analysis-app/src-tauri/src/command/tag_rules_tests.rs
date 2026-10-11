#[test]
fn approved_defaults_roundtrip_and_validate() {
    let tags=get_default_tags();
    let decoded:Vec<TagConfig>=serde_json::from_str(&serde_json::to_string(&tags).unwrap()).unwrap();
    assert_eq!(decoded.len(),25);
    for t in decoded {validate_condition(&t.condition,0).unwrap();}
    assert!(!tags.iter().any(|t| ["hexaram_style_rescue","hexaram_style_ineffective"].contains(&t.id.as_str())));
}
#[test]
fn recent_window_and_modes_do_not_mix() {
    let t=default_tag("hexaram_high_win");
    let mixed=make_history((0..19).map(|_|make_game(1,true,2400)).chain((0..19).map(|_|make_game(1,true,2410))).collect());
    assert!(t.evaluate(&mixed,0,None).is_none());
    let h=make_history((0..50).map(|_|make_game(1,false,2400)).chain((0..150).map(|_|make_game(1,true,2400))).collect());
    assert!(t.evaluate(&h,2400,None).is_none());
    let mut custom=t.clone();custom.id="custom".into();custom.is_default=false;
    assert!(custom.evaluate(&mixed,0,None).is_none());
}
#[test]
fn allround_strict_win_boundary_diversity_and_unknown_roles() {
    let groups:Vec<Vec<i32>>=["Fighter","Marksman","Mage","Tank"].iter().map(|role|
        (1..1000).filter(|id|super::super::champion_roles::primary_role(*id)==Some(*role)).take(3).collect()
    ).collect();
    assert!(groups.iter().all(|g|g.len()==3));
    let games:Vec<_>=(0..100).map(|i|make_game(groups[i%4][(i/4)%3],i<52,2400)).collect();
    let mut h=make_history(games);let t=default_tag("hexaram_allround");
    assert!(t.evaluate(&h,2400,None).is_none());
    h.games.games[52].participants[0].stats.win=true;
    assert!(t.evaluate(&h,2400,None).is_some());
    let mut cloned=t.clone();cloned.id="my_allround".into();cloned.is_default=false;
    assert!(cloned.evaluate(&h,2400,None).is_some());
    h.games.games[0].participants[0].champion_id=999999;
    assert!(t.evaluate(&h,2400,None).is_none());
    h.games.games[0].participants[0].champion_id=groups[0][0];
    for g in h.games.games.iter_mut().take(60) {g.participants[0].champion_id=groups[0][0];}
    assert!(t.evaluate(&h,2400,None).is_none());
}
#[test]
fn qualified_ratio_excludes_missing_and_requires_twenty_valid_games() {
    let t=default_tag("hexaram_fire");
    let mut complete=make_game(1,true,2400);
    complete.participants[0].stats.total_damage_dealt_to_champions=40;
    let mut team=vec![complete.participants[0].clone();5];
    for p in &mut team[1..] {p.stats.total_damage_dealt_to_champions=15;}
    std::sync::Arc::make_mut(&mut complete.game_detail).participants=team;
    let mut h=make_history(vec![complete.clone();19]);h.games.games.extend(vec![make_game(1,true,2400);31]);
    assert!(t.evaluate(&h,2400,None).is_none());
    h.games.games[19]=complete;
    let tag=t.evaluate(&h,2400,None).unwrap();assert!(tag.tag_desc.contains("20 / 20"));
}
#[test]
fn aggregate_kda_is_ratio_of_totals_and_handles_zero_deaths() {
    let t=default_tag("hexaram_kda");
    let h=make_history((0..20).map(|i| if i<10 {make_game_kda(1,true,2400,10,1,0)}else{make_game_kda(1,true,2400,0,10,0)}).collect());
    assert!(t.evaluate(&h,2400,None).is_none());
    let h=make_history((0..20).map(|_|make_game_kda(1,true,2400,5,0,0)).collect());
    assert!(t.evaluate(&h,2400,None).is_some());
}
#[test]
fn migration_is_idempotent_and_retains_custom_removed_tag() {
    let mut old=default_tag("hexaram_style_front");old.id="hexaram_style_rescue".into();
    let mut custom=old.clone();custom.is_default=false;custom.id="custom_rescue".into();
    let mut tags=vec![old,custom];assert!(migrate_mayhem_defaults(&mut tags));
    assert_eq!(tags.len(),1);assert_eq!(tags[0].id,"custom_rescue");
    let mut tags=merge_missing_defaults(tags);assert!(!migrate_mayhem_defaults(&mut tags));
}
#[test]
fn validation_rejects_empty_groups_and_invalid_sample_limits() {
    let mut t=default_tag("hexaram_fire");
    if let TagCondition::PerMode{condition}=&mut t.condition {
        if let TagCondition::History{refresh:MatchRefresh::QualifiedRatio{min_games,..},..}=condition.as_mut(){*min_games=0;}
    }
    assert!(validate_condition(&t.condition,0).is_err());
    assert!(validate_condition(&TagCondition::And{conditions:vec![]},0).is_err());
}

#[test]
fn detached_rule_exposes_build_alternatives_and_minimum_hits() {
    let mut t=default_tag("hexaram_style_detached");t.enabled=true;
    let mut g=make_game(57,true,2400);
    g.game_duration=1200;
    let p=&mut g.participants[0];
    p.stats.deaths=18;p.stats.kills=1;p.stats.assists=0;
    p.stats.item0=3084;p.stats.total_damage_taken=40;
    let mut team=vec![p.clone();5];
    for p in &mut team[1..] {p.stats.kills=10;p.stats.total_damage_taken=15;}
    std::sync::Arc::make_mut(&mut g.game_detail).participants=team;
    let mut miss=g.clone();miss.participants[0].stats.item0=0;
    let mut h=make_history(vec![miss;20]);
    for i in 0..4 {h.games.games[i]=g.clone();}
    assert!(t.evaluate(&h,2400,None).is_none());
    h.games.games[4]=g.clone();
    assert!(t.evaluate(&h,2400,None).is_some());
    // A non-front champion must have two defensive items.
    for game in &mut h.games.games[..5] {game.participants[0].champion_id=22;}
    assert!(t.evaluate(&h,2400,None).is_none());
    for game in &mut h.games.games[..5] {game.participants[0].stats.item1=3065;}
    assert!(t.evaluate(&h,2400,None).is_some());
}

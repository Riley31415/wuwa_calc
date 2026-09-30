//! src/resonators/fusion/mornye.ts.
use crate::authoring::{Coord, ResDef};
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;
use crate::loadout::{EchoLoadout, Kind, Loadout, LoadoutDef, Mainstat, Substat, Tier};
use crate::rotation::{group_of, Form, W::A};
use std::rc::Rc;

fn act(name: &str) -> ADef {
    ADef { name: name.into(), element: FUSION, scaling: Scaling::Atk, ..Default::default() }
}
fn b(hit: f64, mv: f64, energy: f64, concerto: f64, offtune: f64) -> BulletDef {
    BulletDef { hit, mv, energy, concerto, offtune, ..Default::default() }
}

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    let sh = *sh;
    let heals = sh.heals;
    let mornye = lib.res(e, "MORNYE_RESONATOR");
    let (s1, s2) = (e.reserve("Mornye S1: The Silent Observer"), e.reserve("Mornye S2: Morning Star of Entropy"));
    let her_holds = move |e: &Eng, seq: GearId| e.member_with(mornye).map_or(false, |m| e.members[m].stacks.has(seq));

    let syntony = e.reserve("Mornye: Syntony Field");
    let high_syntony = e.reserve("Mornye: High Syntony Field");
    let recursion = e.buff(GDef { duration: 60.0 * 30.0, stats: vec![(s::AMP, 25.0, 0)], ..buff("Mornye: Outro") });
    let crit_protocol = e.reserve("Mornye: Critical Protocol");
    let observation = e.reserve("Mornye: Observation Marker");
    let interfered_marker = e.reserve("Mornye: Interfered Marker");
    let syntony_heals = e.coordinated("Mornye: Syntony Field (heals)", 25.0, mornye, Err(Rc::new(|e: &mut Eng| e.heal())), Coord { every: 3.0, ..Default::default() });

    // --- Baseline Mode
    let ba1 = e.action(ADef {
        anim: 25.0,
        cast: Cast::Basic,
        typ: T_BASIC,
        bullets: vec![b(10.0, 16.71, 0.27, 0.84, 840.0), b(13.0, 22.27, 0.35, 1.12, 1120.0), b(25.0, 16.71, 0.27, 0.84, 840.0)],
        cast_forte: [20.0, 0.0, 0.0, 0.0, 0.0],
        node: Node::Normal,
        ..act("Basic - Ground State Calibration 1")
    });
    let c34 = |hit: f64| BulletDef { commit: 34.0, ..b(hit, 17.9, 0.29, 0.9, 900.0) };
    let ba2 = e.action(ADef {
        anim: 49.0,
        cast: Cast::Basic,
        typ: T_BASIC,
        bullets: vec![b(11.0, 23.86, 0.38, 1.2, 1200.0), b(26.0, 23.86, 0.38, 1.2, 1200.0), c34(40.0), c34(49.0), c34(58.0), c34(67.0)],
        cast_forte: [43.0, 0.0, 0.0, 0.0, 0.0],
        node: Node::Normal,
        ..act("Basic - Ground State Calibration 2")
    });
    let c40 = |hit: f64| BulletDef { commit: 40.0, ..b(hit, 10.34, 0.17, 0.52, 520.0) };
    let ba3 = e.action(ADef {
        anim: 49.0,
        cast: Cast::Basic,
        typ: T_BASIC,
        bullets: vec![b(24.0, 41.36, 0.65, 2.08, 2080.0), b(40.0, 10.34, 0.17, 0.52, 520.0), c40(49.0), c40(58.0), c40(67.0), c40(76.0), c40(85.0)],
        cast_forte: [37.0, 0.0, 0.0, 0.0, 0.0],
        node: Node::Normal,
        ..act("Basic - Ground State Calibration 3")
    });
    let _ba4 = e.action(ADef { anim: 116.0, cast: Cast::Basic, typ: T_BASIC, bullets: vec![b(51.0, 135.2, 2.13, 6.8, 6800.0)], cast_forte: [100.0, 0.0, 0.0, 0.0, 0.0], node: Node::Normal, ..act("Basic - Ground State Calibration 4") });
    let _ha = e.action(ADef {
        anim: 95.0,
        cast: Cast::Heavy,
        typ: T_HEAVY,
        bullets: vec![b(19.0, 11.1, 0.24, 0.75, 744.0), b(40.0, 11.1, 0.24, 0.75, 744.0), b(70.0, 14.8, 0.31, 1.0, 992.0)],
        cast_forte: [20.0, 0.0, 0.0, 0.0, 0.0],
        node: Node::Normal,
        ..act("Heavy - Ground State Calibration")
    });
    let _ma = e.action(ADef { anim: 42.0, cast: Cast::Basic, typ: T_BASIC, bullets: vec![b(36.0, 98.61, 1.55, 4.96, 4960.0)], node: Node::Normal, ..act("Mid-air - Ground State Calibration Plunge") });
    let _dc = e.action(ADef { anim: 26.0, cast: Cast::DodgeCounter, typ: T_BASIC, bullets: vec![b(9.0, 162.23, 2.55, 18.16, 8160.0)], cast_forte: [20.0, 0.0, 0.0, 0.0, 0.0], node: Node::Normal, ..act("Dodge Counter - Ground State Calibration") });

    // --- Wide Field Observation Mode
    let wb = |hit: f64| BulletDef { commit: 14.0, forte: [0.0, 2.5, 0.0, 0.0, 0.0], ..b(hit, 13.92, 0.22, 0.35, 700.0) };
    let wba1 = e.action(ADef { anim: 21.0, cast: Cast::Basic, typ: T_BASIC, bullets: vec![wb(26.0), wb(34.0), wb(42.0), wb(49.0)], node: Node::Normal, ..act("Basic - Wide Field Observation 1") });
    let w2 = |hit: f64, commit: f64| BulletDef { commit, forte: [0.0, 3.0, 0.0, 0.0, 0.0], ..b(hit, 25.85, 0.41, 0.64, 1300.0) };
    let wba2 = e.action(ADef { anim: 39.0, cast: Cast::Basic, typ: T_BASIC, bullets: vec![w2(17.0, -1.0), w2(33.0, 17.0), w2(49.0, 17.0), w2(65.0, 17.0)], node: Node::Normal, ..act("Basic - Wide Field Observation 2") });
    let w3 = |hit: f64, mv: f64, en: f64, co: f64, off: f64, f2: f64| BulletDef { commit: 13.0, forte: [0.0, f2, 0.0, 0.0, 0.0], ..b(hit, mv, en, co, off) };
    let wba3 = e.action(ADef {
        anim: 41.0,
        cast: Cast::Basic,
        typ: T_BASIC,
        bullets: vec![
            w3(31.0, 9.31, 0.15, 0.23, 468.0, 9.0),
            w3(34.0, 9.31, 0.15, 0.23, 468.0, 4.5),
            w3(41.0, 9.31, 0.15, 0.23, 468.0, 4.5),
            w3(62.0, 33.09, 0.52, 0.82, 1664.0, 0.0),
            w3(67.0, 9.31, 0.15, 0.23, 468.0, 0.0),
            w3(100.0, 33.09, 0.52, 0.82, 1664.0, 0.0),
        ],
        node: Node::Normal,
        ..act("Basic - Wide Field Observation 3")
    });
    let wd = |hit: f64, commit: f64, f2: f64| BulletDef { commit, forte: [0.0, f2, 0.0, 0.0, 0.0], ..b(hit, 25.85, 0.41, 3.14, 1300.0) };
    let _wdc = e.action(ADef {
        anim: 41.0,
        cast: Cast::DodgeCounter,
        typ: T_BASIC,
        bullets: vec![wd(17.0, -1.0, 0.0), wd(33.0, 17.0, 0.0), wd(49.0, 17.0, 0.0), wd(65.0, 17.0, 12.0)],
        node: Node::Normal,
        ..act("Dodge Counter - Wide Field Observation")
    });

    // --- Forte Circuit: the field comes up with the airborne state
    let syntony_hit = e.action(ADef {
        typ: T_LIBERATION,
        mv: 198.85,
        update_buffs: h(move |e| {
            if e.stacks_of_team(high_syntony) > 0.0 {
                e.apply_team(high_syntony, 1.0);
            } else {
                e.apply_team(syntony, 1.0);
            }
            let n = e.gears[syntony_heals as usize].max_stacks;
            e.apply_team(syntony_heals, n);
        }),
        node: Node::Forte,
        ..act("Forte - Syntony Field")
    });
    let field: Option<Hook> = h(move |e| e.queue(syntony_hit));
    let geo_shift = e.action(ADef {
        anim: 92.0,
        cast: Cast::Heavy,
        typ: T_HEAVY,
        bullets: vec![b(22.0, 44.14, 0.93, 2.96, 2960.0), b(80.0, 99.02, 2.08, 6.65, 6640.0)],
        cast_forte: [-100.0, 0.0, 0.0, 0.0, 0.0],
        update_buffs: field.clone(),
        node: Node::Forte,
        ..act("Forte Heavy - Geopotential Shift")
    });
    let inversion = e.action(ADef {
        anim: 76.0,
        motion_stop: 76.0,
        cast: Cast::Heavy,
        typ: T_HEAVY,
        bullets: vec![b(76.0, 258.46, 3.25, 11.96, 10400.0)],
        cast_forte: [0.0, -100.0, 0.0, 0.0, 0.0],
        update_debuffs: h(move |e| {
            e.apply_enemy(observation, 1.0);
        }),
        node: Node::Forte,
        ..act("Forte Heavy - Inversion")
    });

    // --- Resolution
    let skill_heal: Option<Hook> = h(move |e| {
        e.apply_current(heals, 1.0);
    });
    let skill = e.action(ADef { anim: 21.0, cooldown: CdSpec::Frames(60.0 * 5.0), cast: Cast::Skill, update_debuffs: skill_heal.clone(), node: Node::Skill, ..act("Skill - Expectation Error") });
    let _optimal = e.action(ADef {
        anim: 110.0,
        cast: Cast::Skill,
        typ: T_SKILL,
        bullets: vec![BulletDef { forte: [100.0, 0.0, 0.0, 0.0, 0.0], ..b(44.0, 179.73, 3.96, 9.04, 9040.0) }],
        update_buffs: h(move |e| e.reduce_cooldown(skill, 60.0 * 2.0)),
        node: Node::Skill,
        ..act("Skill - Optimal Solution")
    });
    let da = |hit: f64| BulletDef { forte: [0.0, 15.0, 0.0, 0.0, 0.0], ..b(hit, 39.77, 4.63, 0.0, 2000.0) };
    let distributed = e.action(ADef {
        anim: 60.0,
        cooldown: CdSpec::Frames(60.0 * 16.0),
        cast: Cast::Skill,
        typ: T_SKILL,
        bullets: vec![BulletDef { update_debuffs: skill_heal.clone(), ..da(46.0) }, da(46.0), da(60.0), da(60.0)],
        cast_concerto: 10.0,
        node: Node::Skill,
        ..act("Skill - Distributed Array")
    });
    let lib_act = e.action(ADef {
        anim: 300.0,
        timestop: 300.0,
        motion_stop: 300.0,
        cooldown: CdSpec::Frames(60.0 * 25.0),
        cast: Cast::Liberation,
        typ: T_LIBERATION,
        scaling: Scaling::Def,
        bullets: vec![b(272.0, 522.33, 0.0, 0.0, 72000.0)],
        cast_concerto: 20.0,
        reset_energy: true,
        update_buffs: h(move |e| {
            e.apply_current(crit_protocol, 1.0);
            if e.stacks_of_team(syntony) > 0.0 || e.stacks_of_team(high_syntony) > 0.0 {
                e.revoke_team(syntony);
                e.apply_team(high_syntony, 1.0);
                let n = e.gears[syntony_heals as usize].max_stacks;
                e.apply_team(syntony_heals, n);
            }
        }),
        node: Node::Liberation,
        ..act("Liberation - Critical Protocol")
    });
    let intro = e.action(ADef {
        anim: 105.0,
        prio: 80.0,
        motion_stop: 76.0,
        cast: Cast::Intro,
        typ: T_INTRO,
        bullets: vec![b(38.0, 202.79, 10.0, 0.0, 13600.0)],
        cast_concerto: 10.0,
        update_buffs: field.clone(),
        node: Node::Intro,
        ..act("Intro - Convergence")
    });
    let outro = e.action(ADef {
        cast: Cast::Outro,
        cast_concerto: -100.0,
        update_buffs: h(move |e| {
            e.apply_team(recursion, 1.0);
        }),
        ..act("Outro - Recursion")
    });
    let particle_jet = e.action(ADef { typ: T_RUPTURE, bullets: vec![b(0.0, 298.22, 0.0, 0.0, 0.0)], scaling: Scaling::Tune, node: Node::Forte, ..act("Tune Rupture Response - Particle Jet") });

    // --- buffs
    for (id, name, high) in [(syntony, "Mornye: Syntony Field", false), (high_syntony, "Mornye: High Syntony Field", true)] {
        e.define_buff(
            id,
            GDef {
                duration: 60.0 * 25.0,
                stats: vec![(s::OFFTUNE_BUILDUP, 50.0, 0)],
                apply_stats: h(move |e| {
                    if high {
                        e.add_stat(s::BONUS_DEF, 20.0, 0);
                    }
                    if her_holds(e, s2) {
                        e.as_source(s2, |e| e.add_stat(s::OFFTUNE_BUILDUP, 20.0, 0));
                    }
                }),
                ..buff(name)
            },
        );
    }
    e.define_buff(
        crit_protocol,
        GDef {
            convert_stats: h(move |e| {
                if !e.running_action(lib_act) {
                    return;
                }
                let converted = e.get_stat(s::ER) - 100.0;
                e.add_stat(s::CRIT_RATE, 80f64.min(0.5 * converted), 0);
                e.add_stat(s::CRIT_DMG, 160f64.min(converted), 0);
            }),
            after_action: h(move |e| {
                if e.running_action(lib_act) {
                    e.revoke_current(crit_protocol);
                }
            }),
            ..buff("Mornye: Critical Protocol")
        },
    );
    e.define_debuff(
        observation,
        GDef {
            duration: 60.0 * 30.0,
            hit_global: h(move |e| {
                if !e.running_action(sh.tune_break) {
                    return;
                }
                e.revoke_enemy(interfered_marker);
                e.apply_enemy(interfered_marker, 1.0);
            }),
            ..buff("Mornye: Observation Marker")
        },
    );
    e.define_debuff(
        interfered_marker,
        GDef {
            duration_fn: dur(move |e: &Eng, _n: f64| if her_holds(e, s1) { 60.0 * 20.0 } else { 60.0 * 8.0 }),
            apply_stats: h(move |e| {
                let interfered = e.stacks_of_enemy(sh.rupture_interfered) > 0.0 || e.stacks_of_enemy(sh.strain_interfered) > 0.0;
                if interfered {
                    e.add_stat(s::DMG_BONUS, 40.0, 0);
                } else if her_holds(e, s1) {
                    e.as_source(s1, |e| e.add_stat(s::DMG_BONUS, 40.0, 0));
                }
                if her_holds(e, s2) {
                    e.as_source(s2, |e| e.add_stat(s::CRIT_DMG, 32.0, 0));
                }
            }),
            ..buff("Mornye: Interfered Marker")
        },
    );

    // --- sequences
    e.define(
        s1,
        GDef {
            name: "Mornye S1: The Silent Observer".into(),
            update_debuffs: h(move |e| {
                if !e.running_action(inversion) {
                    return;
                }
                e.revoke_enemy(interfered_marker);
                e.apply_enemy(interfered_marker, 1.0);
            }),
            ..Default::default()
        },
    );
    e.define(s2, GDef { name: "Mornye S2: Morning Star of Entropy".into(), ..Default::default() });
    let s3 = e.sequence(GDef {
        name: "Mornye S3: Blueprint of Recursion".into(),
        apply_stats: h(move |e| {
            if e.running_action(distributed) {
                e.add_stat(s::ADD_CONCERTO, 25.0, 0);
                e.add_stat(s::ADD_FORTE2, 100.0, 0);
            }
        }),
        ..Default::default()
    });
    let s4 = e.sequence(GDef { name: "Mornye S4: Latent Variables of the Cosmos".into(), ..Default::default() });
    let s5 = e.sequence(GDef {
        name: "Mornye S5: Time Dilation Effect".into(),
        apply_stats: h(move |e| {
            if e.running_action(lib_act) {
                e.add_stat(s::MUL_MV, 40.0, 0);
            }
            if e.running_action(particle_jet) {
                e.add_stat(s::MUL_MV, 160.0, 0);
            }
        }),
        ..Default::default()
    });
    let s6 = e.sequence(GDef {
        name: "Mornye S6: To the Far Shores of the Stars".into(),
        apply_stats: h(move |e| {
            if e.running_action(lib_act) {
                e.add_stat(s::DMG_BONUS, 400.0, 0);
            }
        }),
        ..Default::default()
    });
    e.set_kind(s1, Kind::Sequence);
    e.set_kind(s2, Kind::Sequence);

    // --- kit
    let inh1 = e.inherent(GDef {
        name: "Inherent: Blueprint".into(),
        stats: vec![(s::ER, 10.0, 0)],
        update_buffs: h(move |e| {
            if e.running_action(intro) || e.running_action(wba3) {
                e.add_to_cast([0.0, 20.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
            }
        }),
        ..Default::default()
    });
    let inh2 = e.inherent(GDef { name: "Inherent: Boundedness".into(), ..Default::default() });
    let talents = e.talent(GDef { name: "Mornye: Talents".into(), stats: vec![(s::BONUS_DEF, 15.2, 0), (s::HEALING_BONUS, 12.0, 0)], ..Default::default() });
    let strain = sh.strain_payout(e);
    e.resonator(
        mornye,
        ResDef {
            name: "Mornye",
            talent: talents,
            inherent1: inh1,
            inherent2: inh2,
            element: FUSION,
            weapon: Weapon::Broadblade,
            color: "#d2d4ff",
            intro: intro,
            max_energy: 175.0,
            max_forte: [100.0, 100.0, 0.0, 0.0, 0.0],
            stats: vec![(s::BASE_HP, 15375.0, 0), (s::BASE_ATK, 287.5, 0), (s::BASE_DEF, 1356.6642, 0), (s::TBB, 10.0, 0)],
            g: GDef {
                hit_global: h(move |e| sh.tune_rupture_response(e, particle_jet)),
                combat_start: h(move |e| {
                    e.max_stack_increase(sh.strain_interfered, 1.0);
                    e.apply_current(strain, 1.0);
                }),
                ..Default::default()
            },
            ..Default::default()
        },
    );

    // --- rotation
    let mk = e.mk.clone();
    let ba123 = group_of("Basic - Ground State Calibration 123", vec![A(ba1), A(ba2), A(ba3)], 0);
    let wba123 = group_of("Basic - Wide Field Observation 123", vec![A(wba1), A(wba2), A(wba3)], 0);
    let rot = vec![
        A(mk.start[1]), A(mk.start[2]), e.form(&A(skill), Form::InstaSwap),
        A(mk.nointro), e.form(&ba123, Form::InstaCancel), A(lib_act), A(geo_shift),
        e.form(&wba123, Form::Cancel), A(distributed), A(inversion),
        e.form(&A(mk.echo), Form::InstaSwap), A(outro),
        e.form(&A(mk.intro), Form::EasyCancel), A(lib_act),
        e.form(&wba123, Form::Cancel), A(distributed), A(inversion),
        e.form(&A(mk.echo), Form::InstaSwap), A(outro),
    ];
    let rotation = e.rotation(rot);

    let discord = lib.w("DISCORD");
    let spacetrek = lib.g("SPACETREK_EXPLORER");
    let starry = lib.g("STARRY_RADIANCE_5PC");
    let echoes = vec![
        EchoLoadout { mainslot: lib.g("REACTOR_HUSK"), sonata: starry, sets: vec![starry] },
        EchoLoadout { mainslot: spacetrek, sonata: starry, sets: vec![starry] },
    ];
    let mainstats = vec![e.mainstats(&[Mainstat::DEF4, Mainstat::ER3, Mainstat::ER3, Mainstat::DEF1, Mainstat::DEF1])];
    let substat = e.substats([Substat::Er, Substat::CritDmg, Substat::CritRate, Substat::Liberation, Substat::DefPct, Substat::Basic]);
    let high_substat = e.high_subs([Substat::CritRate, Substat::CritDmg, Substat::Er, Substat::Liberation, Substat::DefPct, Substat::Basic]);
    lib.loadouts.push(Loadout::new(LoadoutDef {
        export: "MORNYE",
        resonator: mornye,
        weapons: vec![lib.w("STARFIELD_CALIBRATOR"), discord],
        echo_loadouts: echoes,
        mainstats,
        substat,
        high_substat,
        rotation: vec![(0, rotation)],
        sequences: vec![s1, s2, s3, s4, s5, s6],
        ..Default::default()
    }));
    let _ = Tier::Limited;
}

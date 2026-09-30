//! src/resonators/spectro/lucy.ts.
use crate::authoring::ResDef;
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;
use crate::loadout::{EchoLoadout, Kind, Loadout, LoadoutDef, Mainstat, Substat};
use crate::rotation::{group_of, Form, W::A};
use std::rc::Rc;

fn act(name: &str) -> ADef {
    ADef { name: name.into(), element: SPECTRO, scaling: Scaling::Atk, ..Default::default() }
}
fn b(hit: f64, mv: f64, energy: f64, concerto: f64, offtune: f64, f1: f64) -> BulletDef {
    BulletDef { hit, mv, energy, concerto, offtune, forte: [f1, 0.0, 0.0, 0.0, 0.0], ..Default::default() }
}
fn r(hit: f64, mv: f64, energy: f64, concerto: f64, offtune: f64, f2: f64) -> BulletDef {
    BulletDef { hit, mv, energy, concerto, offtune, forte: [0.0, f2, 0.0, 0.0, 0.0], ..Default::default() }
}

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    let sh = *sh;
    let lucy = lib.res(e, "LUCY_RESONATOR");
    let hack: Option<Hook> = h(move |e| sh.apply_hack(e));
    let algo = e.reserve("Lucy: Algorithm Compaction");
    let sql = e.reserve("Lucy: SQL");
    let outdated = e.reserve("Lucy: Outdated Hallucination");
    let handshake = e.reserve("Lucy: Digital Handshake");
    let cyberware = e.debuff(GDef { duration: 60.0 * 30.0, stats: vec![(s::DAMAGE_TAKEN, 5.0, 0)], ..buff("Spoofing Program: Cyberware Malfunction") });
    let breach = e.debuff(GDef { duration: 60.0 * 30.0, apply_stats: h(|e| e.add_stat(s::DEF_REDUCE, 5.0, 0)), ..buff("Spoofing Program: Breach Protocol") });
    let (s2, s_key) = (e.reserve("Lucy S2: The Blackwall, the Past, the Escape"), ());
    let _ = s_key;

    // --- Locked Thread
    let basic = |name: &str, anim: f64, bullets: Vec<BulletDef>| ADef { anim, cast: Cast::Basic, typ: T_BASIC, bullets: bullets, node: Node::Normal, ..act(name) };
    let _ba1 = e.action(basic("Basic - Locked Thread 1", 31.0, vec![b(14.0, 24.302, 0.38, 1.2461, 1504.0, 3.2), b(19.0, 97.188, 1.52, 4.9239, 6016.0, 12.8)]));
    let ba2 = e.action(basic("Basic - Locked Thread 2", 37.0, vec![b(12.0, 20.66, 0.32, 1.05, 1279.0, 4.08), b(23.0, 20.05, 0.32, 1.01, 1241.0, 3.96), b(26.0, 20.05, 0.32, 1.01, 1241.0, 3.96)]));
    let ba3 = e.action(basic("Basic - Locked Thread 3", 69.0, vec![b(10.0, 36.06, 0.56, 1.82, 2232.0, 5.4), b(31.0, 36.06, 0.56, 1.82, 2232.0, 5.4), b(53.0, 48.08, 0.75, 2.42, 2976.0, 7.2)]));
    let ba4 = e.action(basic(
        "Basic - Locked Thread 4",
        75.0,
        vec![b(10.0, 31.02, 0.48, 1.56, 1920.0, 5.2), b(12.0, 15.51, 0.24, 0.78, 960.0, 2.6), b(18.0, 15.51, 0.24, 0.78, 960.0, 2.6), b(24.0, 15.51, 0.24, 0.78, 960.0, 2.6), b(40.0, 38.77, 0.6, 1.95, 2400.0, 6.5), b(63.0, 38.77, 0.6, 1.95, 2400.0, 6.5)],
    ));
    let _ma = e.action(basic("Mid-air - Locked Thread Plunge", 97.0, vec![b(74.0, 58.16, 1.13, 2.93, 3600.0, 4.0), b(79.0, 58.16, 1.13, 2.93, 3600.0, 4.0)]));
    let _dc = e.action(ADef {
        anim: 70.0,
        cast: Cast::DodgeCounter,
        typ: T_BASIC,
        bullets: vec![b(10.0, 59.32, 1.15, 5.992, 3672.0, 3.6), b(31.0, 79.09, 1.53, 7.976, 4896.0, 4.8), b(54.0, 59.32, 1.15, 5.992, 3672.0, 3.6)],
        node: Node::Normal,
        ..act("Dodge Counter - Locked Thread")
    });
    let heavy = |name: &str, anim: f64, bullets: Vec<BulletDef>| ADef { anim, cast: Cast::Heavy, typ: T_HEAVY, bullets: bullets, node: Node::Normal, ..act(name) };
    let ha1 = e.action(heavy("Heavy - Locked Thread 1", 48.0, vec![b(16.0, 22.1, 0.43, 1.12, 1368.0, 3.0), b(30.0, 22.1, 0.43, 1.12, 1368.0, 3.0), b(43.0, 29.47, 0.57, 1.49, 1824.0, 4.0)]));
    let ha2 = e.action(heavy(
        "Heavy - Locked Thread 2",
        109.0,
        vec![
            b(8.0, 56.86, 1.1, 2.86, 3520.0, 4.0),
            b(17.0, 56.86, 1.1, 2.86, 3520.0, 4.0),
            b(25.0, 18.96, 0.37, 0.96, 1174.0, 1.34),
            b(31.0, 18.96, 0.37, 0.96, 1174.0, 1.34),
            b(37.0, 18.96, 0.37, 0.96, 1174.0, 1.34),
            b(56.0, 56.86, 1.1, 2.86, 3520.0, 4.0),
            b(73.0, 56.86, 1.1, 2.86, 3520.0, 4.0),
        ],
    ));

    // --- Algorithm Compaction
    let shred = |name: &str, anim: f64, bullets: Vec<BulletDef>| ADef { anim, cast: Cast::Basic, typ: T_HEAVY, bullets: bullets, node: Node::Normal, ..act(name) };
    let _eba1 = e.action(shred("Basic - Thread Shredding 1", 34.0, [14.0, 19.0, 21.0, 23.0].iter().map(|&t| r(t, 19.49, 0.28, 1.12, 1120.0, 4.05)).collect()));
    let eba2 = e.action(shred("Basic - Thread Shredding 2", 55.0, [24.0, 28.0, 32.0, 37.0, 41.0].iter().map(|&t| r(t, 22.27, 0.32, 1.28, 1280.0, 5.91)).collect()));
    let eba3 = e.action(shred("Basic - Thread Shredding 3", 67.0, [4.0, 6.0, 33.0, 45.0, 49.0].iter().map(|&t| r(t, 28.12, 0.41, 1.62, 1616.0, 7.46)).collect()));
    let eba4 = e.action(shred("Basic - Thread Shredding 4", 57.0, [3.0, 6.0, 9.0, 13.0, 26.0].iter().map(|&t| r(t, 25.06, 0.36, 1.44, 1440.0, 6.65)).collect()));
    let _ema = e.action(basic("Mid-air - Algorithm Compaction Plunge", 67.0, vec![r(34.0, 62.63, 1.13, 2.93, 3600.0, 0.0), r(43.0, 62.63, 1.13, 2.93, 3600.0, 33.22)]));
    let _edc = e.action(ADef { cast: Cast::DodgeCounter, typ: T_BASIC, mv: 194.85, energy: 3.5, concerto: 21.2, offtune: 11200.0, forte: [0.0, 29.55, 0.0, 0.0, 0.0], node: Node::Normal, ..act("Dodge Counter - Algorithm Compaction") });
    let _eha = e.action(heavy("Heavy - Single Threading", 67.0, [8.0, 13.0, 19.0, 24.0, 38.0].iter().map(|&t| r(t, 23.39, 0.34, 1.35, 1344.0, 6.2)).collect()));
    let dual = e.action(ADef {
        cast_concerto: 8.0,
        cast_forte: [0.0, -100.0, 0.0, 0.0, 0.0],
        ..heavy("Heavy - Dual Threading", 67.0, [10.0, 15.0, 21.0, 26.0, 48.0].iter().map(|&t| r(t, 33.41, 0.6, 0.0, 1344.0, 0.0)).collect())
    });
    let multi = e.action(ADef { cast_concerto: 8.0, update_debuffs: hack.clone(), ..heavy("Heavy - Multi-threading", 61.0, [38.0, 43.0, 49.0, 55.0].iter().map(|&t| r(t, 59.65, 0.75, 0.0, 2520.0, 0.0)).collect()) });

    // --- Protocol Breach
    let skill2 = e.action(ADef { cast: Cast::Skill, typ: T_SKILL, mv: 70.17, energy: 3.5, concerto: 5.6, offtune: 3528.0, forte: [8.4, 0.0, 0.0, 0.0, 0.0], node: Node::Skill, ..act("Skill - Payload (Follow-Up)") });
    let skill1 = e.action(ADef {
        anim: 55.0,
        bullets: vec![b(46.0, 30.08, 1.5, 2.4, 1512.0, 3.6)],
        cooldown: CdSpec::Frames(60.0 * 15.0),
        cast: Cast::Skill,
        typ: T_SKILL,
        update_debuffs: h(move |e| {
            sh.apply_hack(e);
            e.queue(skill2);
        }),
        node: Node::Skill,
        ..act("Skill - Payload (Charge)")
    });
    let skill3 = e.action(ADef {
        anim: 156.0,
        cast: Cast::Skill,
        typ: T_SKILL,
        bullets: vec![
            b(2.0, 30.86, 0.5, 0.0, 1552.0, 0.442),
            b(12.0, 30.86, 0.5, 0.0, 1552.0, 0.442),
            b(114.0, 61.72, 1.0, 0.0, 3104.0, 0.884),
            b(121.0, 61.72, 1.0, 0.0, 3104.0, 0.884),
            b(128.0, 61.72, 1.0, 0.0, 3104.0, 0.884),
            b(128.0, 61.72, 1.0, 0.0, 3104.0, 0.884),
        ],
        cast_concerto: 8.0,
        cast_forte: [7.58, 0.0, 0.0, 0.0, 0.0],
        update_buffs: h(move |e| {
            e.apply_current(handshake, 1.0);
        }),
        node: Node::Skill,
        ..act("Skill - Pulse Interference")
    });
    let deadlock = e.action(ADef {
        anim: 72.0,
        timestop: 60.0,
        motion_stop: 36.0,
        cooldown: CdSpec::Frames(60.0 * 14.0),
        cast: Cast::Skill,
        typ: T_HEAVY,
        bullets: vec![b(35.0, 51.7, 2.0, 0.0, 0.0, 0.0), b(64.0, 206.77, 8.0, 0.0, 0.0, 0.0)],
        cast_concerto: 8.0,
        cast_forte: [-100.0, 0.0, 0.0, 0.0, 0.0],
        update_debuffs: hack.clone(),
        update_buffs: h(move |e| {
            if !e.is_held(algo) {
                e.apply_current(algo, 1.0);
                e.apply_current(sql, 1.0);
            }
        }),
        node: Node::Skill,
        ..act("Skill - Deadlock")
    });

    // --- Netrunner
    let lib_cd = e.new_cooldown(60.0 * 25.0);
    let ping = e.action(ADef { typ: T_HEAVY, bullets: vec![b(0.0, 79.53, 0.0, 0.0, 0.0, 0.0)], node: Node::Liberation, ..act("Liberation - Spoofing Program: Ping") });
    let synapse = e.action(ADef { typ: T_HEAVY, bullets: vec![b(0.0, 79.53, 0.0, 0.0, 0.0, 0.0)], node: Node::Liberation, ..act("Liberation - Spoofing Program: Synapse Burnout") });
    let cripple = e.action(ADef { typ: T_HACK, scaling: Scaling::Tune, mv: 911.83, node: Node::Liberation, ..act("Liberation - Spoofing Program: Cripple Movement") });
    let override_buffs: Option<Hook> = h(move |e| e.reset_cooldown(deadlock));
    let override_debuffs: Option<Hook> = h(move |e| {
        e.apply_enemy(cyberware, 1.0);
        e.apply_enemy(breach, 1.0);
        e.queue(ping);
        e.queue(synapse);
        e.queue(cripple);
    });
    let lib_def = |name: &str, ts: f64, mv: f64, off: f64| ADef {
        anim: 262.0,
        timestop: ts,
        motion_stop: ts,
        cast: Cast::Liberation,
        node: Node::Liberation,
        typ: T_HEAVY,
        bullets: vec![b(251.0, mv, 0.0, 0.0, off, 0.0)],
        cast_concerto: 20.0,
        reset_energy: true,
        reset_forte: [true, false, false, false, false],
        cooldown: CdSpec::Shared(lib_cd),
        update_buffs: override_buffs.clone(),
        update_debuffs: override_debuffs.clone(),
        ..act(name)
    };
    let lib_act = e.action(lib_def("Liberation - Netrunner: Override", 202.0, 894.65, 43200.0));
    let elib = e.action(lib_def("Liberation - Old Net Deep Dive: Override", 262.0, 1789.29, 86400.0));
    let intro = e.action(ADef {
        anim: 57.0,
        prio: 45.0,
        motion_stop: 28.0,
        cast: Cast::Intro,
        typ: T_INTRO,
        bullets: vec![b(34.0, 69.14, 5.0, 0.0, 4280.0, 0.0), b(39.0, 69.14, 5.0, 0.0, 4280.0, 0.0)],
        cast_concerto: 10.0,
        update_buffs: h(move |e| {
            e.apply_current(outdated, 1.0);
        }),
        node: Node::Intro,
        ..act("Intro - Outdated Hallucination")
    });
    let cm_handoff = e.buff(GDef { duration: 60.0 * 14.0, lost_on_swap: true, stats: vec![(s::AMP, 25.0, T_BASIC)], ..buff("Lucy: Outro") });
    let cm_amp = e.buff(GDef { lost_on_swap: true, stats: vec![(s::AMP, 20.0, 0)], ..buff("Lucy: Countermeasure Program") });
    let cm_marker = e.reserve("Lucy: Countermeasure Program (team)");
    e.define_buff(
        cm_marker,
        GDef {
            duration: 60.0 * 25.0,
            update_debuffs: h(move |e| {
                if e.applied(sh.hack_shifting) > 0.0 && !e.is_held(lucy) {
                    e.apply_current(cm_amp, 1.0);
                    e.revoke_team(cm_marker);
                }
            }),
            ..buff("Lucy: Countermeasure Program (team)")
        },
    );
    let outro = e.action(ADef {
        cast: Cast::Outro,
        cast_concerto: -100.0,
        update_buffs: h(move |e| {
            e.queue_outro(cm_handoff);
            e.apply_team(cm_marker, 1.0);
        }),
        ..act("Outro - Countermeasure Program")
    });
    let db = |mv: f64| b(0.0, mv, 0.0, 0.0, 0.0, 0.0);
    let data_crash = e.action(ADef { typ: T_HACK, scaling: Scaling::Tune, bullets: vec![db(1094.19), db(68.39), db(68.39), db(68.39), db(68.39)], node: Node::Forte, ..act("Tune Hack Response - Data Crash") });

    // --- buffs
    e.define_buff(
        algo,
        GDef {
            duration: 60.0 * 8.0,
            stats: vec![(s::DMG_BONUS, 65.0, SPECTRO)],
            after_action: h(move |e| {
                if e.running_action(cripple) {
                    e.revoke_current(algo);
                }
            }),
            ..buff("Lucy: Algorithm Compaction")
        },
    );
    e.define_buff(
        sql,
        GDef {
            apply_stats: h(move |e| {
                if !e.running_action(multi) {
                    return;
                }
                let m = if e.is_held(s2) { 560.0 } else { 270.0 };
                e.add_stat(s::MUL_MV, m, 0);
                e.add_stat(s::ADD_ENERGY, 7.0, 0);
                e.add_stat(s::ADD_OFFTUNE, 57600.0, 0);
            }),
            after_action: h(move |e| {
                if e.running_action(multi) {
                    e.revoke_current(sql);
                }
            }),
            ..buff("Lucy: SQL")
        },
    );
    e.define_buff(
        outdated,
        GDef {
            update_buffs: h(move |e| {
                if !e.running_action(skill3) {
                    return;
                }
                e.add_to_cast([0.0, 0.0, 20.60, 0.0, 0.0, 0.0, 0.0]);
                e.revoke_current(outdated);
            }),
            ..buff("Lucy: Outdated Hallucination")
        },
    );
    e.define_buff(
        handshake,
        GDef {
            update_buffs: h(move |e| {
                if e.running_action(outro) {
                    e.add_to_cast([0.0, 0.0, 12.0, 0.0, 0.0, 0.0, 0.0]);
                }
            }),
            ..buff("Lucy: Digital Handshake")
        },
    );

    // --- resonance chain
    let s1_atk = e.buff(GDef { duration: 60.0 * 14.0, stats: vec![(s::BONUS_ATK, 20.0, 0)], ..buff("Lucy S1: The Moon, a Ticket, and a Dream") });
    let s1 = e.sequence(GDef { name: "Lucy S1: The Moon, a Ticket, and a Dream".into(), grants: vec![grant(on_action(&[intro]), s1_atk, To::Me)], ..Default::default() });
    let s2_instance = e.action(ADef {
        typ: T_HEAVY,
        mv: 450.0,
        after_action: h(move |e| {
            e.apply_enemy(cyberware, 1.0);
            e.apply_enemy(breach, 1.0);
        }),
        node: Node::Skill,
        ..act("Skill - Pulse Interference (S2 Additional)")
    });
    e.define(
        s2,
        GDef {
            name: "Lucy S2: The Blackwall, the Past, the Escape".into(),
            update_buffs: h(move |e| {
                if e.running_action(skill3) {
                    e.queue(s2_instance);
                }
            }),
            ..Default::default()
        },
    );
    e.set_kind(s2, Kind::Sequence);
    let s3 = e.sequence(GDef {
        name: "Lucy S3: Cyberpunk".into(),
        apply_stats: h(move |e| {
            if e.running_action(lib_act) || e.running_action(elib) {
                e.add_stat(s::MUL_MV, 50.0, 0);
                e.add_stat(s::CRIT_DMG, 100.0, 0);
            }
            if e.running_action(cripple) || e.running_action(data_crash) {
                e.add_stat(s::MUL_MV, 65.0, 0);
            }
        }),
        ..Default::default()
    });
    let s4_team = e.buff(GDef { duration: 60.0 * 20.0, stats: vec![(s::DMG_BONUS, 20.0, 0)], ..buff("Lucy S4: No Living Legends in Night City") });
    let s4 = e.sequence(GDef {
        name: "Lucy S4: No Living Legends in Night City".into(),
        hit_global: h(move |e| {
            if e.applied(sh.hack_shifting) > 0.0 {
                e.apply_team(s4_team, 1.0);
            }
        }),
        ..Default::default()
    });
    let s5 = e.sequence(GDef { name: "Lucy S5: A Broken Path to Hell".into(), ..Default::default() });
    let s6 = e.sequence(GDef {
        name: "Lucy S6: I Really Want to Stay At Your House".into(),
        apply_stats: h(move |e| {
            if e.stacks_of_enemy(sh.hack_shifting) == 0.0 && e.stacks_of_enemy(sh.hack_interfered) == 0.0 {
                return;
            }
            e.add_stat(s::DAMAGE_TAKEN, 40.0, T_HEAVY);
            e.add_stat(s::DAMAGE_TAKEN, 60.0, T_HACK);
        }),
        ..Default::default()
    });

    // --- kit
    let inh1 = e.inherent(GDef { name: "Inherent: Ghost Cyberware".into(), ..Default::default() });
    let inh2 = e.inherent(GDef { name: "Inherent: Function Cracking".into(), ..Default::default() });
    let talents = e.talent(GDef { name: "Lucy: Talents".into(), stats: vec![(s::BONUS_ATK, 12.0, 0), (s::CRIT_RATE, 8.0, 0)], ..Default::default() });
    let backdoor = e.buff(GDef {
        max_stacks: 2.0,
        duration: 60.0 * 120.0,
        apply_stats: h(|e| {
            let n = e.frozen_stacks();
            let bonus = 10.0 * n + if n >= 2.0 { 5.0 } else { 0.0 };
            e.add_stat(s::AMP, bonus, 0);
            e.add_stat(s::MUL_MV, bonus, T_HACK);
        }),
        ..buff("Lucy: Network Backdoor")
    });
    let matrix = e.matrix(
        "Lucy",
        0.0,
        GDef {
            update_buffs: h(move |e| {
                if e.running_action(lib_act) {
                    e.apply_team(backdoor, 1.0);
                }
            }),
            ..Default::default()
        },
    );
    e.resonator(
        lucy,
        ResDef {
            name: "Lucy",
            matrix: matrix,
            talent: talents,
            inherent1: inh1,
            inherent2: inh2,
            element: SPECTRO,
            weapon: Weapon::Pistols,
            color: "#efe8de",
            intro: intro,
            max_energy: 125.0,
            max_forte: [100.0, 100.0, 0.0, 0.0, 0.0],
            stats: vec![(s::BASE_HP, 11025.0, 0), (s::BASE_ATK, 425.0, 0), (s::BASE_DEF, 1148.8868, 0), (s::TBB, 10.0, 0)],
            g: GDef { hit_global: h(move |e| sh.tune_hack_response(e, data_crash)), ..Default::default() },
            ..Default::default()
        },
    );

    // --- rotation
    let mk = e.mk.clone();
    let ba234 = group_of("Basic - Locked Thread 234", vec![A(ba2), A(ba3), A(ba4)], 0);
    let eba234 = group_of("Basic - Thread Shredding 234", vec![A(eba2), A(eba3), A(eba4)], 0);
    let rot = vec![
        A(mk.start[2]), A(lib_act), e.form(&A(mk.echo), Form::InstaSwap),
        A(mk.intro), e.form(&ba234, Form::Cancel), A(skill1), e.form(&A(skill3), Form::EasyCancel),
        A(deadlock), e.form(&eba234, Form::EasyCancel),
        A(dual), A(multi), A(mk.echo),
        A(elib), A(ha1), e.form(&A(ha2), Form::InstaSwap), A(outro),
    ];
    let rotation = e.rotation(rot);

    let adam = lib.g("ADAM_SMASHER_LUCY");
    let dreams = lib.g("SHATTERED_DREAMS_1PC");
    let celestial = lib.g("CELESTIAL_LIGHT_2PC");
    let lingering = lib.g("LINGERING_TUNES_2PC");
    let neon2 = lib.g("NEONLIGHT_LEAP_2PC");
    let reel = lib.g("REEL_2PC");
    let moonlit2 = lib.g("MOONLIT_CLOUDS_2PC");
    let one = |sets: Vec<GearId>| EchoLoadout { mainslot: adam, sonata: sets[0], sets };
    let echoes = vec![
        one(vec![dreams, celestial, neon2]),
        one(vec![dreams, celestial, lingering]),
        one(vec![dreams, lingering, reel]),
        one(vec![dreams, celestial, moonlit2]),
        one(vec![dreams, lingering, moonlit2]),
    ];
    let new_std = lib.w("NEW_STD_PISTOL");
    let static_mist = lib.w("STATIC_MIST");
    let mainstats = e.mainstat_options(&[Mainstat::CR4, Mainstat::CD4, Mainstat::ATK3, Mainstat::Spectro3, Mainstat::ATK1]);
    let substat = e.substats([Substat::CritRate, Substat::CritDmg, Substat::AtkPct, Substat::Heavy, Substat::FlatAtk, Substat::Skill]);
    let high_substat = e.high_subs([Substat::CritRate, Substat::CritDmg, Substat::AtkPct, Substat::Heavy, Substat::FlatAtk, Substat::Skill]);
    lib.loadouts.push(Loadout::new(LoadoutDef {
        export: "LUCY",
        resonator: lucy,
        weapons: vec![lib.w("SPECTRAL_TRIGGER"), new_std, static_mist],
        echo_loadouts: echoes,
        mainstats,
        substat,
        high_substat,
        rotation: vec![(0, rotation)],
        sequences: vec![s1, s2, s3, s4, s5, s6],
        ..Default::default()
    }));
    let _ = Rc::new(0);
}

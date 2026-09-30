//! src/resonators/electro/rebecca.ts.
use crate::authoring::{Coord, ResDef};
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;
use crate::loadout::{EchoLoadout, Kind, Loadout, LoadoutDef, Mainstat, Substat};
use crate::rotation::{group_of, Form, W::A};

fn act(name: &str) -> ADef {
    ADef { name: name.into(), element: ELECTRO, scaling: Scaling::Atk, ..Default::default() }
}
fn b(hit: f64, mv: f64, energy: f64, concerto: f64, offtune: f64, f1: f64) -> BulletDef {
    BulletDef { hit, mv, energy, concerto, offtune, forte: [f1, 0.0, 0.0, 0.0, 0.0], ..Default::default() }
}
fn f2(hit: f64, mv: f64, energy: f64, concerto: f64, offtune: f64, f2: f64) -> BulletDef {
    BulletDef { hit, mv, energy, concerto, offtune, forte: [0.0, f2, 0.0, 0.0, 0.0], ..Default::default() }
}
fn basic(name: &str, anim: f64, bullets: Vec<BulletDef>) -> ADef {
    ADef { anim, cast: Cast::Basic, typ: T_BASIC, bullets: bullets, node: Node::Normal, ..act(name) }
}

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    let sh = *sh;
    let rebecca = lib.res(e, "REBECCA_RESONATOR");
    let lucy = lib.res(e, "LUCY_RESONATOR");
    let huntress = e.buff(GDef { stats: vec![(s::CRIT_DMG, 30.0, 0)], ..buff("Rebecca: Huntress") });
    let guts = e.buff(GDef { stats: vec![(s::DEF_IGNORE_NEW, 15.0, 0)], ..buff("Rebecca: Guts") });
    let a_girl = e.reserve("Rebecca: A Girl Gets What She Wants!");
    let (s4, s6_key) = (e.reserve("Rebecca S4: Got Ya Covered!"), ());
    let _ = s6_key;
    let hack: Option<Hook> = h(move |e| sh.apply_hack(e));
    let to_guts: Option<Hook> = h(move |e| {
        e.revoke_current(huntress);
        e.apply_current(guts, 1.0);
    });
    let to_huntress: Option<Hook> = h(move |e| {
        e.revoke_current(guts);
        e.apply_current(huntress, 1.0);
    });

    // --- Mix-'n'-Match, the Huntress half
    let hba1 = e.action(basic("Basic - Huntress 1", 26.0, vec![b(8.0, 36.76, 0.55, 1.09, 1740.0, 3.53), b(22.0, 36.76, 0.55, 1.09, 1740.0, 3.53)]));
    let h2 = |t: f64| b(t, 19.13, 0.29, 0.57, 906.0, 1.84);
    let hba2 = e.action(basic("Basic - Huntress 2", 40.0, vec![h2(12.0), h2(13.0), h2(14.0), h2(16.0), h2(30.0)]));
    let hba3 = e.action(basic("Basic - Huntress 3", 42.0, vec![b(18.0, 109.85, 1.63, 3.25, 5200.0, 10.54)]));
    let hha = e.action(ADef { anim: 32.0, cast: Cast::Heavy, typ: T_BASIC, bullets: vec![b(26.0, 16.9, 0.25, 0.5, 800.0, 1.79), b(32.0, 16.9, 0.25, 0.5, 800.0, 1.79)], node: Node::Normal, ..act("Heavy - Huntress") });
    let eat_lead = e.action(ADef { anim: 36.0, cast: Cast::Heavy, typ: T_HEAVY, bullets: vec![b(0.0, 60.84, 0.9, 1.8, 2880.0, 5.84), b(13.0, 60.84, 0.9, 1.8, 2880.0, 5.84)], node: Node::Normal, ..act("Heavy - Eat Lead!: Huntress") });
    let _hma_h = e.action(basic("Mid-air - Huntress Plunge", 43.0, vec![b(34.0, 136.04, 2.02, 4.03, 6440.0, 13.05)]));
    let hma = _hma_h;
    let htd_b = |t: f64| b(t, 16.9, 0.25, 0.5, 800.0, 1.79);
    let htd = e.action(basic("Basic - Tactical Dodge: Huntress", 36.0, vec![htd_b(6.0), htd_b(10.0), htd_b(16.0), htd_b(20.0), htd_b(30.0)]));
    let comin = e.action(ADef { cast: Cast::Basic, node: Node::Normal, ..act("Basic - Comin' in Hot!: Huntress") });

    // --- the Guts half
    let gba1 = e.action(basic("Basic - Guts 1", 56.0, vec![b(14.0, 61.69, 0.92, 1.83, 2920.0, 6.81), b(31.0, 61.69, 0.92, 1.83, 2920.0, 6.81)]));
    let gba2 = e.action(basic("Basic - Guts 2", 33.0, vec![b(11.0, 84.5, 1.25, 2.5, 4000.0, 9.32)]));
    let gba3 = e.action(basic("Basic - Guts 3", 85.0, vec![b(13.0, 33.77, 0.5, 1.0, 1599.0, 3.73), b(23.0, 33.77, 0.5, 1.0, 1599.0, 3.73), b(58.0, 157.57, 2.34, 4.67, 7460.0, 17.38)]));
    let gha = e.action(ADef { anim: 68.0, cast: Cast::Heavy, typ: T_HEAVY, bullets: vec![b(50.0, 202.79, 3.0, 6.0, 9600.0, 19.45)], node: Node::Normal, ..act("Heavy - Guts") });
    let _gma = e.action(basic("Mid-air - Guts Plunge", 57.0, vec![b(34.0, 104.78, 1.55, 3.1, 4960.0, 10.05)]));
    let gtd = e.action(basic("Basic - Tactical Dodge: Guts", 40.0, vec![b(6.0, 101.4, 1.5, 3.0, 4800.0, 9.73)]));
    let huntress_dodges = [hba1, hba2, hba3, hha, eat_lead, comin, htd];
    let guts_dodges = [gba1, gba2, gba3, gtd];

    // --- Tactical Tweaks: one Resonance Skill per mode, sharing one 1s cooldown
    let skill_cd = e.new_cooldown(60.0);
    let sk = |t: f64, mv: f64, en: f64, co: f64, off: f64, f: f64| b(t, mv, en, co, off, f);
    let skill = e.action(ADef {
        anim: 87.0,
        cooldown: CdSpec::Shared(skill_cd),
        cast: Cast::Skill,
        typ: T_SKILL,
        bullets: vec![
            sk(30.0, 23.66, 0.35, 0.7, 1120.0, 2.27),
            sk(32.0, 23.66, 0.35, 0.7, 1120.0, 2.27),
            sk(34.0, 23.66, 0.35, 0.7, 1120.0, 2.27),
            sk(36.0, 23.66, 0.35, 0.7, 1120.0, 2.27),
            sk(38.0, 35.49, 0.53, 1.05, 1680.0, 3.41),
            sk(40.0, 35.49, 0.53, 1.05, 1680.0, 3.41),
            sk(42.0, 35.49, 0.53, 1.05, 1680.0, 3.41),
            sk(60.0, 35.49, 0.53, 1.05, 1680.0, 3.41),
        ],
        update_buffs: to_guts.clone(),
        node: Node::Skill,
        ..act("Skill - It's Big Boomin' Time!")
    });
    let _eskill = e.action(ADef {
        anim: 110.0,
        cooldown: CdSpec::Shared(skill_cd),
        cast: Cast::Skill,
        typ: T_SKILL,
        bullets: vec![
            sk(12.0, 23.66, 0.35, 0.7, 1120.0, 2.27),
            sk(36.0, 4.74, 0.07, 0.14, 224.0, 0.46),
            sk(62.0, 23.66, 0.35, 0.7, 1120.0, 2.27),
            sk(64.0, 23.66, 0.35, 0.7, 1120.0, 2.27),
            sk(66.0, 137.22, 2.03, 4.06, 6496.0, 13.17),
            sk(68.0, 11.83, 0.18, 0.35, 560.0, 1.14),
            sk(70.0, 11.83, 0.18, 0.35, 560.0, 1.14),
        ],
        update_buffs: to_huntress.clone(),
        node: Node::Skill,
        ..act("Skill - Come 'n' Get Me!")
    });

    // --- Gloves Are Comin' Off!: the Fervor finishers
    let fh = |t: f64| f2(t, 19.89, 0.75, 1.0, 2216.0, 0.0);
    let fha_hunt = e.action(ADef {
        anim: 110.0,
        cast: Cast::Heavy,
        typ: T_BASIC,
        bullets: vec![fh(12.0), fh(46.0), fh(50.0), fh(56.0), f2(84.0, 318.1, 12.0, 16.0, 35456.0, 40.0)],
        cast_forte: [-120.0, 0.0, 0.0, 0.0, 0.0],
        update_debuffs: hack.clone(),
        node: Node::Forte,
        ..act("Forte Heavy - Rat-tat-tat!: Huntress")
    });
    let fha_guts = e.action(ADef {
        anim: 90.0,
        cast: Cast::Heavy,
        typ: T_BASIC,
        bullets: vec![f2(64.0, 278.34, 15.0, 20.0, 44320.0, 40.0)],
        cast_forte: [-120.0, 0.0, 0.0, 0.0, 0.0],
        update_debuffs: hack.clone(),
        node: Node::Forte,
        ..act("Forte Heavy - Bang-bang-bang!: Guts")
    });

    // --- Party 'til Dawn!
    let lib1 = e.action(ADef { anim: 180.0, timestop: 180.0, motion_stop: 180.0, cooldown: CdSpec::Frames(60.0 * 25.0), cast: Cast::Liberation, reset_energy: true, node: Node::Liberation, ..act("Liberation - Party 'til Dawn!") });
    let lib2 = e.action(ADef { typ: T_BASIC, cast: Cast::Liberation, bullets: vec![f2(0.0, 121.5, 0.0, 22.8, 8045.0, 0.0)], node: Node::Liberation, ..act("Liberation - Mk. 31 HMG x5") });
    let lib3 = e.action(ADef { typ: T_BASIC, cast: Cast::Liberation, bullets: vec![f2(0.0, 243.0, 0.0, 5.6, 16090.0, 0.0)], node: Node::Liberation, ..act("Liberation - Mk. 31 HMG 1st Enhancement x5") });
    let lib4 = e.action(ADef { typ: T_BASIC, cast: Cast::Liberation, bullets: vec![f2(0.0, 729.0, 0.0, 16.7, 48260.0, 0.0)], node: Node::Liberation, ..act("Liberation - Mk. 31 HMG 2nd Enhancement x10") });
    let boom = e.action(ADef {
        tag: Tag::Field,
        anim: 133.0,
        prio: 133.0,
        typ: T_BASIC,
        cast: Cast::Liberation,
        bullets: vec![f2(66.0, 63.62, 2.0, 1.0, 3103.0, 0.0), f2(79.0, 572.58, 18.0, 9.0, 27922.0, 0.0)],
        update_debuffs: hack.clone(),
        node: Node::Liberation,
        ..act("Liberation - BOOM! Fireworks!")
    });

    // --- My Turn!: one Intro per mode
    let ib = |t: f64, mv: f64, en: f64, off: f64| f2(t, mv, en, 0.0, off, 0.0);
    let intro = e.action(ADef {
        anim: 96.0,
        prio: 96.0,
        motion_stop: 90.0,
        cast: Cast::Intro,
        typ: T_INTRO,
        bullets: vec![
            ib(44.0, 27.04, 1.0, 1280.0),
            ib(46.0, 27.04, 1.0, 1280.0),
            ib(48.0, 27.04, 1.0, 1280.0),
            ib(50.0, 27.04, 1.0, 1280.0),
            ib(52.0, 27.04, 1.0, 1280.0),
            ib(54.0, 27.04, 1.0, 1280.0),
            ib(56.0, 40.56, 1.5, 1920.0),
            ib(72.0, 67.6, 2.5, 3200.0),
        ],
        cast_concerto: 10.0,
        update_debuffs: hack.clone(),
        update_buffs: to_guts.clone(),
        node: Node::Intro,
        ..act("Intro - Yo, It's Big Boomin' Time!")
    });
    let eintro = e.action(ADef {
        anim: 89.0,
        prio: 69.0,
        motion_stop: 58.0,
        cast: Cast::Intro,
        typ: T_INTRO,
        bullets: vec![ib(29.0, 10.14, 0.5, 480.0), ib(53.0, 30.42, 1.5, 1440.0), ib(54.0, 40.56, 2.0, 1920.0), ib(55.0, 40.56, 2.0, 1920.0), ib(57.0, 40.56, 2.0, 1920.0), ib(59.0, 40.56, 2.0, 1920.0)],
        cast_concerto: 10.0,
        update_debuffs: hack.clone(),
        update_buffs: to_huntress.clone(),
        node: Node::Intro,
        ..act("Intro - Hey, Leadhead, Come 'n' Get Me!")
    });

    // --- Preem Choom: the Outro's turret, enhanced when it hands to Lucy
    let edgerunner = e.reserve("Rebecca: Outro - Edgerunner Bonds");
    let turret_field = e.new_field("Rebecca: Outro Turret");
    let turret_tick = e.action(ADef { typ: T_OUTRO, mv: 2.5, field: turret_field, ..act("Outro - Preem Choom: Turret") });
    let turret_tick_lucy = e.variant(turret_tick, |d| {
        d.name = "Outro - Preem Choom: Turret (Enhanced)".into();
        d.apply_stats = h(|e| e.add_stat(s::MUL_MV, 250.0, 0));
    });
    let turret = e.coordinated("Rebecca: Outro Turret", 14.0, rebecca, Ok(turret_tick), Coord { hits: 5, ..Default::default() });
    let turret_lucy = e.coordinated("Rebecca: Outro Turret (Lucy)", 4.0, rebecca, Ok(turret_tick_lucy), Coord { hits: 5, ..Default::default() });
    let outro = e.action(ADef {
        cast: Cast::Outro,
        typ: T_OUTRO,
        cast_concerto: -100.0,
        update_buffs: h(move |e| {
            let n = e.nslots as i32;
            let next = ((e.active as i32 + e.outro_dir + n) % n) as usize;
            let is_lucy = e.members[next].resonator.map_or(false, |r| e.gears[r as usize].name == "Lucy");
            if is_lucy {
                e.apply_team(turret_lucy, 4.0);
            } else {
                e.apply_team(turret, 14.0);
            }
            e.queue_outro(edgerunner);
            e.add_stat(s::ADD_FORTE2, 120.0, 0);
        }),
        ..act("Outro - Preem Choom")
    });
    let meltdown = e.action(ADef { typ: T_HACK, scaling: Scaling::Tune, bullets: vec![f2(0.0, 2358.89, 0.0, 0.0, 0.0, 0.0)], node: Node::Forte, ..act("Tune Hack Response - Meltdown") });

    // --- buffs
    e.define_buff(
        a_girl,
        GDef {
            duration: 60.0 * 12.0,
            apply_stats: h(move |e| {
                let k = if e.is_held(s4) { 1.6 } else { 1.0 };
                if !e.is_held(huntress) {
                    e.add_stat(s::CRIT_DMG, 30.0 * k, 0);
                } else if k > 1.0 {
                    e.add_stat(s::CRIT_DMG, 30.0 * (k - 1.0), 0);
                }
                if !e.is_held(guts) {
                    e.add_stat(s::DEF_IGNORE_NEW, 15.0 * k, 0);
                } else if k > 1.0 {
                    e.add_stat(s::DEF_IGNORE_NEW, 15.0 * (k - 1.0), 0);
                }
                let a = &e.acts[e.pressed() as usize];
                let (f, c) = (a.forte[1], a.cast_forte[1]);
                if f > c {
                    e.add_stat(s::ADD_FORTE2, -(f - c), 0);
                }
            }),
            ..buff("Rebecca: A Girl Gets What She Wants!")
        },
    );
    let tag_youre_it = e.buff(GDef { max_stacks: 2.0, duration: 60.0 * 12.0, stats: vec![(s::BONUS_ATK, 10.0, 0)], per_stack: true, ..buff("Inherent: Tag, You're It!") });
    let tag_tbb = e.buff(GDef { duration: 60.0 * 30.0, stats: vec![(s::TBB, 30.0, 0)], ..buff("Inherent: Tag, You're It! (team)") });
    let left_an_opening = e.buff(GDef { duration: 60.0 * 30.0, stats: vec![(s::BONUS_ATK, 20.0, 0)], ..buff("Inherent: Left an Opening!") });
    let overlimit = e.buff(GDef { max_stacks: 70.0, lost_on_swap: true, stats: vec![(s::AMP, 0.5, T_HEAVY)], per_stack: true, ..buff("Rebecca: Outro - Overlimit") });
    e.define_buff(
        edgerunner,
        GDef {
            duration: 60.0 * 14.0,
            stats: vec![(s::AMP, 15.0, 0)],
            update_buffs: h(move |e| {
                if e.is_held(lucy) {
                    e.apply_current(overlimit, 70.0);
                }
            }),
            tick_every: TickEvery::Every(12.0),
            tick_fn: ticks(move |e: &mut Eng, _n: f64| {
                e.apply_current(overlimit, 1.0);
            }),
            lost_on_swap: true,
            ..buff("Rebecca: Outro - Edgerunner Bonds")
        },
    );

    // --- resonance chain
    let s1 = e.sequence(GDef {
        name: "Rebecca S1: Try Not to Get in the Way!".into(),
        apply_stats: h(move |e| {
            if [hba1, hba2, hba3, hha, htd, gba1, gba2, gba3, gtd].iter().any(|&a| e.running_action(a)) {
                e.add_stat(s::MUL_MV, 50.0, 0);
            }
        }),
        ..Default::default()
    });
    let choom_team = e.buff(GDef { duration: 60.0 * 30.0, stats: vec![(s::DMG_BONUS, 20.0, 0)], ..buff("Rebecca S2: Oh, Hey Choom! (intro/lib)") });
    let choom_hack = e.buff(GDef { duration: 60.0 * 30.0, stats: vec![(s::AMP, 15.0, 0)], ..buff("Rebecca S2: Oh, Hey Choom! (hack)") });
    let s2 = e.sequence(GDef {
        name: "Rebecca S2: Oh, Hey Choom!".into(),
        hit_global: h(move |e| {
            if let Some(acting) = e.members[e.active].resonator {
                if e.applied(sh.hack_shifting) > 0.0 {
                    e.add_buff(acting, choom_hack, 1.0);
                }
            }
        }),
        update_buffs: h(move |e| {
            if e.running_action(intro) || e.running_action(eintro) || e.running_action(lib1) {
                e.apply_team(choom_team, 1.0);
            }
        }),
        ..Default::default()
    });
    let s3 = e.sequence(GDef {
        name: "Rebecca S3: Don't Sweat Your Six!".into(),
        apply_stats: h(move |e| {
            if [lib2, lib3, lib4, boom].iter().any(|&a| e.running_action(a)) {
                e.add_stat(s::MUL_MV, 60.0, 0);
            }
        }),
        update_buffs: h(move |e| {
            if e.casting(Cast::Intro) && !e.is_held(a_girl) && e.forte(1) < 120.0 {
                e.add_to_cast([0.0, 0.0, 0.0, 120.0, 0.0, 0.0, 0.0]);
            }
        }),
        ..Default::default()
    });
    e.define(s4, GDef { name: "Rebecca S4: Got Ya Covered!".into(), ..Default::default() });
    e.set_kind(s4, Kind::Sequence);
    let dreamin = e.buff(GDef { duration: 60.0 * 8.0, stats: vec![(s::DMG_BONUS, 20.0, T_BASIC)], ..buff("Rebecca S5: Dreamin' on the Edge") });
    let s5 = e.sequence(GDef {
        name: "Rebecca S5: Dreamin' on the Edge".into(),
        grants: vec![grant(inflicting(move |e| e.is_active() && e.applied(sh.hack_shifting) > 0.0), dreamin, To::Me)],
        ..Default::default()
    });
    let s6_hunt = e.action(ADef { typ: T_BASIC, mv: 900.0, node: Node::Forte, ..act("Forte Heavy - Rat-tat-tat!: Huntress (S6 Strike)") });
    let s6_guts = e.action(ADef { typ: T_BASIC, mv: 900.0, node: Node::Forte, ..act("Forte Heavy - Bang-bang-bang!: Guts (S6 Strike)") });
    let s6 = e.sequence(GDef {
        name: "Rebecca S6: Maybe, Just Maybe...".into(),
        apply_stats: h(move |e| {
            if (e.running_action(fha_hunt) || e.running_action(fha_guts)) && !e.is_held(a_girl) {
                e.add_stat(s::ADD_FORTE2, 20.0, 0);
            }
        }),
        late_convert: h(|e| {
            let v = 0.4 * e.basic_dmg_bonus();
            e.add_stat(s::DMG_BONUS, v, T_BASIC);
        }),
        update_buffs: h(move |e| {
            if e.running_action(fha_hunt) {
                e.queue(s6_hunt);
            }
            if e.running_action(fha_guts) {
                e.queue(s6_guts);
            }
        }),
        ..Default::default()
    });

    // --- kit
    let inh1 = e.inherent(GDef {
        name: "Inherent: Tag, You're It!".into(),
        hit_global: h(move |e| {
            if let Some(acting) = e.members[e.active].resonator {
                if e.applied(sh.hack_shifting) > 0.0 {
                    e.add_buff(acting, tag_tbb, 1.0);
                }
            }
        }),
        update_buffs: h(move |e| {
            if e.applied(a_girl) > 0.0 || e.running_action(fha_hunt) || e.running_action(fha_guts) {
                e.apply_current(tag_youre_it, 1.0);
            }
        }),
        ..Default::default()
    });
    let inh2 = e.inherent(GDef { name: "Inherent: Left an Opening!".into(), grants: vec![grant(on_action(&[lib1]), left_an_opening, To::Team)], ..Default::default() });
    let talents = e.talent(GDef { name: "Rebecca: Talents".into(), stats: vec![(s::BONUS_ATK, 12.0, 0), (s::CRIT_RATE, 8.0, 0)], ..Default::default() });
    let intro_resolver = e.action(ADef {
        name: "Intro Resolver".into(),
        cast: Cast::Intro,
        resolve: resolver(move |e: &mut Eng| Some(if e.is_held(guts) { eintro } else { intro })),
        ..Default::default()
    });
    let dodge = dodges(move |e: &mut Eng, after: ActId| {
        let c = e.acts[after as usize].cast;
        if c == Some(Cast::Skill) || c == Some(Cast::Intro) {
            return Some(if e.is_held(guts) { gtd } else { htd });
        }
        if huntress_dodges.contains(&after) {
            Some(htd)
        } else if guts_dodges.contains(&after) {
            Some(gtd)
        } else {
            None
        }
    });
    e.resonator(
        rebecca,
        ResDef {
            name: "Rebecca",
            talent: talents,
            inherent1: inh1,
            inherent2: inh2,
            element: ELECTRO,
            weapon: Weapon::Pistols,
            color: "#abebda",
            intro: intro_resolver,
            dodge,
            max_energy: 125.0,
            max_forte: [120.0, 120.0, 0.0, 0.0, 0.0],
            stats: vec![(s::BASE_HP, 11600.0, 0), (s::BASE_ATK, 400.0, 0), (s::BASE_DEF, 1173.3312, 0), (s::TBB, 10.0, 0)],
            g: GDef {
                combat_start: h(move |e| {
                    e.apply_current(huntress, 1.0);
                    e.set_forte(1, 120.0);
                }),
                hit_global: h(move |e| sh.tune_hack_response(e, meltdown)),
                update_buffs: h(move |e| {
                    if e.forte(1) >= 120.0 && (e.casting(Cast::Skill) || e.casting(Cast::Intro)) {
                        e.apply_current(a_girl, 1.0);
                        let f1 = if e.casting(Cast::Intro) { 50.0 } else { 0.0 };
                        e.add_to_cast([0.0, 0.0, f1, -120.0, 0.0, 0.0, 0.0]);
                    }
                }),
                ..Default::default()
            },
            ..Default::default()
        },
    );

    // --- rotation
    let mk = e.mk.clone();
    let lib234 = group_of("Liberation - Mk. 31 HMG", vec![A(lib2), A(lib3), A(lib4)], 0);
    let rot = vec![
        A(mk.first_intro), e.form(&A(gba1), Form::DodgeCancel), A(gba2), e.form(&A(gba3), Form::Cancel),
        e.form(&A(gha), Form::EasyCancel),
        A(fha_guts),
        e.form(&A(gha), Form::EasyCancel),
        e.form(&A(mk.echo), Form::InstaDodge), A(lib1), lib234.clone(), e.form(&A(boom), Form::InstaSwap), A(outro),

        A(mk.intro), A(hma),
        e.form(&A(skill), Form::DodgeCancel),
        e.form(&A(gha), Form::EasyCancel),
        A(fha_guts),
        e.form(&A(gha), Form::EasyCancel),
        e.form(&A(mk.echo), Form::InstaDodge), A(lib1), lib234, e.form(&A(boom), Form::InstaSwap), A(outro),
    ];
    let rotation = e.rotation(rot);

    let adam = lib.g("ADAM_SMASHER_REBECCA");
    let dreams = lib.g("SHATTERED_DREAMS_1PC");
    let lingering = lib.g("LINGERING_TUNES_2PC");
    let void = lib.g("VOID_THUNDER_2PC");
    let reel = lib.g("REEL_2PC");
    let sworn = lib.g("SWORN_VIGIL_2PC");
    let moonlit2 = lib.g("MOONLIT_CLOUDS_2PC");
    let hyvatia = lib.g("HYVATIA");
    let neonlight5 = lib.g("NEONLIGHT_LEAP_5PC");
    let heron = lib.g("HERON");
    let stonewall = lib.g("STONEWALL_BRACER");
    let moonlit5 = lib.g("MOONLIT_CLOUDS_5PC");
    let one = |mainslot: GearId, sets: Vec<GearId>| EchoLoadout { mainslot, sonata: sets[0], sets };
    let echoes = vec![
        one(adam, vec![dreams, lingering, void]),
        one(adam, vec![dreams, lingering, reel]),
        one(adam, vec![dreams, sworn, void]),
        one(adam, vec![dreams, lingering, moonlit2]),
        one(adam, vec![dreams, moonlit2, void]),
        one(hyvatia, vec![neonlight5]),
        one(heron, vec![moonlit5]),
        one(stonewall, vec![moonlit5]),
    ];
    let new_std = lib.w("NEW_STD_PISTOL");
    let static_mist = lib.w("STATIC_MIST");
    let mainstats = e.mainstat_options(&[Mainstat::CR4, Mainstat::CD4, Mainstat::ER3, Mainstat::ATK3, Mainstat::Electro3, Mainstat::ATK1]);
    let substat = e.substats([Substat::CritRate, Substat::CritDmg, Substat::Basic, Substat::AtkPct, Substat::FlatAtk, Substat::Heavy]);
    let high_substat = e.high_subs([Substat::CritRate, Substat::CritDmg, Substat::Basic, Substat::AtkPct, Substat::FlatAtk, Substat::Heavy]);
    lib.loadouts.push(Loadout::new(LoadoutDef {
        export: "REBECCA",
        resonator: rebecca,
        weapons: vec![lib.w("SKULL_THRASHER"), new_std, static_mist],
        echo_loadouts: echoes,
        mainstats,
        substat,
        high_substat,
        rotation: vec![(0, rotation)],
        sequences: vec![s1, s2, s3, s4, s5, s6],
        ..Default::default()
    }));
}

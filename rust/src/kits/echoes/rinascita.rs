//! src/echoes/rinascita.ts: mainslot echoes and sonatas from Rinascita (versions 2.0-2.4).
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    let aero_erosion = sh.aero_erosion;
    let spectro_frazzle = sh.spectro_frazzle;
    let heliacal_ember = sh.heliacal_ember;

    /* Carlotta, 2.0 */

    // Sentry Construct: flat Glacio/Resonance Skill DMG Bonus, no trigger
    let a = e.action(ADef {
        name: "Echo - Sentry Construct".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 405.0, energy: 5.62, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 25.0),
        cast: Cast::Echo,
        element: GLACIO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_SENTRY_CONSTRUCT", a);
    let g = e.mainslot(GDef { name: "Sentry Construct".into(), stats: vec![(s::DMG_BONUS, 12.0, GLACIO), (s::DMG_BONUS, 12.0, T_SKILL)], ..Default::default() }, a);
    lib.put("SENTRY_CONSTRUCT", g);

    // Frosty Resolve: Skill grants Glacio DMG, Liberation grants stacking Skill DMG
    let two = e.sonata2pc(GDef { name: "Frosty Resolve 2pc".into(), stats: vec![(s::DMG_BONUS, 12.0, T_SKILL)], ..Default::default() });
    lib.put("FROSTY_RESOLVE_2PC", two);
    let glacio = e.buff(GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 22.5, GLACIO)], ..buff("Frosty Resolve 5pc: Glacio") });
    lib.put("FROSTY_RESOLVE_GLACIO", glacio);
    let skill = e.buff(GDef {
        max_stacks: 2.0,
        duration: 60.0 * 5.0,
        stats: vec![(s::DMG_BONUS, 18.0, T_SKILL)],
        per_stack: true,
        ..buff("Frosty Resolve 5pc: Resonance Skill")
    });
    lib.put("FROSTY_RESOLVE_SKILL_DMG", skill);
    let five = e.sonata(
        GDef {
            name: "Frosty Resolve 5pc".into(),
            grants: vec![grant(on_cast(&[Cast::Skill]), glacio, To::Me), grant(on_cast(&[Cast::Liberation]), skill, To::Me)],
            ..Default::default()
        },
        two,
    );
    lib.put("FROSTY_RESOLVE_5PC", five);

    /* Roccia, 2.0 */

    let a = e.action(ADef {
        name: "Echo - Nightmare: Impermanence Heron".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 405.0, energy: 5.6, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 25.0),
        cast: Cast::Echo,
        element: HAVOC,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_NM_HERON", a);
    let g = e.mainslot(GDef { name: "Nightmare: Impermanence Heron".into(), stats: vec![(s::DMG_BONUS, 12.0, HAVOC), (s::DMG_BONUS, 12.0, T_HEAVY)], ..Default::default() }, a);
    lib.put("NM_HERON", g);

    /* Cantarella, 2.2 */

    let a = e.action(ADef {
        name: "Echo - Lorelei".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 405.0, energy: 5.62, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 25.0),
        cast: Cast::Echo,
        element: HAVOC,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_LORELEI", a);
    let g = e.mainslot(GDef { name: "Lorelei".into(), stats: vec![(s::DMG_BONUS, 12.0, HAVOC), (s::DMG_BONUS, 12.0, T_BASIC)], ..Default::default() }, a);
    lib.put("LORELEI", g);

    // Midnight Veil: the outro fires a Havoc burst and hands the incoming resonator Havoc DMG
    let two = e.sonata2pc(GDef { name: "Midnight Veil 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, HAVOC)], ..Default::default() });
    lib.put("MIDNIGHT_VEIL_2PC", two);
    let burst = e.action(ADef {
        name: "Outro - Midnight Veil".into(),
        element: HAVOC,
        scaling: Scaling::Atk,
        typ: T_OUTRO,
        mv: 480.0,
        ..Default::default()
    });
    lib.put_a("ACTION_MIDNIGHT_VEIL_BURST", burst);
    let handoff = e.buff(GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 15.0, HAVOC)], ..buff("Midnight Veil 5pc (outro)") });
    lib.put("MIDNIGHT_VEIL_HANDOFF", handoff);
    let five = e.sonata(
        GDef {
            name: "Midnight Veil 5pc".into(),
            update_buffs: h(move |e| {
                if e.casting(Cast::Outro) {
                    e.queue(burst);
                    e.queue_outro(handoff);
                }
            }),
            ..Default::default()
        },
        two,
    );
    lib.put("MIDNIGHT_VEIL_5PC", five);

    /* Brant, 2.1 */

    let a = e.action(ADef {
        name: "Echo - Dragon of Dirge".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 36.81 * 8.0, energy: 0.51 * 8.0, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 25.0),
        cast: Cast::Echo,
        element: FUSION,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_DRAGON_OF_DIRGE", a);
    let g = e.mainslot(GDef { name: "Dragon of Dirge".into(), stats: vec![(s::DMG_BONUS, 12.0, FUSION), (s::DMG_BONUS, 12.0, T_BASIC)], ..Default::default() }, a);
    lib.put("DRAGON_OF_DIRGE", g);

    let two = e.sonata2pc(GDef { name: "Tidebreaking Courage 2pc".into(), stats: vec![(s::ER, 10.0, 0)], ..Default::default() });
    lib.put("TIDEBREAKING_2PC", two);
    // +30% DMG Bonus once Energy Regen reaches 250%, read after every ER contribution landed
    let five = e.sonata(
        GDef {
            name: "Tidebreaking Courage 5pc".into(),
            stats: vec![(s::BONUS_ATK, 15.0, 0)],
            convert_stats: h(|e| {
                if e.get_stat(s::ER) >= 250.0 {
                    e.add_stat(s::DMG_BONUS, 30.0, 0);
                }
            }),
            ..Default::default()
        },
        two,
    );
    lib.put("TIDEBREAKING_5PC", five);

    /* Phrolova */

    let a = e.action(ADef {
        name: "Echo - Nightmare: Hecate".into(),
        anim: 50.0,
        bullets: vec![BulletDef { hit: 36.0, mv: 457.17, energy: 3.15, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 25.0),
        cast: Cast::Echo,
        element: HAVOC,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_NM_HECATE", a);
    let g = e.mainslot(GDef { name: "Nightmare: Hecate".into(), stats: vec![(s::DMG_BONUS, 12.0, HAVOC), (s::DMG_BONUS, 20.0, T_ECHO)], ..Default::default() }, a);
    lib.put("NM_HECATE", g);

    /* Zhezhi */

    let a = e.action(ADef {
        name: "Echo - Nightmare: Lampylumen Myriad".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: GLACIO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 273.6,
        energy: 3.8,
        ..Default::default()
    });
    lib.put_a("ACTION_NM_LAMPY", a);
    let g = e.mainslot(GDef { name: "Nightmare: Lampylumen Myriad".into(), stats: vec![(s::DMG_BONUS, 12.0, GLACIO), (s::DMG_BONUS, 30.0, S_COORDINATED)], ..Default::default() }, a);
    lib.put("NM_LAMPY", g);

    let a = e.action(ADef {
        name: "Echo - Hecate".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: HAVOC,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 45.59 * 6.0,
        energy: 0.63 * 6.0,
        ..Default::default()
    });
    lib.put_a("ACTION_HECATE", a);
    let g = e.mainslot(GDef { name: "Hecate".into(), stats: vec![(s::DMG_BONUS, 40.0, S_COORDINATED)], ..Default::default() }, a);
    lib.put("HECATE", g);

    // Empyrean Anthem: a Coordinated Attack hit grants the team ATK while on field
    let two = e.sonata2pc(GDef { name: "Empyrean Anthem 2pc".into(), stats: vec![(s::ER, 10.0, 0)], ..Default::default() });
    lib.put("EMPYREAN_ANTHEM_2PC", two);
    let team = e.reserve("Empyrean Anthem 5pc");
    let five = e.sonata(
        GDef {
            name: "Empyrean Anthem 5pc".into(),
            stats: vec![(s::DMG_BONUS, 80.0, S_COORDINATED)],
            grants: vec![hit_grant(on_type(&[S_COORDINATED]), team, To::Team)],
            ..Default::default()
        },
        two,
    );
    lib.put("EMPYREAN_ANTHEM_5PC", five);
    e.define_buff(
        team,
        GDef {
            duration: 60.0 * 4.0,
            stats: vec![(s::BONUS_ATK, 20.0, 0)],
            when: cond(|e: &mut Eng| e.is_active()),
            ..buff("Empyrean Anthem 5pc")
        },
    );
    lib.put("EMPYREAN_ANTHEM_TEAM", team);

    /* Ciaccona */

    // Nightmare: Kelpie: an Outro summons it once more as Aero DMG
    let a = e.action(ADef {
        name: "Echo - Nightmare: Kelpie".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 405.0, energy: 2.81, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 25.0),
        cast: Cast::Echo,
        element: GLACIO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_NM_KELPIE", a);
    let outro = e.action(ADef {
        name: "Echo - Nightmare: Kelpie (Outro)".into(),
        element: AERO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 405.0,
        energy: 2.81,
        ..Default::default()
    });
    lib.put_a("ACTION_NM_KELPIE_OUTRO", outro);
    let g = e.mainslot(
        GDef {
            name: "Nightmare: Kelpie".into(),
            stats: vec![(s::DMG_BONUS, 12.0, GLACIO), (s::DMG_BONUS, 12.0, AERO)],
            update_buffs: h(move |e| {
                if e.casting(Cast::Outro) {
                    e.queue(outro);
                }
            }),
            ..Default::default()
        },
        a,
    );
    lib.put("NM_KELPIE", g);

    /* Ciaccona, 2.3 */

    // Gusts of Welkin: inflicting Aero Erosion pays the team and the inflicter Aero DMG
    let team = e.buff(GDef { duration: 60.0 * 20.0, stats: vec![(s::DMG_BONUS, 15.0, AERO)], ..buff("Gusts of Welkin 5pc (team)") });
    lib.put("GUSTS_OF_WELKIN_TEAM", team);
    let own = e.buff(GDef { duration: 60.0 * 20.0, stats: vec![(s::DMG_BONUS, 15.0, AERO)], ..buff("Gusts of Welkin 5pc") });
    lib.put("GUSTS_OF_WELKIN_SELF", own);
    let two = e.sonata2pc(GDef { name: "Gusts of Welkin 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, AERO)], ..Default::default() });
    lib.put("GUSTS_OF_WELKIN_2PC", two);
    let five = e.sonata(
        GDef {
            name: "Gusts of Welkin 5pc".into(),
            grants: vec![grant(on_inflict(&[aero_erosion]), team, To::Team), grant(on_inflict(&[aero_erosion]), own, To::Me)],
            ..Default::default()
        },
        two,
    );
    lib.put("GUSTS_OF_WELKIN_5PC", five);

    /* Cartethyia, 2.4 */

    // Reminiscence: Fleurdelys: another +10% Aero when its wearer is Rover: Aero or Cartethyia
    let a = e.action(ADef {
        name: "Echo - Reminiscence: Fleurdelys".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: AERO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 27.36 * 8.0 + 136.8,
        energy: 0.38 * 8.0 + 1.9,
        ..Default::default()
    });
    lib.put_a("ACTION_FLEURDELYS", a);
    let g = e.mainslot(
        GDef {
            name: "Reminiscence: Fleurdelys".into(),
            constant: vec![(s::DMG_BONUS, 10.0, AERO)],
            constant_fn: h(|e| {
                let worn = e.members[e.slot].resonator.map_or(false, |r| matches!(e.gears[r as usize].name.as_str(), "Aero Rover" | "Cartethyia"));
                if worn {
                    e.add_stat(s::DMG_BONUS, 10.0, AERO);
                }
            }),
            ..Default::default()
        },
        a,
    );
    lib.put("FLEURDELYS", g);

    // Windward Pilgrimage: any hit on a target already carrying Aero Erosion pays
    let two = e.sonata2pc(GDef { name: "Windward Pilgrimage 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, AERO)], ..Default::default() });
    lib.put("WINDWARD_2PC", two);
    let windward = e.reserve("Windward Pilgrimage 5pc");
    let five = e.sonata(
        GDef {
            name: "Windward Pilgrimage 5pc".into(),
            grants: vec![hit_grant(when(move |e| e.stacks_of_enemy(aero_erosion) > 0.0), windward, To::Me)],
            ..Default::default()
        },
        two,
    );
    lib.put("WINDWARD_5PC", five);
    e.define_buff(windward, GDef { duration: 60.0 * 10.0, stats: vec![(s::CRIT_RATE, 10.0, 0), (s::DMG_BONUS, 30.0, AERO)], ..buff("Windward Pilgrimage 5pc") });
    lib.put("WINDWARD_BUFF", windward);

    /* Phoebe and Zani, 2.4 */

    let a = e.action(ADef {
        name: "Echo - Capitaneus".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: SPECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 118.80 + 59.40 * 4.0,
        energy: 1.65 + 0.82 * 4.0,
        ..Default::default()
    });
    lib.put_a("ACTION_CAPITANEUS", a);
    let g = e.mainslot(GDef { name: "Capitaneus".into(), stats: vec![(s::DMG_BONUS, 12.0, SPECTRO), (s::DMG_BONUS, 12.0, T_HEAVY)], ..Default::default() }, a);
    lib.put("CAPITANEUS", g);

    // Nightmare: Mourning Aix: its own damage doubles against a Spectro Frazzled target
    let a = e.action(ADef {
        name: "Echo - Nightmare: Mourning Aix".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: SPECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 273.6,
        energy: 3.8,
        apply_stats: h(move |e| {
            if e.stacks_of_enemy(spectro_frazzle) > 0.0 {
                e.add_stat(s::TOTAL_DMG, 100.0, 0);
            }
        }),
        ..Default::default()
    });
    lib.put_a("ACTION_NM_MOURNING_AIX", a);
    let g = e.mainslot(GDef { name: "Nightmare: Mourning Aix".into(), stats: vec![(s::DMG_BONUS, 12.0, SPECTRO)], ..Default::default() }, a);
    lib.put("NM_MOURNING_AIX", g);

    // Eternal Radiance: Heliacal Ember counts toward Spectro Frazzle for both halves
    let two = e.sonata2pc(GDef { name: "Eternal Radiance 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, SPECTRO)], ..Default::default() });
    lib.put("ETERNAL_RADIANCE_2PC", two);
    let crit = e.buff(GDef { duration: 60.0 * 15.0, stats: vec![(s::CRIT_RATE, 20.0, 0)], ..buff("Eternal Radiance 5pc (frazzle)") });
    lib.put("ETERNAL_RADIANCE_CRIT", crit);
    let spectro = e.buff(GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 15.0, SPECTRO)], ..buff("Eternal Radiance 5pc (10 stacks)") });
    lib.put("ETERNAL_RADIANCE_SPECTRO", spectro);
    let five = e.sonata(
        GDef {
            name: "Eternal Radiance 5pc".into(),
            grants: vec![
                grant(on_applied(&[spectro_frazzle, heliacal_ember]), crit, To::Me),
                // read on the hit, after its own inflictions, and pays into that same hit
                grant(inflicting(move |e| !e.cur().bullets.is_empty() && e.stacks_of_enemy(spectro_frazzle) + e.stacks_of_enemy(heliacal_ember) >= 10.0), spectro, To::Me),
            ],
            ..Default::default()
        },
        two,
    );
    lib.put("ETERNAL_RADIANCE_5PC", five);
}

//! src/echoes/lahairoi.ts: mainslot echoes and sonatas from Lahairoi (versions 2.8-3.4), plus the
//! 3.5-3.6 pieces with no region file of their own yet.
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;
use std::rc::Rc;

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    let sh = *sh;
    let heals = sh.heals;
    let chafe = sh.glacio_chafe;
    let burst = sh.fusion_burst;

    /* ------------------------------------------------------------------ Sigrika, 3.2 */

    let a = e.action(ADef {
        name: "Echo - Nameless Explorer".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: AERO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 273.6,
        energy: 3.8,
        ..Default::default()
    });
    lib.put_a("ACTION_NAMELESS_EXPLORER", a);
    let g = e.mainslot(GDef { name: "Nameless Explorer".into(), stats: vec![(s::DMG_BONUS, 12.0, AERO), (s::DMG_BONUS, 20.0, T_ECHO)], ..Default::default() }, a);
    lib.put("NAMELESS_EXPLORER", g);

    // Sound of True Name: dealing Echo Skill DMG grants Echo Crit Rate and Aero DMG Bonus for 5s
    let two = e.sonata2pc(GDef { name: "Sound of True Name 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, AERO)], ..Default::default() });
    lib.put("SOUND_OF_TRUE_NAME_2PC", two);
    let b = e.buff(GDef { duration: 60.0 * 5.0, stats: vec![(s::CRIT_RATE, 20.0, T_ECHO), (s::DMG_BONUS, 15.0, AERO)], ..buff("Sound of True Name 5pc") });
    lib.put("SOUND_OF_TRUE_NAME_BUFF", b);
    let five = e.sonata(GDef { name: "Sound of True Name 5pc".into(), grants: vec![Grant { on_hit: true, ..grant(on_type(&[T_ECHO]), b, To::Me) }], ..Default::default() }, two);
    lib.put("SOUND_OF_TRUE_NAME_5PC", five);

    /* ------------------------------------------------------------------ Lynae, 3.6 */

    // Hyvatia: ten lasers, and an Outro within 15s of the summon hands off +10% DMG Bonus
    let hyvatia_handoff = e.handoff("Hyvatia: Outro", Rc::new(|e: &mut Eng| e.add_stat(s::DMG_BONUS, 10.0, 0)), 15.0);
    let a = e.action(ADef {
        name: "Echo - Hyvatia".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: SPECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 27.36 * 10.0,
        energy: 0.03 * 10.0,
        update_buffs: h(move |e| e.queue_outro(hyvatia_handoff)),
        ..Default::default()
    });
    lib.put_a("ACTION_HYVATIA", a);
    lib.put("HYVATIA_HANDOFF", hyvatia_handoff);
    let g = e.mainslot(GDef { name: "Hyvatia".into(), ..Default::default() }, a);
    lib.put("HYVATIA", g);

    /* ------------------------------------------------------------------ Mornye, 3.6 */

    // Reactor Husk: one heavy slash, and +10% Energy Regen for whoever wears it
    let a = e.action(ADef {
        name: "Echo - Reactor Husk".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 351.0, energy: 4.87, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: FUSION,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_REACTOR_HUSK", a);
    let g = e.mainslot(GDef { name: "Reactor Husk".into(), stats: vec![(s::ER, 10.0, 0)], ..Default::default() }, a);
    lib.put("REACTOR_HUSK", g);

    // Spacetrek Explorer: a team shield and no damage of its own
    let a = e.action(ADef {
        name: "Echo - Spacetrek Explorer".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: FUSION,
        scaling: Scaling::Atk,
        update_debuffs: h(move |e| sh.gain_shield(e)),
        ..Default::default()
    });
    lib.put_a("ACTION_SPACETREK", a);
    let g = e.mainslot(GDef { name: "Spacetrek Explorer".into(), ..Default::default() }, a);
    lib.put("SPACETREK_EXPLORER", g);

    /* ------------------------------------------------------------------ Hiyuki, 3.6 */

    let a = e.action(ADef {
        name: "Echo - Reminiscence: Voidborne Construct".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: GLACIO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 21.88 * 5.0 + 164.16,
        energy: 0.12 * 5.0 + 1.36,
        ..Default::default()
    });
    lib.put_a("ACTION_VOIDBORNE_CONSTRUCT", a);
    let g = e.mainslot(GDef { name: "Reminiscence: Threnodian - Voidborne".into(), stats: vec![(s::DMG_BONUS, 12.0, GLACIO), (s::DMG_BONUS, 12.0, T_LIBERATION)], ..Default::default() }, a);
    lib.put("VOIDBORNE_CONSTRUCT", g);

    // Glommoth: an Outro within 15s of the summon hands off +12% Glacio DMG Bonus
    let glommoth_handoff = e.handoff("Glommoth: Outro", Rc::new(|e: &mut Eng| e.add_stat(s::DMG_BONUS, 12.0, GLACIO)), 15.0);
    let a = e.action(ADef {
        name: "Echo - Glommoth".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: GLACIO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 273.6,
        energy: 3.8,
        update_buffs: h(move |e| e.queue_outro(glommoth_handoff)),
        ..Default::default()
    });
    lib.put_a("ACTION_GLOMMOTH", a);
    lib.put("GLOMMOTH_HANDOFF", glommoth_handoff);
    let g = e.mainslot(GDef { name: "Glommoth".into(), ..Default::default() }, a);
    lib.put("GLOMMOTH", g);

    // Wishes of Quiet Snowfall: Glacio Chafe grants +10% Glacio and, once every 25s, Snowfall,
    // spent on a Liberation hit (Crit Rate) or an Outro (the incoming resonator's Glacio DMG)
    let two = e.sonata2pc(GDef { name: "Wishes of Quiet Snowfall 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, GLACIO)], ..Default::default() });
    lib.put("QUIET_SNOWFALL_2PC", two);
    let cooldown = e.reserve("Wishes of Quiet Snowfall 5pc: Snowfall Cooldown");
    let glacio = e.reserve("Wishes of Quiet Snowfall 5pc (chafe)");
    let snowfall = e.reserve("Wishes of Quiet Snowfall 5pc: Snowfall");
    let ready = move |e: &mut Eng| !e.is_held(cooldown);
    let five = e.sonata(
        GDef {
            name: "Wishes of Quiet Snowfall 5pc".into(),
            grants: vec![
                grant(on_inflict(&[chafe]), glacio, To::Me),
                // Snowfall once every 25s: the cooldown marker goes up with it
                grant(both(vec![on_inflict(&[chafe]), when(ready)]), snowfall, To::Me),
                grant(both(vec![on_inflict(&[chafe]), when(ready)]), cooldown, To::Me),
            ],
            ..Default::default()
        },
        two,
    );
    lib.put("QUIET_SNOWFALL_5PC", five);
    e.define_buff(cooldown, GDef { duration: 60.0 * 25.0, hidden: true, ..buff("Wishes of Quiet Snowfall 5pc: Snowfall Cooldown") });
    e.define_buff(glacio, GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 10.0, GLACIO)], ..buff("Wishes of Quiet Snowfall 5pc (chafe)") });
    lib.put("QUIET_SNOWFALL_GLACIO", glacio);
    let crit = e.reserve("Wishes of Quiet Snowfall 5pc (liberation)");
    let extends = e.reserve("Wishes of Quiet Snowfall 5pc: Extensions");
    let gap = e.reserve("Wishes of Quiet Snowfall 5pc: Extension Cooldown");
    let snowfall_outro = e.handoff("Wishes of Quiet Snowfall 5pc (outro)", Rc::new(|e: &mut Eng| e.add_stat(s::DMG_BONUS, 25.0, GLACIO)), 15.0);
    // the marker itself carries no stat: it is only ever what one of the two branches spends
    e.define_buff(
        snowfall,
        GDef {
            duration: 60.0 * 15.0,
            update_buffs: h(move |e| {
                if e.casting(Cast::Outro) {
                    e.revoke_current(snowfall);
                    e.queue_outro(snowfall_outro);
                }
            }),
            after_hit: h(move |e| {
                if e.is_type(T_LIBERATION) {
                    e.revoke_current(snowfall);
                    e.revoke_current(extends);
                    e.apply_current(crit, 1.0);
                }
            }),
            ..buff("Wishes of Quiet Snowfall 5pc: Snowfall")
        },
    );
    lib.put("SNOWFALL", snowfall);
    // 6s of Crit Rate; Liberation DMG while it is up adds 4s, once every 0.5s, 6 times
    e.define_buff(
        crit,
        GDef {
            duration: 60.0 * 6.0,
            stats: vec![(s::CRIT_RATE, 25.0, 0)],
            after_hit: h(move |e| {
                if !e.is_type(T_LIBERATION) {
                    return;
                }
                if e.is_held(gap) || e.stacks_of(extends) >= 6.0 {
                    return;
                }
                e.extend_current(crit, 60.0 * 4.0);
                e.apply_current(extends, 1.0);
                e.apply_current(gap, 1.0);
            }),
            ..buff("Wishes of Quiet Snowfall 5pc (liberation)")
        },
    );
    lib.put("SNOWFALL_CRIT", crit);
    e.define_buff(extends, GDef { max_stacks: 6.0, hidden: true, ..buff("Wishes of Quiet Snowfall 5pc: Extensions") });
    e.define_buff(gap, GDef { duration: 30.0, hidden: true, ..buff("Wishes of Quiet Snowfall 5pc: Extension Cooldown") });
    lib.put("SNOWFALL_OUTRO", snowfall_outro);

    /* ------------------------------------------------------------------ 3.5-3.6 sonatas */

    // Pact of Neonlight Leap: the incoming resonator's +15% ATK, plus 0.3% per point of their TBB
    let two = e.sonata2pc(GDef { name: "Pact of Neonlight Leap 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, SPECTRO)], ..Default::default() });
    lib.put("NEONLIGHT_LEAP_2PC", two);
    let neon = e.reserve("Pact of Neonlight Leap 5pc (outro)");
    let five = e.sonata(GDef { name: "Pact of Neonlight Leap 5pc".into(), grants: vec![grant(on_cast(&[Cast::Outro]), neon, To::Next)], ..Default::default() }, two);
    lib.put("NEONLIGHT_LEAP_5PC", five);
    e.define_buff(
        neon,
        GDef {
            lost_on_swap: true,
            duration: 60.0 * 15.0,
            stats: vec![(s::BONUS_ATK, 15.0, 0)],
            // the TBB half is read late, so every contribution has landed this action
            late_convert: h(|e| {
                let v = 15f64.min(0.3 * e.get_stat(s::TBB));
                e.add_stat(s::BONUS_ATK, v, 0);
            }),
            ..buff("Pact of Neonlight Leap 5pc (outro)")
        },
    );
    lib.put("NEONLIGHT_LEAP_HANDOFF", neon);

    // Halo of Starry Radiance: healing a teammate grants the team ATK off the healer's buildup rate
    let two = e.sonata2pc(GDef { name: "Halo of Starry Radiance 2pc".into(), stats: vec![(s::HEALING_BONUS, 10.0, 0)], ..Default::default() });
    lib.put("STARRY_RADIANCE_2PC", two);
    let team = e.reserve("Halo of Starry Radiance 5pc");
    let five = e.sonata(GDef { name: "Halo of Starry Radiance 5pc".into(), grants: vec![grant(on_applied(&[heals]), team, To::Team)], ..Default::default() }, two);
    lib.put("STARRY_RADIANCE_5PC", five);
    e.define_buff(
        team,
        GDef {
            duration: 60.0 * 4.0,
            convert_stats: h(|e| {
                let v = 25f64.min(0.2 * e.get_stat(s::OFFTUNE_BUILDUP));
                e.add_stat(s::BONUS_ATK, v, 0);
            }),
            ..buff("Halo of Starry Radiance 5pc")
        },
    );
    lib.put("STARRY_RADIANCE_TEAM", team);

    // Chromatic Foam: Fusion Burst grants +10% Fusion; an Outro while up hands off +25% Fusion
    let two = e.sonata2pc(GDef { name: "Chromatic Foam 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, FUSION)], ..Default::default() });
    lib.put("CHROMATIC_FOAM_2PC", two);
    let foam = e.reserve("Chromatic Foam 5pc");
    let five = e.sonata(GDef { name: "Chromatic Foam 5pc".into(), grants: vec![grant(on_inflict(&[burst]), foam, To::Me)], ..Default::default() }, two);
    lib.put("CHROMATIC_FOAM_5PC", five);
    let foam_handoff = e.reserve("Chromatic Foam 5pc (outro)");
    e.define_buff(
        foam,
        GDef {
            duration: 60.0 * 15.0,
            stats: vec![(s::DMG_BONUS, 10.0, FUSION)],
            grants: vec![grant(on_cast(&[Cast::Outro]), foam_handoff, To::Next)],
            ..buff("Chromatic Foam 5pc")
        },
    );
    lib.put("CHROMATIC_FOAM_BUFF", foam);
    // the receiver's half: the text's plain 15s, with no end on switching out
    e.define_buff(foam_handoff, GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 25.0, FUSION)], ..buff("Chromatic Foam 5pc (outro)") });
    lib.put("CHROMATIC_FOAM_HANDOFF", foam_handoff);

    // Trailblazing Star: Fusion Burst or Tune Rupture - Shifting grants Crit Rate and Fusion DMG
    let two = e.sonata2pc(GDef { name: "Trailblazing Star 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, FUSION)], ..Default::default() });
    lib.put("TRAILBLAZING_STAR_2PC", two);
    let star = e.reserve("Trailblazing Star 5pc");
    let five = e.sonata(GDef { name: "Trailblazing Star 5pc".into(), grants: vec![grant(on_inflict(&[burst, sh.rupture_shifting]), star, To::Me)], ..Default::default() }, two);
    lib.put("TRAILBLAZING_STAR_5PC", five);
    e.define_buff(star, GDef { duration: 60.0 * 8.0, stats: vec![(s::CRIT_RATE, 20.0, 0), (s::DMG_BONUS, 20.0, FUSION)], ..buff("Trailblazing Star 5pc") });
    lib.put("TRAILBLAZING_STAR_BUFF", star);

    // Rite of Gilded Revelation: Basic Attack hits stack Spectro DMG; at 3, a Liberation's +40% Basic
    let two = e.sonata2pc(GDef { name: "Rite of Gilded Revelation 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, SPECTRO)], ..Default::default() });
    lib.put("GILDED_REVELATION_2PC", two);
    let gilded = e.reserve("Rite of Gilded Revelation 5pc");
    let five = e.sonata(GDef { name: "Rite of Gilded Revelation 5pc".into(), grants: vec![Grant { on_hit: true, ..grant(on_type(&[T_BASIC]), gilded, To::Me) }], ..Default::default() }, two);
    lib.put("GILDED_REVELATION_5PC", five);
    e.define_buff(
        gilded,
        GDef {
            max_stacks: 3.0,
            duration: 60.0 * 5.0,
            stats: vec![(s::DMG_BONUS, 10.0, SPECTRO)],
            per_stack: true,
            apply_stats: h(|e| {
                if e.frozen_stacks() >= 3.0 && e.casting(Cast::Liberation) {
                    e.add_stat(s::DMG_BONUS, 40.0, T_BASIC);
                }
            }),
            ..buff("Rite of Gilded Revelation 5pc")
        },
    );
    lib.put("GILDED_REVELATION_STACKS", gilded);

    /* ------------------------------------------------------------------ Luuk, 3.6 */

    let a = e.action(ADef {
        name: "Echo - Twin Nova: Nebulous Cannon".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 80.51 * 2.0, energy: 0.55 * 2.0, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 8.0),
        cast: Cast::Echo,
        element: SPECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_NEBULOUS_CANNON", a);
    let g = e.mainslot(GDef { name: "Twin Nova: Nebulous Cannon".into(), stats: vec![(s::DMG_BONUS, 12.0, SPECTRO), (s::DMG_BONUS, 12.0, T_BASIC)], ..Default::default() }, a);
    lib.put("NEBULOUS_CANNON", g);

    /* ------------------------------------------------------------------ Denia, 3.6 */

    // Trickster: an Outro within 15s of the summon hands off +12% Fusion, the plain 15s
    let trickster_handoff = e.reserve("Trickster: Outro");
    let a = e.action(ADef {
        name: "Echo - Trickster".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: FUSION,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 273.6,
        energy: 3.8,
        update_buffs: h(move |e| e.queue_outro(trickster_handoff)),
        ..Default::default()
    });
    lib.put_a("ACTION_TRICKSTER", a);
    e.define_buff(trickster_handoff, GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 12.0, FUSION)], ..buff("Trickster: Outro") });
    lib.put("TRICKSTER_HANDOFF", trickster_handoff);
    let g = e.mainslot(GDef { name: "Reminiscence: Denia".into(), ..Default::default() }, a);
    lib.put("TRICKSTER", g);

    // Voidwing Moth: the tap, and an Outro within 15s hands off +12% ATK
    let voidwing_handoff = e.handoff("Voidwing Moth: Outro", Rc::new(|e: &mut Eng| e.add_stat(s::BONUS_ATK, 12.0, 0)), 15.0);
    let a = e.action(ADef {
        name: "Echo - Voidwing Moth".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 405.0, energy: 5.62, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 25.0),
        cast: Cast::Echo,
        element: SPECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        update_buffs: h(move |e| e.queue_outro(voidwing_handoff)),
        ..Default::default()
    });
    lib.put_a("ACTION_VOIDWING_MOTH", a);
    lib.put("VOIDWING_HANDOFF", voidwing_handoff);
    let g = e.mainslot(GDef { name: "Voidwing Moth".into(), ..Default::default() }, a);
    lib.put("VOIDWING_MOTH", g);

    // Reel of Spliced Memories: Tune Rupture/Strain - Shifting grants the team +20 Tune Break Boost
    let two = e.sonata2pc(GDef { name: "Reel of Spliced Memories 2pc".into(), stats: vec![(s::BONUS_ATK, 10.0, 0)], ..Default::default() });
    lib.put("REEL_2PC", two);
    let reel = e.reserve("Reel of Spliced Memories 5pc");
    let five = e.sonata(
        GDef { name: "Reel of Spliced Memories 5pc".into(), grants: vec![grant(on_inflict(&[sh.rupture_shifting, sh.strain_shifting]), reel, To::Team)], ..Default::default() },
        two,
    );
    lib.put("REEL_5PC", five);
    e.define_buff(reel, GDef { duration: 60.0 * 30.0, stats: vec![(s::TBB, 20.0, 0)], ..buff("Reel of Spliced Memories 5pc") });
    lib.put("REEL_TEAM", reel);

    /* ------------------------------------------------------------------ Rebecca and Lucy, the collab */

    // Shadow of Shattered Dreams: a one-piece set, paid off inflicting Hack - Shifting
    let dreams = e.buff(GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 35.0, T_BASIC), (s::DMG_BONUS, 35.0, T_HEAVY)], ..buff("Shadow of Shattered Dreams") });
    lib.put("SHATTERED_DREAMS", dreams);
    let one = e.sonata1pc(GDef { name: "Shadow of Shattered Dreams 1pc".into(), grants: vec![grant(on_inflict(&[sh.hack_shifting]), dreams, To::Me)], ..Default::default() });
    lib.put("SHATTERED_DREAMS_1PC", one);

    // Nightmare: Adam Smasher, one special cast each for Lucy and Rebecca
    let a = e.action(ADef {
        name: "Echo - Adam Smasher".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: SPECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 273.6,
        energy: 3.8,
        ..Default::default()
    });
    lib.put_a("ACTION_ADAM_SMASHER_LUCY", a);
    let g = e.mainslot(GDef { name: "Nightmare: Adam Smasher".into(), stats: vec![(s::CRIT_RATE, 15.0, 0)], ..Default::default() }, a);
    lib.put("ADAM_SMASHER_LUCY", g);
    let a = e.action(ADef {
        name: "Echo - Adam Smasher".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: ELECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 17.1 * 16.0,
        energy: 0.23 * 16.0,
        ..Default::default()
    });
    lib.put_a("ACTION_ADAM_SMASHER_REBECCA", a);
    let g = e.mainslot(GDef { name: "Nightmare: Adam Smasher".into(), stats: vec![(s::CRIT_RATE, 15.0, 0)], ..Default::default() }, a);
    lib.put("ADAM_SMASHER_REBECCA", g);

    /* ------------------------------------------------------------------ Aemeath, 3.6 */

    let a = e.action(ADef {
        name: "Echo - Sigillum".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: FUSION,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 68.4 + 205.2,
        energy: 0.23 + 2.13,
        ..Default::default()
    });
    lib.put_a("ACTION_SIGILLUM", a);
    // "when equipped in the main slot by Aemeath": the bonus reads its wearer
    let g = e.mainslot(
        GDef {
            name: "Sigillum".into(),
            constant_fn: h(|e| {
                if e.members[e.slot].resonator.map_or(false, |r| e.gears[r as usize].name == "Aemeath") {
                    e.add_stat(s::DMG_BONUS, 25.0, T_LIBERATION);
                }
            }),
            ..Default::default()
        },
        a,
    );
    lib.put("SIGILLUM", g);
}

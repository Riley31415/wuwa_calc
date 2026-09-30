//! src/echoes/jinzhou.ts: mainslot echoes and sonatas from Jinzhou (versions 1.0-1.4).
use crate::authoring::Coord;
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;
use std::rc::Rc;

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    let sh = *sh;
    let heals = sh.heals;

    /* ------------------------------------------------------------------ generic, unowned */

    // Bell-Borne Geochelone: its cast puts the team's Bell-Borne Shield up for 15s
    let shield = e.reserve("Bell-Borne Geochelone: Bell-Borne Shield");
    let a = e.action(ADef {
        name: "Echo - Bell-Borne Geochelone".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        anim: 5.0,
        cast: Cast::Echo,
        element: GLACIO,
        scaling: Scaling::Def,
        typ: T_ECHO,
        mv: 145.92,
        energy: 4.55,
        update_buffs: h(move |e| {
            e.apply_team(shield, 1.0);
        }),
        ..Default::default()
    });
    lib.put_a("ACTION_BELL_BORNE", a);
    let g = e.mainslot(GDef { name: "Bell-Borne Geochelone".into(), ..Default::default() }, a);
    lib.put("BELL_BORNE_GEOCHELONE", g);
    e.define_buff(shield, GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 10.0, 0)], ..buff("Bell-Borne Geochelone: Bell-Borne Shield") });
    lib.put("BELL_BORNE_SHIELD", shield);

    // Impermanence Heron: its cast primes an Outro handoff of +12% DMG Bonus
    let heron_handoff = e.handoff("Impermanence Heron: Outro", Rc::new(|e: &mut Eng| e.add_stat(s::DMG_BONUS, 12.0, 0)), 15.0);
    let a = e.action(ADef {
        name: "Echo - Impermanence Heron".into(),
        // 4.85 off the hit itself, plus the flat 10 its own skill text hands back
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 310.56, energy: 4.85 + 10.0, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: HAVOC,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        update_buffs: h(move |e| e.queue_outro(heron_handoff)),
        ..Default::default()
    });
    lib.put_a("ACTION_HERON", a);
    let g = e.mainslot(GDef { name: "Impermanence Heron".into(), ..Default::default() }, a);
    lib.put("HERON", g);
    lib.put("HERON_HANDOFF", heron_handoff);

    // Stonewall Bracer: a Physical transform, and a shield off the wearer's own Max HP
    let a = e.action(ADef {
        name: "Echo - Stonewall Bracer".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 281.60, energy: 4.40, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 15.0),
        cast: Cast::Echo,
        element: PHYSICAL,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        update_debuffs: h(move |e| sh.gain_shield(e)),
        ..Default::default()
    });
    lib.put_a("ACTION_STONEWALL_BRACER", a);
    let g = e.mainslot(GDef { name: "Stonewall Bracer".into(), ..Default::default() }, a);
    lib.put("STONEWALL_BRACER", g);

    // Moonlit Clouds: +10% ER, and on Outro the incoming resonator's +22.5% ATK
    let two = e.sonata2pc(GDef { name: "Moonlit Clouds 2pc".into(), stats: vec![(s::ER, 10.0, 0)], ..Default::default() });
    lib.put("MOONLIT_CLOUDS_2PC", two);
    let moonlit_handoff = e.handoff("Moonlit Clouds 5pc (outro)", Rc::new(|e: &mut Eng| e.add_stat(s::BONUS_ATK, 22.5, 0)), 15.0);
    let five = e.sonata(GDef { name: "Moonlit Clouds 5pc".into(), grants: vec![grant(on_cast(&[Cast::Outro]), moonlit_handoff, To::Next)], ..Default::default() }, two);
    lib.put("MOONLIT_CLOUDS_5PC", five);
    lib.put("MOONLIT_CLOUDS_HANDOFF", moonlit_handoff);

    // Rejuvenating Glow: healing an ally grants the team +15% ATK
    let two = e.sonata2pc(GDef { name: "Rejuvenating Glow 2pc".into(), stats: vec![(s::HEALING_BONUS, 10.0, 0)], ..Default::default() });
    lib.put("REJUV_2PC", two);
    let team = e.reserve("Rejuvenating Glow 5pc");
    let five = e.sonata(GDef { name: "Rejuvenating Glow 5pc".into(), grants: vec![grant(on_applied(&[heals]), team, To::Team)], ..Default::default() }, two);
    lib.put("REJUV_5PC", five);
    e.define_buff(team, GDef { duration: 60.0 * 30.0, stats: vec![(s::BONUS_ATK, 15.0, 0)], ..buff("Rejuvenating Glow 5pc") });
    lib.put("REJUV_TEAM", team);

    /* ------------------------------------------------------------------ Changli, 1.1 */

    let two = e.sonata2pc(GDef { name: "Molten Rift 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, FUSION)], ..Default::default() });
    lib.put("MOLTEN_RIFT_2PC", two);
    let rift = e.reserve("Molten Rift 5pc");
    let five = e.sonata(GDef { name: "Molten Rift 5pc".into(), grants: vec![grant(on_cast(&[Cast::Skill]), rift, To::Me)], ..Default::default() }, two);
    lib.put("MOLTEN_RIFT_5PC", five);
    e.define_buff(rift, GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 30.0, FUSION)], ..buff("Molten Rift 5pc") });
    lib.put("MOLTEN_RIFT_BUFF", rift);

    let a = e.action(ADef {
        name: "Echo - Nightmare: Inferno Rider".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 405.0, energy: 5.62, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 25.0),
        cast: Cast::Echo,
        element: FUSION,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_NM_INFERNO_RIDER", a);
    let g = e.mainslot(GDef { name: "Nightmare: Inferno Rider".into(), stats: vec![(s::DMG_BONUS, 12.0, FUSION), (s::DMG_BONUS, 12.0, T_SKILL)], ..Default::default() }, a);
    lib.put("NM_INFERNO_RIDER", g);

    /* ------------------------------------------------------------------ Encore, 1.0 */

    // Inferno Rider: the cast grants a +12%/+12% Fusion/Basic Attack window
    let window = e.reserve("Inferno Rider");
    let a = e.action(ADef {
        name: "Echo - Inferno Rider".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 242.4 + 282.8 * 2.0, energy: 3.78 + 4.41 * 2.0, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: FUSION,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        after_action: h(move |e| {
            e.apply_current(window, 1.0);
        }),
        ..Default::default()
    });
    lib.put_a("ACTION_INFERNO_RIDER", a);
    e.define_buff(window, GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 12.0, FUSION), (s::DMG_BONUS, 12.0, T_BASIC)], ..buff("Inferno Rider") });
    lib.put("INFERNO_RIDER_WINDOW", window);
    let g = e.mainslot(GDef { name: "Inferno Rider".into(), ..Default::default() }, a);
    lib.put("INFERNO_RIDER", g);

    /* ------------------------------------------------------------------ Camellya 1.4 / Rover 1.0 */

    let cd = e.new_cooldown(60.0 * 12.0);
    e.cds[cd as usize].charges = 3.0;
    let a = e.action(ADef {
        name: "Echo - Nightmare: Crownless".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 264.6, energy: 3.67, ..Default::default() }],
        cooldown: CdSpec::Shared(cd),
        cast: Cast::Echo,
        element: HAVOC,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_NM_CROWNLESS", a);
    let g = e.mainslot(GDef { name: "Nightmare: Crownless".into(), stats: vec![(s::DMG_BONUS, 12.0, HAVOC), (s::DMG_BONUS, 12.0, T_BASIC)], ..Default::default() }, a);
    lib.put("NM_CROWNLESS", g);

    // Crownless: the transform grants the +12%/+12% Havoc/Resonance Skill window
    let window = e.reserve("Crownless");
    let a = e.action(ADef {
        name: "Echo - Crownless".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 134.08, energy: 2.09, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: HAVOC,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        update_buffs: h(move |e| {
            e.apply_current(window, 1.0);
        }),
        ..Default::default()
    });
    lib.put_a("ACTION_CROWNLESS", a);
    e.define_buff(window, GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 12.0, HAVOC), (s::DMG_BONUS, 12.0, T_SKILL)], ..buff("Crownless") });
    lib.put("CROWNLESS_WINDOW", window);
    let g = e.mainslot(GDef { name: "Crownless".into(), ..Default::default() }, a);
    lib.put("CROWNLESS", g);

    // Havoc Eclipse: +7.5% Havoc DMG Bonus a stack off Basic/Heavy hits, up to 4
    let two = e.sonata2pc(GDef { name: "Havoc Eclipse 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, HAVOC)], ..Default::default() });
    lib.put("HAVOC_ECLIPSE_2PC", two);
    let stacks = e.reserve("Havoc Eclipse 5pc");
    let five = e.sonata(GDef { name: "Havoc Eclipse 5pc".into(), grants: vec![Grant { on_hit: true, ..grant(on_type(&[T_BASIC, T_HEAVY]), stacks, To::Me) }], ..Default::default() }, two);
    lib.put("HAVOC_ECLIPSE_5PC", five);
    e.define_buff(stacks, GDef { max_stacks: 4.0, duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 7.5, HAVOC)], per_stack: true, ..buff("Havoc Eclipse 5pc") });
    lib.put("HAVOC_ECLIPSE_STACKS", stacks);

    /* ------------------------------------------------------------------ old Jinzhou sonatas */

    // Lampylumen Myriad: its hits stack +4% Glacio / +4% Resonance Skill DMG Bonus, up to 3
    let lamp = e.reserve("Lampylumen Myriad");
    let a = e.action(ADef {
        name: "Echo - Lampylumen Myriad".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 667.20, energy: 3.12 * 2.0 + 4.17, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: GLACIO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        update_debuffs: h(move |e| {
            e.apply_current(lamp, 3.0);
        }),
        ..Default::default()
    });
    lib.put_a("ACTION_LAMPYLUMEN_MYRIAD", a);
    e.define_buff(lamp, GDef { max_stacks: 3.0, duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 4.0, GLACIO), (s::DMG_BONUS, 4.0, T_SKILL)], per_stack: true, ..buff("Lampylumen Myriad") });
    lib.put("LAMPYLUMEN_MYRIAD_STACKS", lamp);
    let g = e.mainslot(GDef { name: "Lampylumen Myriad".into(), ..Default::default() }, a);
    lib.put("LAMPYLUMEN_MYRIAD", g);

    // Freezing Frost: +10% Glacio DMG Bonus a stack off Basic/Heavy hits, up to 3
    let two = e.sonata2pc(GDef { name: "Freezing Frost 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, GLACIO)], ..Default::default() });
    lib.put("FREEZING_FROST_2PC", two);
    let stacks = e.reserve("Freezing Frost 5pc");
    let five = e.sonata(GDef { name: "Freezing Frost 5pc".into(), grants: vec![Grant { on_hit: true, ..grant(on_type(&[T_BASIC, T_HEAVY]), stacks, To::Me) }], ..Default::default() }, two);
    lib.put("FREEZING_FROST_5PC", five);
    e.define_buff(stacks, GDef { max_stacks: 3.0, duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 10.0, GLACIO)], per_stack: true, ..buff("Freezing Frost 5pc") });
    lib.put("FREEZING_FROST_STACKS", stacks);

    let a = e.action(ADef {
        name: "Echo - Nightmare: Feilian Beringal".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: AERO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 273.56,
        energy: 2.28 + 0.3 * 5.0,
        ..Default::default()
    });
    lib.put_a("ACTION_NM_FEILIAN_BERINGAL", a);
    let g = e.mainslot(GDef { name: "Nightmare: Feilian Beringal".into(), stats: vec![(s::DMG_BONUS, 12.0, AERO), (s::DMG_BONUS, 12.0, T_HEAVY)], ..Default::default() }, a);
    lib.put("NM_FEILIAN_BERINGAL", g);

    // Sierra Gale: +30% Aero DMG Bonus for 15s after Intro Skill
    let two = e.sonata2pc(GDef { name: "Sierra Gale 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, AERO)], ..Default::default() });
    lib.put("SIERRA_GALE_2PC", two);
    let intro = e.reserve("Sierra Gale 5pc");
    let five = e.sonata(GDef { name: "Sierra Gale 5pc".into(), grants: vec![grant(on_cast(&[Cast::Intro]), intro, To::Me)], ..Default::default() }, two);
    lib.put("SIERRA_GALE_5PC", five);
    e.define_buff(intro, GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 30.0, AERO)], ..buff("Sierra Gale 5pc") });
    lib.put("SIERRA_GALE_INTRO", intro);

    // Jué: Blessing of Time, a self-held coordinated countdown of 16% Resonance Skill ticks
    let field = e.new_field("Jué: Blessing of Time");
    // no energy: the tick has a damage row of its own and it pays nothing
    let tick = e.action(ADef { name: "Echo - Jué: Blessing of Time".into(), element: SPECTRO, scaling: Scaling::Atk, typ: T_SKILL, mv: 16.0, field: field, ..Default::default() });
    let blessing = e.coordinated("Jué: Blessing of Time", 15.0, NO_GEAR, Ok(tick), Coord { apply_stats: h(|e| e.add_stat(s::DMG_BONUS, 16.0, T_SKILL)), ..Default::default() });
    let a = e.action(ADef {
        name: "Echo - Jué".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: SPECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 48.64 * 3.0 + 19.46 * 5.0,
        energy: 0.76 * 3.0 + 0.3 * 5.0,
        update_buffs: h(move |e| {
            e.apply_current(blessing, 15.0);
        }),
        ..Default::default()
    });
    lib.put_a("ACTION_JUE", a);
    lib.put_a("ACTION_JUE_TICK", tick);
    lib.put("JUE_BLESSING", blessing);
    let g = e.mainslot(GDef { name: "Jué".into(), ..Default::default() }, a);
    lib.put("JUE", g);

    // Celestial Light: +30% Spectro DMG Bonus for 15s after Intro Skill
    let two = e.sonata2pc(GDef { name: "Celestial Light 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, SPECTRO)], ..Default::default() });
    lib.put("CELESTIAL_LIGHT_2PC", two);
    let intro = e.reserve("Celestial Light 5pc");
    let five = e.sonata(GDef { name: "Celestial Light 5pc".into(), grants: vec![grant(on_cast(&[Cast::Intro]), intro, To::Me)], ..Default::default() }, two);
    lib.put("CELESTIAL_LIGHT_5PC", five);
    e.define_buff(intro, GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 30.0, SPECTRO)], ..buff("Celestial Light 5pc") });
    lib.put("CELESTIAL_LIGHT_INTRO", intro);

    // Mech Abomination: the strike grants +12% ATK and summons Mech Waste (Outro Skill DMG)
    let atk = e.reserve("Mech Abomination");
    let waste = e.action(ADef { name: "Echo - Mech Abomination: Mech Waste".into(), cast: Cast::Echo, element: ELECTRO, scaling: Scaling::Atk, typ: T_OUTRO, mv: 480.0, energy: 1.52, ..Default::default() });
    let a = e.action(ADef {
        name: "Echo - Mech Abomination".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 48.64, energy: 0.76, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: ELECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        // the strike's: on the hit, so Mech Waste lands after it
        update_debuffs: h(move |e| {
            e.apply_current(atk, 1.0);
            e.queue(waste);
        }),
        ..Default::default()
    });
    lib.put_a("ACTION_MECH_ABOMINATION", a);
    lib.put_a("ACTION_MECH_WASTE", waste);
    e.define_buff(atk, GDef { duration: 60.0 * 15.0, stats: vec![(s::BONUS_ATK, 12.0, 0)], ..buff("Mech Abomination") });
    lib.put("MECH_ABOMINATION_ATK", atk);
    let g = e.mainslot(GDef { name: "Mech Abomination".into(), ..Default::default() }, a);
    lib.put("MECH_ABOMINATION", g);

    // Lingering Tunes: +60% Outro DMG, and +5% ATK every 1.5s on field, up to 4 stacks
    let two = e.sonata2pc(GDef { name: "Lingering Tunes 2pc".into(), stats: vec![(s::BONUS_ATK, 10.0, 0)], ..Default::default() });
    lib.put("LINGERING_TUNES_2PC", two);
    let clock = e.reserve("Lingering Tunes 5pc");
    let five = e.sonata(
        GDef {
            name: "Lingering Tunes 5pc".into(),
            stats: vec![(s::DMG_BONUS, 60.0, T_OUTRO)],
            // the clock runs on a buff of the wearer's, put up on their first on-field press
            grants: vec![grant(when(|e| e.is_active()), clock, To::Me)],
            ..Default::default()
        },
        two,
    );
    lib.put("LINGERING_TUNES_5PC", five);
    let stacks = e.reserve("Lingering Tunes 5pc");
    e.define_buff(
        clock,
        GDef {
            hidden: true,
            tick_every: TickEvery::Every(90.0),
            tick_fn: ticks(move |e: &mut Eng, _n: f64| {
                e.apply_current(stacks, 1.0);
            }),
            update_buffs: h(|e| e.lost_on_swap()),
            ..buff("Lingering Tunes 5pc")
        },
    );
    e.define_buff(
        stacks,
        GDef {
            max_stacks: 4.0,
            stats: vec![(s::BONUS_ATK, 5.0, 0)],
            per_stack: true,
            update_buffs: h(|e| e.lost_on_swap()),
            display: shown(|e: &mut Eng| format!("Lingering Tunes x{}", e.frozen_stacks())),
            ..buff("Lingering Tunes 5pc")
        },
    );
    lib.put("LINGERING_TUNES_STACKS", stacks);

    let a = e.action(ADef {
        name: "Echo - Nightmare: Thundering Mephis".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 405.0, energy: 5.62, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 25.0),
        cast: Cast::Echo,
        element: ELECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_NM_MEPHIS", a);
    let g = e.mainslot(GDef { name: "Nightmare: Thundering Mephis".into(), stats: vec![(s::DMG_BONUS, 12.0, ELECTRO), (s::DMG_BONUS, 12.0, T_LIBERATION)], ..Default::default() }, a);
    lib.put("NM_MEPHIS", g);

    let a = e.action(ADef {
        name: "Echo - Nightmare: Tempest Mephis".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 405.0, energy: 5.62, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 25.0),
        cast: Cast::Echo,
        element: ELECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_NM_TEMPEST_MEPHIS", a);
    let g = e.mainslot(GDef { name: "Nightmare: Tempest Mephis".into(), stats: vec![(s::DMG_BONUS, 12.0, ELECTRO), (s::DMG_BONUS, 12.0, T_SKILL)], ..Default::default() }, a);
    lib.put("NM_TEMPEST_MEPHIS", g);

    // Void Thunder: +15% Electro DMG Bonus a stack on Heavy Attack or Resonance Skill, up to 2
    let two = e.sonata2pc(GDef { name: "Void Thunder 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, ELECTRO)], ..Default::default() });
    lib.put("VOID_THUNDER_2PC", two);
    let stacks = e.buff(GDef { max_stacks: 2.0, duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 15.0, ELECTRO)], per_stack: true, ..buff("Void Thunder 5pc: Electro") });
    lib.put("VOID_THUNDER_STACKS", stacks);
    let five = e.sonata(GDef { name: "Void Thunder 5pc".into(), grants: vec![grant(on_cast(&[Cast::Heavy, Cast::Skill]), stacks, To::Me)], ..Default::default() }, two);
    lib.put("VOID_THUNDER_5PC", five);

    // Fallacy of No Return: a team +10% ATK, gone when its wearer casts an Intro; +10% ER while up
    let team = e.reserve("Fallacy of No Return");
    let a = e.action(ADef {
        name: "Echo - Fallacy of No Return".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: SPECTRO,
        scaling: Scaling::Hp,
        typ: T_ECHO,
        mv: 15.85,
        energy: 3.04,
        after_action: h(move |e| {
            e.apply_team(team, 1.0);
        }),
        ..Default::default()
    });
    lib.put_a("ACTION_FALLACY", a);
    e.define_buff(team, GDef { duration: 60.0 * 20.0, stats: vec![(s::BONUS_ATK, 10.0, 0)], ..buff("Fallacy of No Return") });
    lib.put("FALLACY_TEAM", team);
    let g = e.mainslot(
        GDef {
            name: "Fallacy of No Return".into(),
            update_buffs: h(move |e| {
                if e.casting(Cast::Intro) {
                    e.revoke_team(team);
                }
            }),
            apply_stats: h(move |e| {
                if e.stacks_of_team(team) != 0.0 {
                    e.add_stat(s::ER, 10.0, 0);
                }
            }),
            ..Default::default()
        },
        a,
    );
    lib.put("FALLACY", g);
}

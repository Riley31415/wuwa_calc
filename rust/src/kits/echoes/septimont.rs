//! src/echoes/septimont.ts: mainslot echoes and sonatas from Septimont (versions 2.5-2.7).
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;
use std::cell::Cell;
use std::rc::Rc;

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    let shield = sh.shield;
    let havoc_bane = sh.havoc_bane;

    /* Phrolova, 2.5 */

    // Dream of the Lost: "holding 0 Resonance Energy" read off the wearer's own maxEnergy
    let g = e.sonata3pc(GDef {
        name: "Dream of the Lost 3pc".into(),
        apply_stats: h(|e| {
            if e.max_energy() != 0.0 {
                return;
            }
            e.add_stat(s::CRIT_RATE, 20.0, 0);
            e.add_stat(s::DMG_BONUS, 35.0, T_ECHO);
        }),
        ..Default::default()
    });
    lib.put("DREAM_OF_THE_LOST_3PC", g);

    /* Augusta, 2.6 */

    // False Sovereign: 2 charges, one back every 8s; Intro also summons it for a bonus hit
    let cd = e.new_cooldown(60.0 * 8.0);
    e.cds[cd as usize].charges = 2.0;
    let a = e.action(ADef {
        name: "Echo - False Sovereign".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 221.4, energy: 3.04, ..Default::default() }],
        cooldown: CdSpec::Shared(cd),
        cast: Cast::Echo,
        element: ELECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_FALSE_SOVEREIGN", a);
    // no energy: the Intro summon has its own damage row and pays none
    let intro = e.action(ADef {
        name: "Echo - False Sovereign (Intro)".into(),
        element: ELECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 405.0,
        ..Default::default()
    });
    lib.put_a("ACTION_FALSE_SOVEREIGN_INTRO", intro);
    let g = e.mainslot(
        GDef {
            name: "False Sovereign".into(),
            update_buffs: h(move |e| {
                if e.casting(Cast::Intro) {
                    e.queue(intro);
                }
            }),
            stats: vec![(s::DMG_BONUS, 12.0, ELECTRO), (s::DMG_BONUS, 12.0, T_HEAVY)],
            ..Default::default()
        },
        a,
    );
    lib.put("FALSE_SOVEREIGN", g);

    // Crown of Valor: a shield stacks ATK / Crit DMG, one stack per shield applied
    let crown = e.buff(GDef {
        max_stacks: 5.0,
        duration: 60.0 * 4.0,
        stats: vec![(s::BONUS_ATK, 6.0, 0), (s::CRIT_DMG, 4.0, 0)],
        per_stack: true,
        ..buff("Crown of Valor")
    });
    lib.put("CROWN_STACKS", crown);
    // `stacks: () => applied(SHIELD)`: a Grant's stacks are fixed, so the trigger grants them itself
    let g = e.sonata3pc(GDef {
        name: "Crown of Valor 3pc".into(),
        grants: vec![grant_count(on_applied(&[shield]), crown, To::Me, move |e| e.applied(shield))],
        ..Default::default()
    });
    lib.put("COV_3PC", g);

    /* Iuno, 2.6 */

    let a = e.action(ADef {
        name: "Echo - Lady of the Sea".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: AERO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 300.96,
        energy: 4.18,
        ..Default::default()
    });
    lib.put_a("ACTION_MYA", a);
    let g = e.mainslot(GDef { name: "Lady of the Sea".into(), stats: vec![(s::DMG_BONUS, 12.0, T_LIBERATION), (s::DMG_BONUS, 12.0, AERO)], ..Default::default() }, a);
    lib.put("MYA", g);

    /* Lupa, 2.4 */

    let a = e.action(ADef {
        name: "Echo - Lioness of Glory".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: FUSION,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 273.6,
        energy: 3.8,
        ..Default::default()
    });
    lib.put_a("ACTION_LIONESS", a);
    let g = e.mainslot(GDef { name: "Lioness of Glory".into(), stats: vec![(s::DMG_BONUS, 12.0, T_LIBERATION), (s::DMG_BONUS, 12.0, FUSION)], ..Default::default() }, a);
    lib.put("LIONESS_OF_GLORY", g);

    // Flaming Clawprint: Liberation grants the team Fusion DMG and the caster Liberation DMG
    let team = e.buff(GDef { duration: 60.0 * 35.0, stats: vec![(s::DMG_BONUS, 15.0, FUSION)], ..buff("Flaming Clawprint 5pc (team)") });
    lib.put("CLAWPRINT_TEAM", team);
    let lib_dmg = e.buff(GDef { duration: 60.0 * 35.0, stats: vec![(s::DMG_BONUS, 20.0, T_LIBERATION)], ..buff("Flaming Clawprint 5pc") });
    lib.put("CLAWPRINT_LIBERATION", lib_dmg);
    let two = e.sonata2pc(GDef { name: "Flaming Clawprint 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, FUSION)], ..Default::default() });
    lib.put("CLAWPRINT_2PC", two);
    let five = e.sonata(
        GDef {
            name: "Flaming Clawprint 5pc".into(),
            grants: vec![grant(on_cast(&[Cast::Liberation]), team, To::Team), grant(on_cast(&[Cast::Liberation]), lib_dmg, To::Me)],
            ..Default::default()
        },
        two,
    );
    lib.put("CLAWPRINT_5PC", five);

    /* Galbrena, 2.7 */

    let a = e.action(ADef {
        name: "Echo - Corrosaurus".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: FUSION,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 273.6,
        energy: 3.8,
        ..Default::default()
    });
    lib.put_a("ACTION_CORROSAURUS", a);
    let g = e.mainslot(GDef { name: "Corrosaurus".into(), stats: vec![(s::DMG_BONUS, 12.0, FUSION), (s::DMG_BONUS, 20.0, T_ECHO)], ..Default::default() }, a);
    lib.put("CORROSAURUS", g);

    // Flamewing's Shadow: Echo and Heavy hits cross-grant crit; with both up, Fusion DMG
    let echo = e.buff(GDef { duration: 60.0 * 6.0, stats: vec![(s::CRIT_RATE, 20.0, T_HEAVY)], ..buff("Flamewing's Shadow 3pc (echo)") });
    lib.put("FLAMEWING_SHADOW_ECHO", echo);
    let heavy = e.buff(GDef { duration: 60.0 * 6.0, stats: vec![(s::CRIT_RATE, 20.0, T_ECHO)], ..buff("Flamewing's Shadow 3pc (heavy)") });
    lib.put("FLAMEWING_SHADOW_HEAVY", heavy);
    let g = e.sonata3pc(GDef {
        name: "Flamewing's Shadow 3pc".into(),
        grants: vec![hit_grant(on_type(&[T_ECHO]), echo, To::Me), hit_grant(on_type(&[T_HEAVY]), heavy, To::Me)],
        apply_stats: h(move |e| {
            if e.stacks_of(echo) != 0.0 && e.stacks_of(heavy) != 0.0 {
                e.add_stat(s::DMG_BONUS, 16.0, FUSION);
            }
        }),
        ..Default::default()
    });
    lib.put("FLAMEWING_SHADOW_3PC", g);

    /* Qiuyuan, 2.7 */

    let a = e.action(ADef {
        name: "Echo - Reminiscence: Fenrico".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: AERO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 273.6,
        energy: 3.8,
        ..Default::default()
    });
    lib.put_a("ACTION_FENRICO", a);
    let g = e.mainslot(GDef { name: "Reminiscence: Fenrico".into(), stats: vec![(s::DMG_BONUS, 12.0, AERO), (s::DMG_BONUS, 12.0, T_HEAVY)], ..Default::default() }, a);
    lib.put("FENRICO", g);

    // Law of Harmony: Echo Skill grants the caster Heavy DMG and the team a stacking Echo DMG
    let own = e.buff(GDef { duration: 60.0 * 4.0, stats: vec![(s::DMG_BONUS, 30.0, T_HEAVY)], ..buff("Law of Harmony") });
    lib.put("LAW_OF_HARMONY_SELF", own);
    let team = e.reserve("Law of Harmony (team)");
    e.define_buff(
        team,
        GDef {
            max_stacks: 4.0,
            duration: 60.0 * 30.0,
            apply_stats: h(move |e| {
                let v = 4.0 * e.stacks_of_team(team);
                e.add_stat(s::DMG_BONUS, v, T_ECHO);
            }),
            ..buff("Law of Harmony (team)")
        },
    );
    lib.put("LAW_OF_HARMONY_TEAM", team);
    let g = e.sonata3pc(GDef {
        name: "Law of Harmony 3pc".into(),
        grants: vec![grant(on_cast(&[Cast::Echo]), own, To::Me), grant(on_cast(&[Cast::Echo]), team, To::Team)],
        ..Default::default()
    });
    lib.put("LAW_OF_HARMONY_3PC", g);

    /* Chisa, 3.6 */

    // Leviathan: its hit queues the Core of Collapse bundle, declared just below
    let core = Rc::new(Cell::new(0 as ActId));
    let core_c = core.clone();
    let a = e.action(ADef {
        name: "Echo - Reminiscence: Leviathan".into(),
        cooldown: CdSpec::Frames(60.0 * 25.0),
        cast: Cast::Echo,
        element: HAVOC,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 131.04 * 2.0,
        energy: 0.91 * 2.0,
        update_debuffs: h(move |e| e.queue(core_c.get())),
        ..Default::default()
    });
    lib.put_a("ACTION_THRENODIAN_LEVIATHAN", a);
    // eight 24.57% hits as one row; Havoc Bane doubles it as Damage Taken
    let c = e.action(ADef {
        name: "Echo - Core of Collapse".into(),
        element: HAVOC,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        anim: 5.0,
        mv: 24.57 * 8.0,
        apply_stats: h(move |e| {
            if e.stacks_of_enemy(havoc_bane) > 0.0 {
                e.add_stat(s::DAMAGE_TAKEN, 100.0, 0);
            }
        }),
        ..Default::default()
    });
    core.set(c);
    lib.put_a("ACTION_CORE_OF_COLLAPSE", c);
    let g = e.mainslot(GDef { name: "Reminiscence: Threnodian - Leviathan".into(), stats: vec![(s::DMG_BONUS, 12.0, HAVOC), (s::DMG_BONUS, 12.0, T_LIBERATION)], ..Default::default() }, a);
    lib.put("THRENODIAN_LEVIATHAN", g);

    // Thread of Severed Fate: hitGlobal so it pays off field; appliedByMe keeps it to its holder's Bane
    let fate = e.reserve("Thread of Severed Fate");
    let g = e.sonata3pc(GDef {
        name: "Thread of Severed Fate 3pc".into(),
        hit_global: h(move |e| {
            if e.applied_by_me(havoc_bane) > 0.0 {
                e.apply_current(fate, 1.0);
            }
        }),
        ..Default::default()
    });
    lib.put("THREAD_OF_SEVERED_FATE_3PC", g);
    e.define_buff(fate, GDef { duration: 60.0 * 5.0, stats: vec![(s::BONUS_ATK, 20.0, 0), (s::DMG_BONUS, 30.0, T_LIBERATION)], ..buff("Thread of Severed Fate") });
    lib.put("THREAD_OF_SEVERED_FATE_BUFF", fate);
}

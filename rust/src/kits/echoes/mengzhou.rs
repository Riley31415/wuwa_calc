//! src/echoes/mengzhou.ts: mainslot echoes and sonatas from Mengzhou (versions 3.5-3.8).
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;
use std::rc::Rc;

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    let sh = *sh;
    let (unison, response) = (sh.unison, sh.unison_response);
    // unison.ts's gainedUnison and unisonResponse
    let gained_unison = move || inflicting(move |e| e.applied(unison) > 0.0);
    let unison_response = move || inflicting(move |e| e.applied(response) > 0.0);

    /* ------------------------------------------------------------------ Jingran, 3.6 */

    let a = e.action(ADef {
        name: "Echo - Myriad Snare".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: FUSION,
        scaling: Scaling::Hp,
        typ: T_ECHO,
        mv: 17.23,
        energy: 3.8,
        ..Default::default()
    });
    lib.put_a("ACTION_MYRIAD_SNARE", a);
    let g = e.mainslot(GDef { name: "Myriad Snare: Rustfire Chassis".into(), stats: vec![(s::DMG_BONUS, 12.0, FUSION), (s::DMG_BONUS, 12.0, T_HEAVY)], ..Default::default() }, a);
    lib.put("MYRIAD_SNARE", g);

    // Lamp of Nether Road: a shield grants 5% Crit Rate a stack; the full four pay 15% Fusion on top
    let lamp = e.buff(GDef {
        max_stacks: 4.0,
        duration: 60.0 * 5.0,
        stats: vec![(s::CRIT_RATE, 5.0, 0)],
        per_stack: true,
        apply_stats: h(|e| {
            if e.frozen_stacks() >= 4.0 {
                e.add_stat(s::DMG_BONUS, 15.0, FUSION);
            }
        }),
        ..buff("Lamp of Nether Road 5pc")
    });
    lib.put("LAMP_STACKS", lamp);
    let two = e.sonata2pc(GDef { name: "Lamp of Nether Road 2pc".into(), stats: vec![(s::BONUS_HP, 10.0, 0)], ..Default::default() });
    lib.put("LAMP_2PC", two);
    let shield = sh.shield;
    let five = e.sonata(
        GDef {
            name: "Lamp of Nether Road 5pc".into(),
            grants: vec![grant_count(on_applied(&[shield]), lamp, To::Me, move |e| e.applied(shield))],
            ..Default::default()
        },
        two,
    );
    lib.put("LAMP_5PC", five);

    /* ------------------------------------------------------------------ Qingxiao, 3.6 */

    let a = e.action(ADef {
        name: "Echo - Calamity Effigy".into(),
        anim: 60.0,
        bullets: vec![BulletDef { hit: 46.0, mv: 405.0, energy: 5.62, ..Default::default() }],
        cooldown: CdSpec::Frames(60.0 * 25.0),
        cast: Cast::Echo,
        element: AERO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        ..Default::default()
    });
    lib.put_a("ACTION_CALAMITY_EFFIGY", a);
    let strain = e.buff(GDef { duration: 60.0 * 15.0, stats: vec![(s::DMG_BONUS, 10.0, AERO)], ..buff("Calamity Effigy (strain)") });
    lib.put("CALAMITY_EFFIGY_STRAIN", strain);
    let g = e.mainslot(
        GDef {
            name: "Calamity Effigy".into(),
            stats: vec![(s::DMG_BONUS, 10.0, AERO)],
            grants: vec![grant(on_inflict(&[sh.strain_shifting]), strain, To::Me)],
            ..Default::default()
        },
        a,
    );
    lib.put("CALAMITY_EFFIGY", g);

    // Heart of Evil's Purge: Tune Strain - Shifting grants +20% Crit DMG and +30% Aero for 15s
    let two = e.sonata2pc(GDef { name: "Heart of Evil's Purge 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, AERO)], ..Default::default() });
    lib.put("HEART_OF_EVILS_PURGE_2PC", two);
    let purge = e.reserve("Heart of Evil's Purge 5pc");
    let five = e.sonata(GDef { name: "Heart of Evil's Purge 5pc".into(), grants: vec![grant(on_inflict(&[sh.strain_shifting]), purge, To::Me)], ..Default::default() }, two);
    lib.put("HEART_OF_EVILS_PURGE_5PC", five);
    e.define_buff(purge, GDef { duration: 60.0 * 15.0, stats: vec![(s::CRIT_DMG, 20.0, 0), (s::DMG_BONUS, 30.0, AERO)], ..buff("Heart of Evil's Purge 5pc") });
    lib.put("HEART_OF_EVILS_PURGE_BUFF", purge);

    /* ------------------------------------------------------------------ Yangyang: Xuanling */

    // Thousand-Puppet Pavilion: one Havoc hit that also summons the Blades of Thousand Memories
    let blades = e.action(ADef { name: "Echo - Blade of Thousand Memories x4".into(), element: HAVOC, scaling: Scaling::Atk, typ: T_ECHO, mv: 41.04 * 4.0, energy: 0.57 * 4.0, ..Default::default() });
    let a = e.action(ADef {
        name: "Echo - Thousand-Puppet Pavilion".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        anim: 5.0,
        cast: Cast::Echo,
        element: HAVOC,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 109.44,
        energy: 1.52,
        update_buffs: h(move |e| e.queue(blades)),
        ..Default::default()
    });
    lib.put_a("ACTION_THOUSAND_PUPPET_PAVILION", a);
    lib.put_a("ACTION_BLADE_OF_THOUSAND_MEMORIES", blades);
    let g = e.mainslot(GDef { name: "Thousand-Puppet Pavilion".into(), stats: vec![(s::DMG_BONUS, 12.0, HAVOC), (s::DMG_BONUS, 12.0, T_HEAVY)], ..Default::default() }, a);
    lib.put("THOUSAND_PUPPET_PAVILION", g);

    // Song of Feathered Trace: Havoc Bane grants Xuanling's Feather (self), Glacio Chafe
    // Chongming's Feather (team, at its own +25% cap)
    let two = e.sonata2pc(GDef { name: "Song of Feathered Trace 2pc".into(), stats: vec![(s::ER, 10.0, 0)], ..Default::default() });
    lib.put("FEATHERED_TRACE_2PC", two);
    let xuanling = e.reserve("Song of Feathered Trace 5pc: Xuanling's Feather");
    let chongming = e.reserve("Song of Feathered Trace 5pc: Chongming's Feather");
    let five = e.sonata(
        GDef {
            name: "Song of Feathered Trace 5pc".into(),
            grants: vec![grant(on_inflict(&[sh.havoc_bane]), xuanling, To::Me), grant(on_inflict(&[sh.glacio_chafe]), chongming, To::Team)],
            ..Default::default()
        },
        two,
    );
    lib.put("FEATHERED_TRACE_5PC", five);
    e.define_buff(xuanling, GDef { duration: 60.0 * 15.0, stats: vec![(s::CRIT_RATE, 20.0, 0), (s::DMG_BONUS, 35.0, T_HEAVY)], ..buff("Song of Feathered Trace 5pc: Xuanling's Feather") });
    lib.put("XUANLINGS_FEATHER", xuanling);
    e.define_buff(chongming, GDef { duration: 60.0 * 10.0, stats: vec![(s::BONUS_ATK, 25.0, 0)], ..buff("Song of Feathered Trace 5pc: Chongming's Feather") });
    lib.put("CHONGMINGS_FEATHER", chongming);

    /* ------------------------------------------------------------------ Suisui, 3.6 */

    let a = e.action(ADef {
        name: "Echo - Forbidden Bastion".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: GLACIO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 237.60,
        energy: 3.30,
        ..Default::default()
    });
    lib.put_a("ACTION_FORBIDDEN_BASTION", a);
    let g = e.mainslot(GDef { name: "Forbidden Bastion".into(), stats: vec![(s::HEALING_BONUS, 10.0, 0)], ..Default::default() }, a);
    lib.put("FORBIDDEN_BASTION", g);

    /* ------------------------------------------------------------------ Suoming and Hsin, 3.7 */

    // "Stay tuned" 4c: +10% Electro flat, and another +10% for 30s off Electro Flare or Unison
    let stay_tuned = e.buff(GDef { duration: 60.0 * 30.0, stats: vec![(s::DMG_BONUS, 10.0, ELECTRO)], ..buff("Stay tuned 4c (flare/unison)") });
    lib.put("STAY_TUNED_BUFF", stay_tuned);
    let flare = sh.electro_flare;
    let stay_tuned_grants = move || vec![grant(either(vec![on_inflict(&[flare]), gained_unison(), unison_response()]), stay_tuned, To::Me)];
    let a = e.action(ADef {
        name: "Echo - Stay tuned 4c".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: ELECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 27.36 * 4.0 + 164.16,
        energy: 0.38 * 4.0 + 2.28,
        ..Default::default()
    });
    lib.put_a("ACTION_STAY_TUNED", a);
    let g = e.mainslot(GDef { name: "Stay tuned 4c".into(), stats: vec![(s::DMG_BONUS, 10.0, ELECTRO)], grants: stay_tuned_grants(), ..Default::default() }, a);
    lib.put("STAY_TUNED", g);

    // Hsin's own form of it: her loadouts name this one instead
    let a = e.action(ADef {
        name: "Echo - Stay tuned 4c (Hsin)".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: ELECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 13.68 * 5.0 + 232.56,
        energy: 0.19 * 5.0 + 3.23,
        ..Default::default()
    });
    lib.put_a("ACTION_STAY_TUNED_HSIN", a);
    let g = e.mainslot(GDef { name: "Stay tuned 4c".into(), stats: vec![(s::DMG_BONUS, 10.0, ELECTRO)], grants: stay_tuned_grants(), ..Default::default() }, a);
    lib.put("STAY_TUNED_HSIN", g);

    // Soulfrayer: three Electro hits, and the Heron-shaped +12% Electro handoff
    let soulfrayer_outro = e.handoff("Soulfrayer: Outro", Rc::new(|e: &mut Eng| e.add_stat(s::DMG_BONUS, 12.0, ELECTRO)), 15.0);
    let a = e.action(ADef {
        name: "Echo - Soulfrayer".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: ELECTRO,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 91.18 * 3.0,
        energy: 1.26 * 3.0,
        update_buffs: h(move |e| e.queue_outro(soulfrayer_outro)),
        ..Default::default()
    });
    lib.put_a("ACTION_STAY_TUNED_3C", a);
    let g = e.mainslot(GDef { name: "Soulfrayer".into(), ..Default::default() }, a);
    lib.put("STAY_TUNED_3C", g);
    lib.put("STAY_TUNED_3C_OUTRO", soulfrayer_outro);

    // Heart of Sworn Vigil: Electro Flare or Unison grants Crit Rate and Electro DMG for 30s
    let two = e.sonata2pc(GDef { name: "Heart of Sworn Vigil 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, ELECTRO)], ..Default::default() });
    lib.put("SWORN_VIGIL_2PC", two);
    let vigil = e.reserve("Heart of Sworn Vigil 5pc");
    let five = e.sonata(
        GDef {
            name: "Heart of Sworn Vigil 5pc".into(),
            grants: vec![grant(either(vec![on_inflict(&[flare]), gained_unison(), unison_response()]), vigil, To::Me)],
            ..Default::default()
        },
        two,
    );
    lib.put("SWORN_VIGIL_5PC", five);
    e.define_buff(vigil, GDef { duration: 60.0 * 30.0, stats: vec![(s::CRIT_RATE, 15.0, 0), (s::DMG_BONUS, 22.5, ELECTRO)], ..buff("Heart of Sworn Vigil 5pc") });
    lib.put("SWORN_VIGIL_BUFF", vigil);

    // Flash of Electric Reflection: Electro Flare grants +10% Electro; an Outro while up hands off +25%
    let two = e.sonata2pc(GDef { name: "Flash of Electric Reflection 2pc".into(), stats: vec![(s::DMG_BONUS, 10.0, ELECTRO)], ..Default::default() });
    lib.put("ELECTRIC_REFLECTION_2PC", two);
    let reflection = e.reserve("Flash of Electric Reflection 5pc");
    let five = e.sonata(GDef { name: "Flash of Electric Reflection 5pc".into(), grants: vec![grant(on_inflict(&[flare]), reflection, To::Me)], ..Default::default() }, two);
    lib.put("ELECTRIC_REFLECTION_5PC", five);
    let reflection_handoff = e.handoff("Flash of Electric Reflection 5pc (outro)", Rc::new(|e: &mut Eng| e.add_stat(s::DMG_BONUS, 25.0, ELECTRO)), 15.0);
    e.define_buff(
        reflection,
        GDef {
            duration: 60.0 * 15.0,
            stats: vec![(s::DMG_BONUS, 10.0, ELECTRO)],
            grants: vec![grant(on_cast(&[Cast::Outro]), reflection_handoff, To::Next)],
            ..buff("Flash of Electric Reflection 5pc")
        },
    );
    lib.put("ELECTRIC_REFLECTION_BUFF", reflection);
    lib.put("ELECTRIC_REFLECTION_HANDOFF", reflection_handoff);

    // Formrender: one Fusion hit, and +10% Energy Regen for whoever wears it
    let a = e.action(ADef {
        name: "Echo - Formrender".into(),
        cooldown: CdSpec::Frames(60.0 * 20.0),
        cast: Cast::Echo,
        element: FUSION,
        scaling: Scaling::Atk,
        typ: T_ECHO,
        mv: 273.6,
        energy: 3.8,
        ..Default::default()
    });
    lib.put_a("ACTION_FORMLESS_DEMON", a);
    let g = e.mainslot(GDef { name: "Formrender".into(), stats: vec![(s::ER, 10.0, 0)], ..Default::default() }, a);
    lib.put("FORMLESS_DEMON", g);

    // Flower of Tinged Yearning: healing grants the team +10% ATK; while it stands, obtaining
    // Unison or triggering Unison Response grants whoever did it +15% more
    let two = e.sonata2pc(GDef { name: "Flower of Tinged Yearning 2pc".into(), stats: vec![(s::HEALING_BONUS, 10.0, 0)], ..Default::default() });
    lib.put("TINGED_YEARNING_2PC", two);
    let team = e.reserve("Flower of Tinged Yearning 5pc (team)");
    let five = e.sonata(GDef { name: "Flower of Tinged Yearning 5pc".into(), grants: vec![grant(on_applied(&[sh.heals]), team, To::Team)], ..Default::default() }, two);
    lib.put("TINGED_YEARNING_5PC", five);
    let own = e.reserve("Flower of Tinged Yearning 5pc");
    e.define_buff(
        team,
        GDef {
            duration: 60.0 * 30.0,
            stats: vec![(s::BONUS_ATK, 10.0, 0)],
            grants: vec![grant(either(vec![gained_unison(), unison_response()]), own, To::Me)],
            ..buff("Flower of Tinged Yearning 5pc (team)")
        },
    );
    lib.put("TINGED_YEARNING_TEAM", team);
    e.define_buff(own, GDef { stats: vec![(s::BONUS_ATK, 15.0, 0)], ..buff("Flower of Tinged Yearning 5pc") });
    lib.put("TINGED_YEARNING_UNISON", own);
}

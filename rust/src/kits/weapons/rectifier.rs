//! src/weapons/rectifier.ts.
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;
use crate::loadout::Tier;

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    let glacio_chafe = sh.glacio_chafe;
    let fusion_burst = sh.fusion_burst;
    let heals = sh.heals;
    let electro_flare = sh.electro_flare;
    let spectro_frazzle = sh.spectro_frazzle;
    let strain = sh.strain_shifting;
    let unison_response = sh.unison_response;

    // Rime-Draped Sprouts, Zhezhi's sig: Panorama
    let w = e.refinements(|e, r, rank| {
        let offield = e.buff(GDef {
            duration: 60.0 * 27.0,
            stats: vec![(s::DMG_BONUS, [52.0, 65.0, 78.0, 91.0, 104.0][r], T_BASIC)],
            when: cond(|e: &mut Eng| !e.is_active()),
            ..buff(&format!("Rime-Draped Sprouts: Panorama{} (outro)", rank))
        });
        let stacks = e.reserve(&format!("Rime-Draped Sprouts: Panorama{} (skill)", rank));
        e.define_buff(
            stacks,
            GDef {
                max_stacks: 3.0,
                duration: 60.0 * 6.0,
                stats: vec![(s::DMG_BONUS, [12.0, 15.0, 18.0, 21.0, 24.0][r], T_BASIC)],
                per_stack: true,
                // on outro: 3+ stacks convert into the off-field version; short of 3 the outro leaves them be
                update_buffs: h(move |e| {
                    if e.casting(Cast::Outro) && e.frozen_stacks() >= 3.0 {
                        e.apply_current(offield, 1.0);
                        e.revoke_current(stacks);
                    }
                }),
                ..buff(&format!("Rime-Draped Sprouts: Panorama{} (skill)", rank))
            },
        );
        e.weapon(
            GDef {
                name: format!("Rime-Draped Sprouts{}", rank),
                stats: vec![(s::BASE_ATK, 500.0, 0), (s::CRIT_DMG, 72.0, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Skill]), stacks, To::Me)],
                ..Default::default()
            },
            Weapon::Rectifier,
            Tier::Limited,
        )
    });
    lib.put_w("RIME_DRAPED_SPROUTS", w);

    // Stringmaster: Electric Amplification
    let w = e.refinements(|e, r, rank| {
        let atk = [12.0, 15.0, 18.0, 21.0, 24.0][r];
        let stacks = e.buff(GDef {
            max_stacks: 2.0,
            duration: 60.0 * 5.0,
            apply_stats: h(move |e| {
                if !e.is_active() {
                    e.add_stat(s::BONUS_ATK, atk, 0);
                }
                e.add_stat(s::BONUS_ATK, atk * e.frozen_stacks(), 0);
            }),
            ..buff(&format!("Stringmaster: Electric Amplification{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Stringmaster{}", rank),
                stats: vec![(s::BASE_ATK, 500.0, 0), (s::CRIT_RATE, 36.0, 0), (s::DMG_BONUS, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![on_hit(grant(on_type(&[T_SKILL]), stacks, To::Me))],
                ..Default::default()
            },
            Weapon::Rectifier,
            Tier::Limited,
        )
    });
    lib.put_w("STRINGMASTER", w);

    // Whispers of Sirens, Cantarella's sig: Gentle Dream
    let w = e.refinements(|e, r, rank| {
        let (bonus, ignore) = ([40.0, 50.0, 60.0, 70.0, 80.0][r], [12.0, 15.0, 18.0, 21.0, 24.0][r]);
        let dream = e.buff(GDef {
            max_stacks: 2.0,
            duration: 60.0 * 10.0,
            lost_on_swap: true,
            // one stack is the Basic Attack DMG Bonus, the second adds the Havoc RES ignore on top
            apply_stats: h(move |e| {
                e.add_stat(s::DMG_BONUS, bonus, T_BASIC);
                if e.frozen_stacks() >= 2.0 {
                    e.add_stat(s::RES_IGNORE, ignore, HAVOC);
                }
            }),
            ..buff(&format!("Whispers of Sirens: Gentle Dream{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Whispers of Sirens{}", rank),
                stats: vec![(s::BASE_ATK, 500.0, 0), (s::CRIT_DMG, 72.0, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                // every Echo Skill cast banks a stack, her own subcast Echo presses included
                grants: vec![grant(on_cast(&[Cast::Echo]), dream, To::Me)],
                ..Default::default()
            },
            Weapon::Rectifier,
            Tier::Limited,
        )
    });
    lib.put_w("WHISPERS_OF_SIRENS", w);

    // Lethean Elegy, Phrolova's sig: Underworld Requiem
    let w = e.refinements(|e, r, rank| {
        let requiem = e.buff(GDef {
            duration: 60.0 * 12.0,
            stats: vec![
                (s::DMG_BONUS, [32.0, 40.0, 48.0, 56.0, 64.0][r], T_SKILL),
                (s::AMP, [32.0, 40.0, 48.0, 56.0, 64.0][r], T_ECHO),
                (s::DEF_IGNORE_OLD, [8.0, 10.0, 12.0, 14.0, 16.0][r], 0),
            ],
            ..buff(&format!("Lethean Elegy: Underworld Requiem{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Lethean Elegy{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![on_hit(grant(on_type(&[T_ECHO]), requiem, To::Me))],
                ..Default::default()
            },
            Weapon::Rectifier,
            Tier::Limited,
        )
    });
    lib.put_w("LETHEAN_ELEGY", w);

    // Freeze Frame, Lucilla's sig: Light's Offering
    let w = e.refinements(|e, r, rank| {
        let own = e.buff(GDef {
            duration: 60.0 * 12.0,
            stats: vec![(s::DMG_BONUS, [30.0, 37.5, 45.0, 52.5, 60.0][r], GLACIO)],
            ..buff(&format!("Freeze Frame: Light's Offering{}", rank))
        });
        let team = e.buff(GDef {
            duration: 60.0 * 30.0,
            stats: vec![(s::BONUS_ATK, [24.0, 30.0, 36.0, 42.0, 48.0][r], 0)],
            ..buff(&format!("Freeze Frame: Light's Offering{} (team)", rank))
        });
        e.weapon(
            GDef {
                name: format!("Freeze Frame{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_inflict(&[glacio_chafe]), own, To::Me), grant(on_inflict(&[glacio_chafe]), team, To::Team)],
                ..Default::default()
            },
            Weapon::Rectifier,
            Tier::Limited,
        )
    });
    lib.put_w("FREEZE_FRAME", w);

    // Stellar Symphony, Shorekeeper's sig: Astral Evolvement
    let w = e.refinements(|e, r, rank| {
        let team = e.buff(GDef {
            duration: 60.0 * 30.0,
            stats: vec![(s::BONUS_ATK, [14.0, 17.5, 21.0, 24.5, 28.0][r], 0)],
            ..buff(&format!("Stellar Symphony: Astral Evolvement{} (team)", rank))
        });
        // the charge the Liberation spends: held from combat start, back on the wielder's own Outro
        let charge = e.reserve(&format!("Stellar Symphony: Astral Evolvement{}", rank));
        let concerto = [8.0, 10.0, 12.0, 14.0, 16.0][r];
        e.define_buff(
            charge,
            GDef {
                update_buffs: h(move |e| {
                    if !e.casting(Cast::Liberation) {
                        return;
                    }
                    e.add_to_cast([0.0, concerto, 0.0, 0.0, 0.0, 0.0, 0.0]);
                    e.revoke_current(charge);
                }),
                ..buff(&format!("Stellar Symphony: Astral Evolvement{}", rank))
            },
        );
        e.weapon(
            GDef {
                name: format!("Stellar Symphony{}", rank),
                stats: vec![(s::BASE_ATK, 412.5, 0), (s::ER, 77.04, 0), (s::BONUS_HP, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                combat_start: h(move |e| {
                    e.apply_current(charge, 1.0);
                }),
                grants: vec![grant(both(vec![on_cast(&[Cast::Skill]), on_applied(&[heals])]), team, To::Team), grant(on_cast(&[Cast::Outro]), charge, To::Me)],
                ..Default::default()
            },
            Weapon::Rectifier,
            Tier::Limited,
        )
    });
    lib.put_w("SK_SIG", w);

    // Luminous Hymn, Phoebe's sig: Homebuilder's Anthem
    let w = e.refinements(|e, r, rank| {
        let stacks = e.buff(GDef {
            max_stacks: 3.0,
            duration: 60.0 * 6.0,
            stats: vec![(s::DMG_BONUS, [14.0, 17.5, 21.0, 24.5, 28.0][r], T_BASIC), (s::DMG_BONUS, [14.0, 17.5, 21.0, 24.5, 28.0][r], T_HEAVY)],
            per_stack: true,
            ..buff(&format!("Luminous Hymn: Homebuilder's Anthem{}", rank))
        });
        let frazzle = e.debuff(GDef {
            duration: 60.0 * 30.0,
            stats: vec![(s::AMP, [30.0, 37.5, 45.0, 52.5, 60.0][r], S_SPECTRO_FRAZZLE)],
            ..buff(&format!("Luminous Hymn: Homebuilder's Anthem{} (frazzle)", rank))
        });
        e.weapon(
            GDef {
                name: format!("Luminous Hymn{}", rank),
                stats: vec![(s::BASE_ATK, 500.0, 0), (s::CRIT_RATE, 36.0, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![
                    on_hit(grant(when(move |e| !e.cur().bullets.is_empty() && e.stacks_of_enemy(spectro_frazzle) > 0.0), stacks, To::Me)),
                    grant(on_cast(&[Cast::Outro]), frazzle, To::Enemy),
                ],
                ..Default::default()
            },
            Weapon::Rectifier,
            Tier::Limited,
        )
    });
    lib.put_w("LUMINOUS_HYMN", w);

    // Forged Dwarf Star, Denia's sig: Dissolution
    let w = e.refinements(|e, r, rank| {
        let team = e.buff(GDef {
            duration: 60.0 * 15.0,
            stats: vec![(s::BONUS_ATK, [24.0, 30.0, 36.0, 42.0, 48.0][r], 0)],
            ..buff(&format!("Forged Dwarf Star: Dissolution{} (team)", rank))
        });
        let lib_dmg = e.buff(GDef {
            duration: 60.0 * 5.0,
            stats: vec![(s::DMG_BONUS, [36.0, 45.0, 54.0, 63.0, 72.0][r], T_LIBERATION)],
            // the team half reacts to anyone's infliction, so it watches from hitGlobal
            hit_global: h(move |e| {
                if e.applied(fusion_burst) > 0.0 || e.applied(strain) > 0.0 {
                    e.apply_team(team, 1.0);
                }
            }),
            ..buff(&format!("Forged Dwarf Star: Dissolution{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Forged Dwarf Star{}", rank),
                stats: vec![(s::BASE_ATK, 500.0, 0), (s::CRIT_RATE, 36.0, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_inflict(&[fusion_burst, strain]), lib_dmg, To::Me)],
                ..Default::default()
            },
            Weapon::Rectifier,
            Tier::Limited,
        )
    });
    lib.put_w("FORGED_DWARF_STAR", w);

    // Firstlight's Herald, Suisui's sig: Spring Wreath
    let w = e.refinements(|e, r, rank| {
        // the charge the Liberation spends: held from combat start, back on the wielder's own Outro
        let wreath = e.reserve(&format!("Firstlight's Herald: Spring Wreath{}", rank));
        let concerto = [8.0, 10.0, 12.0, 14.0, 16.0][r];
        e.define_buff(
            wreath,
            GDef {
                update_buffs: h(move |e| {
                    if !e.casting(Cast::Liberation) {
                        return;
                    }
                    e.add_to_cast([0.0, concerto, 0.0, 0.0, 0.0, 0.0, 0.0]);
                    e.revoke_current(wreath);
                }),
                ..buff(&format!("Firstlight's Herald: Spring Wreath{}", rank))
            },
        );
        let snow_taint = e.buff(GDef { duration: 60.0 * 6.0, ..buff(&format!("Firstlight's Herald: Snow Taint{}", rank)) });
        let ripples = e.buff(GDef { duration: 60.0 * 6.0, ..buff(&format!("Firstlight's Herald: Ripples{}", rank)) });
        let team = e.buff(GDef {
            duration: 60.0 * 6.0,
            stats: vec![(s::BONUS_ATK, [20.0, 25.0, 30.0, 35.0, 40.0][r], 0)],
            ..buff(&format!("Firstlight's Herald: Spring Wreath{} (team)", rank))
        });
        let both_marks = move |e: &mut Eng| e.is_held(snow_taint) && e.is_held(ripples);
        e.weapon(
            GDef {
                name: format!("Firstlight's Herald{}", rank),
                stats: vec![(s::BASE_ATK, 412.5, 0), (s::ER, 77.04, 0), (s::BONUS_HP, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                combat_start: h(move |e| {
                    e.apply_current(wreath, 1.0);
                }),
                grants: vec![
                    grant(on_inflict(&[glacio_chafe]), snow_taint, To::Me),
                    grant(on_applied(&[heals]), ripples, To::Me),
                    // read after the marks land, wherever the inflicting was
                    grant(inflicting(both_marks), team, To::Team),
                    grant(when(move |e| e.casting(Cast::Outro) && both_marks(e)), snow_taint, To::Me),
                    grant(when(move |e| e.casting(Cast::Outro) && both_marks(e)), ripples, To::Me),
                    grant(on_cast(&[Cast::Outro]), wreath, To::Me),
                ],
                ..Default::default()
            },
            Weapon::Rectifier,
            Tier::Limited,
        )
    });
    lib.put_w("FIRSTLIGHTS_HERALD", w);

    // Blooming Jadehaven: Hundredfold Artifice
    let w = e.refinements(|e, r, rank| {
        let (res_ignore, flare_amp) = ([10.0, 13.5, 17.0, 20.5, 24.0][r], [30.0, 37.5, 45.0, 52.5, 60.0][r]);
        let artifice = e.buff(GDef {
            stats: vec![(s::AMP, [36.0, 45.0, 54.0, 63.0, 72.0][r], T_SKILL)],
            apply_stats: h(move |e| {
                if e.is_type(T_SKILL) {
                    e.add_stat(s::RES_IGNORE, res_ignore, ELECTRO);
                }
                if e.is_active() {
                    e.add_stat(s::AMP, flare_amp, S_ELECTRO_FLARE);
                }
            }),
            ..buff(&format!("Blooming Jadehaven: Hundredfold Artifice{}", rank))
        });
        let flare = e.buff(GDef {
            duration: 60.0 * 30.0,
            stats: vec![(s::AMP, flare_amp, S_ELECTRO_FLARE)],
            when: cond(|e: &mut Eng| e.is_active()),
            ..buff(&format!("Blooming Jadehaven: Hundredfold Artifice{} (flare)", rank))
        });
        let unison = move || inflicting(move |e| e.applied(unison_response) > 0.0);
        e.weapon(
            GDef {
                name: format!("Blooming Jadehaven{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::DMG_BONUS, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![
                    grant(either(vec![on_inflict(&[electro_flare]), unison()]), artifice, To::Me),
                    grant(either(vec![on_inflict(&[electro_flare]), unison()]), flare, To::Me),
                ],
                ..Default::default()
            },
            Weapon::Rectifier,
            Tier::Limited,
        )
    });
    lib.put_w("BLOOMING_JADEHAVEN", w);
}

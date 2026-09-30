//! src/weapons/standard.ts.
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;
use crate::loadout::Tier;

/// The five 4-star standard weapons: Ceaseless Aria, a Skill's Concerto the wielder's Outro readies again.
fn concerto_weapon(e: &mut Eng, name: &str, weapon_type: Weapon, tier: Tier) -> Vec<GearId> {
    e.refinements(|e, r, rank| {
        let aria = e.reserve(&format!("{}: Ceaseless Aria{}", name, rank));
        let concerto = [8.0, 10.0, 12.0, 14.0, 16.0][r];
        e.define_buff(
            aria,
            GDef {
                update_buffs: h(move |e| {
                    if !e.casting(Cast::Skill) {
                        return;
                    }
                    e.add_to_cast([0.0, concerto, 0.0, 0.0, 0.0, 0.0, 0.0]);
                    e.revoke_current(aria);
                }),
                ..buff(&format!("{}: Ceaseless Aria{}", name, rank))
            },
        );
        e.weapon(
            GDef {
                name: format!("{}{}", name, rank),
                stats: vec![(s::BASE_ATK, 337.5, 0), (s::ER, 51.84, 0)],
                combat_start: h(move |e| {
                    e.apply_current(aria, 1.0);
                }),
                grants: vec![grant(on_cast(&[Cast::Outro]), aria, To::Me)],
                ..Default::default()
            },
            weapon_type,
            tier,
        )
    })
}

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    // Ceaseless Aria (4-star, 5)
    let w = concerto_weapon(e, "Variation", Weapon::Rectifier, Tier::Standard);
    lib.put_w("VARIATION", w);
    let w = concerto_weapon(e, "Marcato", Weapon::Gauntlets, Tier::Free);
    lib.put_w("MARCATO", w);
    let w = concerto_weapon(e, "Cadenza", Weapon::Pistols, Tier::Free);
    lib.put_w("CADENZA", w);
    let w = concerto_weapon(e, "Overture", Weapon::Sword, Tier::Free);
    lib.put_w("OVERTURE", w);
    let w = concerto_weapon(e, "Discord", Weapon::Broadblade, Tier::Free);
    lib.put_w("DISCORD", w);

    // Stormy Resolution (5-star, 5): Static Mist
    let w = e.refinements(|e, r, rank| {
        let handoff = e.buff(GDef { duration: 60.0 * 14.0, stats: vec![(s::BONUS_ATK, [10.0, 12.5, 15.0, 17.5, 20.0][r], 0)], ..buff(&format!("Static Mist: Stormy Resolution{}", rank)) });
        e.weapon(
            GDef {
                name: format!("Static Mist{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::ER, [12.8, 16.0, 19.2, 22.4, 25.6][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Outro]), handoff, To::Next)],
                ..Default::default()
            },
            Weapon::Pistols,
            Tier::Standard,
        )
    });
    lib.put_w("STATIC_MIST", w);

    // Emerald of Genesis
    let w = e.refinements(|e, r, rank| {
        let stacks = e.buff(GDef {
            max_stacks: 2.0,
            duration: 60.0 * 10.0,
            stats: vec![(s::BONUS_ATK, [6.0, 7.5, 9.0, 10.5, 12.0][r], 0)],
            per_stack: true,
            ..buff(&format!("Emerald of Genesis: Stormy Resolution{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Emerald of Genesis{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::ER, [12.8, 16.0, 19.2, 22.4, 25.6][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Skill]), stacks, To::Me)],
                ..Default::default()
            },
            Weapon::Sword,
            Tier::Standard,
        )
    });
    lib.put_w("EMERALD_OF_GENESIS", w);

    // Cosmic Ripples
    let w = e.refinements(|e, r, rank| {
        let stacks = e.buff(GDef {
            max_stacks: 5.0,
            duration: 60.0 * 8.0,
            stats: vec![(s::DMG_BONUS, [3.2, 4.0, 4.8, 5.6, 6.4][r], T_BASIC)],
            per_stack: true,
            ..buff(&format!("Cosmic Ripples: Stormy Resolution{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Cosmic Ripples{}", rank),
                stats: vec![(s::BASE_ATK, 500.0, 0), (s::BONUS_ATK, 54.0, 0), (s::ER, [12.8, 16.0, 19.2, 22.4, 25.6][r], 0)],
                grants: vec![hit_grant(on_type(&[T_BASIC]), stacks, To::Me)],
                ..Default::default()
            },
            Weapon::Rectifier,
            Tier::Standard,
        )
    });
    lib.put_w("COSMIC_RIPPLES", w);

    // Abyss Surges
    let w = e.refinements(|e, r, rank| {
        let skill_hit = e.buff(GDef { duration: 60.0 * 8.0, stats: vec![(s::DMG_BONUS, [10.0, 12.5, 15.0, 17.5, 20.0][r], T_BASIC)], ..buff(&format!("Abyss Surges: Stormy Resolution{} (skill)", rank)) });
        let basic_hit = e.buff(GDef { duration: 60.0 * 8.0, stats: vec![(s::DMG_BONUS, [10.0, 12.5, 15.0, 17.5, 20.0][r], T_SKILL)], ..buff(&format!("Abyss Surges: Stormy Resolution{} (basic)", rank)) });
        e.weapon(
            GDef {
                name: format!("Abyss Surges{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::BONUS_ATK, 36.45, 0), (s::ER, [12.8, 16.0, 19.2, 22.4, 25.6][r], 0)],
                grants: vec![hit_grant(on_type(&[T_SKILL]), skill_hit, To::Me), hit_grant(on_type(&[T_BASIC]), basic_hit, To::Me)],
                ..Default::default()
            },
            Weapon::Gauntlets,
            Tier::Standard,
        )
    });
    lib.put_w("ABYSS_SURGES", w);

    // Lustrous Razor
    let w = e.refinements(|e, r, rank| {
        let stacks = e.buff(GDef {
            max_stacks: 3.0,
            duration: 60.0 * 12.0,
            stats: vec![(s::DMG_BONUS, [7.0, 8.75, 10.5, 12.25, 14.0][r], T_LIBERATION)],
            per_stack: true,
            ..buff(&format!("Lustrous Razor: Stormy Resolution{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Lustrous Razor{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::BONUS_ATK, 36.45, 0), (s::ER, [12.8, 16.0, 19.2, 22.4, 25.6][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Skill]), stacks, To::Me)],
                ..Default::default()
            },
            Weapon::Broadblade,
            Tier::Standard,
        )
    });
    lib.put_w("LUSTROUS_RAZOR", w);

    // new standard (5-star, 5): a hit on a Tune Strain - Interfered target
    let si = sh.strain_interfered;
    let hit_interfered = move || when(move |e| !e.cur().bullets.is_empty() && e.stacks_of_enemy(si) > 0.0);

    // Radiance Cleaver: Edge Breaker
    let w = e.refinements(|e, r, rank| {
        let edge = e.buff(GDef { duration: 60.0 * 3.0, stats: vec![(s::DMG_BONUS, [24.0, 27.0, 30.0, 33.0, 36.0][r], T_LIBERATION)], ..buff(&format!("Radiance Cleaver: Edge Breaker{}", rank)) });
        e.weapon(
            GDef {
                name: format!("Radiance Cleaver{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_DMG, 48.6, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![hit_grant(hit_interfered(), edge, To::Me)],
                ..Default::default()
            },
            Weapon::Broadblade,
            Tier::Standard,
        )
    });
    lib.put_w("NEW_STD_BRAUDBLADE", w);

    // Pulsation Bracer: Barrier Breacher
    let w = e.refinements(|e, r, rank| {
        let stacks = e.buff(GDef {
            max_stacks: 4.0,
            duration: 60.0 * 3.0,
            stats: vec![(s::DMG_BONUS, [6.0, 6.7, 7.5, 8.2, 9.0][r], T_BASIC)],
            per_stack: true,
            ..buff(&format!("Pulsation Bracer: Barrier Breacher{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Pulsation Bracer{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![hit_grant(hit_interfered(), stacks, To::Me)],
                ..Default::default()
            },
            Weapon::Gauntlets,
            Tier::Standard,
        )
    });
    lib.put_w("NEW_STD_GAUNTLET", w);

    // Laser Shearer: Signal Catcher
    let w = e.refinements(|e, r, rank| {
        let signal = e.buff(GDef { duration: 60.0 * 3.0, stats: vec![(s::DMG_BONUS, [24.0, 27.0, 30.0, 33.0, 36.0][r], T_SKILL)], ..buff(&format!("Laser Shearer: Signal Catcher{}", rank)) });
        e.weapon(
            GDef {
                name: format!("Laser Shearer{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::ER, 38.88, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![hit_grant(hit_interfered(), signal, To::Me)],
                ..Default::default()
            },
            Weapon::Sword,
            Tier::Standard,
        )
    });
    lib.put_w("NEW_STD_SWORD", w);

    // Bloodpact's Pledge: Harmonious Vibrancy (the healing half; Rover: Aero applies the Aero amp)
    let heals = sh.heals;
    let w = e.refinements(|e, r, rank| {
        let vibrancy = e.buff(GDef { duration: 60.0 * 6.0, stats: vec![(s::DMG_BONUS, [10.0, 14.0, 18.0, 22.0, 26.0][r], T_SKILL)], ..buff(&format!("Bloodpact's Pledge: Harmonious Vibrancy{}", rank)) });
        e.weapon(
            GDef {
                name: format!("Bloodpact's Pledge{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::ER, 38.88, 0)],
                grants: vec![grant(on_applied(&[heals]), vibrancy, To::Me)],
                ..Default::default()
            },
            Weapon::Sword,
            Tier::Free,
        )
    });
    lib.put_w("BLOODPACTS_PLEDGE", w);

    // the Unbound Flow half, one buff per refinement, applied by Rover: Aero off the rank they hold
    let amps: Vec<GearId> = [10.0, 14.0, 18.0, 22.0, 26.0]
        .iter()
        .enumerate()
        .map(|(r, &amp)| {
            e.buff(GDef {
                duration: 60.0 * 30.0,
                stats: vec![(s::AMP, amp, AERO)],
                when: cond(|e: &mut Eng| e.is_active()),
                ..buff(&format!("Bloodpact's Pledge: Harmonious Vibrancy R{}", r + 1))
            })
        })
        .collect();
    lib.put_w("BLOODPACT_AERO_AMP", amps);

    // Boson Astrolabe: Path Observer
    let w = e.refinements(|e, r, rank| {
        let observer = e.buff(GDef {
            duration: 60.0 * 14.0,
            stats: vec![(s::BONUS_ATK, [12.0, 13.5, 15.0, 16.5, 18.0][r], 0), (s::DMG_BONUS, [12.0, 13.5, 15.0, 16.5, 18.0][r], T_BASIC)],
            ..buff(&format!("Boson Astrolabe: Path Observer{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Boson Astrolabe{}", rank),
                stats: vec![(s::BASE_ATK, 525.0, 0), (s::ER, 38.88, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                hit_global: h(move |e| {
                    if e.casting(Cast::TuneBreak) {
                        e.apply_current(observer, 1.0);
                    }
                }),
                ..Default::default()
            },
            Weapon::Rectifier,
            Tier::Standard,
        )
    });
    lib.put_w("NEW_STD_RECTIFIER", w);

    // Phasic Homogenizer: Insight Bearer
    let w = e.refinements(|e, r, rank| {
        let insight = e.buff(GDef { duration: 60.0 * 14.0, stats: vec![(s::DMG_BONUS, [20.0, 22.5, 25.0, 27.5, 30.0][r], 0)], ..buff(&format!("Phasic Homogenizer: Insight Bearer{}", rank)) });
        e.weapon(
            GDef {
                name: format!("Phasic Homogenizer{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_DMG, 48.6, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                hit_global: h(move |e| {
                    if e.casting(Cast::TuneBreak) {
                        e.apply_current(insight, 1.0);
                    }
                }),
                ..Default::default()
            },
            Weapon::Pistols,
            Tier::Standard,
        )
    });
    lib.put_w("NEW_STD_PISTOL", w);
}

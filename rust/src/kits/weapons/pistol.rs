//! src/weapons/pistol.ts.
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;
use crate::loadout::Tier;

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    let hack = sh.hack_shifting;
    let rupture = sh.rupture_shifting;
    let strain = sh.strain_shifting;
    let erosion = sh.aero_erosion;

    // The Last Dance, Carlotta's sig: Silent Eulogy
    let w = e.refinements(|e, r, rank| {
        let eulogy = e.buff(GDef {
            duration: 60.0 * 5.0,
            stats: vec![(s::DMG_BONUS, [48.0, 60.0, 72.0, 84.0, 96.0][r], T_SKILL)],
            ..buff(&format!("The Last Dance: Silent Eulogy{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("The Last Dance{}", rank),
                stats: vec![(s::BASE_ATK, 500.0, 0), (s::CRIT_DMG, 72.0, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Intro, Cast::Liberation]), eulogy, To::Me)],
                ..Default::default()
            },
            Weapon::Pistols,
            Tier::Limited,
        )
    });
    lib.put_w("THE_LAST_DANCE", w);

    // Lux & Umbra, Galbrena's sig: To Fire She Returns
    let w = e.refinements(|e, r, rank| {
        let on_echo = e.buff(GDef {
            duration: 60.0 * 6.0,
            stats: vec![(s::AMP, [24.0, 30.0, 36.0, 42.0, 48.0][r], T_HEAVY)],
            ..buff(&format!("Lux & Umbra: To Fire She Returns{} (echo)", rank))
        });
        let on_heavy = e.buff(GDef {
            duration: 60.0 * 6.0,
            stats: vec![(s::AMP, [24.0, 30.0, 36.0, 42.0, 48.0][r], T_ECHO)],
            ..buff(&format!("Lux & Umbra: To Fire She Returns{} (heavy)", rank))
        });
        let ignore = [8.0, 10.0, 12.0, 14.0, 16.0][r];
        e.weapon(
            GDef {
                name: format!("Lux & Umbra{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_DMG, 48.6, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                apply_stats: h(move |e| {
                    if e.is_held(on_echo) && e.is_held(on_heavy) {
                        e.add_stat(s::DEF_IGNORE_NEW, ignore, 0);
                    }
                }),
                grants: vec![on_hit(grant(on_type(&[T_ECHO]), on_echo, To::Me)), on_hit(grant(on_type(&[T_HEAVY]), on_heavy, To::Me))],
                ..Default::default()
            },
            Weapon::Pistols,
            Tier::Limited,
        )
    });
    lib.put_w("LUX_UMBRA", w);

    // Woodland Aria, Ciaccona's sig: Lingering Summer Tune
    let w = e.refinements(|e, r, rank| {
        let tune = e.buff(GDef {
            duration: 60.0 * 10.0,
            stats: vec![(s::DMG_BONUS, [24.0, 30.0, 36.0, 42.0, 48.0][r], AERO)],
            ..buff(&format!("Woodland Aria: Lingering Summer Tune{}", rank))
        });
        let shred = e.debuff(GDef {
            duration: 60.0 * 20.0,
            stats: vec![(s::RES_REDUCE, [10.0, 11.5, 13.0, 14.5, 16.0][r], AERO)],
            ..buff(&format!("Woodland Aria: Lingering Summer Tune{} (enemy)", rank))
        });
        e.weapon(
            GDef {
                name: format!("Woodland Aria{}", rank),
                stats: vec![(s::BASE_ATK, 500.0, 0), (s::CRIT_RATE, 36.0, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_inflict(&[erosion]), tune, To::Me), grant(on_inflict(&[erosion]), shred, To::Enemy)],
                ..Default::default()
            },
            Weapon::Pistols,
            Tier::Limited,
        )
    });
    lib.put_w("WOODLAND_ARIA", w);

    // Spectrum Blaster, Lynae's sig: Attendance Exemption Protocol
    let w = e.refinements(|e, r, rank| {
        let exemption = e.buff(GDef {
            duration: 60.0 * 4.0,
            stats: vec![(s::DMG_BONUS, [36.0, 45.0, 54.0, 63.0, 72.0][r], T_BASIC)],
            ..buff(&format!("Spectrum Blaster: Attendance Exemption Protocol{}", rank))
        });
        let chorus = e.buff(GDef {
            max_stacks: 3.0,
            duration: 60.0 * 30.0,
            stats: vec![(s::DMG_BONUS, [8.0, 10.0, 12.0, 14.0, 16.0][r], 0)],
            per_stack: true,
            ..buff(&format!("Spectrum Blaster: Attendance Exemption Protocol{} (team)", rank))
        });
        e.weapon(
            GDef {
                name: format!("Spectrum Blaster{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![
                    grant(on_cast(&[Cast::Intro]), exemption, To::Me),
                    on_hit(grant(on_type(&[T_BASIC]), exemption, To::Me)),
                    grant(both(vec![on_cast(&[Cast::Basic]), on_inflict(&[rupture, strain])]), chorus, To::Team),
                ],
                ..Default::default()
            },
            Weapon::Pistols,
            Tier::Limited,
        )
    });
    lib.put_w("SPECTRUM_BLASTER", w);

    // Skull Thrasher, Rebecca's sig: Wakeful Loner
    let w = e.refinements(|e, r, rank| {
        let intro = e.buff(GDef { duration: 60.0 * 14.0, stats: vec![(s::DMG_BONUS, [24.0, 30.0, 36.0, 42.0, 48.0][r], T_BASIC)], ..buff(&format!("Skull Thrasher: Wakeful Loner{} (intro)", rank)) });
        let on_hack = e.buff(GDef { duration: 60.0 * 14.0, stats: vec![(s::DMG_BONUS, [12.0, 15.0, 18.0, 21.0, 24.0][r], T_BASIC)], ..buff(&format!("Skull Thrasher: Wakeful Loner{} (hack)", rank)) });
        let team = e.buff(GDef { duration: 60.0 * 30.0, stats: vec![(s::BONUS_ATK, [24.0, 30.0, 36.0, 42.0, 48.0][r], 0)], ..buff(&format!("Skull Thrasher: Wakeful Loner{} (team)", rank)) });
        e.weapon(
            GDef {
                name: format!("Skull Thrasher{}", rank),
                stats: vec![(s::BASE_ATK, 500.0, 0), (s::CRIT_DMG, 72.0, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Intro]), intro, To::Me), grant(on_inflict(&[hack]), on_hack, To::Me), grant(on_inflict(&[hack]), team, To::Team)],
                ..Default::default()
            },
            Weapon::Pistols,
            Tier::Limited,
        )
    });
    lib.put_w("SKULL_THRASHER", w);

    // Spectral Trigger, Lucy's sig: Sunken Dream
    let w = e.refinements(|e, r, rank| {
        let stacks = e.buff(GDef {
            max_stacks: 2.0,
            duration: 60.0 * 14.0,
            stats: vec![(s::DMG_BONUS, [20.0, 25.0, 30.0, 35.0, 40.0][r], SPECTRO)],
            per_stack: true,
            ..buff(&format!("Spectral Trigger: Sunken Dream{} (skill)", rank))
        });
        let on_hack = e.buff(GDef {
            duration: 60.0 * 14.0,
            stats: vec![(s::AMP, [30.0, 37.5, 45.0, 52.5, 60.0][r], T_HEAVY), (s::DEF_IGNORE_NEW, [10.0, 12.5, 15.0, 17.5, 20.0][r], T_HEAVY)],
            ..buff(&format!("Spectral Trigger: Sunken Dream{} (hack)", rank))
        });
        e.weapon(
            GDef {
                name: format!("Spectral Trigger{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_DMG, 48.6, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Skill]), stacks, To::Me), grant(on_inflict(&[hack]), on_hack, To::Me)],
                ..Default::default()
            },
            Weapon::Pistols,
            Tier::Limited,
        )
    });
    lib.put_w("SPECTRAL_TRIGGER", w);
}

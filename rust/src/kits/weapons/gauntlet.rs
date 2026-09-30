//! src/weapons/gauntlet.ts.
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;
use crate::loadout::Tier;

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    let shield = sh.shield;
    let strain = sh.strain_shifting;

    // Verity's Handle, Xiangli Yao's sig: Ad Veritatem
    let w = e.refinements(|e, r, rank| {
        let ad_veritatem = e.buff(GDef {
            duration: 60.0 * 8.0,
            stats: vec![(s::DMG_BONUS, [48.0, 60.0, 72.0, 84.0, 96.0][r], T_LIBERATION)],
            ..buff(&format!("Verity's Handle: Ad Veritatem{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Verity's Handle{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::DMG_BONUS, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Liberation]), ad_veritatem, To::Me)],
                ..Default::default()
            },
            Weapon::Gauntlets,
            Tier::Limited,
        )
    });
    lib.put_w("VERITYS_HANDLE", w);

    // Tragicomedy, Roccia's sig: Fool's Warble
    let w = e.refinements(|e, r, rank| {
        let warble = e.buff(GDef {
            duration: 60.0 * 3.0,
            stats: vec![(s::DMG_BONUS, [48.0, 60.0, 72.0, 84.0, 96.0][r], T_HEAVY)],
            ..buff(&format!("Tragicomedy: Fool's Warble{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Tragicomedy{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Basic, Cast::Intro]), warble, To::Me)],
                ..Default::default()
            },
            Weapon::Gauntlets,
            Tier::Limited,
        )
    });
    lib.put_w("TRAGICOMEDY", w);

    // Blazing Justice, Zani's sig: Darkness Breaker
    let w = e.refinements(|e, r, rank| {
        let breaker = e.buff(GDef {
            duration: 60.0 * 6.0,
            stats: vec![(s::DEF_IGNORE_OLD, [8.0, 10.0, 12.0, 14.0, 16.0][r], 0), (s::AMP, [50.0, 62.5, 75.0, 87.5, 100.0][r], S_SPECTRO_FRAZZLE)],
            ..buff(&format!("Blazing Justice: Darkness Breaker{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Blazing Justice{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_DMG, 48.6, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Basic]), breaker, To::Me)],
                ..Default::default()
            },
            Weapon::Gauntlets,
            Tier::Limited,
        )
    });
    lib.put_w("BLAZING_JUSTICE", w);

    // Solsworn Ciphers, Sigrika's sig: Sunward
    let w = e.refinements(|e, r, rank| {
        let amp = e.buff(GDef {
            duration: 60.0 * 15.0,
            stats: vec![(s::AMP, [32.0, 40.0, 48.0, 56.0, 64.0][r], T_ECHO)],
            ..buff(&format!("Solsworn Ciphers: Sunward{} (intro/echo)", rank))
        });
        let ignore = e.buff(GDef {
            duration: 60.0 * 6.0,
            stats: vec![(s::DEF_IGNORE_NEW, [10.0, 12.5, 15.0, 17.5, 20.0][r], AERO)],
            ..buff(&format!("Solsworn Ciphers: Sunward{} (echo dmg)", rank))
        });
        e.weapon(
            GDef {
                name: format!("Solsworn Ciphers{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_DMG, 48.6, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Intro, Cast::Echo]), amp, To::Me), on_hit(grant(on_type(&[T_ECHO]), ignore, To::Me))],
                ..Default::default()
            },
            Weapon::Gauntlets,
            Tier::Limited,
        )
    });
    lib.put_w("SOLSWORN_CIPHERS", w);

    // Moongazer's Sigil, Iuno's sig: Plenilune Radiance
    let w = e.refinements(|e, r, rank| {
        let dmg = e.buff(GDef {
            duration: 60.0 * 15.0,
            stats: vec![(s::DMG_BONUS, [20.0, 25.0, 30.0, 35.0, 40.0][r], T_LIBERATION)],
            ..buff(&format!("Moongazer's Sigil: Plenilune Radiance{} (intro/lib)", rank))
        });
        let stacks = e.buff(GDef {
            max_stacks: 5.0,
            duration: 60.0 * 7.0,
            // scoped to liberation damage: most of Lunar Cycle qualifies, intro/outro/echo don't
            stats: vec![(s::DEF_IGNORE_NEW, [7.2, 8.4, 9.6, 10.8, 12.0][r], T_LIBERATION)],
            per_stack: true,
            ..buff(&format!("Moongazer's Sigil: Plenilune Radiance{} (shield)", rank))
        });
        e.weapon(
            GDef {
                name: format!("Moongazer's Sigil{}", rank),
                stats: vec![(s::BASE_ATK, 500.0, 0), (s::CRIT_RATE, 36.0, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Intro, Cast::Liberation]), dmg, To::Me), grant_count(on_applied(&[shield]), stacks, To::Me, move |e| e.applied(shield))],
                update_buffs: h(move |e| {
                    if e.casting(Cast::Intro) {
                        e.set_stacks_self(stacks, 5.0);
                    }
                }),
                ..Default::default()
            },
            Weapon::Gauntlets,
            Tier::Limited,
        )
    });
    lib.put_w("IUNO_SIG", w);

    // Daybreaker's Spine, Luuk's sig: Suturing Dayline
    let w = e.refinements(|e, r, rank| {
        let spectro = e.buff(GDef {
            duration: 60.0 * 4.0,
            stats: vec![(s::DMG_BONUS, [20.0, 25.0, 30.0, 35.0, 40.0][r], SPECTRO)],
            ..buff(&format!("Daybreaker's Spine: Suturing Dayline{} (basic)", rank))
        });
        let on_strain = e.buff(GDef {
            duration: 60.0 * 6.0,
            stats: vec![(s::AMP, [20.0, 25.0, 30.0, 35.0, 40.0][r], T_BASIC), (s::DEF_IGNORE_NEW, [10.0, 12.5, 15.0, 17.5, 20.0][r], T_BASIC)],
            ..buff(&format!("Daybreaker's Spine: Suturing Dayline{} (strain)", rank))
        });
        e.weapon(
            GDef {
                name: format!("Daybreaker's Spine{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![on_hit(grant(on_type(&[T_BASIC]), spectro, To::Me)), grant(on_inflict(&[strain]), on_strain, To::Me)],
                ..Default::default()
            },
            Weapon::Gauntlets,
            Tier::Limited,
        )
    });
    lib.put_w("DAYBREAKERS_SPINE", w);
}

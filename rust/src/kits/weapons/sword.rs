//! src/weapons/sword.ts.
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;
use crate::loadout::Tier;

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    let sh = *sh;
    // Blazing Brilliance, Changli's sig: Crimson Phoenix
    let w = e.refinements(|e, r, rank| {
        let feather = e.reserve(&format!("Blazing Brilliance: Crimson Phoenix{}", rank));
        e.define_buff(
            feather,
            GDef {
                max_stacks: 14.0,
                stats: vec![(s::DMG_BONUS, [4.0, 5.0, 6.0, 7.0, 8.0][r], T_SKILL)],
                per_stack: true,
                after_action: h(move |e| {
                    if e.casting(Cast::Outro) && e.stacks_of(feather) >= 14.0 {
                        e.revoke_current(feather);
                    }
                }),
                ..buff(&format!("Blazing Brilliance: Crimson Phoenix{}", rank))
            },
        );
        let clock = e.buff(GDef {
            hidden: true,
            tick_every: TickEvery::Every(30.0),
            tick_fn: ticks(move |e: &mut Eng, _n: f64| {
                e.apply_current(feather, 1.0);
            }),
            update_buffs: h(|e| e.lost_on_swap()),
            ..buff(&format!("Blazing Brilliance: Crimson Phoenix{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Blazing Brilliance{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_DMG, 48.6, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(when(|e| e.is_active()), clock, To::Me), Grant { stacks: 5.0, ..grant(on_cast(&[Cast::Skill]), feather, To::Me) }],
                ..Default::default()
            },
            Weapon::Sword,
            Tier::Limited,
        )
    });
    lib.put_w("BLAZING_BRILLIANCE", w);

    // Red Spring, Camellya's sig: Beyond the Cycle
    let w = e.refinements(|e, r, rank| {
        let basic = e.buff(GDef {
            max_stacks: 3.0,
            duration: 60.0 * 14.0,
            stats: vec![(s::DMG_BONUS, [10.0, 12.5, 15.0, 17.5, 20.0][r], T_BASIC)],
            per_stack: true,
            ..buff(&format!("Red Spring: Beyond the Cycle{}", rank))
        });
        let consume = e.buff(GDef { duration: 60.0 * 10.0, stats: vec![(s::DMG_BONUS, [40.0, 50.0, 60.0, 70.0, 80.0][r], T_BASIC)], ..buff(&format!("Red Spring: Beyond the Cycle{}", rank)) });
        e.weapon(
            GDef {
                name: format!("Red Spring{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![hit_grant(on_type(&[T_BASIC]), basic, To::Me), grant(when(move |e| sh.consumed_concerto(e)), consume, To::Me)],
                ..Default::default()
            },
            Weapon::Sword,
            Tier::Limited,
        )
    });
    lib.put_w("RED_SPRING", w);

    // Unflickering Valor, Brant's sig: Laughter Prevails
    let w = e.refinements(|e, r, rank| {
        let lib_buff = e.buff(GDef { duration: 60.0 * 10.0, stats: vec![(s::DMG_BONUS, [24.0, 30.0, 36.0, 42.0, 48.0][r], T_BASIC)], ..buff(&format!("Unflickering Valor: Laughter Prevails{} (liberation)", rank)) });
        let basic = e.buff(GDef { duration: 60.0 * 4.0, stats: vec![(s::DMG_BONUS, [24.0, 30.0, 36.0, 42.0, 48.0][r], T_BASIC)], ..buff(&format!("Unflickering Valor: Laughter Prevails{} (basic)", rank)) });
        e.weapon(
            GDef {
                name: format!("Unflickering Valor{}", rank),
                stats: vec![(s::BASE_ATK, 412.5, 0), (s::ER, 77.04, 0), (s::CRIT_RATE, [8.0, 10.0, 12.0, 14.0, 16.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Liberation]), lib_buff, To::Me), hit_grant(on_type(&[T_BASIC]), basic, To::Me)],
                ..Default::default()
            },
            Weapon::Sword,
            Tier::Limited,
        )
    });
    lib.put_w("UNFLICKERING_VALOR", w);

    // Emerald Sentence, Qiuyuan's sig: When A Heart Settles
    let w = e.refinements(|e, r, rank| {
        let team = e.buff(GDef { duration: 60.0 * 30.0, stats: vec![(s::DMG_BONUS, [20.0, 25.0, 30.0, 35.0, 40.0][r], T_ECHO)], ..buff(&format!("Emerald Sentence: When A Heart Settles{}", rank)) });
        // the nameless 10s window an Intro or Basic opens for the next Echo Skills
        let ready = e.buff(GDef { duration: 60.0 * 10.0, ..buff("") });
        let cleaver = e.buff(GDef {
            max_stacks: 2.0,
            duration: 60.0 * 12.0,
            lost_on_swap: true,
            stats: vec![(s::DMG_BONUS, [30.0, 37.5, 45.0, 52.5, 60.0][r], T_HEAVY)],
            per_stack: true,
            ..buff(&format!("Emerald Sentence: Bamboo Cleaver{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Emerald Sentence{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![
                    grant(on_cast(&[Cast::Intro]), team, To::Team),
                    grant(when(|e| e.casting(Cast::Intro) || e.casting(Cast::Basic)), ready, To::Me),
                    grant(when(move |e| e.casting(Cast::Echo) && e.is_held(ready)), cleaver, To::Me),
                ],
                ..Default::default()
            },
            Weapon::Sword,
            Tier::Limited,
        )
    });
    lib.put_w("EMERALD_SENTENCE", w);

    // Glint of Clouds, Qingxiao's sig: Evil's Scourge
    let strain_shifting = sh.strain_shifting;
    let w = e.refinements(|e, r, rank| {
        let def_ignore = [10.0, 12.5, 15.0, 17.5, 20.0][r];
        // the TS reads stacksOf() after the stacks land, which is the count handed in here
        let scourge = e.buff(GDef {
            max_stacks: 5.0,
            duration_fn: dur(|_e: &Eng, n: f64| if n >= 5.0 { 60.0 * 30.0 } else { 60.0 * 2.0 }),
            stats: vec![(s::DMG_BONUS, [11.2, 14.0, 16.8, 19.6, 22.4][r], AERO)],
            per_stack: true,
            apply_stats: h(move |e| {
                if e.frozen_stacks() >= 5.0 {
                    e.add_stat(s::DEF_IGNORE_NEW, def_ignore, AERO);
                }
            }),
            ..buff(&format!("Glint of Clouds: Evil's Scourge{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Glint of Clouds{}", rank),
                stats: vec![(s::BASE_ATK, 500.0, 0), (s::CRIT_RATE, 36.0, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_inflict(&[strain_shifting]), scourge, To::Me)],
                ..Default::default()
            },
            Weapon::Sword,
            Tier::Limited,
        )
    });
    lib.put_w("GLINT_OF_CLOUDS", w);

    // Frostburn, Hiyuki's sig: Self No More
    let chafe = sh.glacio_chafe;
    let w = e.refinements(|e, r, rank| {
        let self_no_more = e.buff(GDef {
            stats: vec![(s::AMP, [28.0, 35.0, 42.0, 49.0, 56.0][r], GLACIO), (s::DEF_IGNORE_NEW, [10.0, 12.5, 15.0, 17.5, 20.0][r], T_LIBERATION)],
            ..buff(&format!("Frostburn: Self No More{}", rank))
        });
        let self_no_more_chafe = e.buff(GDef {
            duration: 60.0 * 6.0,
            stats: vec![(s::AMP, [20.0, 25.0, 30.0, 35.0, 40.0][r], S_GLACIO_CHAFE)],
            when: cond(|e: &mut Eng| e.is_active()),
            ..buff(&format!("Frostburn: Self No More{} (chafe)", rank))
        });
        e.weapon(
            GDef {
                name: format!("Frostburn{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_inflict(&[chafe]), self_no_more, To::Me), grant(on_inflict(&[chafe]), self_no_more_chafe, To::Me)],
                ..Default::default()
            },
            Weapon::Sword,
            Tier::Limited,
        )
    });
    lib.put_w("FROSTBURN", w);

    // Azure Oath, Xuanling's sig: Unbending
    let bane = sh.havoc_bane;
    let w = e.refinements(|e, r, rank| {
        let unbending = e.buff(GDef {
            duration: 60.0 * 8.0,
            stats: vec![(s::AMP, [36.0, 45.0, 54.0, 63.0, 72.0][r], T_HEAVY), (s::DEF_IGNORE_NEW, [12.0, 15.0, 18.0, 21.0, 24.0][r], T_HEAVY)],
            ..buff(&format!("Azure Oath: Unbending{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Azure Oath{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::DMG_BONUS, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_inflict(&[bane]), unbending, To::Me)],
                ..Default::default()
            },
            Weapon::Sword,
            Tier::Limited,
        )
    });
    lib.put_w("AZURE_OATH", w);

    // Everbright Polestar, Aemeath's sig: Starchaser
    let (rupture_shifting, burst) = (sh.rupture_shifting, sh.fusion_burst);
    let w = e.refinements(|e, r, rank| {
        let res_ignore = [10.0, 15.0, 20.0, 25.0, 30.0][r];
        let starchaser = e.buff(GDef {
            duration: 60.0 * 8.0,
            stats: vec![(s::DEF_IGNORE_NEW, [32.0, 40.0, 48.0, 56.0, 64.0][r], T_LIBERATION)],
            apply_stats: h(move |e| {
                if e.is_type(T_LIBERATION) {
                    e.add_stat(s::RES_IGNORE, res_ignore, FUSION);
                }
            }),
            ..buff(&format!("Everbright Polestar: Starchaser{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Everbright Polestar{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::DMG_BONUS, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_inflict(&[rupture_shifting, burst]), starchaser, To::Me)],
                ..Default::default()
            },
            Weapon::Sword,
            Tier::Limited,
        )
    });
    lib.put_w("EVERBRIGHT_POLESTAR", w);

    // Defier's Thorn, Cartethyia's sig: A Free Knight's Tarantella
    let erosion = sh.aero_erosion;
    let w = e.refinements(|e, r, rank| {
        let amp = [20.0, 25.0, 30.0, 35.0, 40.0][r];
        let tarantella = e.buff(GDef {
            duration: 60.0 * 15.0,
            stats: vec![(s::DEF_IGNORE_OLD, [8.0, 10.0, 12.0, 14.0, 16.0][r], 0)],
            apply_stats: h(move |e| {
                if e.stacks_of_enemy(erosion) > 0.0 {
                    e.add_stat(s::AMP, amp, 0);
                }
            }),
            ..buff(&format!("Defier's Thorn: A Free Knight's Tarantella{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Defier's Thorn{}", rank),
                // the 12% is A Free Knight's Tarantella's own flat half
                stats: vec![(s::BASE_ATK, 412.5, 0), (s::BONUS_HP, 72.225, 0), (s::BONUS_HP, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Intro, Cast::Basic]), tarantella, To::Me)],
                ..Default::default()
            },
            Weapon::Sword,
            Tier::Limited,
        )
    });
    lib.put_w("DEFIERS_THORN", w);

    // Unspoken Rue: Locked Thunder, Trapped Rain
    let unison = sh.unison;
    let w = e.refinements(|e, r, rank| {
        let locked = e.buff(GDef { duration: 60.0 * 30.0, stats: vec![(s::DMG_BONUS, [30.0, 37.5, 45.0, 52.5, 60.0][r], ELECTRO)], ..buff(&format!("Unspoken Rue: Locked Thunder, Trapped Rain{}", rank)) });
        let binding = e.buff(GDef { duration: 60.0 * 30.0, stats: vec![(s::DMG_BONUS, [24.0, 30.0, 36.0, 42.0, 48.0][r], ELECTRO)], ..buff(&format!("Unspoken Rue: Binding Mind{}", rank)) });
        let yearning = e.buff(GDef {
            lost_on_swap: true,
            duration: 60.0 * 14.0,
            stats: vec![(s::DMG_BONUS, [40.0, 50.0, 60.0, 70.0, 80.0][r], ELECTRO)],
            ..buff(&format!("Unspoken Rue: Yearning Mind{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Unspoken Rue{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                update_buffs: h(move |e| {
                    if e.applied(unison) > 0.0 {
                        e.apply_current(locked, 1.0);
                        e.apply_team(binding, 1.0);
                        e.revoke_current(yearning);
                    }
                    if sh.consumed_concerto(e) {
                        e.apply_current(yearning, 1.0);
                        e.revoke_team(binding);
                    }
                }),
                ..Default::default()
            },
            Weapon::Sword,
            Tier::Limited,
        )
    });
    lib.put_w("UNSPOKEN_RUE", w);
}

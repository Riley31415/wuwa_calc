//! src/weapons/broadblade.ts.
use crate::eng::*;
use crate::kits::shared::{buff, h, Shared};
use crate::kits::Lib;
use crate::loadout::Tier;

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    let sh = *sh;
    let heals = sh.heals;
    let shield = sh.shield;

    // Verdant Summit, Jiyan's sig: Swordsworn
    let w = e.refinements(|e, r, rank| {
        let stacks = e.buff(GDef {
            max_stacks: 2.0,
            duration: 60.0 * 14.0,
            stats: vec![(s::DMG_BONUS, [24.0, 30.0, 36.0, 42.0, 48.0][r], T_HEAVY)],
            per_stack: true,
            ..buff(&format!("Verdant Summit: Swordsworn{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Verdant Summit{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_DMG, 48.6, 0), (s::DMG_BONUS, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Intro, Cast::Liberation]), stacks, To::Me)],
                ..Default::default()
            },
            Weapon::Broadblade,
            Tier::Limited,
        )
    });
    lib.put_w("VERDANT_SUMMIT", w);

    // Ages of Harvest, Jinhsi's sig: Divine Blessing
    let w = e.refinements(|e, r, rank| {
        let marking = e.buff(GDef {
            duration: 60.0 * 12.0,
            stats: vec![(s::DMG_BONUS, [24.0, 30.0, 36.0, 42.0, 48.0][r], T_SKILL)],
            ..buff(&format!("Ages of Harvest: Ageless Marking{}", rank))
        });
        let endowment = e.buff(GDef {
            duration: 60.0 * 12.0,
            stats: vec![(s::DMG_BONUS, [24.0, 30.0, 36.0, 42.0, 48.0][r], T_SKILL)],
            ..buff(&format!("Ages of Harvest: Ethereal Endowment{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Ages of Harvest{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_RATE, 24.3, 0), (s::DMG_BONUS, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Intro]), marking, To::Me), grant(on_cast(&[Cast::Skill]), endowment, To::Me)],
                ..Default::default()
            },
            Weapon::Broadblade,
            Tier::Limited,
        )
    });
    lib.put_w("AGES_OF_HARVEST", w);

    // Thunderflare Dominion, Augusta's sig: Thunderblaze Eminence
    let w = e.refinements(|e, r, rank| {
        let dmg = e.buff(GDef {
            duration: 60.0 * 15.0,
            stats: vec![(s::DMG_BONUS, [20.0, 25.0, 30.0, 35.0, 40.0][r], T_HEAVY)],
            ..buff(&format!("Thunderflare Dominion: Thunderblaze Eminence{} (intro/skill)", rank))
        });
        let def = e.buff(GDef {
            max_stacks: 5.0,
            duration: 60.0 * 7.0,
            stats: vec![(s::DEF_IGNORE_NEW, [7.2, 8.4, 9.6, 10.8, 12.0][r], T_HEAVY)],
            per_stack: true,
            ..buff(&format!("Thunderflare Dominion: Thunderblaze Eminence{} (shield)", rank))
        });
        e.weapon(
            GDef {
                name: format!("Thunderflare Dominion{}", rank),
                stats: vec![(s::BASE_ATK, 675.0, 0), (s::CRIT_RATE, 12.15, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Intro, Cast::Skill]), dmg, To::Me), grant_count(on_applied(&[shield]), def, To::Me, move |e| e.applied(shield))],
                ..Default::default()
            },
            Weapon::Broadblade,
            Tier::Limited,
        )
    });
    lib.put_w("THUNDERFLARE_DOMINION", w);

    // Wildfire Mark, Lupa's sig: Blazing Starfire
    let w = e.refinements(|e, r, rank| {
        let team = e.buff(GDef {
            duration: 60.0 * 30.0,
            stats: vec![(s::DMG_BONUS, [24.0, 30.0, 36.0, 42.0, 48.0][r], FUSION)],
            ..buff(&format!("Wildfire Mark: Blazing Starfire{} (team)", rank))
        });
        let extended = e.buff(GDef { hidden: true, ..buff(&format!("Wildfire Mark: Blazing Starfire{} (extended)", rank)) });
        let lib_dmg = e.reserve(&format!("Wildfire Mark: Blazing Starfire{}", rank));
        e.define_buff(
            lib_dmg,
            GDef {
                duration: 60.0 * 6.0,
                stats: vec![(s::DMG_BONUS, [24.0, 30.0, 36.0, 42.0, 48.0][r], T_LIBERATION)],
                update_debuffs: h(move |e| {
                    if !e.is_type(T_HEAVY) || e.is_held(extended) {
                        return;
                    }
                    e.extend_current(lib_dmg, 60.0 * 4.0);
                    e.apply_current(extended, 1.0);
                    e.apply_team(team, 1.0);
                }),
                ..buff(&format!("Wildfire Mark: Blazing Starfire{}", rank))
            },
        );
        e.weapon(
            GDef {
                name: format!("Wildfire Mark{}", rank),
                stats: vec![(s::BASE_ATK, 587.5, 0), (s::CRIT_DMG, 48.6, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Intro, Cast::Liberation]), lib_dmg, To::Me)],
                // a fresh grant can be extended again
                update_buffs: h(move |e| {
                    if e.casting(Cast::Intro) || e.casting(Cast::Liberation) {
                        e.revoke_current(extended);
                    }
                }),
                ..Default::default()
            },
            Weapon::Broadblade,
            Tier::Limited,
        )
    });
    lib.put_w("WILDFIRE_MARK", w);

    // Thousandfold Deliverance, Jingran's sig: Nature's Order and Cradle of Life
    let w = e.refinements(|e, r, rank| {
        let crit_rate = [12.0, 15.0, 18.0, 21.0, 24.0][r];
        let natures_order = e.buff(GDef {
            max_stacks: 6.0,
            duration: 60.0 * 7.0,
            lost_on_swap: true,
            stats: vec![(s::CRIT_DMG, [4.0, 5.0, 6.0, 7.0, 8.0][r], 0)],
            per_stack: true,
            apply_stats: h(move |e| {
                if e.frozen_stacks() >= 6.0 {
                    e.add_stat(s::CRIT_RATE, crit_rate, T_HEAVY);
                }
            }),
            ..buff(&format!("Thousandfold Deliverance: Nature's Order{}", rank))
        });
        // what a heavy's spend pays out, held at the stacks it spent, over the press and its summons
        let cradle_spent = e.buff(GDef {
            max_stacks: 2.0,
            duration: 60.0 * 2.0,
            stats: vec![(s::DEF_IGNORE_NEW, [15.0, 17.5, 20.0, 22.5, 25.0][r], T_HEAVY)],
            per_stack: true,
            ..buff(&format!("Thousandfold Deliverance: Cradle of Life{} (spent)", rank))
        });
        let cradle = e.reserve(&format!("Thousandfold Deliverance: Cradle of Life{}", rank));
        e.define_buff(
            cradle,
            GDef {
                max_stacks: 6.0,
                duration: 60.0 * 7.0,
                lost_on_swap: true,
                update_buffs: h(move |e| {
                    if !e.casting(Cast::Heavy) {
                        return;
                    }
                    let spent = e.frozen_stacks().min(2.0);
                    if spent == 0.0 {
                        return;
                    }
                    e.remove_stack_current(cradle, spent);
                    // applied mid-phase: misses this action's own updateBuffs but pays into its press
                    e.set_stacks_self(cradle_spent, spent);
                }),
                ..buff(&format!("Thousandfold Deliverance: Cradle of Life{}", rank))
            },
        );
        e.weapon(
            GDef {
                name: format!("Thousandfold Deliverance{}", rank),
                stats: vec![(s::BASE_ATK, 412.5, 0), (s::BONUS_HP, 72.225, 0), (s::DMG_BONUS, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                // two separate triggers, so his Intro (which also shields) pays both and stacks twice
                grants: vec![
                    grant(on_cast(&[Cast::Intro]), natures_order, To::Me),
                    grant(on_cast(&[Cast::Intro]), cradle, To::Me),
                    grant_count(on_applied(&[shield]), natures_order, To::Me, move |e| e.applied(shield)),
                    grant_count(on_applied(&[shield]), cradle, To::Me, move |e| e.applied(shield)),
                ],
                ..Default::default()
            },
            Weapon::Broadblade,
            Tier::Limited,
        )
    });
    lib.put_w("JINGRAN_SIG", w);

    // Starfield Calibrator, Mornye's sig: Definite Solution
    let w = e.refinements(|e, r, rank| {
        let team = e.buff(GDef {
            duration: 60.0 * 4.0,
            stats: vec![(s::CRIT_DMG, [20.0, 25.0, 30.0, 35.0, 40.0][r], 0)],
            when: cond(|e: &mut Eng| e.is_active()),
            ..buff(&format!("Starfield Calibrator: Definite Solution{} (team)", rank))
        });
        let ds = e.reserve(&format!("Starfield Calibrator: Definite Solution{}", rank));
        let concerto = [8.0, 10.0, 12.0, 14.0, 16.0][r];
        e.define_buff(
            ds,
            GDef {
                update_buffs: h(move |e| {
                    if !e.casting(Cast::Skill) {
                        return;
                    }
                    e.add_to_cast([0.0, concerto, 0.0, 0.0, 0.0, 0.0, 0.0]);
                    e.revoke_current(ds);
                }),
                ..buff(&format!("Starfield Calibrator: Definite Solution{}", rank))
            },
        );
        e.weapon(
            GDef {
                name: format!("Starfield Calibrator{}", rank),
                stats: vec![(s::BASE_ATK, 412.5, 0), (s::ER, 77.04, 0), (s::BONUS_DEF, [16.0, 20.0, 24.0, 28.0, 32.0][r], 0)],
                combat_start: h(move |e| {
                    e.apply_current(ds, 1.0);
                }),
                grants: vec![grant(on_applied(&[heals]), team, To::Team), grant(on_cast(&[Cast::Outro]), ds, To::Me)],
                ..Default::default()
            },
            Weapon::Broadblade,
            Tier::Limited,
        )
    });
    lib.put_w("STARFIELD_CALIBRATOR", w);

    // Kumokiri, Chisa's sig: Thread of Fate
    let w = e.refinements(|e, r, rank| {
        let bonus = e.buff(GDef {
            duration: 60.0 * 15.0,
            stats: vec![(s::DMG_BONUS, [24.0, 30.0, 36.0, 42.0, 48.0][r], 0)],
            ..buff(&format!("Kumokiri: Thread of Fate{} (team)", rank))
        });
        let stacks = e.buff(GDef {
            max_stacks: 3.0,
            duration: 60.0 * 15.0,
            stats: vec![(s::DMG_BONUS, [8.0, 10.0, 12.0, 14.0, 16.0][r], T_LIBERATION)],
            per_stack: true,
            // on every hit, to each member credited with an inflict on it, whoever's hit it was
            hit_global: h(move |e| {
                if e.frozen_stacks() < 3.0 {
                    return;
                }
                for m in 0..e.nslots {
                    if let Some(res) = e.members[m].resonator {
                        if sh.inflicted_negative_status_by(e, m) {
                            e.add_buff(res, bonus, 1.0);
                        }
                    }
                }
            }),
            ..buff(&format!("Kumokiri: Thread of Fate{}", rank))
        });
        e.weapon(
            GDef {
                name: format!("Kumokiri{}", rank),
                stats: vec![(s::BASE_ATK, 500.0, 0), (s::CRIT_RATE, 36.0, 0), (s::BONUS_ATK, [12.0, 15.0, 18.0, 21.0, 24.0][r], 0)],
                grants: vec![grant(on_cast(&[Cast::Intro]), stacks, To::Me)],
                // any hit her own inflict is credited on, her Snare's Bane off a teammate's swing included
                hit_global: h(move |e| {
                    if sh.inflicted_negative_status_by(e, e.slot) {
                        e.apply_current(stacks, 1.0);
                    }
                }),
                ..Default::default()
            },
            Weapon::Broadblade,
            Tier::Limited,
        )
    });
    lib.put_w("KUMOKIRI", w);
}

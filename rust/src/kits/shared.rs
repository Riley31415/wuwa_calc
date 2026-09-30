//! shared/status.ts, shared/tunebreak.ts and shared/unison.ts: the statuses, the Tune Break and
//! Unison — the machinery every kit reaches into.
use super::Lib;
use crate::authoring::ResDef;
use crate::eng::*;
use std::rc::Rc;

pub use crate::eng::h;
pub fn buff(name: &str) -> GDef {
    GDef { name: name.into(), is_buff: true, ..Default::default() }
}

/// A status's damage ladder: an Action per stack count, index 0 empty.
pub type Ladder = Rc<Vec<Option<ActId>>>;

/// The ids closures capture: every status, the Tune Break machinery and Unison.
#[derive(Clone, Copy)]
pub struct Shared {
    pub shield: GearId,
    pub shield_ready: GearId,
    pub heals: GearId,
    pub havoc_bane: GearId,
    pub glacio_chafe: GearId,
    pub fusion_burst: GearId,
    pub aero_erosion: GearId,
    pub erosion_haste: GearId,
    pub spectro_frazzle: GearId,
    pub frazzle_slowed: GearId,
    pub shimmer: GearId,
    pub heliacal_ember: GearId,
    pub electro_rage: GearId,
    pub flare_retained: GearId,
    pub electro_flare: GearId,
    pub tune_break: ActId,
    pub tune_break_cooldown: GearId,
    pub rupture_shifting: GearId,
    pub strain_shifting: GearId,
    pub hack_shifting: GearId,
    pub rupture_interfered: GearId,
    pub strain_interfered: GearId,
    pub hack_interfered: GearId,
    pub enemy: GearId,
    pub base_resistance: GearId,
    pub unison: GearId,
    pub unison_intro: GearId,
    pub unison_response: GearId,
    pub unison_boon: GearId,
    pub nine_shadows: GearId,
}

pub const ENEMY_MAX_OFFTUNE: f64 = 392_000.0;

/// status.ts's negativeStatusRung: the rung a live count names, or none.
pub fn rung(ladder: &[Option<ActId>], held: f64) -> Option<ActId> {
    if held < 1.0 {
        return None;
    }
    ladder[(held as usize).min(ladder.len() - 1)]
}

fn ladder(e: &mut Eng, name: &str, element: u32, subtype: u32, mvs: &[f64]) -> Ladder {
    let mut v = vec![None];
    for (i, &mv) in mvs.iter().enumerate() {
        let n = i + 1;
        v.push(Some(e.action(ADef {
            name: format!("{} - {} Stack{}", name, n, if n > 1 { "s" } else { "" }),
            element,
            typ: T_STATUS,
            subtype,
            scaling: Scaling::Dot,
            mv,
            ..Default::default()
        })));
    }
    Rc::new(v)
}

impl Shared {
    fn negative_statuses(&self) -> [GearId; 6] {
        [self.havoc_bane, self.glacio_chafe, self.electro_flare, self.fusion_burst, self.aero_erosion, self.spectro_frazzle]
    }
    /// Did this kit inflict any Negative Status on the press being evaluated?
    pub fn inflicted_negative_status(&self, e: &Eng) -> bool {
        self.negative_statuses().iter().any(|&d| e.applied_by_me(d) > 0.0)
    }
    pub fn any_negative_status_inflicted(&self, e: &Eng) -> bool {
        self.negative_statuses().iter().any(|&d| e.applied(d) > 0.0)
    }
    pub fn has_negative_status(&self, e: &Eng) -> bool {
        self.negative_statuses().iter().any(|&d| e.stacks_of_enemy(d) > 0.0)
    }
    pub fn inflicted_negative_status_by(&self, e: &Eng, member: usize) -> bool {
        self.negative_statuses().iter().any(|&d| e.applied_by_member(d, member) > 0.0)
    }
    /// status.ts's gainShield(): a shield off this hit or cast, at a 0.5s cooldown per resonator.
    pub fn gain_shield(&self, e: &mut Eng) {
        let now = e.frame;
        if now < e.stacks_of(self.shield_ready) {
            return;
        }
        e.apply_current(self.shield, 1.0);
        e.set_stacks_self(self.shield_ready, now + 30.0);
    }
    /// status.ts's inflictElectroFlare(): what the cap turns away lands as Electro Rage.
    pub fn inflict_electro_flare(&self, e: &mut Eng, n: f64) {
        let before = e.stacks_of_enemy(self.electro_flare);
        let over = n - (e.apply_enemy(self.electro_flare, n) - before);
        if over > 0.0 {
            e.apply_enemy(self.electro_rage, over);
        }
    }
    fn shifting(&self, e: &mut Eng, which: GearId) {
        for other in [self.rupture_shifting, self.strain_shifting, self.hack_shifting] {
            if other != which {
                e.revoke_enemy(other);
            }
        }
        e.apply_enemy(which, 1.0);
    }
    pub fn apply_rupture(&self, e: &mut Eng) {
        self.shifting(e, self.rupture_shifting);
    }
    pub fn apply_strain(&self, e: &mut Eng) {
        self.shifting(e, self.strain_shifting);
    }
    pub fn apply_hack(&self, e: &mut Eng) {
        self.shifting(e, self.hack_shifting);
    }
    pub fn tune_rupture_response(&self, e: &mut Eng, a: ActId) {
        if e.running_action(self.tune_break) && e.applied(self.rupture_interfered) > 0.0 {
            e.queue(a);
        }
    }
    pub fn tune_hack_response(&self, e: &mut Eng, a: ActId) {
        if e.running_action(self.tune_break) && e.applied(self.hack_interfered) > 0.0 {
            e.queue(a);
        }
    }
    /// unison.ts's unisonIntro(): is the Intro answering a Unison outro?
    pub fn unison_intro(&self, e: &Eng) -> bool {
        e.is_held(self.unison_intro) || e.outro_queue.contains(&self.unison_intro)
    }
    pub fn respond_to_unison(&self, e: &mut Eng) {
        if e.is_held(self.unison_intro) {
            e.apply_current(self.unison_response, 1.0);
        }
    }
    pub fn is_double_intro(&self, e: &Eng) -> bool {
        e.outro_dir == -1
    }
    /// unison.ts's consumedConcerto(): a cast of the wielder's own that spends Concerto.
    pub fn consumed_concerto(&self, e: &mut Eng) -> bool {
        e.cur().concerto + e.get_stat(s::ADD_CONCERTO) + e.cast_gained(1) < 0.0 && !e.casting(Cast::Outro)
    }
    /// unison.ts's grantBoon(): one granter's stack, its retriggers only resetting the clock.
    pub fn grant_boon(&self, e: &mut Eng, marker: GearId) {
        if e.stacks_of_team(self.unison_boon) > 0.0 && e.is_held(marker) {
            e.refresh_team(self.unison_boon);
            return;
        }
        e.apply_team(self.unison_boon, 1.0);
        e.apply_current(marker, 1.0);
    }
    pub fn unison_boon_amp(&self, e: &mut Eng) {
        let stacks = e.stacks_of_team(self.unison_boon);
        if stacks != 0.0 {
            let per = if e.stacks_of_team(self.nine_shadows) != 0.0 { 4.5 } else { 3.0 };
            e.add_stat(s::AMP, per * stacks, 0);
        }
    }
    /// A responder's own carrier for the Boon's payout.
    pub fn boon_payout(&self, e: &mut Eng) -> GearId {
        let sh = *self;
        e.buff(GDef { name: "Unison Boon".into(), hidden: true, apply_stats: h(move |e| sh.unison_boon_amp(e)), ..Default::default() })
    }
    /// tunebreak.ts's strainPayout(): a Tune Strain responder's own carrier for the payout.
    pub fn strain_payout(&self, e: &mut Eng) -> GearId {
        let si = self.strain_interfered;
        e.buff(GDef {
            name: "Tune Strain - Interfered".into(),
            hidden: true,
            late_convert: h(move |e| {
                let stacks = e.stacks_of_enemy(si);
                if stacks == 0.0 {
                    return;
                }
                let v = 0.12 * e.get_stat(s::TBB) * stacks;
                e.add_stat(s::TOTAL_DMG, v, 0);
            }),
            ..Default::default()
        })
    }
    /// tunebreak.ts's tuneBreak(): the break as one resonator performs it.
    pub fn tune_break_form(&self, e: &mut Eng, anim: f64, timestop: f64, motion_stop: f64, bullets: &[(f64, f64)]) -> ActId {
        let bullets: Vec<BulletDef> = bullets.iter().map(|&(hit, mv)| BulletDef { hit, mv, ..Default::default() }).collect();
        let out = e.variant(self.tune_break, |d| {
            d.anim = anim;
            d.timestop = timestop;
            d.motion_stop = motion_stop;
            d.bullets = bullets;
        });
        e.acts[out as usize].form_of = Some(self.tune_break);
        out
    }
    /// unison.ts's unisonOutro(): the same Outro declaring no Concerto spend.
    pub fn unison_outro(&self, e: &mut Eng, outro: ActId) -> ActId {
        let name = format!("{} (Unison)", e.acts[outro as usize].name);
        let out = e.variant(outro, |d| {
            d.name = name;
            d.concerto = 0.0;
            d.cast_concerto = 0.0;
        });
        e.acts[out as usize].form_of = Some(outro);
        out
    }
}

/// status.ts's queueOnApplier: a status's rung on whoever put the status there.
pub fn queue_on_applier(e: &mut Eng, status: GearId, rung: ActId) {
    let src = e.source_of[status as usize];
    if src >= 0 && (src as usize) < e.nslots && e.members[src as usize].resonator.is_some() {
        let r = e.members[src as usize].resonator.unwrap();
        e.queue_on(r, rung);
    } else {
        e.queue(rung);
    }
}

pub fn build(e: &mut Eng, lib: &mut Lib) -> Shared {
    let heals = e.common.heals;
    let shield = e.buff(GDef { max_stacks: 9999.0, ..buff("Shield") });
    let shield_ready = e.buff(GDef { max_stacks: 1e9, hidden: true, ..buff("Shield Cooldown") });
    let havoc_bane = e.debuff(GDef {
        max_stacks: 3.0,
        duration: 60.0 * 25.0,
        apply_stats: h(|e| {
            let n = e.frozen_stacks();
            e.add_stat(s::DEF_REDUCE, 2.0 * n, 0);
        }),
        ..buff("Havoc Bane")
    });

    let chafe_ladder = ladder(e, "Glacio Chafe", GLACIO, S_GLACIO_CHAFE, &[24.5, 44.42, 64.34, 84.26, 104.17, 124.09, 144.01, 163.93, 183.85, 203.77, 271.69, 339.61, 407.53, 475.46, 543.38, 611.3]);
    let own_rungs = lib.own_chafe_rungs.clone();
    let glacio_chafe = e.reserve("Glacio Chafe");
    let cl = chafe_ladder.clone();
    e.define_debuff(
        glacio_chafe,
        GDef {
            max_stacks: 10.0,
            duration: 60.0 * 15.0,
            hit_global: h(move |e| {
                let held = e.stacks_of_enemy(glacio_chafe);
                let me = e.slot;
                let own = if e.on_field >= 0 && e.on_field as usize == me {
                    e.members[me].resonator.and_then(|r| own_rungs.borrow().iter().find(|x| x.0 == r).map(|x| x.1.clone()))
                } else {
                    None
                };
                let rungs = own.unwrap_or_else(|| cl.clone());
                let from = (held - e.applied(glacio_chafe) + 1.0).max(1.0);
                let mut n = from;
                while n <= held {
                    e.queue(rungs[n as usize].unwrap());
                    n += 1.0;
                }
            }),
            ..buff("Glacio Chafe")
        },
    );

    let burst_ladder = ladder(e, "Fusion Burst", FUSION, S_FUSION_BURST, &[84.0, 152.29, 220.58, 288.88, 357.17, 425.46, 493.75, 562.04, 630.34, 698.63, 931.5, 1164.38, 1397.26, 1630.13, 1863.01, 2095.88]);
    let fusion_burst = e.reserve("Fusion Burst");
    let (bl1, bl2) = (burst_ladder.clone(), burst_ladder.clone());
    e.define_debuff(
        fusion_burst,
        GDef {
            max_stacks: 10.0,
            duration: 60.0 * 15.0,
            apply_stats: h(move |e| {
                if !e.is_type(S_FUSION_BURST) || e.cur().mv != 0.0 {
                    return;
                }
                let cap = e.enemy_max_of(fusion_burst) as usize;
                if let Some(Some(r)) = bl1.get(cap) {
                    let (r, mv) = (*r, e.acts[*r as usize].mv);
                    let g = e.acts[r as usize].gear;
                    e.as_source(g, |e| e.add_stat(s::ADD_MV, mv, 0));
                }
            }),
            update_debuffs: h(move |e| {
                let n = e.frozen_stacks();
                if n < e.enemy_max_of(fusion_burst) {
                    return;
                }
                e.queue(bl2[n as usize].unwrap());
                e.revoke_enemy(fusion_burst);
            }),
            ..buff("Fusion Burst")
        },
    );

    let erosion_ladder = ladder(e, "Aero Erosion", AERO, S_AERO_EROSION, &[45.0, 112.5, 225.0, 337.5, 450.0, 562.5, 675.0, 787.5, 900.0, 1012.5, 1125.0, 1237.5, 1350.0, 1462.5, 1575.0]);
    let erosion_haste = e.debuff(GDef::default());
    let aero_erosion = e.reserve("Aero Erosion");
    let el = erosion_ladder.clone();
    e.define_debuff(
        aero_erosion,
        GDef {
            max_stacks: 3.0,
            duration: 60.0 * 14.8,
            tick_every: TickEvery::Fn(Rc::new(move |e: &Eng| if e.stacks_of_enemy(erosion_haste) != 0.0 { 90.0 } else { 180.0 })),
            tick_fn: ticks(move |e: &mut Eng, _n: f64| {
                if let Some(r) = rung(&el, e.stacks_of_enemy(aero_erosion)) {
                    queue_on_applier(e, aero_erosion, r);
                }
            }),
            ..buff("Aero Erosion")
        },
    );

    let frazzle_mvs = [30.0, 54.39, 78.78, 103.17, 127.56, 151.95, 176.34, 200.73, 225.12, 249.51, 332.68, 415.85, 499.02, 582.19, 665.36, 748.53];
    let frazzle_ladder = ladder(e, "Spectro Frazzle", SPECTRO, S_SPECTRO_FRAZZLE, &frazzle_mvs);
    let frazzle_slowed = e.debuff(GDef::default());
    let shimmer = e.debuff(GDef { duration: 60.0 * 9.0, ..buff("Shimmer") });
    let spectro_frazzle = e.reserve("Spectro Frazzle");
    let fl = frazzle_ladder.clone();
    e.define_debuff(
        spectro_frazzle,
        GDef {
            max_stacks: 10.0,
            tick_every: TickEvery::Fn(Rc::new(move |e: &Eng| if e.stacks_of_enemy(frazzle_slowed) != 0.0 { 270.0 } else { 180.0 })),
            tick_fn: ticks(move |e: &mut Eng, _n: f64| {
                let Some(r) = rung(&fl, e.stacks_of_enemy(spectro_frazzle)) else { return };
                queue_on_applier(e, spectro_frazzle, r);
                if e.stacks_of_enemy(shimmer) == 0.0 {
                    e.remove_stack_enemy(spectro_frazzle, 1.0);
                }
            }),
            ..buff("Spectro Frazzle")
        },
    );
    let heliacal_ember = e.reserve("Heliacal Ember");
    e.define_debuff(
        heliacal_ember,
        GDef {
            max_stacks: 60.0,
            tick_every: TickEvery::Every(360.0),
            tick_fn: ticks(move |e: &mut Eng, _n: f64| {
                e.remove_stack_enemy(heliacal_ember, 1.0);
            }),
            ..buff("Heliacal Ember")
        },
    );
    let mut ember = vec![None];
    for i in 0..frazzle_mvs.len() {
        let fl = frazzle_ladder.clone();
        ember.push(Some(e.action(ADef {
            name: format!("Heliacal Ember - {} Stack{}", i + 1, if i > 0 { "s" } else { "" }),
            element: SPECTRO,
            typ: T_STATUS,
            subtype: S_SPECTRO_FRAZZLE,
            scaling: Scaling::Dot,
            bullets: vec![BulletDef { hit: 0.0, ..Default::default() }],
            apply_stats: h(move |e| {
                for n in (0..=i).rev() {
                    let r = fl[n + 1].unwrap();
                    let (g, mv) = (e.acts[r as usize].gear, e.acts[r as usize].mv);
                    e.as_source(g, |e| e.add_stat(s::ADD_MV, mv, 0));
                }
            }),
            ..Default::default()
        })));
    }

    let flare_mvs = [50.0, 90.65, 131.3, 171.95, 212.6, 253.25, 293.9, 334.55, 375.2, 415.85, 554.47, 693.08, 831.7, 970.32, 1108.93, 1247.55];
    let flare_ladder = ladder(e, "Electro Flare", ELECTRO, S_ELECTRO_FLARE, &flare_mvs);
    let rage_ladder = ladder(e, "Electro Rage", ELECTRO, S_ELECTRO_FLARE, &flare_mvs);
    let electro_rage = e.debuff(GDef { max_stacks: 10.0, ..buff("Electro Rage") });
    let flare_retained = e.debuff(GDef::default());
    let electro_flare = e.reserve("Electro Flare");
    let (fl1, fl2, rl) = (flare_ladder.clone(), flare_ladder.clone(), rage_ladder.clone());
    e.define_debuff(
        electro_flare,
        GDef {
            max_stacks: 10.0,
            duration: 60.0 * 15.0,
            apply_stats: h(move |e| {
                if !e.is_type(S_ELECTRO_FLARE) || e.cur().mv != 0.0 {
                    return;
                }
                if let Some(r) = rung(&fl1, e.frozen_stacks()) {
                    let (g, mv) = (e.acts[r as usize].gear, e.acts[r as usize].mv);
                    e.as_source(g, |e| e.add_stat(s::ADD_MV, mv, 0));
                }
            }),
            tick_every: TickEvery::Every(300.0),
            tick_fn: ticks(move |e: &mut Eng, _n: f64| {
                let held = e.stacks_of_enemy(electro_flare);
                let Some(r) = rung(&fl2, held) else { return };
                queue_on_applier(e, electro_flare, r);
                if let Some(rage) = rung(&rl, e.stacks_of_enemy(electro_rage)) {
                    queue_on_applier(e, electro_flare, rage);
                    e.revoke_enemy(electro_rage);
                }
                if e.stacks_of_enemy(flare_retained) == 0.0 {
                    e.remove_stack_enemy(electro_flare, held - (held / 2.0).floor());
                }
            }),
            ..buff("Electro Flare")
        },
    );

    /* ------------------------------------------------------------------ the Tune Break */
    let rupture_interfered = e.debuff(GDef { duration: 480.0, ..buff("Tune Rupture - Interfered") });
    let strain_interfered = e.debuff(GDef { max_stacks: 1.0, ..buff("Tune Strain - Interfered") });
    let hack_interfered = e.debuff(GDef { duration: 480.0, ..buff("Tune Hack - Interfered") });
    let tune_break = e.action(ADef {
        name: "Tune Break (Auto Generated)".into(),
        element: PHYSICAL,
        scaling: Scaling::Tune,
        cast: Cast::TuneBreak,
        typ: T_BREAK,
        mv: 1600.0,
        slot_enemy: true,
        anim: 90.0,
        timestop: 90.0,
        motion_stop: 70.0,
        apply_stats: h(|e| e.add_stat(s::DIRECT_OFFTUNE, -ENEMY_MAX_OFFTUNE, 0)),
        ..Default::default()
    });
    let shifting = |e: &mut Eng, name: &str, interfered: GearId| -> GearId {
        let id = e.reserve(name);
        e.define_debuff(
            id,
            GDef {
                update_debuffs: h(move |e| {
                    if !e.running_action(tune_break) {
                        return;
                    }
                    e.revoke_enemy(id);
                    e.apply_enemy(interfered, 1.0);
                }),
                ..buff(name)
            },
        );
        id
    };
    let rupture_shifting = shifting(e, "Tune Rupture - Shifting", rupture_interfered);
    let strain_shifting = shifting(e, "Tune Strain - Shifting", strain_interfered);
    let hack_shifting = shifting(e, "Tune Hack - Shifting", hack_interfered);
    let cooldown = e.debuff(GDef {
        duration: 60.0 * 3.0,
        late_convert: h(|e| {
            let built = e.acts[e.pressed() as usize].offtune + e.get_stat(s::ADD_OFFTUNE);
            if built > 0.0 {
                let v = -built * e.get_stat(s::OFFTUNE_BUILDUP) / 100.0;
                e.add_stat(s::DIRECT_OFFTUNE, v, 0);
            }
        }),
        ..buff("Tune Break Cooldown")
    });
    let res_lines: Vec<(usize, f64, u32)> = [AERO, ELECTRO, FUSION, GLACIO, SPECTRO, HAVOC, PHYSICAL].iter().map(|&a| (s::RES_REDUCE, -20.0, a)).collect();
    let base_resistance = e.gear(GDef { name: "Base Resistance".into(), constant: res_lines, ..Default::default() });

    /* ------------------------------------------------------------------ Unison */
    let unison = e.reserve("Unison");
    let unison_intro = e.reserve("");
    e.define_buff(
        unison,
        GDef {
            name: "Unison".into(),
            update_buffs: h(move |e| {
                if !e.casting(Cast::Outro) {
                    return;
                }
                e.revoke_current(unison);
                e.queue_outro(unison_intro);
            }),
            ..Default::default()
        },
    );
    e.define_buff(
        unison_intro,
        GDef {
            after_action: h(move |e| {
                if e.casting(Cast::Intro) {
                    e.revoke_current(unison_intro);
                }
            }),
            ..Default::default()
        },
    );
    let unison_response = e.reserve("");
    e.define_buff(
        unison_response,
        GDef {
            after_action: h(move |e| {
                if e.casting(Cast::Intro) {
                    e.revoke_current(unison_response);
                }
            }),
            ..Default::default()
        },
    );
    let unison_boon = e.buff(GDef { max_stacks: 4.0, duration: 60.0 * 30.0, ..buff("Unison Boon") });
    let nine_shadows = e.buff(buff("Suoming S6: Nine Shadows at Her Side"));

    let enemy = e.reserve("Tune Break");
    let sh = Shared {
        shield,
        shield_ready,
        heals,
        havoc_bane,
        glacio_chafe,
        fusion_burst,
        aero_erosion,
        erosion_haste,
        spectro_frazzle,
        frazzle_slowed,
        shimmer,
        heliacal_ember,
        electro_rage,
        flare_retained,
        electro_flare,
        tune_break,
        tune_break_cooldown: cooldown,
        rupture_shifting,
        strain_shifting,
        hack_shifting,
        rupture_interfered,
        strain_interfered,
        hack_interfered,
        enemy,
        base_resistance,
        unison,
        unison_intro,
        unison_response,
        unison_boon,
        nine_shadows,
    };
    // each weapon class's own break
    let classes = [
        (Weapon::Sword, sh.tune_break_form(e, 90.0, 90.0, 70.0, &[(30.0, 100.0), (36.0, 100.0), (42.0, 100.0), (48.0, 100.0), (72.0, 1200.0)])),
        (Weapon::Broadblade, sh.tune_break_form(e, 94.0, 94.0, 64.0, &[(4.0, 173.34), (26.0, 226.66), (66.0, 1200.0)])),
        (Weapon::Rectifier, sh.tune_break_form(e, 90.0, 90.0, 54.0, &[(56.0, 1600.0)])),
        (Weapon::Pistols, sh.tune_break_form(e, 96.0, 96.0, 70.0, &[(72.0, 1600.0)])),
        (Weapon::Gauntlets, sh.tune_break_form(e, 92.0, 92.0, 70.0, &[(72.0, 1600.0)])),
    ];
    let press = e.action(ADef {
        name: "Tune Break Placeholder".into(),
        resolve: resolver(move |e: &mut Eng| {
            let Some(r) = e.members[e.slot].resonator else { return Some(tune_break) };
            let info = e.gears[r as usize].res.clone().unwrap();
            if let Some(own) = info.tune_break {
                return match e.acts[own as usize].resolve.clone() {
                    Some(f) => f(e),
                    None => Some(own),
                };
            }
            Some(classes.iter().find(|c| c.0 == info.weapon).unwrap().1)
        }),
        ..Default::default()
    });
    e.resonator(
        enemy,
        ResDef {
            name: "Tune Break",
            enemy: true,
            element: PHYSICAL,
            weapon: Weapon::Sword,
            color: "#c9d2de",
            g: GDef {
                combat_start: h(move |e| e.equip(base_resistance)),
                update_debuffs: h(move |e| {
                    if !e.running_action(tune_break) {
                        return;
                    }
                    if e.offtune >= ENEMY_MAX_OFFTUNE {
                        e.offtune = ENEMY_MAX_OFFTUNE;
                    }
                    e.apply_enemy(cooldown, 1.0);
                }),
                after_action: h(move |e| {
                    if e.triggered || !e.is_active() {
                        return;
                    }
                    if e.inside_group {
                        return;
                    }
                    if e.stacks_of_enemy(rupture_interfered) > 0.0 || e.stacks_of_enemy(hack_interfered) > 0.0 {
                        return;
                    }
                    if e.is_cast(e.act, Cast::Intro) {
                        return;
                    }
                    if e.offtune >= ENEMY_MAX_OFFTUNE {
                        e.queue_event(press);
                    }
                }),
                ..Default::default()
            },
            ..Default::default()
        },
    );

    lib.put("TUNE_BREAK_ENEMY", enemy);
    lib.put("BASE_RESISTANCE", base_resistance);
    lib.put_a("TUNE_BREAK", tune_break);
    lib.ladders.insert("GLACIO_CHAFE_ACTIONS", chafe_ladder);
    lib.ladders.insert("FUSION_BURST_ACTIONS", burst_ladder);
    lib.ladders.insert("AERO_EROSION_ACTIONS", erosion_ladder);
    lib.ladders.insert("SPECTRO_FRAZZLE_ACTIONS", frazzle_ladder);
    lib.ladders.insert("HELIACAL_EMBER_ACTIONS", Rc::new(ember));
    lib.ladders.insert("ELECTRO_FLARE_DMG", flare_ladder);
    lib.ladders.insert("ELECTRO_RAGE_ACTIONS", rage_ladder);
    sh
}

//! Running presses: evaluate.ts's evaluate/closePress/run and rotation.ts's scheduler, plus
//! damage.ts's formula — the untraced path only.
use crate::eng::*;
use crate::rotation::{Group, W};
use std::rc::Rc;

const CAST_PHASES: u32 = (1 << 1) | (1 << 6);
const HIT_PHASES: u32 = (1 << 0) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 6) | (1 << 7);
const ON_HIT_PHASES: u32 = 1 << 8;
const END_PHASES: u32 = 1 << 5;
const PER_PRESS: [usize; 10] = [s::ADD_MV, s::ADD_ENERGY, s::ADD_CONCERTO, s::ADD_OFFTUNE, s::DIRECT_OFFTUNE, 30, 31, 32, 33, 34];
const READ_APPLY: i32 = 1;
const READ_CONVERT: i32 = 2;
const READ_AFTER: i32 = 4;
/// The stats a press banks into the gauges — a variant moving one would bank another fight.
const RESOURCE_STATS: [usize; 11] = [s::ADD_ENERGY, s::ADD_CONCERTO, s::ADD_OFFTUNE, s::DIRECT_OFFTUNE, s::OFFTUNE_BUILDUP, s::ENERGY_REGEN_MULT, 30, 31, 32, 33, 34];

/// Scale what the stat phases added to `PER_PRESS` down to this hit's share, over `from`.
fn share_out(eff: &mut Stats, share: f64, from: impl Fn(usize, usize) -> f64) {
    for k in 0..PER_PRESS.len() {
        let i = PER_PRESS[k];
        let f = from(k, i);
        eff[i] = f + (eff[i] - f) * share;
    }
}

fn resource_moved(diff: &[usize], eff: &Stats, from: &Stats) -> bool {
    diff.iter().any(|&i| RESOURCE_STATS.contains(&i) && eff[i] != from[i])
}

/// What a dry run can move of the whole fight.
struct Snap {
    members: Vec<MemberSnap>,
    global: Pool,
    enemy: Pool,
    offtune: f64,
}

/* ------------------------------------------------------------------------------ damage */

const LEVEL_90_DOT: f64 = 3674.0;
const LEVEL_90_TUNE: f64 = 10027.0;
const OWN_DEF: f64 = 800.0 + 90.0 * 8.0;
const ENEMY_DEF: f64 = 792.0 + 8.0 * 100.0;
const ENEMY_RES: f64 = 0.0;

fn fold_stat(st: &Stats, base: usize, bonus: usize, flat: usize) -> f64 {
    let b = st[base].floor();
    b + (b * st[bonus] / 100.0).floor() + st[flat]
}

fn shred_of(st: &Stats, not_dot: f64, base: f64) -> f64 {
    1.0 - ((1.0 - not_dot * st[s::DEF_IGNORE_NEW] / 100.0) * (base * (1.0 - st[s::DEF_REDUCE] / 100.0 - not_dot * st[s::DEF_IGNORE_OLD] / 100.0)).floor()) / base
}
fn res_of(st: &Stats, not_dot: f64, enemy_res: f64) -> f64 {
    (enemy_res / 100.0 - st[s::RES_IGNORE] / 100.0 * not_dot - st[s::RES_REDUCE] / 100.0) * 100.0
}
fn res_factor_from(r: f64) -> f64 {
    if r < 0.0 {
        1.0 - r / 2.0
    } else if r < 0.8 {
        1.0 - r
    } else {
        1.0 / (1.0 + 5.0 * r)
    }
}

pub fn damage_avg(a: &Act, st: &Stats) -> f64 {
    let Some(scaling) = a.scaling else { return 0.0 };
    if scaling == Scaling::Fixed {
        return a.mv.floor();
    }
    let atk = fold_stat(st, s::BASE_ATK, s::BONUS_ATK, s::FLAT_ATK);
    let hp = fold_stat(st, s::BASE_HP, s::BONUS_HP, s::FLAT_HP);
    let def = fold_stat(st, s::BASE_DEF, s::BONUS_DEF, s::FLAT_DEF);
    let not_dot = if scaling != Scaling::Dot { 1.0 } else { 0.0 };
    let not_tune = if scaling != Scaling::Tune { 1.0 } else { 0.0 };
    let final_stat = match scaling {
        Scaling::Atk => atk,
        Scaling::Hp => hp,
        Scaling::Def => def,
        Scaling::Dot => LEVEL_90_DOT,
        Scaling::Tune => LEVEL_90_TUNE,
        Scaling::Fixed => f64::NAN,
        // an action with no scaling returned above
        Scaling::None => unreachable!(),
    }
    .floor();
    let final_mv = (a.mv + st[s::ADD_MV]) * (1.0 + st[s::MUL_MV] / 100.0) / 100.0;
    let amp = if not_dot != 0.0 { st[s::AMP] } else { st[s::SUB_AMP] };
    let amp_factor = 1.0 + (amp / 100.0) * not_tune;
    let bonus_factor = 1.0 + (st[s::DMG_BONUS] / 100.0) * not_dot * not_tune;
    let tbb_factor = 1.0 + (st[s::TBB] / 100.0) * (1.0 - not_tune);
    let res_factor = res_factor_from(res_of(st, not_dot, ENEMY_RES) / 100.0);
    let def_factor = OWN_DEF / (OWN_DEF + (1.0 - shred_of(st, not_dot, ENEMY_DEF)) * ENEMY_DEF);
    let dealt = 1.0 + (if not_dot != 0.0 { st[s::TOTAL_DMG] } else { st[s::SUB_TOTAL] }) / 100.0;
    let taken = 1.0 + (if not_dot != 0.0 { st[s::DAMAGE_TAKEN] } else { st[s::SUB_TAKEN] }) / 100.0;
    let special = not_dot * not_tune == 0.0;
    let crit_mult = if special {
        if st[s::SUB_CD] != 0.0 {
            st[s::SUB_CD] / 100.0
        } else {
            1.0
        }
    } else {
        st[s::CRIT_DMG] / 100.0
    };
    let cr = if special { st[s::SUB_CR] / 100.0 } else { st[s::CRIT_RATE] / 100.0 };
    let crit_factor = if cr >= 1.0 { crit_mult } else { (1.0 - cr) + crit_mult * cr };
    let no_crit = final_mv * final_stat * amp_factor * bonus_factor * tbb_factor * res_factor * def_factor * dealt * taken;
    (no_crit * crit_factor).floor()
}

/* ------------------------------------------------------------------------------ steps */

#[derive(Clone)]
struct Step {
    action: ActId,
    slot: i32,
    by: By,
    group: Option<Rc<Group>>,
    end: bool,
    spill: Option<Rc<Group>>,
    queued: bool,
    cut: Option<Tag>,
    at: Option<f64>,
    into: Option<RowId>,
    away: bool,
    losses: Option<Vec<GearId>>,
    frames: Option<f64>,
    closes: bool,
    triggered: Option<bool>,
    hold: bool,
}

impl Step {
    fn plain(action: ActId, slot: i32, by: By) -> Step {
        Step { action, slot, by, group: None, end: false, spill: None, queued: false, cut: None, at: None, into: None, away: false, losses: None, frames: None, closes: false, triggered: None, hold: false }
    }
}

struct StepQueue {
    front: Vec<Step>,
    list: Vec<Step>,
    at: usize,
}
impl StepQueue {
    fn size(&self) -> usize {
        self.front.len() + self.list.len() - self.at
    }
    fn peek(&self) -> Option<&Step> {
        if let Some(s) = self.front.last() {
            Some(s)
        } else {
            self.list.get(self.at)
        }
    }
    fn take(&mut self) -> Step {
        if let Some(s) = self.front.pop() {
            s
        } else {
            self.at += 1;
            std::mem::replace(&mut self.list[self.at - 1], Step::plain(0, -1, None))
        }
    }
    fn unshift(&mut self, steps: Vec<Step>) {
        for s in steps.into_iter().rev() {
            self.front.push(s);
        }
    }
}

impl Eng {
    fn capture(&mut self, slot: usize) {
        let e = self.enemy();
        self.cap[0] = self.members[slot].stacks.cap();
        self.cap[1] = self.global.cap();
        self.cap[2] = self.members[e].stacks.cap();
    }

    fn run_phase(&mut self, p: usize, with_stacks: bool) {
    #[cfg(feature = "prof")]
    let _p = crate::prof::span("run_phase");
        if (self.phase_mask >> p) & 1 == 0 {
            return;
        }
        for q in 0..3 {
            let cap = self.cap[q].clone();
            let ph = cap.hooks[p].clone();
            for &k in ph.iter() {
                let g = cap.list[k as usize];
                self.buff = Some(g);
                if with_stacks {
                    self.stacks = cap.counts[k as usize];
                }
                if p == PH_CONST {
                    // constantStats is data: its lines, in order (traced runs only reach here)
                    let lines = self.gears[g as usize].constant.clone().unwrap();
                    for &(st, v, tag) in lines.iter() {
                        self.add_stat(st, v, tag);
                    }
                    if let Some(h) = self.gears[g as usize].hooks[PH_CONST].clone() {
                        h(self);
                    }
                    continue;
                }
                let h = self.gears[g as usize].hooks[p].clone().unwrap();
                h(self);
            }
        }
    }

    fn action_hook(&mut self, f: Option<Hook>, p: usize) {
        let Some(f) = f else { return };
        if (self.phase_mask >> p) & 1 == 0 {
            return;
        }
        self.buff = Some(self.acts[self.act as usize].gear);
        self.stacks = 1.0;
        f(self);
    }
    fn own_hook(&self, p: usize) -> Option<Hook> {
        self.gears[self.acts[self.act as usize].gear as usize].hooks[p].clone()
    }

    fn run_globals(&mut self, slot: usize, hit: bool) {
    #[cfg(feature = "prof")]
    let _p = crate::prof::span("run_globals");
        for m in 0..self.nslots {
            self.members[m].global_hooks.compact();
            let mut k = 0;
            while k < self.members[m].global_hooks.items.len() {
                let (g, alive) = self.members[m].global_hooks.items[k];
                k += 1;
                if !alive {
                    continue;
                }
                self.slot = m;
                self.buff = Some(g);
                self.stacks = -1.0;
                let h = if hit { self.gears[g as usize].hit_global.clone() } else { self.gears[g as usize].update_global.clone() };
                if let Some(h) = h {
                    h(self);
                }
            }
        }
        self.slot = slot;
        let e = self.enemy();
        let gh = self.global.global_hooks.clone();
        let eh = self.members[e].stacks.global_hooks.clone();
        for &g in gh.iter().chain(eh.iter()) {
            self.buff = Some(g);
            let h = if hit { self.gears[g as usize].hit_global.clone() } else { self.gears[g as usize].update_global.clone() };
            if let Some(h) = h {
                h(self);
            }
        }
        self.buff = None;
    }

    fn const_base_of(&mut self, slot: usize, swap: Option<[(GearId, GearId); 2]>) -> Box<Stats> {
        let live = self.members[slot].effective;
        self.members[slot].effective = [0.0; NSTAT];
        for q in 0..3 {
            let cap = self.cap[q].clone();
            let ph = cap.hooks[PH_CONST].clone();
            for &k in ph.iter() {
                let mut g = cap.list[k as usize];
                if let Some(sw) = swap {
                    for (from, to) in sw {
                        if g == from {
                            g = to;
                            break;
                        }
                    }
                }
                self.buff = Some(g);
                self.stacks = cap.counts[k as usize];
                let lines = self.gears[g as usize].constant.clone().unwrap();
                for &(st, v, tag) in lines.iter() {
                    self.push_stat(st, tag, v);
                }
                if let Some(h) = self.gears[g as usize].hooks[PH_CONST].clone() {
                    h(self);
                }
            }
        }
        let base = Box::new(self.members[slot].effective);
        self.members[slot].effective = live;
        base
    }

    /// evaluate.ts's evaluate(): one press, or one part of a split press.
    fn evaluate(&mut self, action: ActId, triggered: bool, cut: Option<Tag>, source: By) -> Row {
    #[cfg(feature = "prof")]
    let _p = crate::prof::span("evaluate");
        let slot = self.active;
        self.slot = slot;
        self.act = action;
        let half = self.acts[action as usize].half;
        let cast_side = half == Half::Whole || half == Half::Cast;
        let hit_side = half == Half::Whole || half == Half::Hit || self.acts[action as usize].hits_at_cast;
        let lands = hit_side && !self.acts[action as usize].bullets.is_empty();
        self.phase_mask = (if cast_side { CAST_PHASES } else { 0 }) | (if hit_side { HIT_PHASES } else { 0 }) | (if lands { ON_HIT_PHASES } else { 0 }) | (if half == Half::Whole { END_PHASES } else { 0 });
        let tag = cut.unwrap_or(self.acts[action as usize].tag);
        let charged = self.cost(action, Some(tag));
        let timestop_banked = self.timestop_bank.min(charged.total);
        self.timestop_bank += self.acts[action as usize].timestop - charged.timestop - timestop_banked;
        self.act_frames = charged.total - timestop_banked;
        self.triggered = triggered;
        self.tag_word = self.acts[action as usize].tag_word;
        self.override_type = 0;
        self.override_subtype = 0;
        self.dropped_cast = None;
        self.swap_losses.clear();
        self.action_stamp += 1;
        self.expire_buffs();
        let frame_start = self.frame;
        let active = self.on_field >= 0 && self.on_field as usize == slot;
        let before = (self.members[slot].forte, self.members[slot].energy, self.members[slot].concerto, self.offtune);
        if self.tracing {
            self.members[slot].entries.clear();
            self.cast_adds.clear();
        }
        self.members[slot].effective = [0.0; NSTAT];
        self.wrote = 0;

        if cast_side && self.casting(Cast::Intro) {
            let intro = self.acts[action as usize].form_of.unwrap_or(action);
            let qte = self.acts[intro as usize].qte;
            if qte == 0.0 {
                let q: Vec<GearId> = self.outro_queue.drain(..).collect();
                for g in q {
                    self.add_stack(slot, g, 1.0);
                }
            } else {
                let due = self.frame + qte - self.acts[intro as usize].timestop.min(qte);
                let uid = self.uid();
                self.timed.push(Timed { due, action: None, slot: self.active as i32, into: None, by: None, away: false, apply: Some(Apply::OutroQueue(slot)), losses: None, frames: None, closes: false, triggered: None, uid });
                self.sort_timed();
            }
            let q: Vec<Pending> = self.intro_queue.drain(..).collect();
            self.pending.extend(q);
        }

        self.cast_gain = [0.0; 7];
        self.in_cast = false;
        if cast_side {
            self.in_cast = true;
            let g = self.acts[action as usize].gear as usize;
            let ug = self.gears[g].update_global.clone();
            self.action_hook(ug, 1);
            self.run_globals(slot, false);
            self.capture(slot);
            let ub = self.own_hook(PH_BUFFS);
            self.action_hook(ub, 1);
            self.run_phase(1, true);
            self.in_cast = false;
        }

        let frames = self.act_frames;
        let cost = self.cost(action, Some(tag));
        let motion_stop = self.acts[action as usize].motion_stop;
        let own_stop = motion_stop.min(cost.action);
        let stop_banked = self.motion_stop_bank.min(cost.action + cost.global - own_stop);
        self.motion_stop_bank += motion_stop - own_stop - stop_banked;
        let off_field_shift = frames - (cost.action + cost.global - own_stop - stop_banked);
        self.off_field_shift = off_field_shift;

        if hit_side {
            self.capture(slot);
            let ud = self.own_hook(PH_DEBUFFS);
            self.action_hook(ud, 0);
            if lands {
                let bd = self.acts[action as usize].last_bullet().unwrap().update_debuffs.clone();
                self.action_hook(bd, 0);
            }
            self.run_phase(0, true);
            let hg = self.gears[self.acts[action as usize].gear as usize].hit_global.clone();
            self.action_hook(hg, 0);
            if lands {
                let bg = self.acts[action as usize].last_bullet().unwrap().hit_global.clone();
                self.action_hook(bg, 0);
            }
            self.run_globals(slot, true);
            self.capture(slot);
            self.run_phase(7, true);
        }

        self.capture(slot);
        let held_pools = if self.tracing { Some(self.held_pools(slot)) } else { None };
        // what the main-stat variants start from: the phases so far, before the constant base goes in
        let pre: Option<Stats> = if self.tracing || self.members[slot].variants.is_empty() {
            None
        } else if self.wrote == 0 {
            Some([0.0; NSTAT])
        } else {
            Some(self.members[slot].effective)
        };
        if self.members[slot].const_base_version != self.const_version {
            self.members[slot].const_base.clear();
            self.members[slot].variant_at.clear();
            self.members[slot].const_base_version = self.const_version;
        }
        let tw = self.tag_word;
        let mut bi = 0;
        if self.tracing {
            self.run_phase(PH_CONST, true);
        } else {
            let found = self.members[slot].const_base.iter().position(|x| x.0 == tw);
            bi = match found {
                Some(i) => i,
                None => {
                    let base = self.const_base_of(slot, None);
                    self.members[slot].const_base.push((tw, base));
                    self.members[slot].const_base.len() - 1
                }
            };
            let m = &mut self.members[slot];
            let base = &m.const_base[bi].1;
            if self.wrote == 0 {
                m.effective = **base;
            } else {
                for i in 0..NSTAT {
                    m.effective[i] += base[i];
                }
            }
        }
        // the stat phases are journaled while variants are in play
        self.mut_hash = 0;
        self.recording = pre.is_some();
        self.read_stamp += 1;
        self.read_phase = READ_APPLY;
        self.replay.clear();
        let share = self.acts[action as usize].mv_share;
        if share != 1.0 {
            for k in 0..PER_PRESS.len() {
                self.share_base[k] = self.members[slot].effective[PER_PRESS[k]];
            }
        }
        let h = self.own_hook(PH_APPLY);
        self.action_hook(h, 2);
        self.run_phase(2, true);
        let replay2 = self.replay.len();
        let apply_moved = self.mut_hash != 0;
        let post2 = self.members[slot].effective;
        self.read_phase = READ_CONVERT;
        let h = self.own_hook(PH_CONVERT);
        self.action_hook(h, 3);
        self.run_phase(3, true);
        let h = self.own_hook(PH_LATE);
        self.action_hook(h, 4);
        self.run_phase(4, true);
        self.recording = false;
        if share != 1.0 {
            let base = self.share_base;
            share_out(&mut self.members[slot].effective, share, |k, _| base[k]);
        }
        self.dry_run = false;

        // a variant's row differs only where its main-stat piece does; one whose piece moves an index
        // a stat hook read runs the conversions again, dry
        let mut variant_at: Option<Rc<VariantAt>> = None;
        if let Some(pre) = pre {
            let primary = self.members[slot].effective;
            let at = self.variant_at_for(slot, bi);
            let nv = self.members[slot].variants.len();
            let mut any_dry = false;
            for v in 0..nv {
                let dry = self.read_any(&at.diffs[v], READ_APPLY | READ_CONVERT);
                self.members[slot].variant_dry[v] = dry;
                if !dry {
                    continue;
                }
                if !any_dry {
                    any_dry = true;
                    self.dry_run = true;
                }
                let (diff, vbase) = (&at.diffs[v], &at.bases[v]);
                let replayable = !apply_moved && !self.read_any(diff, READ_APPLY);
                let mut eff = [0.0; NSTAT];
                if replayable {
                    self.sparse_row(diff, vbase, &mut eff, &post2, &pre, 0, replay2);
                } else {
                    for i in 0..NSTAT {
                        eff[i] = pre[i] + vbase[i];
                    }
                }
                self.members[slot].effective = eff;
                if !replayable {
                    let h = self.own_hook(PH_APPLY);
                    self.action_hook(h, 2);
                    self.run_phase(2, true);
                }
                let h = self.own_hook(PH_CONVERT);
                self.action_hook(h, 3);
                self.run_phase(3, true);
                let h = self.own_hook(PH_LATE);
                self.action_hook(h, 4);
                self.run_phase(4, true);
                if share != 1.0 {
                    share_out(&mut self.members[slot].effective, share, |_, i| pre[i] + vbase[i]);
                }
                let eff = self.members[slot].effective;
                self.members[slot].variant_eff[v] = eff;
                if RESOURCE_STATS.iter().any(|&r| eff[r] != primary[r]) {
                    self.members[slot].variant_unsafe[v] = true;
                }
            }
            if any_dry {
                self.dry_run = false;
                self.members[slot].effective = primary;
            }
            variant_at = Some(at);
        }
        self.stacks = -1.0;
        self.buff = None;

        // banking
        let gain = self.cast_gain;
        let eff = self.members[slot].effective;
        let a = &self.acts[action as usize];
        let add_energy = eff[s::ADD_ENERGY] + gain[0];
        let energy_gain = (a.energy + add_energy) * (1.0 + eff[s::ENERGY_REGEN_MULT] / 100.0);
        let a_concerto = a.concerto;
        let a_offtune = a.offtune;
        let deltas = a.forte;
        let resets = a.reset_forte;
        let reset_energy = a.reset_energy;
        let m = &mut self.members[slot];
        m.energy = (m.energy + energy_gain).max(0.0);
        let outro = cast_side && self.is_cast(action, Cast::Outro) && self.dropped_cast != Some(Cast::Outro);
        let energy_wiped = outro && self.outro_dir > 0;
        let m = &mut self.members[slot];
        if outro && energy_wiped {
            m.energy = 0.0;
        }
        let spend = if a_concerto < 0.0 { -a_concerto } else { 0.0 };
        let concerto_short = spend > 0.0 && m.concerto < spend;
        if (spend > 0.0 || outro) && m.concerto > 100.0 {
            m.concerto = 100.0;
        }
        let add_concerto = eff[s::ADD_CONCERTO] + gain[1];
        let concerto = m.concerto + a_concerto + add_concerto;
        m.concerto = if spend > 0.0 { concerto } else { concerto.max(0.0) };
        let built = a_offtune + eff[s::ADD_OFFTUNE];
        self.offtune += (if built < 0.0 { built } else { built * (eff[s::OFFTUNE_BUILDUP] / 100.0) }) + eff[s::DIRECT_OFFTUNE];
        let max_energy = self.members[slot].resonator.and_then(|r| self.gears[r as usize].res.as_ref().map(|i| i.max_energy)).unwrap_or(0.0);
        let cap_of = |v: f64, max: f64| max.min(v.max(0.0));
        let real_before = self.members[slot].real_energy;
        {
            let m = &mut self.members[slot];
            m.real_energy = cap_of(m.real_energy + energy_gain, max_energy);
        }
        let shared = energy_gain / 2.0;
        for o in 0..self.nslots {
            if o != slot {
                let mx = self.members[o].resonator.and_then(|r| self.gears[r as usize].res.as_ref().map(|i| i.max_energy)).unwrap_or(0.0);
                let m = &mut self.members[o];
                m.real_energy = cap_of(m.real_energy + shared, mx);
            }
        }
        // the ER-requirement window: what each Liberation asked of the constant ER
        if reset_energy {
            let m = &mut self.members[slot];
            m.lib_casts += 1;
            if m.lib_casts > 1 {
                m.er_before = real_before;
                m.er_a = m.er_gain_er;
                m.er_g = m.er_gain;
                let want = if real_before > 0.0 { (max_energy * 100.0 - (m.er_gain_er - m.const_er * m.er_gain)) / real_before } else { 0.0 };
                if want > m.er_worst {
                    m.er_worst = want;
                }
                if m.er_guard && want > m.const_er + crate::loadout::ER_TOLERANCE + 1e-9 {
                    self.er_short = Some((slot, want));
                    self.release_caps();
                    return Row { act: action, member: slot, triggered, mv: 0.0, avg: 0.0, starts: frame_start, ends: frame_start, hit_at: None, group: None, group_end: false, spill: None, queued: false, variant_avg: None, swap_frames: 0.0, source: None, trace: None };
                }
            }
            let m = &mut self.members[slot];
            m.er_gain_er = 0.0;
            m.er_gain = 0.0;
            m.real_energy = 0.0;
        } else if !energy_wiped {
            let m = &mut self.members[slot];
            m.er_gain += energy_gain;
            m.er_gain_er += energy_gain * eff[s::ER];
        }
        let caps = self.members[slot].resonator.and_then(|r| self.gears[r as usize].res.as_ref().map(|i| i.max_forte)).unwrap_or([0.0; 5]);
        let m = &mut self.members[slot];
        for i in 0..5 {
            let cap = caps[i];
            let delta = deltas[i] + eff[s::ADD_FORTE1 + i] + gain[2 + i];
            if resets[i] {
                m.forte[i] = 0.0;
            }
            if cap > 0.0 && delta < 0.0 && m.forte[i] > cap {
                m.forte[i] = cap;
            }
            if delta > 0.0 && m.forte[i] < 0.0 {
                m.forte[i] = 0.0;
            }
            m.forte[i] += delta;
        }

        if lands {
            self.capture(slot);
            let h = self.own_hook(PH_ON_HIT);
            self.action_hook(h, 8);
            self.run_phase(8, true);
            self.buff = None;
        }

        // afterAction, the variants' own dry first where they need one
        let mut variant_avg: Option<Vec<f64>> = None;
        if let (Some(at), Some(pre)) = (variant_at, pre) {
            let nv = at.diffs.len();
            let mut out = Vec::with_capacity(nv);
            if self.phase_mask & END_PHASES == 0 {
                let effective = self.members[slot].effective;
                for v in 0..nv {
                    let mut eff = self.members[slot].variant_eff[v];
                    if !self.members[slot].variant_dry[v] {
                        let k1 = self.replay.len();
                        self.sparse_row(&at.diffs[v], &at.bases[v], &mut eff, &effective, &pre, 0, k1);
                        if resource_moved(&at.diffs[v], &eff, &effective) {
                            self.members[slot].variant_unsafe[v] = true;
                        }
                        self.members[slot].variant_eff[v] = eff;
                    }
                    out.push(damage_avg(&self.acts[action as usize], &eff));
                }
            } else {
                let replay4 = self.replay.len();
                let post4 = self.members[slot].effective;
                let banked = self.snapshot();
                self.mut_hash = 0;
                self.recording = true;
                self.read_phase = READ_AFTER;
                let h = self.own_hook(PH_AFTER);
                self.action_hook(h, 5);
                self.run_phase(5, false);
                self.recording = false;
                self.buff = None;
                let primary_hash = self.mut_hash;
                let effective = self.members[slot].effective;
                let mut done: Option<Snap> = None;
                for v in 0..nv {
                    let (diff, vbase) = (&at.diffs[v], &at.bases[v]);
                    let dry = self.members[slot].variant_dry[v];
                    let mut eff = self.members[slot].variant_eff[v];
                    if !dry && !self.read_any(diff, READ_AFTER) {
                        let k1 = self.replay.len();
                        self.sparse_row(diff, vbase, &mut eff, &effective, &pre, 0, k1);
                        if resource_moved(diff, &eff, &effective) {
                            self.members[slot].variant_unsafe[v] = true;
                        }
                    } else {
                        if !dry {
                            self.sparse_row(diff, vbase, &mut eff, &post4, &pre, 0, replay4);
                            if resource_moved(diff, &eff, &post4) {
                                self.members[slot].variant_unsafe[v] = true;
                            }
                        }
                        if done.is_none() {
                            done = Some(self.snapshot());
                            self.dry_run = true;
                        }
                        self.members[slot].effective = eff;
                        self.restore(&banked);
                        self.mut_hash = 0;
                        self.stacks = -1.0;
                        let h = self.own_hook(PH_AFTER);
                        self.action_hook(h, 5);
                        self.run_phase(5, false);
                        eff = self.members[slot].effective;
                        if self.mut_hash != primary_hash {
                            self.members[slot].variant_unsafe[v] = true;
                        }
                    }
                    self.members[slot].variant_eff[v] = eff;
                    out.push(damage_avg(&self.acts[action as usize], &eff));
                }
                if let Some(d) = done {
                    self.dry_run = false;
                    self.restore(&d);
                    self.buff = None;
                    self.members[slot].effective = effective;
                }
            }
            variant_avg = Some(out);
        } else {
            self.mut_hash = 0;
            let h = self.own_hook(PH_AFTER);
            self.action_hook(h, 5);
            self.run_phase(5, false);
            self.buff = None;
        }
        if half == Half::Whole {
            let losses = self.swap_losses.clone();
            for g in losses {
                self.revoke(slot, g);
            }
        }
        if frame_start + frames > self.plays_to {
            self.plays_to = frame_start + frames;
            self.play_stop = off_field_shift.max(0.0);
        }
        let eff = &self.members[slot].effective;
        let a = &self.acts[action as usize];
        let mv = (a.mv + eff[s::ADD_MV]) * (1.0 + eff[s::MUL_MV] / 100.0);
        let avg = damage_avg(a, eff);
        let ends = frame_start + if half == Half::Cast { self.acts[a.form_of.unwrap_or(action) as usize].last_hit_delay() } else { 0.0 };
        let trace = self.traced_row(action, slot, tag, frames, active, timestop_banked, &before, concerto_short, energy_wiped, real_before, held_pools);
        let row = Row { act: action, member: slot, triggered, mv, avg, starts: frame_start, ends, hit_at: None, group: None, group_end: false, spill: None, queued: false, variant_avg, swap_frames: 0.0, source, trace };
        if let Some(t) = &mut self.trace {
            let hs = match half {
                Half::Whole => "null",
                Half::Cast => "cast",
                Half::Hit => "hit",
                Half::End => "end",
            };
            let m = &self.members[slot];
            t.push(format!("E|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}", self.acts[action as usize].name, hs, m.name, frame_start, avg, mv, m.energy, m.concerto, m.forte[0], m.forte[1], m.forte[2], m.forte[3], m.forte[4], self.offtune));
        }
        if cast_side && self.casting(Cast::Outro) {
            let n = self.nslots as i32;
            self.active = ((self.active as i32 + self.outro_dir + n) % n) as usize;
        }
        // nothing holds a phase's roster past the press, so writes between presses need no copies
        self.release_caps();
        row
    }

    /// The variants' constant bases for this tag word, and where each differs from the real one.
    fn variant_at_for(&mut self, slot: usize, bi: usize) -> Rc<VariantAt> {
        let tw = self.tag_word;
        if let Some(x) = self.members[slot].variant_at.iter().find(|x| x.0 == tw) {
            return x.1.clone();
        }
        let base = *self.members[slot].const_base[bi].1;
        let (of, sub_of) = (self.members[slot].variant_of.unwrap(), self.members[slot].variant_sub_of);
        let nv = self.members[slot].variants.len();
        let (mut bases, mut diffs) = (vec![], vec![]);
        for v in 0..nv {
            let to = self.members[slot].variants[v];
            let sub = self.members[slot].variant_subs[v];
            // `sub && variantSubOf`: a stand-in only where the variant wears another tier
            let second = match (sub, sub_of) {
                (Some(t), Some(f)) => (f, t),
                _ => (u32::MAX, u32::MAX),
            };
            let vbase = *self.const_base_of(slot, Some([(of, to), second]));
            let diff: Vec<usize> = (0..NSTAT).filter(|&i| vbase[i] != base[i]).collect();
            bases.push(vbase);
            diffs.push(diff);
        }
        let at = Rc::new(VariantAt { bases, diffs });
        self.members[slot].variant_at.push((tw, at.clone()));
        let m = &mut self.members[slot];
        if m.variant_eff.len() < nv {
            m.variant_eff.resize(nv, [0.0; NSTAT]);
            m.variant_dry.resize(nv, false);
        }
        at
    }

    fn sparse_row(&self, diff: &[usize], vbase: &Stats, eff: &mut Stats, from: &Stats, pre: &Stats, k0: usize, k1: usize) {
        *eff = *from;
        for &i in diff {
            let mut x = pre[i] + vbase[i];
            for k in k0..k1 {
                if self.replay[k].0 == i {
                    x += self.replay[k].1;
                }
            }
            eff[i] = x;
        }
    }

    /// Everything a dry run can move (state.ts's FightSnapshot).
    fn snapshot(&self) -> Snap {
        Snap {
            members: (0..self.nslots).map(|m| MemberSnap { pool: self.members[m].stacks.clone(), global_hooks: self.members[m].global_hooks.clone(), forte: self.members[m].forte, concerto: self.members[m].concerto }).collect(),
            global: self.global.clone(),
            enemy: self.members[self.enemy()].stacks.clone(),
            offtune: self.offtune,
        }
    }
    fn restore(&mut self, s: &Snap) {
        for (m, x) in s.members.iter().enumerate() {
            self.members[m].stacks = x.pool.clone();
            self.members[m].global_hooks = x.global_hooks.clone();
            self.members[m].forte = x.forte;
            self.members[m].concerto = x.concerto;
        }
        self.global = s.global.clone();
        let e = self.enemy();
        self.members[e].stacks = s.enemy.clone();
        self.offtune = s.offtune;
    }

    /// The three pools as the stat phases found them: every live Gear, its count and time left.
    fn held_pools(&self, slot: usize) -> [Vec<(GearId, f64, f64)>; 3] {
        let e = self.enemy();
        let live = |p: &Pool| -> Vec<(GearId, f64, f64)> {
            p.list.iter().enumerate().filter(|(i, &g)| p.pos(g) == *i as i32).map(|(i, &g)| (g, p.counts[i], p.left(g, self.frame))).collect()
        };
        [live(&self.members[slot].stacks), live(&self.global), live(&self.members[e].stacks)]
    }

    #[allow(clippy::too_many_arguments)]
    fn traced_row(&mut self, action: ActId, slot: usize, tag: Tag, frames: f64, active: bool, timestop_banked: f64, before: &([f64; 5], f64, f64, f64), concerto_short: bool, energy_wiped: bool, real_before: f64, held_pools: Option<[Vec<(GearId, f64, f64)>; 3]>) -> Option<Box<crate::trace::RowTrace>> {
        let pools = held_pools?;
        // the counts the stat phases ran with, so a stack-count name reads what it held then
        let mut frozen: Vec<(GearId, f64)> = vec![];
        for q in 0..3 {
            let cap = self.cap[q].clone();
            for p in 0..9 {
                for &k in cap.hooks[p].iter() {
                    let g = cap.list[k as usize];
                    match frozen.iter_mut().find(|x| x.0 == g) {
                        Some(x) => x.1 = cap.counts[k as usize],
                        None => frozen.push((g, cap.counts[k as usize])),
                    }
                }
            }
        }
        let e = self.enemy();
        let mut held: [Vec<crate::trace::Held>; 3] = Default::default();
        for (q, pool) in pools.iter().enumerate() {
            for &(g, n, left) in pool {
                let gear = &self.gears[g as usize];
                let equipped = match q {
                    0 => self.members[slot].equipped.contains(&g),
                    2 => self.members[e].equipped.contains(&g),
                    _ => false,
                };
                if equipped || gear.hidden {
                    continue;
                }
                self.buff = Some(g);
                self.stacks = frozen.iter().find(|x| x.0 == g).map_or(n, |x| x.1);
                let name = self.label(g);
                if name.is_empty() {
                    continue;
                }
                let src = self.source_of[g as usize];
                let source = if src >= 0 { self.members[src as usize].name.clone() } else { String::new() };
                held[q].push((name, source, left));
            }
        }
        self.stacks = -1.0;
        self.buff = None;
        let opens_fields = self.applied_rec.gears(self.action_stamp).iter().filter_map(|&g| self.gears[g as usize].field).collect();
        let m = &self.members[slot];
        let max_forte = m.resonator.and_then(|r| self.gears[r as usize].res.as_ref().map(|i| i.max_forte)).unwrap_or([0.0; 5]);
        let mut forte_short = [false; 5];
        for i in 0..5 {
            forte_short[i] = m.forte[i] < 0.0;
        }
        let a = &self.acts[action as usize];
        let typ = if self.override_type != 0 { self.override_type } else { a.last_bullet().map_or(0, |h| h.typ) };
        let [held_local, held_global, held_enemy] = held;
        Some(Box::new(crate::trace::RowTrace {
            entries: m.entries.clone(),
            cast_adds: self.cast_adds.clone(),
            typ,
            stats: m.effective,
            forte: m.forte,
            forte_before: before.0,
            max_forte,
            energy: m.energy,
            concerto: m.concerto,
            offtune: self.offtune,
            energy_before: before.1,
            concerto_before: before.2,
            offtune_before: before.3,
            concerto_short,
            forte_short,
            energy_wiped,
            real_energy_before: real_before,
            frame: self.frame,
            frames,
            tag,
            active,
            timestop_banked,
            held_local,
            held_global,
            held_enemy,
            opens_fields,
            cast_gain: if self.cast_gain.iter().any(|&x| x != 0.0) { Some(self.cast_gain) } else { None },
        }))
    }

    fn release_caps(&mut self) {
        let empty = self.empty_cap.clone();
        self.cap = [empty.clone(), empty.clone(), empty];
    }

    fn shift_off_field(&mut self, shift: f64, from: f64) {
        let presser = self.presser;
        for h in self.timed.iter_mut() {
            if h.slot == presser || h.due <= from {
                continue;
            }
            h.due = if shift > 0.0 { h.due + shift } else { from.max(h.due + shift) };
        }
        self.sort_timed();
        if shift < 0.0 {
            self.run_ticks(from, from, shift);
        }
    }

    fn close_press(&mut self, action: ActId, triggered: bool) {
    #[cfg(feature = "prof")]
    let _p = crate::prof::span("close_press");
        let slot = self.active;
        self.slot = slot;
        self.act = action;
        self.phase_mask = END_PHASES;
        self.act_frames = 0.0;
        self.triggered = triggered;
        self.tag_word = self.acts[action as usize].tag_word;
        self.override_type = 0;
        self.override_subtype = 0;
        self.dropped_cast = None;
        self.swap_losses.clear();
        self.action_stamp += 1;
        self.expire_buffs();
        self.capture(slot);
        let h = self.own_hook(PH_AFTER);
        self.action_hook(h, 5);
        self.run_phase(5, false);
        self.buff = None;
        self.stacks = -1.0;
        if let Some(t) = &mut self.trace {
            t.push(format!("C|{}|{}|{}", self.acts[action as usize].name, self.members[slot].name, self.frame));
        }
        self.release_caps();
    }

    fn walk(&mut self, steps: &mut StepQueue, spill_group: &Option<Rc<Group>>) -> bool {
        while self.frame < self.plays_to {
            let mut next = f64::INFINITY;
            for h in &self.timed {
                next = next.min(h.due);
            }
            let to = if next < self.plays_to { self.frame.max(next) } else { self.plays_to };
            let stop = self.play_stop.min(to - self.frame);
            self.play_stop -= stop;
            self.slot = self.active;
            let from = self.frame;
            self.run_ticks(from, to, stop);
            self.frame = to;
            self.expire_buffs();
            if !self.pending.is_empty() {
                let q: Vec<Step> = self
                    .pending
                    .drain(..)
                    .map(|q| {
                        let mut s = Step::plain(q.action, q.slot, q.by.clone());
                        s.spill = if q.event { None } else { spill_group.clone() };
                        s.queued = true;
                        s
                    })
                    .collect();
                steps.unshift(q);
            }
            if to < self.plays_to {
                return true;
            }
        }
        self.play_stop = 0.0;
        false
    }

    fn land_hit(&mut self, row: RowId, hit: &Row, at: f64) {
        let r = &mut self.rows[row as usize];
        let summed = r.hit_at.is_some();
        let (avg, mv) = (r.avg, r.mv);
        let old_v = r.variant_avg.take();
        r.mv = hit.mv;
        r.avg = hit.avg;
        r.variant_avg = hit.variant_avg.clone();
        r.starts = hit.starts;
        r.ends = hit.ends;
        if summed {
            r.avg += avg;
            r.mv += mv;
            if let (Some(rv), Some(ov)) = (r.variant_avg.as_mut(), old_v.as_ref()) {
                for n in 0..rv.len() {
                    rv[n] += ov[n];
                }
            }
        }
        r.hit_at = Some(at);
        if let (Some(rt), Some(ht)) = (r.trace.as_mut(), hit.trace.as_ref()) {
            rt.land(ht);
        }
    }

    /// evaluate.ts's run(): a rotation's steps, and whatever they queue, on the clock.
    pub fn run(&mut self, rotation: &[W], flush: bool) -> Vec<RowId> {
        let mut out = vec![];
        if self.er_short.is_some() {
            return out;
        }
        let mut written = vec![];
        let unwrap = |w: &W| -> (ActId, Option<Tag>) {
            match w {
                W::A(a) => (*a, None),
                W::Cut(a, k) => (*a, Some(*k)),
                W::G(_) => panic!("a group holds a group - cut the outer group instead"),
            }
        };
        for entry in rotation {
            match entry {
                W::G(g) => {
                    for (k, m) in g.actions.iter().enumerate() {
                        let (a, cut) = unwrap(m);
                        let mut s = Step::plain(a, -1, None);
                        s.cut = cut;
                        s.group = Some(g.clone());
                        s.end = k == g.actions.len() - 1;
                        written.push(s);
                    }
                }
                _ => {
                    let (a, cut) = unwrap(entry);
                    let mut s = Step::plain(a, -1, None);
                    s.cut = cut;
                    written.push(s);
                }
            }
        }
        let mut steps = StepQueue { front: vec![], list: written, at: 0 };
        self.inside_group = false;
        let mut spill_group: Option<Rc<Group>> = None;
        let mut guard = 0;
        while steps.size() > 0 || (flush && !self.timed.is_empty()) {
            guard += 1;
            if guard > 10000 {
                panic!("action queue did not drain");
            }
            let walking = if steps.peek().map_or(false, |s| s.queued) { self.frame < self.plays_to } else { self.walk(&mut steps, &spill_group) };
            let draining = flush && steps.size() == 0;
            let first = if draining { self.timed.iter().fold(f64::INFINITY, |m, h| m.min(h.due)) } else { 0.0 };
            let frame = self.frame;
            let is_due = |h: &Timed| if draining { h.due <= first } else { h.due < frame || (h.due == frame && (walking || !h.away)) };
            if self.timed.iter().any(is_due) {
                let mut due = vec![];
                let mut kept = vec![];
                for h in self.timed.drain(..) {
                    if is_due(&h) {
                        due.push(h);
                    } else {
                        kept.push(h);
                    }
                }
                due.sort_by(|p, q| p.due.partial_cmp(&q.due).unwrap());
                self.timed = kept;
                let spill = if self.inside_group { spill_group.clone() } else { None };
                let mut landed = vec![];
                for h in due {
                    if let Some(a) = h.action {
                        landed.push(Step { action: a, slot: h.slot, by: h.by, group: None, end: false, spill: spill.clone(), queued: true, cut: None, at: Some(h.due), into: h.into, away: h.away, losses: h.losses, frames: h.frames, closes: h.closes, triggered: h.triggered, hold: false });
                        continue;
                    }
                    let now = self.frame;
                    self.frame = h.due;
                    self.slot = h.slot as usize;
                    match h.apply {
                        Some(Apply::Hook(f)) => f(self),
                        Some(Apply::OutroQueue(m)) => {
                            let q: Vec<GearId> = self.outro_queue.drain(..).collect();
                            for g in q {
                                self.add_stack(m, g, 1.0);
                            }
                        }
                        None => {}
                    }
                    self.frame = now.max(if draining { h.due } else { self.frame });
                    for q in self.pending.drain(..) {
                        let mut s = Step::plain(q.action, q.slot, q.by.clone());
                        s.spill = if q.event { None } else { spill_group.clone() };
                        s.queued = true;
                        s.at = Some(h.due);
                        landed.push(s);
                    }
                }
                steps.unshift(landed);
            }
            if steps.size() == 0 {
                continue;
            }
            let step = steps.take();
            if step.closes {
                let (now, field, before) = (self.frame, self.on_field, self.active);
                self.active = step.slot as usize;
                self.frame = step.at.unwrap();
                if step.away {
                    self.on_field = -1;
                }
                self.press_frames = step.frames.unwrap_or(0.0);
                self.press_start = step.into.map_or(self.frame, |r| self.rows[r as usize].starts);
                self.close_press(step.action, step.triggered.unwrap_or(false));
                if let Some(losses) = &step.losses {
                    for &g in losses {
                        self.revoke(step.slot as usize, g);
                    }
                }
                self.frame = now.max(self.frame);
                self.on_field = field;
                self.active = before;
                if !self.pending.is_empty() {
                    let q: Vec<Step> = self
                        .pending
                        .drain(..)
                        .map(|q| {
                            let mut s = Step::plain(q.action, q.slot, q.by.clone());
                            s.spill = if q.event { None } else { spill_group.clone() };
                            s.queued = true;
                            s.at = step.at;
                            s
                        })
                        .collect();
                    steps.unshift(q);
                }
                continue;
            }
            if !step.queued && !step.hold && self.presser >= 0 && self.presser != self.active as i32 {
                // a kit that keeps the field waiting has the one leaving wait on a row of their own
                let hold_fn = self.members[self.active].resonator.and_then(|r| self.gears[r as usize].res.as_ref().and_then(|i| i.hold.clone()));
                if let (Some(hold_fn), true) = (hold_fn, step.slot < 0) {
                    self.slot = self.active;
                    if let Some(h) = hold_fn(self, step.action) {
                        let mut hs = Step::plain(h, self.presser, None);
                        hs.hold = true;
                        steps.unshift(vec![hs, step]);
                        continue;
                    }
                }
                if let Some(r) = self.swap_row.take() {
                    self.rows[r as usize].swap_frames += SWAP_DELAY;
                }
                self.presser = self.active as i32;
                self.plays_to = self.frame + SWAP_DELAY;
                self.play_stop = 0.0;
                steps.unshift(vec![step]);
                continue;
            }
            if !step.queued && !step.hold {
                self.on_field = self.active as i32;
                self.presser = self.active as i32;
            }
            spill_group = step.group.clone().or(step.spill.clone());
            if step.group.is_some() {
                self.inside_group = !step.end;
            }
            let before = self.active;
            if step.slot >= 0 {
                self.active = step.slot as usize;
            }
            if let Some(skip) = self.acts[step.action as usize].skip_next.clone() {
                self.slot = self.active;
                if skip(self) && steps.size() > 0 {
                    let gated = steps.take();
                    if let Some(g) = &gated.group {
                        while steps.size() > 0 && steps.peek().unwrap().group.as_ref().map_or(false, |x| Rc::ptr_eq(x, g)) {
                            steps.take();
                        }
                    }
                }
                continue;
            }
            let mut action = step.action;
            if let Some(r) = self.acts[action as usize].resolve.clone() {
                self.slot = self.active;
                match r(self) {
                    Some(a) => action = a,
                    None => continue,
                }
            }
            // an Outro into a kit that keeps the field waiting waits first, and comes round again
            {
                let n = self.nslots as i32;
                let into = self.members[((self.active as i32 + self.outro_dir + n) % n) as usize].resonator;
                let info = into.and_then(|r| self.gears[r as usize].res.clone());
                if let Some(info) = info {
                    if let (true, Some(hold_fn), Some(intro)) = (step.slot < 0 && self.is_cast(action, Cast::Outro), info.hold.clone(), info.intro) {
                        self.slot = self.active;
                        if let Some(h) = hold_fn(self, intro) {
                            steps.unshift(vec![Step::plain(h, -1, None), step]);
                            continue;
                        }
                    }
                }
            }
            if step.slot < 0 {
                if let Some(cd) = self.acts[action as usize].cooldown {
                    self.slot = self.active;
                    let now = self.frame;
                    let st = self.cooldown_at(self.active, cd, now);
                    if st.charges <= 0.0 {
                        let w = self.wait_action(cd, st.next - now);
                        steps.unshift(vec![Step::plain(w, -1, None), step]);
                        continue;
                    }
                    let cf = self.acts[action as usize].cooldown_frames;
                    self.spend_cooldown(self.active, cd, now, if cf != 0.0 { Some(cf) } else { None });
                }
            }
            self.pending.clear();
            let ms = self.members[self.active].mainslot.map(|g| self.gears[g as usize].mainslot.unwrap());
            let summon = ms.map_or(false, |f| f.onfield == f.outro && action == f.onfield);
            // a summon's hit names the equipped mainslot as its source
            let by: By = if summon {
                let g = self.members[self.active].mainslot.unwrap();
                Some(Rc::new((self.gears[g as usize].name.clone(), { self.slot = self.active; self.owner_name(Some(g)) })))
            } else {
                step.by.clone()
            };
            let triggered = self.acts[action as usize].tag == Tag::Field || by.is_some();
            let dash = self.acts[step.action as usize].dash_after.is_some()
                && steps.peek().map_or(false, |n| self.acts[n.action as usize].resolve.is_none() && self.acts[n.action as usize].timestop > 0.0);
            let mut cut = if summon {
                None
            } else if dash {
                Some(Tag::InstaCancel)
            } else {
                step.cut
            };
            if cut.is_some() && !dash {
                let (a, c) = self.cut_as(action, cut);
                action = a;
                cut = c;
            }
            let whole = action;
            let splits = self.splits_hit(whole, cut);
            let cast_at = step.at.unwrap_or(self.frame);
            let away = splits && self.acts[whole as usize].hits_away(cut);
            let mut split_uids: Vec<(u32, f64)> = vec![];
            if splits {
                let n = self.acts[whole as usize].bullets.len();
                for k in 0..n {
                    let due = cast_at + self.acts[whole as usize].hit_delay(k);
                    let part = self.hit_part(whole, k);
                    let uid = self.uid();
                    split_uids.push((uid, due));
                    self.timed.push(Timed { due, action: Some(part), slot: self.active as i32, into: None, by: None, away, apply: None, losses: None, frames: Some(0.0), closes: false, triggered: Some(false), uid });
                }
                self.sort_timed();
                action = self.cast_part(whole);
            }
            let n = self.nslots as i32;
            let next = (self.active as i32 + self.outro_dir + n) % n;
            if self.is_cast(action, Cast::Outro) && self.acts[action as usize].half != Half::Hit {
                self.on_field = next;
            }
            let (now, field) = (self.frame, self.on_field);
            if let Some(at) = step.at {
                self.frame = at;
            }
            if step.away {
                self.on_field = -1;
            }
            self.press_frames = step.frames.unwrap_or(0.0);
            self.press_start = step.into.map_or(self.frame, |r| self.rows[r as usize].starts);
            let result = self.evaluate(action, triggered, cut, by.clone());
            if self.er_short.is_some() {
                return out;
            }
            if self.off_field_shift != 0.0 {
                let sh = self.off_field_shift;
                self.shift_off_field(sh, now);
            }
            if splits {
                let mut last = cast_at;
                let af = self.act_frames;
                for &(uid, due0) in &split_uids {
                    let mut due = due0;
                    if let Some(h) = self.timed.iter_mut().find(|h| h.uid == uid) {
                        h.frames = Some(af);
                        h.triggered = Some(triggered);
                        due = h.due;
                    }
                    last = last.max(due);
                }
                let runs = if self.acts[whole as usize].casts_instantly() { self.acts[whole as usize].instant_end() } else { af };
                let end = self.end_part(whole);
                let uid = self.uid();
                let losses = if self.swap_losses.is_empty() { None } else { Some(self.swap_losses.clone()) };
                self.timed.push(Timed { due: last.max(cast_at + runs), action: Some(end), slot: self.active as i32, into: None, by: None, away, apply: None, losses, frames: Some(af), closes: true, triggered: Some(triggered), uid });
                self.sort_timed();
            }
            if step.at.is_some() {
                self.frame = now.max(self.frame);
                self.on_field = field;
            }
            let (r_starts, r_ends) = (result.starts, result.ends);
            if let Some(into) = step.into {
                self.land_hit(into, &result, step.at.unwrap());
            } else {
                let mut row = result;
                row.group = step.group.clone();
                row.group_end = step.end;
                row.spill = step.spill.clone();
                row.queued = step.queued;
                let id = self.rows.len() as RowId;
                if splits {
                    for h in self.timed.iter_mut() {
                        if let Some(a) = h.action {
                            if self.acts[a as usize].form_of == Some(whole) && h.into.is_none() {
                                h.into = Some(id);
                            }
                        }
                    }
                    row.act = whole;
                }
                self.rows.push(row);
                out.push(id);
                let tag = cut.unwrap_or(self.acts[action as usize].tag);
                let swaps = tag == Tag::SwapCancel || tag == Tag::InstaSwap;
                if swaps || (self.is_cast(action, Cast::Outro) && self.swap_row.is_none()) {
                    self.swap_row = Some(id);
                }
            }
            if step.slot >= 0 && self.active == step.slot as usize {
                self.active = before;
            }
            if !self.pending.is_empty() {
                let from = if splits { r_starts } else { r_ends };
                let at = step.at.or(if from < self.frame { Some(from) } else { None });
                let q: Vec<Step> = self
                    .pending
                    .drain(..)
                    .map(|q| {
                        let mut s = Step::plain(q.action, q.slot, q.by.clone());
                        s.spill = if q.event { None } else { spill_group.clone() };
                        s.queued = true;
                        s.at = at;
                        s
                    })
                    .collect();
                steps.unshift(q);
            }
        }
        out
    }
}

//! The rest of context.ts's kit-facing API: everything eng.rs's core doesn't already carry.
use crate::eng::*;

impl Eng {
    /// Assign the press being evaluated a different damage type or subtype, for this evaluation.
    pub fn type_override(&mut self, t: u32) {
        let h = self.cur().last_bullet().map(|b| (b.element, b.typ, b.subtype));
        if t & SUBTYPE_BITS != 0 {
            self.override_subtype = t;
        } else {
            self.override_type = t;
        }
        let (el, ty, sub) = h.unwrap_or((0, 0, 0));
        let ty = if self.override_type != 0 { self.override_type } else { ty };
        let sub = if self.override_subtype != 0 { self.override_subtype } else { sub };
        self.tag_word = el | ty | sub;
    }
    /// The type the press is evaluated as, its override where one stands.
    pub fn effective_type(&self) -> u32 {
        if self.override_type != 0 {
            return self.override_type;
        }
        self.cur().last_bullet().map_or(0, |h| h.typ)
    }
    /// Stop the press counting as `cast` for this half.
    pub fn drop_cast(&mut self, c: Cast) {
        self.dropped_cast = Some(c);
    }
    pub fn running_any_of(&self, acts: &[ActId]) -> bool {
        acts.iter().any(|&a| self.running_action(a))
    }
    pub fn current_gear(&self) -> GearId {
        self.buff.unwrap()
    }
    pub fn triggered_action(&self) -> bool {
        self.triggered
    }
    pub fn mid_action_group(&self) -> bool {
        self.inside_group
    }
    /// The frames the press charges the clock: its own as a press, its press's on a queued hit.
    pub fn elapsed(&self) -> f64 {
        match self.cur().half {
            Half::Hit | Half::End => self.press_frames,
            _ => self.act_frames,
        }
    }
    pub fn current_frame(&self) -> f64 {
        self.frame
    }
    pub fn cast_frame(&self) -> f64 {
        match self.cur().half {
            Half::Hit | Half::End => self.press_start,
            _ => self.frame,
        }
    }
    /// "Lost on swap" from inside a hook: revoked by the swap-out, after a swap cancel pays.
    pub fn lost_on_swap(&mut self) {
        let g = self.current_gear();
        let a = &self.acts[self.act as usize];
        if a.swaps_after_hit() {
            if !self.swap_losses.contains(&g) {
                self.swap_losses.push(g);
            }
        } else if a.swap_out() {
            self.revoke_current(g);
        }
    }
    /// Run `f` with its stats and grants sourced to `g`.
    pub fn as_source<T>(&mut self, g: GearId, f: impl FnOnce(&mut Eng) -> T) -> T {
        let (prev, prev_stacks) = (self.buff, self.stacks);
        self.buff = Some(g);
        self.stacks = -1.0;
        let out = f(self);
        self.buff = prev;
        self.stacks = prev_stacks;
        out
    }
    /// Run `f` as whoever is acting rather than the Gear's own holder.
    pub fn as_actor<T>(&mut self, f: impl FnOnce(&mut Eng) -> T) -> T {
        let prev = self.slot;
        self.slot = self.active;
        let out = f(self);
        self.slot = prev;
        out
    }
    pub fn applied_by_member(&self, g: GearId, member: usize) -> f64 {
        self.applied_rec.get_by(g, self.members[member].index, self.action_stamp)
    }
    pub fn consumed(&self, g: GearId) -> f64 {
        self.consumed_rec.get(g, self.action_stamp)
    }
    pub fn consumed_by_me(&self, g: GearId) -> f64 {
        self.consumed_by_member(g, self.slot)
    }
    pub fn consumed_by_member(&self, g: GearId, member: usize) -> f64 {
        self.consumed_rec.get_by(g, self.members[member].index, self.action_stamp)
    }
    /// Every stack spent off the target this press, by anyone (`consumedAny`).
    pub fn consumed_any(&self) -> f64 {
        self.consumed_rec.total(self.action_stamp)
    }
    /// Spend stacks off the target and say so.
    pub fn consume(&mut self, g: GearId, n: f64) -> f64 {
        let before = self.stacks_of_enemy(g);
        let after = self.remove_stack_enemy(g, n);
        self.record_consumed(g, before - after);
        after
    }
    pub fn extend_current(&mut self, g: GearId, frames: f64) {
        self.note(g as i64, 9e6 + frames);
        let m = self.slot;
        self.members[m].stacks.extend(g, frames);
    }
    /// Reset a held team buff's own duration without touching its count.
    pub fn refresh_team(&mut self, g: GearId) {
        self.note(g as i64, 8e6);
        let n = self.global.get(g).unwrap_or(0.0);
        let dur = self.dur_of(g, n);
        let frame = self.frame;
        self.global.touch(g, dur, frame);
    }
    pub fn left_on_team(&self, g: GearId) -> f64 {
        self.global.left(g, self.frame)
    }
    pub fn ticks_of(&self, g: GearId) -> f64 {
        self.members[self.slot].stacks.ticks_of(g)
    }
    pub fn ticks_of_team(&self, g: GearId) -> f64 {
        self.global.ticks_of(g)
    }
    /// Frames until a held enemy debuff's next tick.
    pub fn tick_in_enemy(&self, g: GearId) -> f64 {
        let pool = &self.members[self.enemy()].stacks;
        let i = pool.pos(g);
        if i < 0 || self.gears[g as usize].tick_fn.is_none() {
            return 0.0;
        }
        self.tick_every_of(g) - pool.progress[i as usize]
    }
    pub fn remove_stack_team(&mut self, g: GearId, n: f64) -> f64 {
        self.remove_stack_global(g, n)
    }
    pub fn remove_buff(&mut self, resonator: GearId, g: GearId, n: f64) -> f64 {
        let m = self.member_of(resonator);
        self.remove_stack(m, g, n)
    }
    pub fn revoke_buff(&mut self, resonator: GearId, g: GearId) {
        let m = self.member_of(resonator);
        self.revoke(m, g);
    }
    /// Grant to every slot but the one acting.
    pub fn apply_others(&mut self, g: GearId, n: f64) {
        self.attribute(g);
        let me = self.slot;
        for m in 0..self.nslots {
            if m != me {
                self.add_stack(m, g, n);
            }
        }
    }
    /// Queue behind the next Intro anyone casts, pinned to the queuing slot.
    pub fn queue_on_intro(&mut self, a: ActId) {
        self.inherit_piece(self.acts[a as usize].gear);
        self.note(self.acts[a as usize].gear as i64, 7e6);
        if self.dry_run {
            return;
        }
        let by = self.queued_by();
        let slot = self.slot_index();
        self.intro_queue.push(Pending { action: a, slot, by, event: false });
    }
    /// The frame the last still-playing press among `presses` ends on.
    pub fn press_end_of(&self, presses: &[ActId]) -> Option<f64> {
        let mut end: Option<f64> = None;
        for h in &self.timed {
            if !h.closes {
                continue;
            }
            let mut x = h.action;
            while let Some(a) = x {
                if presses.contains(&a) {
                    end = Some(end.map_or(h.due, |e: f64| e.max(h.due)));
                }
                let act = &self.acts[a as usize];
                x = act.cancel_of.or(act.form_of);
            }
        }
        end
    }
    /// Take back every hit and end still queued of a press in `presses`.
    pub fn cancel_hits(&mut self, presses: &[ActId]) {
        if self.dry_run {
            return;
        }
        let acts = &self.acts;
        let cut = |a: Option<ActId>| -> bool {
            let mut x = a;
            while let Some(y) = x {
                if presses.contains(&y) {
                    return true;
                }
                x = acts[y as usize].cancel_of.or(acts[y as usize].form_of);
            }
            false
        };
        self.timed.retain(|h| !cut(h.action));
    }
    pub fn enemy_forte(&self, i: usize) -> f64 {
        self.members[self.enemy()].forte[i]
    }
    pub fn set_enemy_forte(&mut self, i: usize, v: f64) {
        self.note(-6 - i as i64, v);
        let e = self.enemy();
        self.members[e].forte[i] = v;
    }
    pub fn add_enemy_forte(&mut self, i: usize, d: f64) {
        self.note(-6 - i as i64, d);
        let e = self.enemy();
        self.members[e].forte[i] += d;
    }
    /// forteGauge's add: a gain never pays a shortfall off — the bar starts from 0.
    pub fn add_forte(&mut self, i: usize, d: f64) {
        self.note(-1 - i as i64, d);
        let m = self.slot;
        let f = &mut self.members[m].forte[i];
        *f = (if d > 0.0 { f.max(0.0) } else { *f }) + d;
    }
    pub fn concerto(&self) -> f64 {
        self.members[self.slot].concerto
    }
    pub fn set_concerto(&mut self, v: f64) {
        self.note(-10, v);
        let m = self.slot;
        self.members[m].concerto = v;
    }
    pub fn cast_gained(&self, i: usize) -> f64 {
        self.cast_gain[i]
    }
    pub fn max_energy(&self) -> f64 {
        self.members[self.slot].resonator.and_then(|r| self.gears[r as usize].res.as_ref().map(|i| i.max_energy)).unwrap_or(0.0)
    }
    pub fn basic_dmg_bonus(&mut self) -> f64 {
        if self.recording {
            self.record_read(s::BASIC_DB);
        }
        self.members[self.slot].effective[s::BASIC_DB]
    }
    pub fn stacks_of_member(&self, m: usize, g: GearId) -> f64 {
        self.stacks_on(m, g)
    }
    /// The enemy's effective cap on a debuff (`State.enemyMax`).
    pub fn enemy_max_of(&self, g: GearId) -> f64 {
        self.gears[g as usize].max_stacks + self.enemy_max_increase[g as usize]
    }
    /// The member holding a resonator, if it is on this team.
    pub fn member_with(&self, resonator: GearId) -> Option<usize> {
        (0..self.nslots).find(|&m| self.members[m].resonator == Some(resonator))
    }
    /// Run `f` as a moment of its own: `act` stands in for the press and a fresh stamp is taken.
    pub fn with_moment(&mut self, act: ActId, f: impl FnOnce(&mut Eng)) {
        let prev = self.act;
        self.act = act;
        self.action_stamp += 1;
        f(self);
        self.act = prev;
    }
}

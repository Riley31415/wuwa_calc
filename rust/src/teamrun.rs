//! teamrun.ts: one run of a team under one combo — the ER-tier loop around it, the lines a
//! section's rows fold into, and the totals the table reads.
use crate::eng::*;
use crate::kits::Lib;
use crate::loadout::{er_roll_value, Pick, ER_TOLERANCE};
use std::collections::HashMap;
use std::rc::Rc;

/// One member of a team: its loadout (an index into `Lib::loadouts`).
#[derive(Clone)]
pub struct Member {
    pub name: String,
    pub loadout: usize,
}

#[derive(Clone, Default, Debug)]
pub struct VariantRun {
    pub total: f64,
    pub by_slot: Vec<(String, f64)>,
    pub section_totals: Vec<f64>,
    pub section_by_slot: Vec<Vec<(String, f64)>>,
    pub fight_total: f64,
    pub fight_by_slot: Vec<(String, f64)>,
    pub seconds: f64,
    pub unsafe_: bool,
}

#[derive(Clone, Default, Debug)]
pub struct TeamRun {
    pub total: f64,
    pub by_slot: Vec<(String, f64)>,
    pub section_totals: Vec<f64>,
    pub section_by_slot: Vec<Vec<(String, f64)>>,
    pub fight_total: f64,
    pub fight_by_slot: Vec<(String, f64)>,
    pub seconds: f64,
    pub section_seconds: Vec<f64>,
    pub variant_runs: Vec<Vec<VariantRun>>,
    /// What each member's Liberation needed of the constant ER over this run.
    pub er_worst: Vec<f64>,
    /// Each section's rows, for the traced report.
    pub sections: Vec<Vec<RowId>>,
    /// The report's lines (traced runs only), fields collapsed.
    pub lines: Vec<Vec<Line>>,
}

/// A row folded into the table's lines: a single press, a group's members, or repeats of one hit.
#[derive(Clone, Debug)]
pub struct Line {
    pub id: String,
    pub is_chain: bool,
    pub members: Vec<RowId>,
    pub parts: Vec<RowId>,
    pub snap: RowId,
    pub mv: f64,
    pub avg: f64,
    pub spill: bool,
    /// A field window's summary row, and which window a line belongs to (display only).
    pub aggregate: bool,
    pub field_key: Option<u32>,
}

/// teamrun.ts's ER caches, kept across runs the way the TS module keeps them.
#[derive(Default)]
pub struct Runner {
    er_last: HashMap<String, Vec<f64>>,
    er_seen: HashMap<String, Vec<HashMap<String, f64>>>,
    er_need_at: HashMap<String, Vec<f64>>,
    er_held: HashMap<(usize, String), f64>,
    gear_er: HashMap<GearId, f64>,
    next_field_key: u32,
}

fn need_key(team: &str, combo: &[Pick], has_matrix: &[bool]) -> String {
    format!("{}|{}", team, combo.iter().zip(has_matrix).map(|(c, &m)| c.key(m)).collect::<Vec<_>>().join(","))
}

impl Eng {
    fn row_slot(&self, r: &Row) -> String {
        if self.acts[r.act as usize].slot_enemy {
            self.members[self.enemy()].name.clone()
        } else {
            self.members[r.member].name.clone()
        }
    }

    /// teamrun.ts's toLines + collapseRepeats.
    fn to_lines(&self, rows: &[RowId]) -> Vec<Line> {
        let mut lines: Vec<Line> = vec![];
        let single = |id: RowId, spill: bool| Line { id: self.acts[self.rows[id as usize].act as usize].name.to_string(), is_chain: false, members: vec![], parts: vec![], snap: id, mv: self.rows[id as usize].mv, avg: self.rows[id as usize].avg, spill, aggregate: false, field_key: None };
        let mut i = 0;
        while i < rows.len() {
            let head = &self.rows[rows[i] as usize];
            let Some(g) = head.group.clone() else {
                lines.push(single(rows[i], false));
                i += 1;
                continue;
            };
            let (mut parts, mut members, mut extras) = (vec![], vec![], vec![]);
            let (mut mv, mut avg) = (0.0, 0.0);
            let mut ended = false;
            let mut j = i;
            while j < rows.len() {
                let snap = &self.rows[rows[j] as usize];
                let member = !ended && snap.group.as_ref().map_or(false, |x| Rc::ptr_eq(x, &g));
                if !member && !snap.spill.as_ref().map_or(false, |x| Rc::ptr_eq(x, &g)) {
                    break;
                }
                parts.push(rows[j]);
                if member {
                    members.push(rows[j]);
                    mv += snap.mv;
                    avg += snap.avg;
                    if snap.group_end {
                        ended = true;
                    }
                } else {
                    extras.push(rows[j]);
                }
                j += 1;
            }
            let shown = members[(members.len() as i64 - 1 - g.trailing as i64).max(0) as usize];
            if members.len() == 1 {
                lines.push(single(shown, false));
            } else {
                let id = if g.name.is_empty() { self.acts[self.rows[shown as usize].act as usize].name.to_string() } else { g.name.clone() };
                lines.push(Line { id, is_chain: true, members, parts, snap: shown, mv, avg, spill: false, aggregate: false, field_key: None });
            }
            for x in extras {
                lines.push(single(x, true));
            }
            i = j;
        }
        // back-to-back repeats of one triggered hit on one slot fold into one line
        let mut out: Vec<Line> = vec![];
        let mut i = 0;
        let mut lines: Vec<Option<Line>> = lines.into_iter().map(Some).collect();
        while i < lines.len() {
            let head = lines[i].as_ref().unwrap();
            let snap = &self.rows[head.snap as usize];
            let mut j = i + 1;
            if !head.is_chain && snap.triggered && self.acts[snap.act as usize].def.field == 0 {
                while j < lines.len() {
                    let next = lines[j].as_ref().unwrap();
                    let ns = &self.rows[next.snap as usize];
                    if next.is_chain || !ns.triggered || next.spill != head.spill {
                        break;
                    }
                    if self.acts[ns.act as usize].name != self.acts[snap.act as usize].name || self.row_slot(ns) != self.row_slot(snap) {
                        break;
                    }
                    j += 1;
                }
            }
            if j - i < 2 {
                out.push(lines[i].take().unwrap());
                i += 1;
                continue;
            }
            let run: Vec<Line> = (i..j).map(|k| lines[k].take().unwrap()).collect();
            let spill = run[0].spill;
            out.push(Line {
                id: format!("{} x{}", self.acts[snap.act as usize].name, run.len()),
                aggregate: false,
                field_key: None,
                is_chain: true,
                members: run.iter().map(|l| l.snap).collect(),
                parts: run.iter().map(|l| l.snap).collect(),
                snap: run.last().unwrap().snap,
                mv: run.iter().fold(0.0, |n, l| n + l.mv),
                avg: run.iter().fold(0.0, |n, l| n + l.avg),
                spill,
            });
            i = j;
        }
        out
    }
}

impl Eng {
    /// teamrun.ts's collapseFields: one summary line per field opening, under the cast that opened
    /// it; the hits stay lines of their own, tagged with the same key.
    pub fn collapse_fields(&self, sections: &[Vec<Line>], next_key: &mut u32) -> Vec<Vec<Line>> {
        let lines: Vec<&Line> = sections.iter().flatten().collect();
        let field_of = |r: RowId| Some(self.acts[self.rows[r as usize].act as usize].def.field).filter(|&f| f != 0);
        let hits_of = |l: &Line| -> Vec<RowId> { if l.members.is_empty() { vec![l.snap] } else { l.members.clone() } };
        let mut fields: Vec<(u32, Vec<usize>)> = vec![];
        for (i, l) in lines.iter().enumerate() {
            let Some(f) = field_of(l.snap) else { continue };
            if !hits_of(l).iter().all(|&h| field_of(h) == Some(f)) {
                continue;
            }
            match fields.iter_mut().find(|x| x.0 == f) {
                Some(x) => x.1.push(i),
                None => fields.push((f, vec![i])),
            }
        }
        if fields.is_empty() {
            return sections.to_vec();
        }
        let mut key_of: Vec<Option<u32>> = vec![None; lines.len()];
        let mut after: Vec<Vec<Line>> = vec![vec![]; lines.len()];
        let mut before: Vec<Vec<Line>> = vec![vec![]; lines.len()];
        for (field, at) in &fields {
            let opens: Vec<usize> = (0..lines.len()).filter(|&i| self.rows[lines[i].snap as usize].trace.as_ref().map_or(false, |t| t.opens_fields.contains(field))).collect();
            let mut groups: Vec<(i64, Vec<usize>)> = vec![];
            for &i in at {
                let mut open: i64 = -1;
                for &o in &opens {
                    if o > i {
                        break;
                    }
                    open = o as i64;
                }
                match groups.iter_mut().find(|x| x.0 == open) {
                    Some(x) => x.1.push(i),
                    None => groups.push((open, vec![i])),
                }
            }
            for (open, hits) in groups {
                let key = *next_key;
                *next_key += 1;
                for &i in &hits {
                    key_of[i] = Some(key);
                }
                let mut parts: Vec<RowId> = vec![];
                for &i in &hits {
                    let l = lines[i];
                    if l.members.is_empty() {
                        parts.push(l.snap);
                    } else {
                        parts.extend(l.parts.iter().copied());
                    }
                }
                let one = &self.acts[self.rows[parts[0] as usize].act as usize].name;
                let same = parts.iter().all(|&p| &self.acts[self.rows[p as usize].act as usize].name == one);
                let id = if same { format!("{} x{}", one, parts.len()) } else { format!("{} x{}", self.fields[*field as usize - 1], parts.len()) };
                let summary = Line {
                    id,
                    is_chain: true,
                    aggregate: true,
                    field_key: Some(key),
                    members: parts.clone(),
                    snap: parts[0],
                    parts,
                    mv: hits.iter().fold(0.0, |n, &i| n + lines[i].mv),
                    avg: hits.iter().fold(0.0, |n, &i| n + lines[i].avg),
                    spill: false,
                };
                if open >= 0 {
                    after[open as usize].push(summary);
                } else {
                    before[hits[0]].push(summary);
                }
            }
        }
        let mut out: Vec<Vec<Line>> = vec![];
        let mut i = 0;
        for section in sections {
            let mut sec = vec![];
            for l in section {
                sec.extend(before[i].iter().cloned());
                let mut l = l.clone();
                if let Some(k) = key_of[i] {
                    l.field_key = Some(k);
                }
                sec.push(l);
                sec.extend(after[i].iter().cloned());
                i += 1;
            }
            out.push(sec);
        }
        out
    }
}

fn bump(v: &mut Vec<(String, f64)>, k: &str, x: f64) {
    match v.iter_mut().find(|e| e.0 == k) {
        Some(e) => e.1 += x,
        None => v.push((k.to_string(), x)),
    }
}
fn adjusted(damage: f64, frames: f64) -> f64 {
    ((damage * 26.0 * 60.0) / frames).floor()
}

impl Runner {
    fn gear_er(&mut self, e: &Eng, g: GearId) -> f64 {
        if let Some(&x) = self.gear_er.get(&g) {
            return x;
        }
        // menuStats keeps the first entry per stat key of a piece
        let mut seen: Vec<(usize, u32)> = vec![];
        let mut er = 0.0;
        if let Some(lines) = &e.gears[g as usize].constant {
            for &(st, v, tag) in lines.iter() {
                if seen.contains(&(st, tag)) {
                    continue;
                }
                seen.push((st, tag));
                if st == s::ER && tag == 0 {
                    er += v;
                }
            }
        }
        self.gear_er.insert(g, er);
        er
    }
    fn er_held(&mut self, e: &Eng, lib: &Lib, m: &Member, p: &Pick, rolls: u32) -> f64 {
        let l = &lib.loadouts[m.loadout];
        let has_matrix = e.gears[l.resonator as usize].meta.as_ref().unwrap().matrix.is_some();
        let key = (m.loadout, format!("{}|{}", p.key(has_matrix), rolls));
        if let Some(&x) = self.er_held.get(&key) {
            return x;
        }
        let mut held = 0.0;
        for g in e.pieces(l, p, rolls) {
            held += self.gear_er(e, g);
        }
        self.er_held.insert(key, held);
        held
    }
    fn er_rolls_wanted(&mut self, e: &Eng, lib: &Lib, m: &Member, p: &Pick, need: f64) -> u32 {
        let base = lib.loadouts[m.loadout].substat.tiers[0].rolls;
        if need == 0.0 {
            return base;
        }
        let held = self.er_held(e, lib, m, p, base);
        base + ((need - held - ER_TOLERANCE) / er_roll_value()).ceil().max(0.0) as u32
    }
    fn er_need_for(&self, team: &str, n: usize, builds: &[String]) -> Vec<f64> {
        let last = self.er_last.get(team);
        let seen = self.er_seen.get(team);
        (0..n).map(|i| seen.and_then(|s| s.get(i)).and_then(|m| m.get(&builds[i]).copied()).or_else(|| last.and_then(|l| l.get(i).copied())).unwrap_or(0.0)).collect()
    }
    fn remember(&mut self, team: &str, builds: &[String], need: &[f64], member: i64) {
        self.er_last.insert(team.to_string(), need.to_vec());
        let seen = self.er_seen.entry(team.to_string()).or_insert_with(|| builds.iter().map(|_| HashMap::new()).collect());
        for (i, &n) in need.iter().enumerate() {
            if member < 0 || member == i as i64 {
                seen[i].insert(builds[i].clone(), n);
            }
        }
    }

    fn keys(e: &Eng, lib: &Lib, members: &[Member], combo: &[Pick]) -> (Vec<bool>, Vec<String>) {
        let has: Vec<bool> = members.iter().map(|m| e.gears[lib.loadouts[m.loadout].resonator as usize].meta.as_ref().unwrap().matrix.is_some()).collect();
        let builds = combo.iter().zip(&has).map(|(c, &h)| c.build(h)).collect();
        (has, builds)
    }

    /// teamrun.ts's erRollsFor: how many ER rolls each member's spread carries under `combo`.
    pub fn er_rolls_for(&mut self, e: &Eng, lib: &Lib, team: &str, members: &[Member], combo: &[Pick]) -> Vec<u32> {
        let (has, builds) = Self::keys(e, lib, members, combo);
        let need = self.er_need_at.get(&need_key(team, combo, &has)).cloned().unwrap_or_else(|| self.er_need_for(team, members.len(), &builds));
        members.iter().enumerate().map(|(i, m)| self.er_rolls_wanted(e, lib, m, &combo[i], *need.get(i).unwrap_or(&0.0))).collect()
    }

    /// teamrun.ts's erFeasible: can every member fill their bar on this combo's gear?
    pub fn er_feasible(&mut self, e: &Eng, lib: &Lib, team: &str, members: &[Member], combo: &[Pick]) -> bool {
        let rolls = self.er_rolls_for(e, lib, team, members, combo);
        members.iter().enumerate().all(|(i, m)| rolls[i] <= lib.loadouts[m.loadout].substat.tiers.last().unwrap().rolls)
    }

    /// teamrun.ts's runTeam: the run at the ER tier the requirement names, re-run until it agrees.
    pub fn run_team(&mut self, e: &mut Eng, lib: &Lib, team: &str, members: &[Member], combo: &[Pick], variants: Option<&[Option<Vec<Pick>>]>, trace: bool) -> TeamRun {
        let outer = e.tracing;
        e.tracing = trace;
        let run = self.run_team_loop(e, lib, team, members, combo, variants);
        e.tracing = outer;
        run
    }

    fn run_team_loop(&mut self, e: &mut Eng, lib: &Lib, team: &str, members: &[Member], combo: &[Pick], variants: Option<&[Option<Vec<Pick>>]>) -> TeamRun {
        let n = members.len();
        let mut floor = vec![0u32; n];
        let top = |m: &Member| lib.loadouts[m.loadout].substat.tiers.last().unwrap().rolls;
        let (has, builds) = Self::keys(e, lib, members, combo);
        let key = need_key(team, combo, &has);
        loop {
            let known = self.er_need_at.contains_key(&key);
            let worn: Vec<u32> = self.er_rolls_for(e, lib, team, members, combo).iter().zip(&floor).map(|(&r, &f)| r.max(f)).collect();
            let guard: Vec<bool> = members.iter().enumerate().map(|(i, m)| !combo[i].high_subs && worn[i] < top(m)).collect();
            let run = self.run_team_inner(e, lib, team, members, combo, variants, &worn, &guard);
            let Some(mut run) = run else {
                let (at, need) = e.er_short.unwrap();
                let mut raised = self.er_need_at.get(&key).cloned().unwrap_or_else(|| self.er_need_for(team, n, &builds));
                raised[at] = raised[at].max(need);
                self.remember(team, &builds, &raised, at as i64);
                if known {
                    self.er_need_at.insert(key.clone(), raised);
                }
                floor[at] = self.er_rolls_for(e, lib, team, members, combo)[at];
                continue;
            };
            let measured = run.er_worst.clone();
            if !known {
                self.er_need_at.insert(key.clone(), measured.clone());
                self.remember(team, &builds, &measured, -1);
            }
            let asked = self.er_rolls_for(e, lib, team, members, combo);
            let over = members.iter().enumerate().any(|(i, m)| {
                let l = &lib.loadouts[m.loadout];
                !combo[i].high_subs && l.substat.at(asked[i].max(floor[i])) != l.substat.at(worn[i])
            });
            if over {
                continue;
            }
            if let Some(vs) = variants {
                for (i, alts) in vs.iter().enumerate() {
                    let Some(alts) = alts else { continue };
                    for (v, alt) in alts.iter().enumerate() {
                        let mut at = combo.to_vec();
                        at[i] = *alt;
                        let alt_key = need_key(team, &at, &has);
                        self.er_need_at.entry(alt_key).or_insert_with(|| measured.clone());
                        let asked = self.er_rolls_for(e, lib, team, members, &at)[i];
                        let l = &lib.loadouts[members[i].loadout];
                        if !alt.high_subs && l.substat.at(asked) != l.substat.at(e.members[i].variant_rolls[v]) {
                            run.variant_runs[i][v].unsafe_ = true;
                        }
                    }
                }
            }
            return run;
        }
    }

    /// teamrun.ts's runTeamInner: None where a Liberation ran its bar short (ER_SHORT).
    #[allow(clippy::too_many_arguments)]
    pub fn run_team_inner(&mut self, e: &mut Eng, lib: &Lib, team: &str, members: &[Member], combo: &[Pick], variants: Option<&[Option<Vec<Pick>>]>, rolls: &[u32], guard: &[bool]) -> Option<TeamRun> {
        let names: Vec<&str> = members.iter().map(|m| m.name.as_str()).collect();
        e.reset_fight(&names);
        let (has, _) = Self::keys(e, lib, members, combo);
        for (i, m) in members.iter().enumerate() {
            e.active = i;
            e.slot = i;
            let l = &lib.loadouts[m.loadout];
            let c = &combo[i];
            for g in e.pieces(l, c, rolls[i]) {
                e.equip(g);
            }
            let held = self.er_held(e, lib, m, c, rolls[i]);
            e.members[i].const_er = held;
            e.members[i].er_guard = guard[i];
            if let Some(Some(alts)) = variants.map(|v| &v[i]) {
                if !alts.is_empty() {
                    let worn = if c.high_subs { None } else { Some(l.substat.at(rolls[i])) };
                    let own = self.er_need_at.get(&need_key(team, combo, &has)).cloned().unwrap_or_else(|| {
                        let builds: Vec<String> = combo.iter().zip(&has).map(|(c, &h)| c.build(h)).collect();
                        self.er_need_for(team, members.len(), &builds)
                    });
                    let mut vrolls = vec![];
                    for alt in alts {
                        let mut at = combo.to_vec();
                        at[i] = *alt;
                        let need = self.er_need_at.get(&need_key(team, &at, &has)).cloned().unwrap_or_else(|| own.clone());
                        vrolls.push(self.er_rolls_wanted(e, lib, m, alt, *need.get(i).unwrap_or(&0.0)));
                    }
                    let subs: Vec<Option<GearId>> = vrolls.iter().map(|&r| {
                        let piece = if c.high_subs { None } else { Some(l.substat.at(r)) };
                        if piece == worn {
                            None
                        } else {
                            piece
                        }
                    }).collect();
                    let slot = &mut e.members[i];
                    slot.variant_of = Some(l.mainstats[c.mainstat]);
                    slot.variants = alts.iter().map(|a| l.mainstats[a.mainstat]).collect();
                    slot.variant_at.clear();
                    slot.variant_unsafe = vec![false; alts.len()];
                    slot.variant_sub_of = worn;
                    slot.variant_rolls = vrolls;
                    slot.variant_subs = subs;
                }
            }
        }
        e.active = 0;
        e.slot = e.enemy();
        let enemy = lib.g("TUNE_BREAK_ENEMY");
        e.equip(enemy);
        e.slot = 0;
        e.buff = None;
        let rotations: Vec<Rc<crate::rotation::Rotation>> = members.iter().enumerate().map(|(i, m)| lib.loadouts[m.loadout].rotation_at(combo[i].sequence)).collect();
        let (sections, frames) = e.run_rotations(&rotations, 4);
        if e.er_short.is_some() {
            return None;
        }
        let lines: Vec<Vec<Line>> = sections.iter().map(|rows| e.to_lines(rows)).collect();
        let starts: Vec<f64> = sections.iter().enumerate().map(|(k, rows)| if k == 0 { 0.0 } else { rows.iter().fold(f64::INFINITY, |m, &r| m.min(e.rows[r as usize].starts)) }).collect();
        let section_seconds = (0..starts.len()).map(|k| (starts.get(k + 1).copied().unwrap_or(frames) - starts[k]) / 60.0).collect();
        let mut run = TeamRun { section_seconds, sections: sections.clone(), ..Default::default() };
        // the table's figures: each section, and the rotations as adjusted DPR
        let mut whole: Vec<(String, f64)> = vec![];
        for (k, ls) in lines.iter().enumerate() {
            let mut by: Vec<(String, f64)> = vec![];
            let mut total = 0.0;
            for l in ls {
                if l.mv == 0.0 {
                    continue;
                }
                let slot = e.row_slot(&e.rows[l.snap as usize]);
                bump(&mut by, &slot, l.avg);
                total += l.avg;
            }
            let _ = k;
            run.section_totals.push(total);
            for (slot, v) in &by {
                bump(&mut whole, slot, *v);
                bump(&mut run.fight_by_slot, slot, *v);
            }
            run.section_by_slot.push(by);
            run.fight_total += total;
        }
        for (slot, v) in &whole {
            let w = adjusted(*v, frames);
            run.by_slot.push((slot.clone(), w));
            run.total += w;
        }
        run.seconds = frames / 60.0;
        run.variant_runs = self.variant_sums(e, &lines, frames, members, variants);
        if e.tracing {
            run.lines = e.collapse_fields(&lines, &mut self.next_field_key);
        }
        run.er_worst = members.iter().enumerate().map(|(i, m)| if e.gears[lib.loadouts[m.loadout].resonator as usize].res.as_ref().unwrap().max_energy != 0.0 { e.members[i].er_worst } else { 0.0 }).collect();
        Some(run)
    }

    /// teamrun.ts's variantSums: every member's main-stat variants scored off the same lines.
    fn variant_sums(&self, e: &Eng, lines: &[Vec<Line>], frames: f64, members: &[Member], variants: Option<&[Option<Vec<Pick>>]>) -> Vec<Vec<VariantRun>> {
        let counts: Vec<usize> = (0..members.len()).map(|i| variants.and_then(|v| v[i].as_ref()).map_or(0, |a| a.len())).collect();
        if counts.iter().all(|&c| c == 0) {
            return members.iter().map(|_| vec![]).collect();
        }
        let mut acc: Vec<Vec<VariantRun>> = counts.iter().map(|&c| vec![VariantRun::default(); c]).collect();
        for ls in lines {
            let mut sec_total: Vec<Vec<f64>> = counts.iter().map(|&c| vec![0.0; c]).collect();
            let mut sec_by: Vec<Vec<Vec<(String, f64)>>> = counts.iter().map(|&c| vec![vec![]; c]).collect();
            for l in ls {
                if l.mv == 0.0 {
                    continue;
                }
                let mut avgs: Vec<Vec<f64>> = counts.iter().map(|&c| vec![l.avg; c]).collect();
                if !l.is_chain {
                    let snap = &e.rows[l.snap as usize];
                    if let Some(i) = members.iter().position(|m| m.name == e.members[snap.member].name) {
                        if let Some(va) = &snap.variant_avg {
                            for v in 0..counts[i] {
                                avgs[i][v] = va[v];
                            }
                        }
                    }
                } else {
                    for &p in &l.parts {
                        if !l.members.contains(&p) {
                            continue;
                        }
                        let ps = &e.rows[p as usize];
                        let Some(i) = members.iter().position(|m| m.name == e.members[ps.member].name) else { continue };
                        let Some(va) = &ps.variant_avg else { continue };
                        for v in 0..counts[i] {
                            avgs[i][v] += va[v] - ps.avg;
                        }
                    }
                }
                let slot = e.row_slot(&e.rows[l.snap as usize]);
                for i in 0..counts.len() {
                    for v in 0..counts[i] {
                        bump(&mut sec_by[i][v], &slot, avgs[i][v]);
                        sec_total[i][v] += avgs[i][v];
                    }
                }
            }
            for i in 0..counts.len() {
                for v in 0..counts[i] {
                    let a = &mut acc[i][v];
                    a.section_totals.push(sec_total[i][v]);
                    for (slot, x) in &sec_by[i][v] {
                        bump(&mut a.fight_by_slot, slot, *x);
                    }
                    a.section_by_slot.push(sec_by[i][v].clone());
                    a.fight_total += sec_total[i][v];
                }
            }
        }
        for (i, list) in acc.iter_mut().enumerate() {
            for (v, a) in list.iter_mut().enumerate() {
                let mut whole: Vec<(String, f64)> = vec![];
                for by in &a.section_by_slot {
                    for (slot, x) in by {
                        bump(&mut whole, slot, *x);
                    }
                }
                for (slot, x) in whole {
                    let w = adjusted(x, frames);
                    a.by_slot.push((slot, w));
                    a.total += w;
                }
                a.seconds = frames / 60.0;
                a.unsafe_ = e.members[i].variant_unsafe[v];
            }
        }
        acc
    }
}

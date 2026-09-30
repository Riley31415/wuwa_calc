//! The traced run: what evaluate.ts's ResolvedSnapshot adds to a row for the detail page.
use crate::eng::*;

/// A held buff as the popover lists it: its name (with its count), whose kit, frames left.
pub type Held = (String, String, f64);

#[derive(Clone)]
pub struct RowTrace {
    pub entries: Vec<StatEntry>,
    pub cast_adds: Vec<(String, String, [f64; 7])>,
    /// The damage type the hit was evaluated as, its override where one stood.
    pub typ: u32,
    pub stats: Stats,
    pub forte: [f64; 5],
    pub forte_before: [f64; 5],
    pub max_forte: [f64; 5],
    pub energy: f64,
    pub concerto: f64,
    pub offtune: f64,
    pub energy_before: f64,
    pub concerto_before: f64,
    pub offtune_before: f64,
    pub concerto_short: bool,
    pub forte_short: [bool; 5],
    pub energy_wiped: bool,
    pub real_energy_before: f64,
    pub frame: f64,
    pub frames: f64,
    pub tag: Tag,
    pub active: bool,
    pub timestop_banked: f64,
    pub held_local: Vec<Held>,
    pub held_global: Vec<Held>,
    pub held_enemy: Vec<Held>,
    pub opens_fields: Vec<u32>,
    pub cast_gain: Option<[f64; 7]>,
}

impl RowTrace {
    /// evaluate.ts's landHit, traced: a hit's row keeps its cast's own and takes the rest.
    pub fn land(&mut self, hit: &RowTrace) {
        self.entries = hit.entries.clone();
        self.typ = hit.typ;
        self.stats = hit.stats;
        self.forte = hit.forte;
        self.max_forte = hit.max_forte;
        self.energy = hit.energy;
        self.concerto = hit.concerto;
        self.offtune = hit.offtune;
        self.held_local = hit.held_local.clone();
        self.held_global = hit.held_global.clone();
        self.held_enemy = hit.held_enemy.clone();
        self.opens_fields.extend(hit.opens_fields.iter().copied());
        for i in 0..5 {
            self.forte_short[i] = self.forte_short[i] || hit.forte_short[i];
        }
    }
}

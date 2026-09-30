//! Every kit, weapon and echo, registered by the name its TS export had (`STARFIELD_CALIBRATOR`,
//! `LUCY_RESONATOR`), so any file reaches any other's gear through the `Lib`.
pub mod echoes;
pub mod resonators;
pub mod shared;
pub mod weapons;

use crate::eng::*;
use crate::loadout::Loadout;
use shared::{Ladder, Shared};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

#[derive(Default)]
pub struct Lib {
    pub gears: HashMap<&'static str, GearId>,
    pub acts: HashMap<&'static str, ActId>,
    pub weapons: HashMap<&'static str, Vec<GearId>>,
    pub ladders: HashMap<&'static str, Ladder>,
    /// status.ts's OWN_CHAFE_RUNGS: a resonator's own copy of the Glacio Chafe rungs.
    pub own_chafe_rungs: Rc<RefCell<Vec<(GearId, Ladder)>>>,
    pub loadouts: Vec<Loadout>,
    /// Gear a loadout lists that is not ported yet (a named, statless stand-in).
    pub pending: Vec<&'static str>,
}

impl Lib {
    pub fn g(&self, name: &str) -> GearId {
        *self.gears.get(name).unwrap_or_else(|| panic!("no gear named {}", name))
    }
    pub fn a(&self, name: &str) -> ActId {
        *self.acts.get(name).unwrap_or_else(|| panic!("no action named {}", name))
    }
    pub fn w(&self, name: &str) -> Vec<GearId> {
        self.weapons.get(name).unwrap_or_else(|| panic!("no weapon named {}", name)).clone()
    }
    pub fn ladder(&self, name: &str) -> Ladder {
        self.ladders.get(name).unwrap_or_else(|| panic!("no ladder named {}", name)).clone()
    }
    /// A resonator's id, reserved the first time any file names it.
    pub fn res(&mut self, e: &mut Eng, name: &'static str) -> GearId {
        if let Some(&g) = self.gears.get(name) {
            return g;
        }
        let g = e.reserve(name);
        self.gears.insert(name, g);
        g
    }
    pub fn put(&mut self, name: &'static str, g: GearId) -> GearId {
        if self.gears.insert(name, g).is_some() {
            panic!("{} registered twice", name);
        }
        g
    }
    pub fn put_a(&mut self, name: &'static str, a: ActId) -> ActId {
        if self.acts.insert(name, a).is_some() {
            panic!("{} registered twice", name);
        }
        a
    }
    pub fn put_w(&mut self, name: &'static str, w: Vec<GearId>) {
        if self.weapons.insert(name, w).is_some() {
            panic!("{} registered twice", name);
        }
    }
    pub fn loadout(&self, export: &str) -> usize {
        self.loadouts.iter().position(|l| l.export == export).unwrap_or_else(|| panic!("no loadout {}", export))
    }
}

/// Everything, in dependency order: the shared machinery, weapons and echoes, then the kits.
pub fn build(e: &mut Eng) -> (Lib, Shared) {
    let mut lib = Lib::default();
    let sh = shared::build(e, &mut lib);
    weapons::build(e, &mut lib, &sh);
    echoes::build(e, &mut lib, &sh);
    resonators::build(e, &mut lib, &sh);
    (lib, sh)
}

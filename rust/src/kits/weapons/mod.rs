//! src/weapons/*.ts.
pub mod broadblade;
pub mod gauntlet;
pub mod pistol;
pub mod rectifier;
pub mod standard;
pub mod sword;

use super::shared::Shared;
use super::Lib;
use crate::eng::*;
use crate::loadout::Tier;

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    broadblade::build(e, lib, sh);
    gauntlet::build(e, lib, sh);
    pistol::build(e, lib, sh);
    rectifier::build(e, lib, sh);
    standard::build(e, lib, sh);
    sword::build(e, lib, sh);
}

impl Lib {
    /// A weapon not ported yet: five named ranks with no stats, so a loadout's indices still line up.
    pub fn todo_w(&mut self, e: &mut Eng, name: &'static str, weapon_type: Weapon) -> Vec<GearId> {
        if let Some(w) = self.weapons.get(name) {
            return w.clone();
        }
        let w = e.refinements(|e, _r, rank| e.weapon(GDef { name: format!("{} (not ported){}", name, rank), ..Default::default() }, weapon_type, Tier::Standard));
        self.pending.push(name);
        self.put_w(name, w.clone());
        w
    }
}

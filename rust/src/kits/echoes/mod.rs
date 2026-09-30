//! src/echoes/*.ts.
pub mod jinzhou;
pub mod lahairoi;
pub mod mengzhou;
pub mod rinascita;
pub mod septimont;

use super::shared::Shared;
use super::Lib;
use crate::eng::*;
use crate::loadout::Kind;

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    jinzhou::build(e, lib, sh);
    lahairoi::build(e, lib, sh);
    mengzhou::build(e, lib, sh);
    rinascita::build(e, lib, sh);
    septimont::build(e, lib, sh);
}

impl Lib {
    /// An echo piece not ported yet: named, statless, of the right kind, so indices still line up.
    pub fn todo_g(&mut self, e: &mut Eng, name: &'static str, kind: Kind) -> GearId {
        if let Some(&g) = self.gears.get(name) {
            return g;
        }
        let label = format!("{} (not ported)", name);
        let g = match kind {
            Kind::Mainslot => {
                let a = e.action(ADef { name: label.clone(), ..Default::default() });
                e.mainslot(GDef { name: label, ..Default::default() }, a)
            }
            Kind::Sonata => {
                let two = e.sonata2pc(GDef { name: format!("{} 2pc", label), ..Default::default() });
                e.sonata(GDef { name: label, ..Default::default() }, two)
            }
            _ => {
                let g = e.gear(GDef { name: label, ..Default::default() });
                e.set_kind(g, kind)
            }
        };
        self.pending.push(name);
        self.put(name, g)
    }
}

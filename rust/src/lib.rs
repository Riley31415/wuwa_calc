//! The engine port: the core (eng, api, run, rotation, loadout, authoring, teamrun), every kit
//! (kits/), and the entry points the native bench and the WebAssembly module drive.
pub mod api;
pub mod authoring;
pub mod eng;
pub mod json;
pub mod kits;
pub mod loadout;
#[cfg(feature = "prof")]
pub mod prof;
pub mod rotation;
pub mod run;
pub mod teamrun;
pub mod trace;
pub mod wasm_api;

use eng::Eng;
use kits::Lib;
use loadout::Pick;
use teamrun::{Member, Runner, TeamRun};

/// The engine with every kit built: what a worker holds for its lifetime.
pub struct World {
    pub e: Eng,
    pub lib: Lib,
    pub runner: Runner,
}

impl World {
    pub fn new() -> World {
        let mut e = Eng::new();
        let (lib, _) = kits::build(&mut e);
        World { e, lib, runner: Runner::default() }
    }
    /// A team of loadouts by export name, as the roster names them.
    pub fn members(&self, exports: &[&str]) -> Vec<Member> {
        exports
            .iter()
            .map(|x| {
                let l = self.lib.loadout(x);
                Member { name: self.e.gears[self.lib.loadouts[l].resonator as usize].name.clone(), loadout: l }
            })
            .collect()
    }
    pub fn run_team(&mut self, team: &str, members: &[Member], combo: &[Pick], variants: Option<&[Option<Vec<Pick>>]>) -> TeamRun {
        self.runner.run_team(&mut self.e, &self.lib, team, members, combo, variants, false)
    }
    pub fn run_traced(&mut self, team: &str, members: &[Member], combo: &[Pick]) -> TeamRun {
        self.runner.run_team(&mut self.e, &self.lib, team, members, combo, None, true)
    }
}

impl Default for World {
    fn default() -> Self {
        World::new()
    }
}

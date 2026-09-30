//! src/resonators/**/*.ts, one file per kit.
pub mod lucy;
pub mod mornye;
pub mod rebecca;

use super::shared::Shared;
use super::Lib;
use crate::eng::*;

pub fn build(e: &mut Eng, lib: &mut Lib, sh: &Shared) {
    mornye::build(e, lib, sh);
    rebecca::build(e, lib, sh);
    lucy::build(e, lib, sh);
}

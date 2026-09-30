//! The WebAssembly boundary: JSON in, JSON out, one world per instance (a page, or a worker).
//! JS writes a request into memory from `alloc`, calls `call`, reads the reply through
//! `reply_ptr`/`reply_len`, and frees the request with `dealloc`.
use crate::loadout::Pick;
use crate::teamrun::{TeamRun, VariantRun};
use crate::World;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::cell::RefCell;

thread_local! {
    static WORLD: RefCell<Option<World>> = const { RefCell::new(None) };
    static REPLY: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct PickJ {
    pub weapon: usize,
    pub echo: usize,
    pub mainstat: usize,
    pub sequence: usize,
    pub refine: usize,
    #[serde(default)]
    pub matrix: bool,
    #[serde(default)]
    pub high_subs: bool,
}
impl From<PickJ> for Pick {
    fn from(p: PickJ) -> Pick {
        Pick { weapon: p.weapon, echo: p.echo, mainstat: p.mainstat, sequence: p.sequence, refine: p.refine, matrix: p.matrix, high_subs: p.high_subs }
    }
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum Req {
    RunTeam {
        team: String,
        members: Vec<String>,
        combo: Vec<PickJ>,
        #[serde(default)]
        variants: Option<Vec<Option<Vec<PickJ>>>>,
        #[serde(default)]
        trace: bool,
    },
    Meta,
    TeamPlayable {
        members: Vec<String>,
    },
    ErRollsFor {
        team: String,
        members: Vec<String>,
        combo: Vec<PickJ>,
    },
    ErFeasible {
        team: String,
        members: Vec<String>,
        combo: Vec<PickJ>,
    },
    Pending,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VariantJ<'a> {
    total: f64,
    by_slot: &'a [(String, f64)],
    section_totals: &'a [f64],
    section_by_slot: &'a [Vec<(String, f64)>],
    fight_total: f64,
    fight_by_slot: &'a [(String, f64)],
    seconds: f64,
    #[serde(rename = "unsafe")]
    unsafe_: bool,
}
fn variant_j(v: &VariantRun) -> VariantJ<'_> {
    VariantJ {
        total: v.total,
        by_slot: &v.by_slot,
        section_totals: &v.section_totals,
        section_by_slot: &v.section_by_slot,
        fight_total: v.fight_total,
        fight_by_slot: &v.fight_by_slot,
        seconds: v.seconds,
        unsafe_: v.unsafe_,
    }
}

fn run_j(r: &TeamRun) -> Value {
    json!({
        "total": r.total,
        "bySlot": r.by_slot,
        "sectionTotals": r.section_totals,
        "sectionBySlot": r.section_by_slot,
        "fightTotal": r.fight_total,
        "fightBySlot": r.fight_by_slot,
        "seconds": r.seconds,
        "sectionSeconds": r.section_seconds,
        "variantRuns": r.variant_runs.iter().map(|vs| vs.iter().map(variant_j).collect::<Vec<_>>()).collect::<Vec<_>>(),
        "erWorst": r.er_worst,
    })
}

fn handle(w: &mut World, req: Req) -> Value {
    match req {
        Req::RunTeam { team, members, combo, variants, trace } => {
            let names: Vec<&str> = members.iter().map(|s| s.as_str()).collect();
            let ms = w.members(&names);
            let combo: Vec<Pick> = combo.into_iter().map(Pick::from).collect();
            if trace {
                let run = w.run_traced(&team, &ms, &combo);
                let mut out = run_j(&run);
                out.as_object_mut().unwrap().insert("traced".into(), crate::json::traced_j(w, &run));
                return out;
            }
            let variants: Option<Vec<Option<Vec<Pick>>>> = variants.map(|v| v.into_iter().map(|a| a.map(|a| a.into_iter().map(Pick::from).collect())).collect());
            let run = w.run_team(&team, &ms, &combo, variants.as_deref());
            run_j(&run)
        }
        Req::Meta => crate::json::meta_j(w),
        Req::TeamPlayable { members } => {
            // every rotation each member's loadout declares, across the team
            let names: Vec<String> = members.iter().map(|x| w.e.gears[w.lib.loadouts[w.lib.loadout(x)].resonator as usize].name.clone()).collect();
            let rots: Vec<Vec<std::rc::Rc<crate::rotation::Rotation>>> = members.iter().map(|x| w.lib.loadouts[w.lib.loadout(x)].rotations.clone()).collect();
            let mut why: Option<String> = None;
            fn walk(rots: &[Vec<std::rc::Rc<crate::rotation::Rotation>>], at: usize, pick: &mut Vec<std::rc::Rc<crate::rotation::Rotation>>, names: &[String], why: &mut Option<String>) {
                if why.is_some() {
                    return;
                }
                if at == rots.len() {
                    *why = crate::rotation::team_playable(pick, names);
                    return;
                }
                for r in &rots[at] {
                    pick.push(r.clone());
                    walk(rots, at + 1, pick, names, why);
                    pick.pop();
                }
            }
            walk(&rots, 0, &mut vec![], &names, &mut why);
            json!(why)
        }
        Req::ErRollsFor { team, members, combo } => {
            let names: Vec<&str> = members.iter().map(|s| s.as_str()).collect();
            let ms = w.members(&names);
            let combo: Vec<Pick> = combo.into_iter().map(Pick::from).collect();
            json!(w.runner.er_rolls_for(&w.e, &w.lib, &team, &ms, &combo))
        }
        Req::ErFeasible { team, members, combo } => {
            let names: Vec<&str> = members.iter().map(|s| s.as_str()).collect();
            let ms = w.members(&names);
            let combo: Vec<Pick> = combo.into_iter().map(Pick::from).collect();
            json!(w.runner.er_feasible(&w.e, &w.lib, &team, &ms, &combo))
        }
        Req::Pending => json!(w.lib.pending),
    }
}

/// One request, as JSON text: the reply, as JSON text.
pub fn call_json(input: &str) -> String {
    WORLD.with(|cell| {
        let mut slot = cell.borrow_mut();
        let w = slot.get_or_insert_with(World::new);
        let reply = match serde_json::from_str::<Req>(input) {
            Ok(req) => handle(w, req),
            Err(err) => json!({ "error": err.to_string() }),
        };
        reply.to_string()
    })
}

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `p` must come from `alloc(n)`.
#[no_mangle]
pub unsafe extern "C" fn dealloc(p: *mut u8, n: usize) {
    drop(Vec::from_raw_parts(p, 0, n));
}

/// # Safety
/// `p` must point at `n` bytes of UTF-8 JSON.
#[no_mangle]
pub unsafe extern "C" fn call(p: *const u8, n: usize) {
    let input = std::str::from_utf8(std::slice::from_raw_parts(p, n)).unwrap_or("{}");
    let out = call_json(input);
    REPLY.with(|r| *r.borrow_mut() = out.into_bytes());
}

#[no_mangle]
pub extern "C" fn reply_ptr() -> *const u8 {
    REPLY.with(|r| r.borrow().as_ptr())
}

#[no_mangle]
pub extern "C" fn reply_len() -> usize {
    REPLY.with(|r| r.borrow().len())
}

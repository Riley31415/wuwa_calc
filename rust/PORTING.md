# Porting a TS kit / weapon / echo file to Rust

Rust is becoming the only engine (see PORT_PLAN.md). Every TS file under `src/weapons`, `src/echoes`
and `src/resonators` gets a Rust twin under `rust/src/kits/`, and it must reproduce the TS engine
**exactly**: same damage, gauges and frames on every evaluate, with no tolerance at all.

## Sources
- Port from `rust/harness/ts_ref/src/...`, the TS tree frozen when the port began. It is identical
  to `src/` today. Its compiled copy `rust/harness/rref/` is the reference every check runs against.
- Learn the idiom from the finished pairs. Each file's header names its TS source.
  - Kits: `rust/src/kits/resonators/{mornye,rebecca,lucy}.rs` against
    `src/resonators/{fusion/mornye,electro/rebecca,spectro/lucy}.ts`.
  - Gear: every file under `rust/src/kits/weapons/` and `rust/src/kits/echoes/`, all ported.
  - Shared machinery: `rust/src/kits/shared.rs`, which covers status, tunebreak and unison.
- Engine API lives in these files:
  - `rust/src/eng.rs`: GDef, ADef, BulletDef, Grant, grant/on_cast/on_action/on_inflict/on_applied,
    stat keys `s::*`, tags `T_*`, elements, and context methods.
  - `rust/src/api.rs`: the rest of context.ts.
  - `rust/src/authoring.rs`: resonator, weapon, refinements, mainslot, sonata*, sequence, inherent,
    talent, mode, matrix, handoff, coordinated, new_field.
  - `rust/src/rotation.rs`: `W`, `group_of`, `Form`, `e.form`, `e.rotation`, and markers `e.mk`.
  - `rust/src/loadout.rs`: Loadout, LoadoutDef, EchoLoadout, Mainstat, Substat.
- TS context functions are the same names in snake_case on `Eng`: `applyCurrent` → `e.apply_current`,
  `isHeld` → `e.is_held`, `addToCast` → `e.add_to_cast`. A hook is `h(move |e| ...)`.

## Idioms (the user's preference: no `Some`/`None` in kit code)
Definition structs take plain values with defaults, so write only what the TS sets and end with
`..Default::default()` (or `..act("Name")`, `..buff("Name")`).
- Enums: `cast: Cast::Basic`, `node: Node::Forte`, `scaling: Scaling::Atk`, `tag: Tag::Field`. The
  default is each enum's `None` variant (`Tag::Default` for tag, which an Outro cast reads as Field).
- Numbers and ids:
  - `max_stacks: 2.0`; 0, the default, means 1.
  - `field: some_field`; 0 means none.
  - `commit: 14.0` on a bullet; the default -1 means "at its hit", and 0 is a real frame 0.
  - A bullet's `element`/`typ`/`subtype` default to `INHERIT`, the action's own. Write 0 for the
    TS `null`.
  - ResDef `talent`/`inherent1`/`inherent2`/`matrix: id` and `intro: act_id` default to
    `NO_GEAR`/`NO_ACT`.
  - A LoadoutDef leaves out `mode` unless the build has one (`mode: id`).
  - `e.coordinated(name, secs, owner, ...)` takes `NO_GEAR` for "the holder's own slot".
- Lists: `bullets: vec![...]`, `constant: vec![...]`. Empty means unset.
- Closures go through builders that hide the Option:
  - `h(move |e| ...)` for hooks;
  - `ticks(|e, n| ...)` for `tick_fn`;
  - `dur(|e, n| ...)` for `duration_fn`;
  - `shown(|e| ...)` for `display`;
  - `cond(|e| ...)` for a buff's `when`;
  - `resolver(|e| Some(act))` for `resolve`;
  - `dodges(|e, after| ...)` for ResDef `dodge`/`jump`/`hold`;
  - `constant_fn: h(...)` for a constantStats that reads its wearer.
- Grants: never write a `Grant { .. }` literal. Build it with:
  - `grant(trigger, buff, To::X)`, `hit_grant(...)` (onHit), or `on_hit(grant(...))`;
  - `grant_count(trigger, buff, to, |e| n)` for TS `stacks: () => n`.
  Triggers are `on_cast`, `on_action`, `on_inflict`, `on_applied`, `on_type`, `when(|e| ...)` (a bare
  `on: () => ...`), `inflicting(|e| ...)`, `either(vec![..])` and `both(vec![..])`.
- Internal engine state (`Act`, `Gear`) still holds Options. That is fine inside the engine, but
  kit code should not have to spell them.

## Rules
- Names are data. Every buff, action, gear and field name string must equal the TS one byte for
  byte, because traces and the page key on them. Register every export under its TS export name:
  - gear with `lib.put("NAME", g)`;
  - a weapon's five ranks with `lib.put_w("NAME", ranks)`;
  - an action another file reaches with `lib.put_a`;
  - a resonator id with `lib.res(e, "NAME_RESONATOR")`;
  - a loadout with `export: "NAME"`.
- Keep the TS order of definitions, grants, stats, hooks and list entries (echo loadouts, weapons,
  main stats, substats, sequences). Order is observable: grants fire in list order, and
  held-buff/stat-entry order shows in the detail page.
- A kit reaches other files' gear by name: `lib.g("NAME")`, `lib.w("NAME")`, `lib.a("NAME")`.
  `lib.todo_g(e, "NAME", Kind)` and `lib.todo_w(e, "NAME", Weapon)` return the real piece once it is
  registered, and a named placeholder until then. Use `lib.g`/`lib.w` for anything that exists.
- Weapons and echoes build before resonators (`kits::build`). A new file gets a `pub mod` line and a
  `build` call in its directory's `mod.rs`, in the TS import order.
- Style follows the repo's CLAUDE.md:
  - comments 1–2 lines max;
  - never put a braced block on one line (`if x { a(); b(); }`); give the body real lines;
  - LF line endings.
- Never touch git: no add, commit, stash, checkout or restore. Never run `npm run precompute`.

## Your workspace
Agents work in parallel, so each one builds in a private copy of the crate:
```
cd C:/Users/Riley/Documents/python/wuwa_calc_rust
mkdir -p rust_work/<you> && cp -r rust/src rust/Cargo.toml rust/Cargo.lock rust_work/<you>/
cd rust_work/<you> && cargo build --profile quick          # target/quick/harness.exe, ~15s
```
- Edit only inside `rust_work/<you>/`. The shared `rust/` is merged by the coordinator.
- If the engine lacks something a kit needs, add it as a new `impl Eng { ... }` in
  `rust_work/<you>/src/ext_<you>.rs`, with a `pub mod` line in lib.rs.
- If parity needs a change to existing engine code (eng.rs, api.rs, run.rs, rotation.rs, ...), make
  the smallest one and list it in your report: file, function, what changed and why. The
  coordinator merges every agent's engine changes by hand, so unreported changes get lost.

## Verifying
The reference runs any three loadouts, named by their TS export. The first one leads, so it needs a
NOINTRO chain.
```
python C:/Users/Riley/Documents/python/wuwa_calc_rust/rust/harness/check.py rust_work/<you> MORNYE,REBECCA,LUCY [picks] [--quick]
```
- `picks` is `w.e.m.sS.rR[.m][.h]` per member, comma-separated, and defaults to all zeros. The fields
  are weapon, echo loadout, main stat, sequence, refine, then `.m` for matrix and `.h` for high subs.
  Each index points into that member's loadout lists.
- The script compares the per-evaluate trace, the variant runs (every other main stat) and the
  traced detail-page run. It prints the first differing row and exits 0 only when all three are
  exact. `--quick` checks the trace alone.
- A kit counts as done when it passes on several teams: every sequence level its loadout lists,
  several refines, every weapon and echo loadout index (some of them `.m`/`.h`), and more than one
  team position (lead, and second or third).
- A mismatch that comes from a piece another agent is still porting (a "(not ported)" name in the
  trace) is not yours to fix. Pick picks that avoid it and say so.

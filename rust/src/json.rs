//! The engine's objects as the UI's mirrors read them: gear, actions, loadouts, traced rows.
use crate::eng::*;
use crate::loadout::{Kind, Loadout};
use crate::teamrun::{Line, TeamRun};
use crate::World;
use serde_json::{json, Value};
use std::collections::BTreeSet;

pub fn tag_str(t: Tag) -> &'static str {
    match t {
        Tag::Default => "",
        Tag::Field => "field",
        Tag::Cancel => "cancel",
        Tag::EasyCancel => "easy cancel",
        Tag::DodgeCancel => "dodge cancel",
        Tag::JumpCancel => "jump cancel",
        Tag::SwapCancel => "swap cancel",
        Tag::InstaCancel => "instant cancel",
        Tag::InstaDodge => "instant dodge",
        Tag::InstaJump => "instant jump",
        Tag::InstaSwap => "instant swap",
        Tag::HitCancel => "cancel on hit",
        Tag::DodgeOnHit => "dodge on hit",
        Tag::JumpOnHit => "jump on hit",
    }
}

fn kind_str(k: Kind) -> &'static str {
    match k {
        Kind::Gear => "Gear",
        Kind::Buff => "Buff",
        Kind::Debuff => "Debuff",
        Kind::Talent => "Talent",
        Kind::Inherent => "Inherent",
        Kind::Sequence => "Sequence",
        Kind::Mode => "ResonanceMode",
        Kind::Sonata2pc => "Sonata2pc",
        Kind::Sonata => "Sonata",
        Kind::Sonata3pc => "Sonata3pc",
        Kind::Sonata1pc => "Sonata1pc",
        Kind::Matrix => "Matrix",
        Kind::Mainslot => "Mainslot",
        Kind::Weapon => "Weapon",
        Kind::Resonator => "Resonator",
        Kind::Action => "Action",
    }
}

fn lines_j(lines: &[(usize, f64, u32)]) -> Value {
    json!(lines.iter().map(|&(st, v, tag)| if tag == 0 { json!([st, v]) } else { json!([st, v, tag]) }).collect::<Vec<_>>())
}

/// One Gear as its mirror reads it.
pub fn gear_j(w: &World, g: GearId) -> Value {
    let e = &w.e;
    let gear = &e.gears[g as usize];
    let mut o = json!({
        "id": g,
        "name": gear.name,
        "kind": kind_str(gear.kind),
        "hidden": gear.hidden,
        "maxStacks": gear.max_stacks,
        "lines": gear.constant.as_ref().map_or(json!([]), |l| lines_j(l)),
    });
    let m = o.as_object_mut().unwrap();
    if let Some(two) = gear.sonata2pc {
        m.insert("sonata2pc".into(), json!(two));
    }
    if let Some(wm) = &gear.weapon {
        m.insert("weapon".into(), json!({ "weaponType": wm.weapon_type as u32, "tier": wm.tier as u32, "refinement": wm.refinement }));
    }
    if let (Some(r), Some(meta)) = (&gear.res, &gear.meta) {
        m.insert(
            "resonator".into(),
            json!({
                "element": meta.element, "color": meta.color, "tier": meta.tier as u32, "weapon": r.weapon as u32,
                "maxEnergy": r.max_energy, "maxForte": r.max_forte,
                "talent": meta.talent, "inherent1": meta.inherent1, "inherent2": meta.inherent2, "matrix": meta.matrix,
            }),
        );
    }
    if let Some((_, b)) = e.breakdowns.iter().find(|x| x.0 == g) {
        m.insert("breakdown".into(), json!(b.iter().map(|(n, l)| json!([n, lines_j(l)])).collect::<Vec<_>>()));
    }
    o
}

fn loadout_j(l: &Loadout) -> Value {
    let spread = |s: &crate::loadout::ErSpread| json!({ "tiers": s.tiers.iter().map(|t| json!([t.rolls, t.piece])).collect::<Vec<_>>(), "noEr": s.no_er });
    json!({
        "export": l.export,
        "resonator": l.resonator,
        "refinements": l.refinements,
        "echoLoadouts": l.echo_loadouts.iter().map(|x| json!({ "mainslot": x.mainslot, "sonata": x.sonata, "sets": x.sets })).collect::<Vec<_>>(),
        "mainstats": l.mainstats,
        "substat": spread(&l.substat),
        "highSubstat": spread(&l.high_substat),
        "sequences": l.sequences,
        "minSequence": l.min_sequence,
        "mode": l.mode,
    })
}

/// Every loadout, and every Gear a loadout can put on a member.
pub fn meta_j(w: &World) -> Value {
    let e = &w.e;
    let mut ids: BTreeSet<GearId> = BTreeSet::new();
    for l in &w.lib.loadouts {
        ids.insert(l.resonator);
        if let Some(meta) = &e.gears[l.resonator as usize].meta {
            ids.extend([meta.talent, meta.inherent1, meta.inherent2, meta.matrix].iter().flatten());
        }
        ids.extend(l.refinements.iter().flatten());
        for x in &l.echo_loadouts {
            ids.insert(x.mainslot);
            ids.extend(x.sets.iter());
            ids.extend(e.echo_pieces(x));
        }
        ids.extend(l.mainstats.iter());
        for s in [&l.substat, &l.high_substat] {
            ids.extend(s.tiers.iter().map(|t| t.piece));
            ids.extend(s.no_er.iter());
        }
        ids.extend(l.sequences.iter());
        ids.extend(l.mode.iter());
    }
    let enemy = w.lib.g("TUNE_BREAK_ENEMY");
    let base = w.lib.g("BASE_RESISTANCE");
    ids.insert(enemy);
    ids.insert(base);
    json!({
        "gears": ids.iter().map(|&g| gear_j(w, g)).collect::<Vec<_>>(),
        "loadouts": w.lib.loadouts.iter().map(loadout_j).collect::<Vec<_>>(),
        "enemy": enemy,
        "baseResistance": base,
        "pending": w.lib.pending,
    })
}

fn act_j(e: &Eng, a: ActId) -> Value {
    let x = &e.acts[a as usize];
    let d = &x.def;
    json!({
        "id": a,
        "gear": x.gear,
        "name": &*x.name,
        "cast": x.cast.map(|c| c as u32),
        "subcast": x.subcast.map(|c| c as u32),
        "node": (d.node != Node::None).then_some(d.node as u32),
        "scaling": x.scaling.map(|s| s as u32),
        "mv": x.mv, "energy": x.energy, "concerto": x.concerto, "offtune": x.offtune,
        "castEnergy": d.cast_energy, "castConcerto": d.cast_concerto, "castForte": x.cast_forte,
        "forte": x.forte, "resetForte": x.reset_forte, "resetEnergy": x.reset_energy,
        "bullets": x.bullets.iter().map(|b| json!({
            "hitFrame": b.hit, "commitFrame": b.commit, "mv": b.mv, "energy": b.energy, "concerto": b.concerto, "offtune": b.offtune,
            "forte": b.forte, "element": if b.element == 0 { Value::Null } else { json!(b.element) },
            "type": if b.typ == 0 { Value::Null } else { json!(b.typ) }, "subtype": if b.subtype == 0 { Value::Null } else { json!(b.subtype) },
        })).collect::<Vec<_>>(),
        "animFrames": x.anim, "prioFrames": x.prio, "qteFrames": x.qte, "timestop": x.timestop, "motionStop": x.motion_stop,
        "tag": tag_str(x.tag),
        "half": match x.half { Half::Whole => Value::Null, Half::Cast => json!("cast"), Half::Hit => json!("hit"), Half::End => json!("end") },
        "hitsAtCast": x.hits_at_cast,
        "onHitAt": x.on_hit_at,
        "cancelOf": x.cancel_of, "formOf": x.form_of,
        "field": (d.field != 0).then(|| e.fields[d.field as usize - 1].clone()),
        "castPart": x.cast_copy,
    })
}

fn line_j(l: &Line) -> Value {
    json!({
        "id": l.id, "isChain": l.is_chain, "members": l.members, "parts": l.parts, "snap": l.snap,
        "mv": l.mv, "avg": l.avg, "spill": l.spill, "aggregate": l.aggregate,
        "fieldKey": l.field_key.map(|k| format!("f{}", k)),
    })
}

/// A traced run: its rows, the lines over them, and every action and Gear they name.
pub fn traced_j(w: &World, run: &TeamRun) -> Value {
    let e = &w.e;
    let mut acts: BTreeSet<ActId> = BTreeSet::new();
    let mut gears: BTreeSet<GearId> = BTreeSet::new();
    let rows: Vec<Value> = e
        .rows
        .iter()
        .map(|r| {
            let mut a = Some(r.act);
            while let Some(x) = a {
                if !acts.insert(x) {
                    break;
                }
                let act = &e.acts[x as usize];
                if let Some(c) = act.cast_copy {
                    acts.insert(c);
                }
                a = act.cancel_of.or(act.form_of);
            }
            let slot = if e.acts[r.act as usize].slot_enemy { e.members[e.enemy()].name.clone() } else { e.members[r.member].name.clone() };
            let mut o = json!({
                "action": r.act, "member": e.members[r.member].name, "slot": slot, "triggered": r.triggered,
                "mv": r.mv, "avg": r.avg, "starts": r.starts, "ends": r.ends, "hitAt": r.hit_at,
                "swapFrames": if r.swap_frames != 0.0 { json!(r.swap_frames) } else { Value::Null },
                "queued": r.queued, "variantAvg": r.variant_avg,
                "source": r.source.as_ref().map(|s| json!({ "name": s.0, "source": s.1, "left": 0 })),
            });
            if let Some(t) = &r.trace {
                for x in &t.entries {
                    gears.extend(x.gear.iter());
                }
                let held = |v: &Vec<crate::trace::Held>| json!(v.iter().map(|(n, s, l)| json!({ "name": n, "source": s, "left": l })).collect::<Vec<_>>());
                let m = o.as_object_mut().unwrap();
                m.insert("trace".into(), json!({
                    "entries": t.entries.iter().map(|x| json!([x.key, x.value, x.source, x.owner, x.gear])).collect::<Vec<_>>(),
                    "castAdds": t.cast_adds.iter().map(|(s, o, g)| json!({ "source": s, "owner": o, "gains": g })).collect::<Vec<_>>(),
                    "type": if t.typ == 0 { Value::Null } else { json!(t.typ) },
                    "stats": t.stats.to_vec(),
                    "forte": t.forte, "forteBefore": t.forte_before, "maxForte": t.max_forte,
                    "energy": t.energy, "concerto": t.concerto, "offtune": t.offtune,
                    "energyBefore": t.energy_before, "concertoBefore": t.concerto_before, "offtuneBefore": t.offtune_before,
                    "concertoShort": t.concerto_short, "forteShort": t.forte_short, "energyWiped": t.energy_wiped,
                    "realEnergyBefore": t.real_energy_before,
                    "frame": t.frame, "frames": t.frames, "tag": tag_str(t.tag), "active": t.active, "timestopBanked": t.timestop_banked,
                    "heldLocal": held(&t.held_local), "heldGlobal": held(&t.held_global), "heldEnemy": held(&t.held_enemy),
                    "opensFields": t.opens_fields.iter().map(|&f| e.fields[f as usize - 1].clone()).collect::<Vec<_>>(),
                    "castGain": t.cast_gain,
                }));
            }
            o
        })
        .collect();
    gears.extend(e.granted_by.keys());
    gears.extend(e.granted_by.values());
    json!({
        "rows": rows,
        "lines": run.lines.iter().map(|ls| ls.iter().map(line_j).collect::<Vec<_>>()).collect::<Vec<_>>(),
        "actions": acts.iter().map(|&a| act_j(e, a)).collect::<Vec<_>>(),
        "gears": gears.iter().map(|&g| gear_j(w, g)).collect::<Vec<_>>(),
        "grantedBy": e.granted_by.iter().map(|(k, v)| json!([k, v])).collect::<Vec<_>>(),
        "grantedOn": e.granted_on.iter().map(|(k, v)| json!([k, e.members[*v].name])).collect::<Vec<_>>(),
    })
}

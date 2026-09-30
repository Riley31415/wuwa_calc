//! Native harness: run a team by loadout exports and picks, write its trace, time it.
use std::time::Instant;
use wuwa_engine::loadout::Pick;
use wuwa_engine::World;

#[cfg(not(target_arch = "wasm32"))]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

fn pick(s: &str) -> Pick {
    // weapon.echo.mainstat.sequence.refine[.m][.h]
    let p: Vec<&str> = s.split('.').collect();
    let n = |i: usize| p[i].trim_start_matches(['s', 'r']).parse::<usize>().unwrap();
    Pick { weapon: n(0), echo: n(1), mainstat: n(2), sequence: n(3), refine: n(4), matrix: p.contains(&"m"), high_subs: p.contains(&"h") }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let get = |k: &str| args.iter().find_map(|a| a.strip_prefix(k).map(|x| x.to_string()));
    let team = get("--team=").unwrap_or("t144".into());
    let exports = get("--members=").unwrap_or("MORNYE,REBECCA,LUCY".into());
    let exports: Vec<&str> = exports.split(',').collect();
    // all zeros by default, as dump.mjs's
    let zeros = vec!["0.0.0.0.0"; exports.len()].join(",");
    let picks: Vec<Pick> = get("--picks=").unwrap_or(zeros).split(',').map(pick).collect();
    let mut w = World::new();
    if args.iter().any(|a| a == "--list") {
        // every loadout export, then the gear still standing in as "(not ported)"
        println!("{}", w.lib.loadouts.iter().map(|l| l.export.as_str()).collect::<Vec<_>>().join(","));
        println!("{}", w.lib.pending.join(","));
        // per loadout: weapons, echo loadouts, main stats, lowest sequence
        let dims: Vec<String> = w.lib.loadouts.iter().map(|l| format!("\"{}\":[{},{},{},{}]", l.export, l.weapons.len(), l.echo_loadouts.len(), l.mainstats.len(), l.min_sequence)).collect();
        println!("{{{}}}", dims.join(","));
        return;
    }
    let members = w.members(&exports);
    if args.iter().any(|a| a == "--trace") {
        w.e.trace = Some(vec![]);
        let run = w.run_team(&team, &members, &picks, None);
        w.e.trace = Some(vec![]);
        let run2 = w.run_team(&team, &members, &picks, None);
        let tr = w.e.trace.take().unwrap();
        std::fs::write("trace.txt", tr.join("\n")).unwrap();
        println!("sections {:?} frames {} rows {} (first run {:?})", run2.section_totals, run2.seconds * 60.0, tr.len(), run.section_totals);
        return;
    }
    if let Some(out) = get("--traced-json=") {
        // the traced run as the page receives it, through the JSON API
        let pj = |p: &Pick| format!("{{\"weapon\":{},\"echo\":{},\"mainstat\":{},\"sequence\":{},\"refine\":{},\"matrix\":{},\"highSubs\":{}}}", p.weapon, p.echo, p.mainstat, p.sequence, p.refine, p.matrix, p.high_subs);
        let req = format!("{{\"op\":\"runTeam\",\"team\":\"{}\",\"members\":[{}],\"combo\":[{}]}}", team, exports.iter().map(|x| format!("\"{}\"", x)).collect::<Vec<_>>().join(","), picks.iter().map(pj).collect::<Vec<_>>().join(","));
        wuwa_engine::wasm_api::call_json(&req);
        let traced = req.replacen("{", "{\"trace\":true,", 1);
        std::fs::write(&out, wuwa_engine::wasm_api::call_json(&traced)).unwrap();
        return;
    }
    if args.iter().any(|a| a == "--variants") {
        // every member's other main stats ride along as variants
        let alts: Vec<Option<Vec<Pick>>> = members
            .iter()
            .enumerate()
            .map(|(i, m)| Some((0..w.lib.loadouts[m.loadout].mainstats.len()).filter(|&k| k != picks[i].mainstat).map(|k| Pick { mainstat: k, ..picks[i] }).collect()))
            .collect();
        let run = w.run_team(&team, &members, &picks, Some(&alts));
        let vs: Vec<String> = run
            .variant_runs
            .iter()
            .map(|list| format!("[{}]", list.iter().map(|v| format!("[{},[{}],{}]", v.total, v.section_totals.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(","), v.unsafe_)).collect::<Vec<_>>().join(",")))
            .collect();
        println!("{{\"total\":{},\"sections\":[{}],\"variants\":[{}]}}", run.total, run.section_totals.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(","), vs.join(","));
        return;
    }
    let run = w.run_team(&team, &members, &picks, None);
    println!("sections {:?} frames {} total {} er_worst {:?}", run.section_totals, run.seconds * 60.0, run.total, run.er_worst);
    let n: usize = get("--n=").and_then(|x| x.parse().ok()).unwrap_or(2000);
    for _ in 0..50 {
        w.run_team(&team, &members, &picks, None);
    }
    let t0 = Instant::now();
    for _ in 0..n {
        w.run_team(&team, &members, &picks, None);
    }
    println!("rust ms/run {:.4}", t0.elapsed().as_secs_f64() * 1000.0 / n as f64);
}

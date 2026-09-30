//! gear.ts's build shapes (Resonator, Weapon refinements, Mainslot, the sonata sets, EchoLoadout,
//! Loadout) and shared/mainstats.ts + shared/substats.ts, which generate a build's stat pieces.
use crate::eng::*;
use crate::rotation::Rotation;
use std::rc::Rc;

/* ------------------------------------------------------------------------------ names */

pub fn stat_name(st: usize) -> &'static str {
    const NAMES: [&str; 37] = [
        "Base ATK", "Base HP", "Base DEF", "Flat ATK", "Flat HP", "Flat DEF", "ATK%", "HP%", "DEF%", "Crit Rate", "Crit Dmg", "Energy Regen", "Tune Break Boost",
        "Offtune Buildup", "Energy Regen Multiplier", "MV increase", "MV multiplier", "Dmg Bonus", "Amplification", "Total Damage", "Damage Taken", "Res Ignore",
        "Def Ignore (new)", "Def Ignore (old)", "Healing Bonus", "Healing Received", "Energy", "Concerto", "Offtune", "DirectOfftune", "Forte1", "Forte2", "Forte3",
        "Forte4", "Forte5", "Res Reduce", "Def Reduce",
    ];
    NAMES[st]
}

pub fn tag_name(tag: u32) -> &'static str {
    match tag {
        AERO => "Aero",
        ELECTRO => "Electro",
        FUSION => "Fusion",
        GLACIO => "Glacio",
        SPECTRO => "Spectro",
        HAVOC => "Havoc",
        PHYSICAL => "Physical",
        T_BASIC => "Basic",
        T_HEAVY => "Heavy",
        T_SKILL => "Skill",
        T_LIBERATION => "Liberation",
        T_INTRO => "Intro",
        T_OUTRO => "Outro",
        T_ECHO => "Echo",
        T_STATUS => "Status",
        T_BREAK => "Tune Break",
        T_RUPTURE => "Tune Rupture",
        T_HACK => "Tune Hack",
        T_UTILITY => "Utility",
        S_COORDINATED => "Coordinated",
        S_SPECTRO_FRAZZLE => "Spectro Frazzle",
        S_AERO_EROSION => "Aero Erosion",
        S_FUSION_BURST => "Fusion Burst",
        S_GLACIO_CHAFE => "Glacio Chafe",
        S_ELECTRO_FLARE => "Electro Flare",
        _ => "?",
    }
}

/// stats.ts's statLabel: "Fusion Dmg Bonus" for a scoped stat, the stat's own name otherwise.
pub fn stat_label(stat: usize, tag: u32) -> String {
    if tag == 0 {
        stat_name(stat).to_string()
    } else {
        format!("{} {}", tag_name(tag), stat_name(stat))
    }
}

/* ------------------------------------------------------------------------------ gear shapes */

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Tier {
    Limited,
    Standard,
    Free,
    FreeS2,
}

/// What kind of Gear a piece is, for the UI (TS's class tree).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Gear,
    Buff,
    Debuff,
    Talent,
    Inherent,
    Sequence,
    Mode,
    Sonata2pc,
    Sonata,
    Sonata3pc,
    Sonata1pc,
    Matrix,
    Mainslot,
    Weapon,
    Resonator,
    Action,
}

/// A resonator's identity beyond its fight hooks — what a loadout and the UI read.
#[derive(Clone)]
pub struct ResMeta {
    pub element: u32,
    pub color: String,
    pub tier: Tier,
    pub talent: Option<GearId>,
    pub inherent1: Option<GearId>,
    pub inherent2: Option<GearId>,
    pub matrix: Option<GearId>,
}

#[derive(Clone)]
pub struct WeaponMeta {
    pub weapon_type: Weapon,
    pub tier: Tier,
    pub refinement: u32,
}

#[derive(Clone)]
pub struct EchoLoadout {
    pub mainslot: GearId,
    pub sonata: GearId,
    /// The sets as a build reads them, one per set named.
    pub sets: Vec<GearId>,
}

impl Eng {
    /// Every piece an echo loadout equips: the mainslot, the sets, and a 5pc's own 2pc.
    pub fn echo_pieces(&self, e: &EchoLoadout) -> Vec<GearId> {
        let mut out = vec![e.mainslot];
        out.extend(e.sets.iter().copied());
        if let Some(two) = self.gears[e.sonata as usize].sonata2pc {
            out.push(two);
        }
        out
    }
}

pub struct ErTier {
    pub rolls: u32,
    pub piece: GearId,
}

/// substats.ts's ErSpread: one ChemX32 (or high-investment) spread at every ER tier it comes in.
#[derive(Default)]
pub struct ErSpread {
    pub named: Vec<Substat>,
    pub tiers: Vec<ErTier>,
    pub no_er: Option<GearId>,
}

impl ErSpread {
    pub fn at(&self, rolls: u32) -> GearId {
        self.tiers.iter().find(|t| t.rolls >= rolls).unwrap_or(self.tiers.last().unwrap()).piece
    }
}

pub struct Loadout {
    /// The TS export this loadout is named by (`SHOREKEEPER`), what the roster and URLs key on.
    pub export: String,
    pub resonator: GearId,
    pub weapons: Vec<GearId>,
    pub refinements: Vec<Vec<GearId>>,
    pub echo_loadouts: Vec<EchoLoadout>,
    pub mainstats: Vec<GearId>,
    pub substat: ErSpread,
    pub high_substat: ErSpread,
    pub rotations: Vec<Rc<Rotation>>,
    pub rotation_by_level: [Option<usize>; 7],
    pub min_sequence: usize,
    pub sequences: Vec<GearId>,
    pub mode: Option<GearId>,
}

pub struct LoadoutDef {
    pub export: &'static str,
    pub resonator: GearId,
    /// Each weapon's whole refinement list, or one rank of it.
    pub weapons: Vec<Vec<GearId>>,
    pub echo_loadouts: Vec<EchoLoadout>,
    pub mainstats: Vec<GearId>,
    pub substat: ErSpread,
    pub high_substat: ErSpread,
    /// The rotation each sequence level takes over at (`{ 0: base, 3: withStrawCape }`).
    pub rotation: Vec<(usize, Rotation)>,
    pub sequences: Vec<GearId>,
    /// A stance the build commits to from combat start; NO_GEAR for none.
    pub mode: GearId,
}

impl Default for LoadoutDef {
    fn default() -> Self {
        LoadoutDef {
            export: "",
            resonator: NO_GEAR,
            weapons: vec![],
            echo_loadouts: vec![],
            mainstats: vec![],
            substat: ErSpread::default(),
            high_substat: ErSpread::default(),
            rotation: vec![],
            sequences: vec![],
            mode: NO_GEAR,
        }
    }
}

impl Loadout {
    pub fn new(d: LoadoutDef) -> Loadout {
        let mut rotations = vec![];
        let mut declared: [Option<usize>; 7] = [None; 7];
        for (level, rot) in d.rotation {
            declared[level] = Some(rotations.len());
            rotations.push(Rc::new(rot));
        }
        let mut by_level: [Option<usize>; 7] = [None; 7];
        for n in 0..7 {
            by_level[n] = declared[n].or(if n > 0 { by_level[n - 1] } else { None });
        }
        let min_sequence = by_level.iter().position(|x| x.is_some()).expect("a loadout's rotation map declares no rotation");
        Loadout {
            export: d.export.to_string(),
            resonator: d.resonator,
            weapons: d.weapons.iter().map(|w| w[0]).collect(),
            refinements: d.weapons,
            echo_loadouts: d.echo_loadouts,
            mainstats: d.mainstats,
            substat: d.substat,
            high_substat: d.high_substat,
            rotations,
            rotation_by_level: by_level,
            min_sequence,
            sequences: d.sequences,
            mode: some_gear(d.mode),
        }
    }
    pub fn rotation_at(&self, level: usize) -> Rc<Rotation> {
        let i = self.rotation_by_level[level.min(6)].expect("no rotation declared at this level");
        self.rotations[i].clone()
    }
}

/// One member's build: indices into its loadout (solver.ts's Pick, resolved to its pieces).
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct Pick {
    pub weapon: usize,
    pub echo: usize,
    pub mainstat: usize,
    pub sequence: usize,
    pub refine: usize,
    pub matrix: bool,
    pub high_subs: bool,
}

impl Pick {
    /// solver.ts's comboOf keys: the combo, and the same without its main stat.
    pub fn key(&self, has_matrix: bool) -> String {
        let m = self.matrix && has_matrix;
        format!("{}.{}.{}.s{}.r{}{}{}", self.weapon, self.echo, self.mainstat, self.sequence, self.refine, if m { ".m" } else { "" }, if self.high_subs { ".h" } else { "" })
    }
    pub fn build(&self, has_matrix: bool) -> String {
        let m = self.matrix && has_matrix;
        format!("{}.{}.s{}.r{}{}{}", self.weapon, self.echo, self.sequence, self.refine, if m { ".m" } else { "" }, if self.high_subs { ".h" } else { "" })
    }
}

impl Eng {
    /// gear.ts's Loadout.spread: the substat piece a build wears at `rolls` ER rolls.
    pub fn spread(&self, l: &Loadout, high: bool, rolls: u32) -> GearId {
        if !high {
            return l.substat.at(rolls);
        }
        let max_energy = self.gears[l.resonator as usize].res.as_ref().unwrap().max_energy;
        if max_energy != 0.0 {
            l.high_substat.at(rolls)
        } else {
            l.high_substat.no_er.unwrap_or(l.high_substat.at(0))
        }
    }
    /// gear.ts's Loadout.pieces: everything a pick equips, in equip order.
    pub fn pieces(&self, l: &Loadout, p: &Pick, rolls: u32) -> Vec<GearId> {
        let r = l.resonator;
        let meta = self.gears[r as usize].meta.clone().unwrap();
        let mut out = vec![r];
        out.extend([meta.talent, meta.inherent1, meta.inherent2].iter().flatten());
        out.push(l.refinements[p.weapon][p.refine]);
        out.extend(self.echo_pieces(&l.echo_loadouts[p.echo]));
        out.push(l.mainstats[p.mainstat]);
        out.push(self.spread(l, p.high_subs, rolls));
        out.extend(l.sequences.iter().take(p.sequence));
        if let Some(m) = l.mode {
            out.push(m);
        }
        if p.matrix {
            if let Some(m) = meta.matrix {
                out.push(m);
            }
        }
        out
    }
}

/* ------------------------------------------------------------------------------ mainstats */

#[derive(Clone, Copy, PartialEq, Eq, Debug, PartialOrd, Ord)]
pub enum Mainstat {
    CR4,
    CD4,
    ATK4,
    HP4,
    DEF4,
    ER3,
    ATK3,
    HP3,
    DEF3,
    Glacio3,
    Fusion3,
    Electro3,
    Aero3,
    Spectro3,
    Havoc3,
    ATK1,
    HP1,
    DEF1,
}

fn main_entry(k: Mainstat) -> (usize, f64, u32) {
    use Mainstat::*;
    match k {
        CR4 => (s::CRIT_RATE, 22.0, 0),
        CD4 => (s::CRIT_DMG, 44.0, 0),
        ATK4 => (s::BONUS_ATK, 33.0, 0),
        HP4 => (s::BONUS_HP, 33.0, 0),
        DEF4 => (s::BONUS_DEF, 41.8, 0),
        ER3 => (s::ER, 32.0, 0),
        ATK3 => (s::BONUS_ATK, 30.0, 0),
        HP3 => (s::BONUS_HP, 30.0, 0),
        DEF3 => (s::BONUS_DEF, 38.0, 0),
        Glacio3 => (s::DMG_BONUS, 30.0, GLACIO),
        Fusion3 => (s::DMG_BONUS, 30.0, FUSION),
        Electro3 => (s::DMG_BONUS, 30.0, ELECTRO),
        Aero3 => (s::DMG_BONUS, 30.0, AERO),
        Spectro3 => (s::DMG_BONUS, 30.0, SPECTRO),
        Havoc3 => (s::DMG_BONUS, 30.0, HAVOC),
        ATK1 => (s::BONUS_ATK, 18.0, 0),
        HP1 => (s::BONUS_HP, 22.8, 0),
        DEF1 => (s::BONUS_DEF, 18.0, 0),
    }
}
fn secondary(cost: u32) -> (usize, f64, u32) {
    match cost {
        4 => (s::FLAT_ATK, 150.0, 0),
        3 => (s::FLAT_ATK, 100.0, 0),
        _ => (s::FLAT_HP, 2280.0, 0),
    }
}
fn cost_of(k: Mainstat) -> u32 {
    if k <= Mainstat::DEF4 {
        4
    } else if k <= Mainstat::Havoc3 {
        3
    } else {
        1
    }
}
fn main_label(k: Mainstat) -> String {
    let (stat, _, tag) = main_entry(k);
    let text = if tag != 0 { tag_name(tag).to_string() } else { stat_name(stat).replace('%', "") };
    let word = if text.contains(' ') { text.split(' ').map(|w| w.chars().next().unwrap().to_string()).collect::<String>() } else { text };
    if cost_of(k) == 1 {
        word.to_lowercase()
    } else {
        word
    }
}

/// A piece's per-echo or per-roll breakdown, for the loadout hover: (name, its stat lines).
pub type Breakdown = Vec<(String, Vec<(usize, f64, u32)>)>;

impl Eng {
    /// mainstats.ts's mainstats(): one main-stat build from its five echoes.
    pub fn mainstats(&mut self, slots: &[Mainstat]) -> GearId {
        let mut slots = slots.to_vec();
        // a stable sort, highest cost first, as the TS sort
        slots.sort_by(|a, b| cost_of(*b).cmp(&cost_of(*a)));
        assert_eq!(slots.len(), 5, "mainstats(): five echoes");
        let cost: u32 = slots.iter().map(|&k| cost_of(k)).sum();
        assert!(cost <= 12, "mainstats(): over the 12 cost cap");
        let mut totals: Vec<(usize, u32, f64)> = vec![];
        let mut bump = |(stat, value, tag): (usize, f64, u32)| match totals.iter_mut().find(|t| t.0 == stat && t.1 == tag) {
            Some(t) => t.2 += value,
            None => totals.push((stat, tag, value)),
        };
        for &k in &slots {
            bump(main_entry(k));
            bump(secondary(cost_of(k)));
        }
        let layout: String = slots.iter().map(|&k| cost_of(k).to_string()).collect();
        let name = format!("{} {}", layout, slots.iter().map(|&k| main_label(k)).collect::<Vec<_>>().join(" "));
        let lines = totals.iter().map(|&(st, tag, v)| (st, v, tag)).collect();
        let g = self.gear(GDef { name, is_buff: true, constant: lines, ..Default::default() });
        self.gears[g as usize].kind = Kind::Buff;
        let breakdown: Breakdown = slots
            .iter()
            .map(|&k| {
                let (stat, _, tag) = main_entry(k);
                (format!("{}C {}", cost_of(k), stat_label(stat, tag)), vec![main_entry(k), secondary(cost_of(k))])
            })
            .collect();
        self.breakdowns.push((g, breakdown));
        g
    }

    /// mainstats.ts's mainstatOptions(): every 43311 and 44111 build (41111 with HP 1-costs).
    pub fn mainstat_options(&mut self, options: &[Mainstat]) -> Vec<GearId> {
        let c4: Vec<Mainstat> = options.iter().copied().filter(|&k| cost_of(k) == 4).collect();
        let c3: Vec<Mainstat> = options.iter().copied().filter(|&k| cost_of(k) == 3).collect();
        let c1: Vec<Mainstat> = options.iter().copied().filter(|&k| cost_of(k) == 1).collect();
        let mut builds = vec![];
        for &four in &c4 {
            for three in multisets(&c3, 2) {
                for one in multisets(&c1, 2) {
                    let mut v = vec![four];
                    v.extend(three.iter());
                    v.extend(one.iter());
                    builds.push(self.mainstats(&v));
                }
            }
        }
        for four in multisets(&c4, 2) {
            for one in multisets(&c1, 3) {
                let mut v = four.clone();
                v.extend(one.iter());
                builds.push(self.mainstats(&v));
            }
        }
        if c1.contains(&Mainstat::HP1) {
            for &four in &c4 {
                for one in multisets(&c1, 4) {
                    let mut v = vec![four];
                    v.extend(one.iter());
                    builds.push(self.mainstats(&v));
                }
            }
        }
        builds
    }
}

fn multisets<T: Copy>(keys: &[T], n: usize) -> Vec<Vec<T>> {
    if n == 0 {
        return vec![vec![]];
    }
    let mut out = vec![];
    for i in 0..keys.len() {
        for rest in multisets(&keys[i..], n - 1) {
            let mut v = vec![keys[i]];
            v.extend(rest);
            out.push(v);
        }
    }
    out
}

/* ------------------------------------------------------------------------------ substats */

#[derive(Clone, Copy, PartialEq, Eq, Debug, PartialOrd, Ord)]
pub enum Substat {
    CritRate,
    CritDmg,
    Er,
    AtkPct,
    FlatAtk,
    HpPct,
    FlatHp,
    DefPct,
    FlatDef,
    Basic,
    Heavy,
    Skill,
    Liberation,
}
const ALL_SUBSTATS: [Substat; 13] = [
    Substat::CritRate,
    Substat::CritDmg,
    Substat::Er,
    Substat::AtkPct,
    Substat::FlatAtk,
    Substat::HpPct,
    Substat::FlatHp,
    Substat::DefPct,
    Substat::FlatDef,
    Substat::Basic,
    Substat::Heavy,
    Substat::Skill,
    Substat::Liberation,
];

struct Roll {
    stat: usize,
    tag: u32,
    values: &'static [f64],
    weights: &'static [f64],
    label: &'static str,
}
const PCT: [f64; 8] = [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6];
const WEIGHTS: [f64; 8] = [7.0, 8.0, 21.0, 25.0, 18.0, 15.0, 6.0, 3.0];
const CRIT_WEIGHTS: [f64; 8] = [70.0, 70.0, 70.0, 24.0, 24.0, 24.0, 9.0, 9.0];
fn roll(sub: Substat) -> Roll {
    use Substat::*;
    match sub {
        CritRate => Roll { stat: s::CRIT_RATE, tag: 0, values: &[6.3, 6.9, 7.5, 8.1, 8.7, 9.3, 9.9, 10.5], weights: &CRIT_WEIGHTS, label: "Crit Rate" },
        CritDmg => Roll { stat: s::CRIT_DMG, tag: 0, values: &[12.6, 13.8, 15.0, 16.2, 17.4, 18.6, 19.8, 21.0], weights: &CRIT_WEIGHTS, label: "Crit Dmg" },
        Er => Roll { stat: s::ER, tag: 0, values: &[6.8, 7.6, 8.4, 9.2, 10.0, 10.8, 11.6, 12.4], weights: &WEIGHTS, label: "ER" },
        AtkPct => Roll { stat: s::BONUS_ATK, tag: 0, values: &PCT, weights: &WEIGHTS, label: "ATK" },
        FlatAtk => Roll { stat: s::FLAT_ATK, tag: 0, values: &[30.0, 40.0, 50.0, 60.0], weights: &[7.0, 54.0, 39.0, 3.0], label: "ATK" },
        HpPct => Roll { stat: s::BONUS_HP, tag: 0, values: &PCT, weights: &WEIGHTS, label: "HP" },
        FlatHp => Roll { stat: s::FLAT_HP, tag: 0, values: &[320.0, 360.0, 390.0, 430.0, 470.0, 510.0, 540.0, 580.0], weights: &WEIGHTS, label: "HP" },
        DefPct => Roll { stat: s::BONUS_DEF, tag: 0, values: &[8.1, 9.0, 10.0, 10.9, 11.8, 12.8, 13.8, 14.7], weights: &WEIGHTS, label: "DEF" },
        FlatDef => Roll { stat: s::FLAT_DEF, tag: 0, values: &[40.0, 50.0, 60.0, 70.0], weights: &[15.0, 46.0, 33.0, 9.0], label: "DEF" },
        Basic => Roll { stat: s::DMG_BONUS, tag: T_BASIC, values: &PCT, weights: &WEIGHTS, label: "Basic" },
        Heavy => Roll { stat: s::DMG_BONUS, tag: T_HEAVY, values: &PCT, weights: &WEIGHTS, label: "Heavy" },
        Skill => Roll { stat: s::DMG_BONUS, tag: T_SKILL, values: &PCT, weights: &WEIGHTS, label: "Skill" },
        Liberation => Roll { stat: s::DMG_BONUS, tag: T_LIBERATION, values: &PCT, weights: &WEIGHTS, label: "Liberation" },
    }
}
/// substats.ts's rollAt: the roll `p` of the way up its own spread.
fn roll_at(sub: Substat, p: f64) -> f64 {
    let r = roll(sub);
    let target = p * r.weights.iter().fold(0.0, |a, b| a + b);
    let mut seen = 0.0;
    for (i, &v) in r.values.iter().enumerate() {
        seen += r.weights[i];
        if seen >= target {
            return v;
        }
    }
    *r.values.last().unwrap()
}
pub fn er_roll_value() -> f64 {
    roll_at(Substat::Er, 0.5)
}
pub const ER_TOLERANCE: f64 = 0.0;
const SHAPE: [u32; 5] = [5, 5, 2, 2, 2];
const HIGH_SHAPE: [u32; 6] = [5, 5, 5, 3, 2, 1];

impl Eng {
    fn roll_breakdown(&self, prefix: &str, counts: &[(Substat, u32)], p: f64) -> Breakdown {
        let mut sorted = counts.to_vec();
        sorted.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        let mut out = vec![];
        for (sub, n) in sorted {
            let r = roll(sub);
            let v = roll_at(sub, p);
            for _ in 0..n {
                out.push((format!("{} - {}", prefix, stat_label(r.stat, r.tag)), vec![(r.stat, v, r.tag)]));
            }
        }
        out
    }

    fn spread_piece(&mut self, named: &[Substat], shape: &[u32], own_er: bool) -> GearId {
        let mut counts: Vec<(Substat, u32)> = vec![];
        for (i, &sub) in named.iter().take(shape.len()).enumerate() {
            match counts.iter_mut().find(|c| c.0 == sub) {
                Some(c) => c.1 = shape[i],
                None => counts.push((sub, shape[i])),
            }
        }
        for &sub in &ALL_SUBSTATS {
            if !counts.iter().any(|c| c.0 == sub) {
                counts.push((sub, 1));
            }
        }
        let mut labels: Vec<&str> = vec![];
        for &sub in named.iter().take(shape.len()) {
            if sub > Substat::CritDmg && (sub != Substat::Er || own_er) {
                let l = roll(sub).label;
                if !labels.contains(&l) {
                    labels.push(l);
                }
            }
        }
        let lines = counts.iter().map(|&(sub, n)| (roll(sub).stat, roll_at(sub, 0.5) * n as f64, roll(sub).tag)).collect();
        let g = self.gear(GDef { name: format!("ChemX32 - {}", labels.join(" ")), is_buff: true, constant: lines, ..Default::default() });
        let b = self.roll_breakdown("ChemX32", &counts, 0.5);
        self.breakdowns.push((g, b));
        g
    }

    /// substats.ts's substats(): a ChemX32 spread at every ER tier.
    pub fn substats(&mut self, named: [Substat; 6]) -> ErSpread {
        let own = named.iter().position(|&x| x == Substat::Er);
        let held = own.map_or(1, |o| SHAPE[o]);
        let rest: Vec<Substat> = named.iter().copied().filter(|&x| x != Substat::Er).collect();
        let mut tiers = vec![ErTier { rolls: held, piece: self.spread_piece(&named, &SHAPE, own.is_some()) }];
        for (rolls, place, shape) in [(2u32, 2usize, SHAPE), (3, 2, [5, 4, 3, 2, 2])] {
            if rolls > held {
                let mut v = rest[..place].to_vec();
                v.push(Substat::Er);
                v.extend(rest[place..].iter());
                v.truncate(5);
                tiers.push(ErTier { rolls, piece: self.spread_piece(&v, &shape, own.is_some()) });
            }
        }
        ErSpread { named: named.to_vec(), tiers, no_er: None }
    }

    fn high_piece(&mut self, named: &[Substat], last: Substat, own_er: bool) -> GearId {
        let mut counts: Vec<(Substat, u32)> = vec![];
        for (i, &sub) in named.iter().enumerate() {
            let n = *HIGH_SHAPE.get(i).unwrap_or(&1);
            match counts.iter_mut().find(|c| c.0 == sub) {
                Some(c) => c.1 = n,
                None => counts.push((sub, n)),
            }
        }
        let mut labels: Vec<&str> = vec![];
        for &sub in named {
            if sub > Substat::CritDmg && sub != last && (sub != Substat::Er || own_er) {
                let l = roll(sub).label;
                if !labels.contains(&l) {
                    labels.push(l);
                }
            }
        }
        let lines = counts.iter().map(|&(sub, n)| (roll(sub).stat, roll_at(sub, 0.8) * n as f64, roll(sub).tag)).collect();
        let g = self.gear(GDef { name: format!("High Invest - {}", labels.join(" ")), is_buff: true, constant: lines, ..Default::default() });
        let b = self.roll_breakdown("High Invest", &counts, 0.8);
        self.breakdowns.push((g, b));
        g
    }

    /// substats.ts's highSubs(): the high-investment spread.
    pub fn high_subs(&mut self, named: [Substat; 6]) -> ErSpread {
        let own = named.iter().position(|&x| x == Substat::Er);
        if let Some(o) = own {
            let piece = self.high_piece(&named, named[5], true);
            return ErSpread { named: named.to_vec(), tiers: vec![ErTier { rolls: HIGH_SHAPE[o], piece }], no_er: None };
        }
        let five = named[..5].to_vec();
        let mut first = five.clone();
        first.push(Substat::Er);
        let mut tiers = vec![ErTier { rolls: 1, piece: self.high_piece(&first, named[5], false) }];
        for (rolls, place) in [(2u32, 4usize), (3, 3)] {
            let mut v = five[..place].to_vec();
            v.push(Substat::Er);
            v.extend(five[place..].iter());
            tiers.push(ErTier { rolls, piece: self.high_piece(&v, named[5], false) });
        }
        let no_er = Some(self.high_piece(&named, named[5], false));
        ErSpread { named: named.to_vec(), tiers, no_er }
    }
}

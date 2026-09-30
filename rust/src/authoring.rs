//! The kit-authoring shapes: gear.ts's Resonator, Weapon/refinements, Mainslot, the sonata sets,
//! Matrix, handoff() and coordinatedBuff(), as builders on the engine.
use crate::eng::*;
use crate::loadout::{Kind, ResMeta, Tier, WeaponMeta};
use std::rc::Rc;

/// A resonator as a kit declares it (gear.ts's ResonatorDef): its identity, the three pieces every
/// build runs, its gauges and forms, its base `stats`, and its hooks (`g`).
pub struct ResDef {
    pub name: &'static str,
    pub element: u32,
    pub weapon: Weapon,
    pub color: &'static str,
    pub tier: Tier,
    pub talent: GearId,
    pub inherent1: GearId,
    pub inherent2: GearId,
    pub matrix: GearId,
    pub max_energy: f64,
    pub max_forte: [f64; 5],
    pub intro: ActId,
    pub tune_break: ActId,
    pub dodge: Option<DodgeFn>,
    pub jump: Option<DodgeFn>,
    pub hold: Option<DodgeFn>,
    pub stats: Vec<(usize, f64, u32)>,
    pub enemy: bool,
    pub g: GDef,
}

impl Default for ResDef {
    fn default() -> Self {
        ResDef {
            name: "",
            element: 0,
            weapon: Weapon::Sword,
            color: "",
            tier: Tier::Limited,
            talent: NO_GEAR,
            inherent1: NO_GEAR,
            inherent2: NO_GEAR,
            matrix: NO_GEAR,
            max_energy: 0.0,
            max_forte: [0.0; 5],
            intro: NO_ACT,
            tune_break: NO_ACT,
            dodge: None,
            jump: None,
            hold: None,
            stats: vec![],
            enemy: false,
            g: GDef::default(),
        }
    }
}

/// coordinatedBuff's options.
pub struct Coord {
    pub hits: usize,
    pub every: f64,
    pub apply_stats: Option<Hook>,
    pub on_tick: Option<TickFn>,
}
impl Default for Coord {
    fn default() -> Self {
        Coord { hits: 1, every: 1.0, apply_stats: None, on_tick: None }
    }
}

impl Eng {
    /// A named ActionField: what a field's Buff and its hits both point at.
    pub fn new_field(&mut self, name: &str) -> u32 {
        self.fields.push(name.to_string());
        self.fields.len() as u32
    }

    pub fn set_kind(&mut self, g: GearId, kind: Kind) -> GearId {
        self.gears[g as usize].kind = kind;
        g
    }
    pub fn talent(&mut self, d: GDef) -> GearId {
        let g = self.gear(d);
        self.set_kind(g, Kind::Talent)
    }
    pub fn inherent(&mut self, d: GDef) -> GearId {
        let g = self.gear(d);
        self.set_kind(g, Kind::Inherent)
    }
    pub fn sequence(&mut self, d: GDef) -> GearId {
        let g = self.gear(d);
        self.set_kind(g, Kind::Sequence)
    }
    pub fn mode(&mut self, d: GDef) -> GearId {
        let g = self.gear(d);
        self.set_kind(g, Kind::Mode)
    }
    pub fn buff(&mut self, d: GDef) -> GearId {
        self.gear(GDef { is_buff: true, ..d })
    }
    pub fn define_buff(&mut self, id: GearId, d: GDef) {
        self.define(id, GDef { is_buff: true, ..d });
    }
    pub fn debuff(&mut self, d: GDef) -> GearId {
        let g = self.gear(GDef { is_buff: true, ..d });
        self.set_kind(g, Kind::Debuff)
    }
    pub fn define_debuff(&mut self, id: GearId, d: GDef) {
        self.define(id, GDef { is_buff: true, ..d });
        self.set_kind(id, Kind::Debuff);
    }
    pub fn sonata2pc(&mut self, d: GDef) -> GearId {
        let g = self.gear(d);
        self.set_kind(g, Kind::Sonata2pc)
    }
    pub fn sonata(&mut self, d: GDef, two: GearId) -> GearId {
        let g = self.gear(d);
        self.gears[g as usize].sonata2pc = Some(two);
        self.set_kind(g, Kind::Sonata)
    }
    pub fn sonata3pc(&mut self, d: GDef) -> GearId {
        let g = self.gear(d);
        self.set_kind(g, Kind::Sonata3pc)
    }
    pub fn sonata1pc(&mut self, d: GDef) -> GearId {
        let g = self.gear(d);
        self.set_kind(g, Kind::Sonata1pc)
    }
    /// gear.ts's matrix(): a resonator's Matrix, its total DMG rebased onto Matrix Mode's +20%.
    pub fn matrix(&mut self, resonator: &str, total_dmg: f64, d: GDef) -> GearId {
        let constant = if total_dmg != 0.0 { vec![(s::TOTAL_DMG, total_dmg / 1.2, 0)] } else { vec![] };
        let g = self.gear(GDef { name: format!("{}: Matrix Buff", resonator), constant, ..d });
        self.set_kind(g, Kind::Matrix)
    }

    /// gear.ts's Resonator, onto a reserved id (other kits and its own buffs name it first).
    pub fn resonator(&mut self, id: GearId, d: ResDef) {
        let mut lines = d.stats.clone();
        if !d.enemy {
            lines.extend([(s::CRIT_RATE, 5.0, 0), (s::CRIT_DMG, 150.0, 0), (s::ER, 100.0, 0), (s::OFFTUNE_BUILDUP, 100.0, 0)]);
        }
        lines.extend(d.g.constant.iter().cloned());
        if !d.enemy && (d.talent == NO_GEAR || d.inherent1 == NO_GEAR || d.inherent2 == NO_GEAR) {
            panic!("{}: a resonator names its Talents and both Inherent Skills", d.name);
        }
        self.define(id, GDef { name: d.name.into(), constant: lines, ..d.g });
        let g = &mut self.gears[id as usize];
        g.kind = Kind::Resonator;
        g.res = Some(ResInfo {
            max_energy: d.max_energy,
            max_forte: d.max_forte,
            intro: some_act(d.intro),
            weapon: d.weapon,
            dodge: d.dodge,
            jump: d.jump,
            hold: d.hold,
            tune_break: some_act(d.tune_break),
            enemy: d.enemy,
        });
        g.meta = Some(ResMeta { element: d.element, color: d.color.into(), tier: d.tier, talent: some_gear(d.talent), inherent1: some_gear(d.inherent1), inherent2: some_gear(d.inherent2), matrix: some_gear(d.matrix) });
    }

    /// A weapon at one rank.
    pub fn weapon(&mut self, d: GDef, weapon_type: Weapon, tier: Tier) -> GearId {
        let g = self.gear(d);
        self.gears[g as usize].weapon = Some(WeaponMeta { weapon_type, tier, refinement: 1 });
        self.set_kind(g, Kind::Weapon)
    }
    /// gear.ts's refinements(): all five ranks, R1 first; `build` gets the rank index and " R{n}".
    pub fn refinements(&mut self, build: impl Fn(&mut Eng, usize, &str) -> GearId) -> Vec<GearId> {
        (0..5)
            .map(|r| {
                let g = build(self, r, &format!(" R{}", r + 1));
                self.gears[g as usize].weapon.as_mut().expect("refinements() builds weapons").refinement = r as u32 + 1;
                g
            })
            .collect()
    }

    /// gear.ts's Mainslot: an echo's gear and its cast in the four forms the ECHO markers place.
    pub fn mainslot(&mut self, d: GDef, action: ActId) -> GearId {
        let g = self.gear(d);
        let forms = if self.acts[action as usize].anim == 0.0 {
            let v = self.variant(action, |_| {});
            MainslotForms { action, onfield: v, outro: v, cancel: v, insta_out: v }
        } else {
            let outro = self.swap_cancel(action);
            let cancel = self.hitless(action, Tag::InstaDodge);
            let insta_out = self.insta_swap(action);
            MainslotForms { action, onfield: action, outro, cancel, insta_out }
        };
        self.gears[g as usize].mainslot = Some(forms);
        self.set_kind(g, Kind::Mainslot)
    }

    /// gear.ts's handoff(): a 15s Outro-to-Intro window, closed at the next visit's first press.
    pub fn handoff(&mut self, name: &str, apply_stats: Hook, seconds: f64) -> GearId {
        let id = self.reserve(name);
        let window: Hook = Rc::new(move |e: &mut Eng| {
            let mine = e.active == e.slot;
            if e.frozen_stacks() < 2.0 {
                if mine && e.casting(Cast::Outro) {
                    e.apply_current(id, 1.0);
                }
                return;
            }
            if !mine && !e.casting(Cast::Intro) {
                e.revoke_current(id);
            }
        });
        // the second stack is bookkeeping, not a doubled payout: no "x2" in the report
        let shown = name.to_string();
        let display: Rc<dyn Fn(&mut Eng) -> String> = Rc::new(move |_: &mut Eng| shown.clone());
        self.define_buff(id, GDef { name: name.into(), max_stacks: 2.0, apply_stats: Some(apply_stats), duration: 60.0 * seconds, display: Some(display), update_global: Some(window), ..Default::default() });
        id
    }

    /// gear.ts's coordinatedBuff(): a window whose stacks are the summons it has left, one fired
    /// every `every` seconds on `owner`'s slot (the holder's own where `owner` is NO_GEAR).
    pub fn coordinated(&mut self, name: &str, seconds: f64, owner: GearId, tick: Result<ActId, Hook>, c: Coord) -> GearId {
        let owner = some_gear(owner);
        let id = self.reserve(name);
        let hits = c.hits;
        let on_tick = c.on_tick.clone();
        let field = match &tick {
            Ok(a) => self.acts[*a as usize].def.field,
            Err(_) => 0,
        };
        let fire: TickFn = Rc::new(move |e: &mut Eng, n: f64| {
            for _ in 0..hits {
                match &tick {
                    Err(f) => e.apply_on(owner, f.clone()),
                    Ok(a) => match owner {
                        None => e.queue(*a),
                        Some(r) => e.queue_on(r, *a),
                    },
                }
            }
            if let Some(f) = &on_tick {
                f(e, n);
            }
            if e.stacks_of(id) > 0.0 {
                e.remove_stack_current(id, 1.0);
            } else if e.stacks_of_team(id) > 0.0 {
                e.remove_stack_global(id, 1.0);
            } else {
                e.remove_stack_enemy(id, 1.0);
            }
        });
        self.define_buff(
            id,
            GDef {
                name: name.into(),
                max_stacks: (seconds / c.every + 1e-9).floor(),
                apply_stats: c.apply_stats,
                field,
                tick_owner: owner,
                tick_every: TickEvery::Every(js_round(60.0 * c.every)),
                tick_fn: Some(fire),
                ..Default::default()
            },
        );
        id
    }
}

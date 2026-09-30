//! The engine core: gears, actions, pools, the fight state and the kit-facing API. A port of
//! src/engine/{stats,runtime,gear,state,context}.ts, untraced and without main-stat variants.
use std::collections::HashSet;
use std::rc::Rc;

pub type GearId = u32;
pub type ActId = u32;
/// An unset GearId / ActId in a definition (`talent`, `intro`, a loadout's `mode`).
pub const NO_GEAR: GearId = u32::MAX;
pub const NO_ACT: ActId = u32::MAX;
/// A bullet's element/type/subtype left to the action's own.
pub const INHERIT: u32 = u32::MAX;
/// A definition's closures, built without spelling out the Option: `update_buffs: h(move |e| ...)`.
pub fn h(f: impl Fn(&mut Eng) + 'static) -> Option<Hook> {
    Some(Rc::new(f))
}
pub fn ticks(f: impl Fn(&mut Eng, f64) + 'static) -> Option<TickFn> {
    Some(Rc::new(f))
}
pub fn dur(f: impl Fn(&Eng, f64) -> f64 + 'static) -> Option<DurFn> {
    Some(Rc::new(f))
}
pub fn shown(f: impl Fn(&mut Eng) -> String + 'static) -> Option<Rc<dyn Fn(&mut Eng) -> String>> {
    Some(Rc::new(f))
}
/// A buff's `when`: its stats pay only while this holds.
pub fn cond(f: impl Fn(&mut Eng) -> bool + 'static) -> Option<Pred> {
    Some(Rc::new(f))
}
pub fn resolver(f: impl Fn(&mut Eng) -> Option<ActId> + 'static) -> Option<Resolve> {
    Some(Rc::new(f))
}
pub fn dodges(f: impl Fn(&mut Eng, ActId) -> Option<ActId> + 'static) -> Option<DodgeFn> {
    Some(Rc::new(f))
}
pub fn some_gear(g: GearId) -> Option<GearId> {
    (g != NO_GEAR).then_some(g)
}
pub fn some_act(a: ActId) -> Option<ActId> {
    (a != NO_ACT).then_some(a)
}
pub type RowId = u32;
pub type Hook = Rc<dyn Fn(&mut Eng)>;
pub type Pred = Rc<dyn Fn(&mut Eng) -> bool>;
pub type Resolve = Rc<dyn Fn(&mut Eng) -> Option<ActId>>;
pub type TickFn = Rc<dyn Fn(&mut Eng, f64)>;
pub type DurFn = Rc<dyn Fn(&Eng, f64) -> f64>;
pub type DodgeFn = Rc<dyn Fn(&mut Eng, ActId) -> Option<ActId>>;

/// A tick clock's cadence: fixed, or read each span (0 holds the clock still).
#[derive(Clone)]
pub enum TickEvery {
    Every(f64),
    Fn(Rc<dyn Fn(&Eng) -> f64>),
}
impl Default for TickEvery {
    fn default() -> Self {
        TickEvery::Every(0.0)
    }
}

/* ------------------------------------------------------------------------------ stats */

pub mod s {
    pub const BASE_ATK: usize = 0;
    pub const BASE_HP: usize = 1;
    pub const BASE_DEF: usize = 2;
    pub const FLAT_ATK: usize = 3;
    pub const FLAT_HP: usize = 4;
    pub const FLAT_DEF: usize = 5;
    pub const BONUS_ATK: usize = 6;
    pub const BONUS_HP: usize = 7;
    pub const BONUS_DEF: usize = 8;
    pub const CRIT_RATE: usize = 9;
    pub const CRIT_DMG: usize = 10;
    pub const ER: usize = 11;
    pub const TBB: usize = 12;
    pub const OFFTUNE_BUILDUP: usize = 13;
    pub const ENERGY_REGEN_MULT: usize = 14;
    pub const ADD_MV: usize = 15;
    pub const MUL_MV: usize = 16;
    pub const DMG_BONUS: usize = 17;
    pub const AMP: usize = 18;
    pub const TOTAL_DMG: usize = 19;
    pub const DAMAGE_TAKEN: usize = 20;
    pub const RES_IGNORE: usize = 21;
    pub const DEF_IGNORE_NEW: usize = 22;
    pub const DEF_IGNORE_OLD: usize = 23;
    pub const HEALING_BONUS: usize = 24;
    pub const HEALING_RECEIVED: usize = 25;
    pub const ADD_ENERGY: usize = 26;
    pub const ADD_CONCERTO: usize = 27;
    pub const ADD_OFFTUNE: usize = 28;
    pub const DIRECT_OFFTUNE: usize = 29;
    pub const ADD_FORTE1: usize = 30;
    pub const ADD_FORTE2: usize = 31;
    pub const RES_REDUCE: usize = 35;
    pub const DEF_REDUCE: usize = 36;
    pub const SUB_AMP: usize = 37;
    pub const BASIC_DB: usize = 38;
    pub const SUB_CR: usize = 39;
    pub const SUB_CD: usize = 40;
    pub const SUB_TOTAL: usize = 41;
    pub const SUB_TAKEN: usize = 42;
}
pub const NSTAT: usize = 43;
pub type Stats = [f64; NSTAT];

pub const AERO: u32 = 1 << 6;
pub const ELECTRO: u32 = 2 << 6;
pub const FUSION: u32 = 3 << 6;
pub const GLACIO: u32 = 4 << 6;
pub const SPECTRO: u32 = 5 << 6;
pub const HAVOC: u32 = 6 << 6;
pub const PHYSICAL: u32 = 7 << 6;
pub const T_BASIC: u32 = 1 << 12;
pub const T_HEAVY: u32 = 2 << 12;
pub const T_SKILL: u32 = 3 << 12;
pub const T_LIBERATION: u32 = 4 << 12;
pub const T_INTRO: u32 = 5 << 12;
pub const T_OUTRO: u32 = 6 << 12;
pub const T_ECHO: u32 = 7 << 12;
pub const T_STATUS: u32 = 8 << 12;
pub const T_BREAK: u32 = 9 << 12;
pub const T_RUPTURE: u32 = 10 << 12;
pub const T_HACK: u32 = 12 << 12;
pub const T_UTILITY: u32 = 13 << 12;
pub const S_COORDINATED: u32 = 1 << 18;
pub const S_SPECTRO_FRAZZLE: u32 = 2 << 18;
pub const S_AERO_EROSION: u32 = 3 << 18;
pub const S_FUSION_BURST: u32 = 4 << 18;
pub const S_GLACIO_CHAFE: u32 = 5 << 18;
pub const S_ELECTRO_FLARE: u32 = 6 << 18;
const ATTR_BITS: u32 = 0x3f << 6;
const TYPE_BITS: u32 = 0x3f << 12;
pub const SUBTYPE_BITS: u32 = 0x3f << 18;

fn tag_band(tag: u32) -> u32 {
    if tag & SUBTYPE_BITS != 0 {
        SUBTYPE_BITS
    } else if tag & TYPE_BITS != 0 {
        TYPE_BITS
    } else {
        ATTR_BITS
    }
}

pub const INSTA_DELAY: f64 = 6.0;
pub const EASY_DELAY: f64 = 6.0;
pub const CANCEL_DELAY: f64 = 12.0;
pub const SWAP_DELAY: f64 = 15.0;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Tag {
    #[default]
    Default,
    Field,
    Cancel,
    EasyCancel,
    DodgeCancel,
    JumpCancel,
    SwapCancel,
    InstaCancel,
    InstaDodge,
    InstaJump,
    InstaSwap,
    HitCancel,
    DodgeOnHit,
    JumpOnHit,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Cast {
    DodgeCounter,
    Basic,
    Heavy,
    Skill,
    Liberation,
    Intro,
    Outro,
    Echo,
    TuneBreak,
    /// no cast: coordinated hits, ticks, fields, responses
    #[default]
    None,
}

/// Which branch of the kit a cast comes from (stats.ts's Node).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Node {
    Normal,
    Skill,
    Forte,
    Liberation,
    Intro,
    #[default]
    None,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Scaling {
    Atk,
    Hp,
    Def,
    Dot,
    Tune,
    Fixed,
    /// no damage of its own (an action with no motion value)
    #[default]
    None,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Half {
    Whole,
    Cast,
    Hit,
    End,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Weapon {
    Sword,
    Broadblade,
    Pistols,
    Gauntlets,
    Rectifier,
}

/// JS ToInt32: a double wrapped into a signed 32-bit integer.
pub fn to_int32(x: f64) -> i32 {
    if !x.is_finite() {
        return 0;
    }
    let t = x.trunc();
    let m = t.rem_euclid(4294967296.0);
    (m as u32) as i32
}

/// JS `Math.round`: the nearest integer, ties toward +infinity.
pub fn js_round(x: f64) -> f64 {
    let f = x.floor();
    if x - f >= 0.5 {
        f + 1.0
    } else {
        f
    }
}

/* ------------------------------------------------------------------------------ gear */

pub const PH_DEBUFFS: usize = 0;
pub const PH_BUFFS: usize = 1;
pub const PH_APPLY: usize = 2;
pub const PH_CONVERT: usize = 3;
pub const PH_LATE: usize = 4;
pub const PH_AFTER: usize = 5;
pub const PH_CONST: usize = 6;
pub const PH_HIT_GRANTS: usize = 7;
pub const PH_ON_HIT: usize = 8;

#[derive(Clone)]
pub struct ResInfo {
    pub max_energy: f64,
    pub max_forte: [f64; 5],
    pub intro: Option<ActId>,
    pub weapon: Weapon,
    pub dodge: Option<DodgeFn>,
    pub jump: Option<DodgeFn>,
    pub hold: Option<DodgeFn>,
    pub tune_break: Option<ActId>,
    pub enemy: bool,
}

#[derive(Clone, Copy)]
pub struct MainslotForms {
    pub action: ActId,
    pub onfield: ActId,
    pub outro: ActId,
    pub cancel: ActId,
    pub insta_out: ActId,
}

pub struct Gear {
    pub name: String,
    pub max_stacks: f64,
    pub duration: f64,
    pub duration_fn: Option<DurFn>,
    pub tick_every: TickEvery,
    pub tick_fn: Option<TickFn>,
    pub tick_skips: bool,
    pub tick_owner: Option<GearId>,
    pub display: Option<Rc<dyn Fn(&mut Eng) -> String>>,
    pub combat_start: Option<Hook>,
    pub update_global: Option<Hook>,
    pub hit_global: Option<Hook>,
    pub hooks: [Option<Hook>; 9],
    pub constant: Option<Rc<Vec<(usize, f64, u32)>>>,
    pub fire_grants: Option<Hook>,
    pub hook_mask: u32,
    pub res: Option<ResInfo>,
    pub mainslot: Option<MainslotForms>,
    pub act: Option<ActId>,
    pub kind: crate::loadout::Kind,
    pub hidden: bool,
    pub meta: Option<crate::loadout::ResMeta>,
    pub weapon: Option<crate::loadout::WeaponMeta>,
    pub sonata2pc: Option<GearId>,
    /// The field this Gear's presence stands for (a report grouping only).
    pub field: Option<u32>,
}

impl Gear {
    fn new(name: &str) -> Gear {
        Gear {
            name: name.to_string(),
            max_stacks: 1.0,
            duration: 0.0,
            duration_fn: None,
            tick_every: TickEvery::Every(0.0),
            tick_fn: None,
            tick_skips: false,
            tick_owner: None,
            display: None,
            combat_start: None,
            update_global: None,
            hit_global: None,
            hooks: Default::default(),
            constant: None,
            fire_grants: None,
            hook_mask: 0,
            res: None,
            mainslot: None,
            act: None,
            kind: crate::loadout::Kind::Gear,
            hidden: false,
            meta: None,
            weapon: None,
            sonata2pc: None,
            field: None,
        }
    }
    pub fn wire(&mut self) {
        let mut mask = 0;
        for p in 0..9 {
            let has = if p == PH_CONST { self.constant.is_some() } else { self.hooks[p].is_some() };
            if has {
                mask |= 1 << p;
            }
        }
        self.hook_mask = mask;
    }
}

/// Who a grant lands on.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum To {
    Me,
    Team,
    Enemy,
    Next,
}

#[derive(Clone)]
pub struct Grant {
    pub on: Pred,
    pub inflicts: bool,
    pub buff: Option<GearId>,
    pub stacks: f64,
    /// `stacks` read at the grant (`stacks: () => n`), in place of the flat count.
    pub stacks_fn: Option<Rc<dyn Fn(&mut Eng) -> f64>>,
    pub to: To,
    pub on_hit: bool,
}

/// A trigger: the predicate and whether it reads inflictions.
#[derive(Clone)]
pub struct Trigger {
    pub on: Pred,
    pub inflicts: bool,
}

pub fn grant(t: Trigger, buff: GearId, to: To) -> Grant {
    Grant { on: t.on, inflicts: t.inflicts, buff: Some(buff), stacks: 1.0, stacks_fn: None, to, on_hit: false }
}
pub fn on_cast(casts: &[Cast]) -> Trigger {
    let casts = casts.to_vec();
    Trigger { on: Rc::new(move |e: &mut Eng| casts.iter().any(|&c| e.casting(c))), inflicts: false }
}
pub fn on_action(acts: &[ActId]) -> Trigger {
    let acts = acts.to_vec();
    Trigger { on: Rc::new(move |e: &mut Eng| acts.iter().any(|&a| e.running_action(a))), inflicts: false }
}
pub fn on_inflict(gears: &[GearId]) -> Trigger {
    let gears = gears.to_vec();
    Trigger { on: Rc::new(move |e: &mut Eng| gears.iter().any(|&g| e.applied_by_me(g) > 0.0)), inflicts: true }
}
pub fn on_applied(gears: &[GearId]) -> Trigger {
    let gears = gears.to_vec();
    Trigger { on: Rc::new(move |e: &mut Eng| gears.iter().any(|&g| e.applied(g) > 0.0)), inflicts: true }
}
/// context.ts's onType(): the hit deals one of `types` (a type or a subtype).
pub fn on_type(types: &[u32]) -> Trigger {
    let types = types.to_vec();
    Trigger { on: Rc::new(move |e: &mut Eng| types.iter().any(|&t| e.is_type(t))), inflicts: false }
}
/// A plain predicate as a trigger (a Grant's `on: () => ...`), reading no inflictions.
pub fn when(f: impl Fn(&mut Eng) -> bool + 'static) -> Trigger {
    Trigger { on: Rc::new(f), inflicts: false }
}
/// context.ts's inflicting(): a predicate whose grant fires wherever the inflicting was.
pub fn inflicting(f: impl Fn(&mut Eng) -> bool + 'static) -> Trigger {
    Trigger { on: Rc::new(f), inflicts: true }
}
pub fn either(parts: Vec<Trigger>) -> Trigger {
    let inflicts = parts.iter().any(|p| p.inflicts);
    Trigger { on: Rc::new(move |e: &mut Eng| parts.iter().any(|p| (p.on)(e))), inflicts }
}
pub fn both(parts: Vec<Trigger>) -> Trigger {
    let inflicts = parts.iter().any(|p| p.inflicts);
    Trigger { on: Rc::new(move |e: &mut Eng| parts.iter().all(|p| (p.on)(e))), inflicts }
}
/// A grant fired after each hit (`onHit: true`).
pub fn hit_grant(t: Trigger, buff: GearId, to: To) -> Grant {
    Grant { on_hit: true, ..grant(t, buff, to) }
}
pub fn on_hit(g: Grant) -> Grant {
    Grant { on_hit: true, ..g }
}
/// A grant whose stack count reads the action (`stacks: () => applied(SHIELD)`).
pub fn grant_count(t: Trigger, buff: GearId, to: To, count: impl Fn(&mut Eng) -> f64 + 'static) -> Grant {
    Grant { stacks_fn: Some(Rc::new(count)), ..grant(t, buff, to) }
}

/// Everything a Gear or Buff is declared with — gear.ts's GearDef and BuffDef in one.
#[derive(Clone, Default)]
pub struct GDef {
    pub name: String,
    pub hidden: bool,
    /// A report field id from `new_field` (they start at 1); 0 is none.
    pub field: u32,
    pub combat_start: Option<Hook>,
    pub update_debuffs: Option<Hook>,
    pub update_global: Option<Hook>,
    pub hit_global: Option<Hook>,
    pub update_buffs: Option<Hook>,
    pub apply_stats: Option<Hook>,
    pub convert_stats: Option<Hook>,
    pub after_action: Option<Hook>,
    pub after_hit: Option<Hook>,
    pub late_convert: Option<Hook>,
    /// Constant stat lines, in their own order (a non-Buff gear's `stats` and `constantStats`).
    pub constant: Vec<(usize, f64, u32)>,
    /// The rest of a constantStats that reads its wearer, run after the lines.
    pub constant_fn: Option<Hook>,
    /// A Buff's `stats`, paid while held.
    pub stats: Vec<(usize, f64, u32)>,
    pub grants: Vec<Grant>,
    pub is_buff: bool,
    /// 0 reads as 1.
    pub max_stacks: f64,
    pub per_stack: bool,
    pub when: Option<Pred>,
    pub lost_on_swap: bool,
    pub duration: f64,
    pub duration_fn: Option<DurFn>,
    pub tick_every: TickEvery,
    pub tick_fn: Option<TickFn>,
    pub tick_skips: bool,
    pub tick_owner: Option<GearId>,
    pub display: Option<Rc<dyn Fn(&mut Eng) -> String>>,
}

/* ------------------------------------------------------------------------------ actions */

#[derive(Clone)]
pub struct BulletDef {
    pub hit: f64,
    /// Where the bullet is guaranteed; -1 (the default) is at its hit.
    pub commit: f64,
    pub mv: f64,
    pub energy: f64,
    pub concerto: f64,
    pub offtune: f64,
    pub forte: [f64; 5],
    /// INHERIT (the default): the action's own; 0: null.
    pub element: u32,
    pub typ: u32,
    pub subtype: u32,
    pub update_debuffs: Option<Hook>,
    pub hit_global: Option<Hook>,
}

impl Default for BulletDef {
    fn default() -> Self {
        BulletDef {
            hit: 0.0,
            commit: -1.0,
            mv: 0.0,
            energy: 0.0,
            concerto: 0.0,
            offtune: 0.0,
            forte: [0.0; 5],
            element: INHERIT,
            typ: INHERIT,
            subtype: INHERIT,
            update_debuffs: None,
            hit_global: None,
        }
    }
}

#[derive(Clone)]
pub struct Bullet {
    pub hit: f64,
    pub commit: f64,
    pub mv: f64,
    pub energy: f64,
    pub concerto: f64,
    pub offtune: f64,
    pub forte: [f64; 5],
    pub element: u32,
    pub typ: u32,
    pub subtype: u32,
    pub update_debuffs: Option<Hook>,
    pub hit_global: Option<Hook>,
}

#[derive(Clone, Copy)]
pub enum CdSpec {
    None,
    Frames(f64),
    Shared(u32),
}
impl Default for CdSpec {
    fn default() -> Self {
        CdSpec::None
    }
}

#[derive(Clone, Default)]
pub struct ADef {
    pub name: String,
    pub element: u32,
    pub typ: u32,
    pub subtype: u32,
    pub cast: Cast,
    pub subcast: Cast,
    pub node: Node,
    pub scaling: Scaling,
    pub mv: f64,
    pub energy: f64,
    pub concerto: f64,
    pub offtune: f64,
    pub cast_energy: f64,
    pub cast_concerto: f64,
    pub cast_forte: [f64; 5],
    pub slot_enemy: bool,
    pub reset_energy: bool,
    pub forte: [f64; 5],
    pub reset_forte: [bool; 5],
    pub resolve: Option<Resolve>,
    pub skip_next: Option<Pred>,
    pub anim: f64,
    pub prio: f64,
    pub qte: f64,
    /// Empty: a plain `mv` is one bullet at `anim`, else the cast deals nothing.
    pub bullets: Vec<BulletDef>,
    pub timestop: f64,
    pub motion_stop: f64,
    pub cooldown: CdSpec,
    pub cooldown_frames: f64,
    /// Default on an Outro cast reads as Field.
    pub tag: Tag,
    pub field: u32,
    pub update_global: Option<Hook>,
    pub update_buffs: Option<Hook>,
    pub update_debuffs: Option<Hook>,
    pub hit_global: Option<Hook>,
    pub apply_stats: Option<Hook>,
    pub convert_stats: Option<Hook>,
    pub late_convert: Option<Hook>,
    pub after_action: Option<Hook>,
    pub after_hit: Option<Hook>,
}

#[derive(Clone, Copy)]
pub struct Cost {
    pub action: f64,
    pub timestop: f64,
    pub global: f64,
    pub total: f64,
}

pub struct Act {
    pub gear: GearId,
    pub name: Rc<str>,
    pub cast: Option<Cast>,
    pub subcast: Option<Cast>,
    pub scaling: Option<Scaling>,
    pub mv: f64,
    pub energy: f64,
    pub concerto: f64,
    pub offtune: f64,
    pub half: Half,
    pub hits_at_cast: bool,
    pub mv_share: f64,
    pub bullets: Vec<Bullet>,
    pub cast_forte: [f64; 5],
    pub slot_enemy: bool,
    pub reset_energy: bool,
    pub forte: [f64; 5],
    pub reset_forte: [bool; 5],
    pub resolve: Option<Resolve>,
    pub skip_next: Option<Pred>,
    pub anim: f64,
    pub prio: f64,
    pub qte: f64,
    pub on_hit_at: Option<f64>,
    pub timestop: f64,
    pub motion_stop: f64,
    pub cooldown: Option<u32>,
    pub cooldown_frames: f64,
    pub tag: Tag,
    pub cancel_of: Option<ActId>,
    pub form_of: Option<ActId>,
    pub def: ADef,
    pub tag_word: u32,
    pub dash_after: Option<ActId>,
    // the action's own hooks, by phase (its gear's), and the two outside the phases
    pub costs: [Option<Cost>; 15],
    pub cast_copy: Option<ActId>,
    pub hit_copies: Vec<Option<ActId>>,
    pub end_copy: Option<ActId>,
    pub hitless: [Option<ActId>; 15],
}

impl Act {
    pub fn last_bullet(&self) -> Option<&Bullet> {
        self.bullets.last()
    }
    pub fn cut_frame(&self) -> f64 {
        let mut at = self.prio;
        for b in &self.bullets {
            at = at.max(b.commit);
        }
        at
    }
    pub fn swaps_after_hit(&self) -> bool {
        self.tag == Tag::SwapCancel
    }
    pub fn swap_out(&self) -> bool {
        self.cast == Some(Cast::Outro) || self.swaps_after_hit() || self.tag == Tag::InstaSwap
    }
    pub fn casts_instantly(&self) -> bool {
        self.cast == Some(Cast::Outro) || self.tag == Tag::InstaSwap || self.tag == Tag::Field
    }
    pub fn hit_delay(&self, k: usize) -> f64 {
        let at = self.bullets.get(k).map_or(0.0, |b| b.hit);
        (at - self.timestop.min(at)).max(0.0)
    }
    pub fn last_hit_delay(&self) -> f64 {
        let mut most = 0.0f64;
        for k in 0..self.bullets.len() {
            most = most.max(self.hit_delay(k));
        }
        most
    }
    pub fn instant_end(&self) -> f64 {
        (self.anim - self.timestop).max(0.0)
    }
    pub fn hits_away(&self, cut: Option<Tag>) -> bool {
        self.cast == Some(Cast::Outro) || cut.unwrap_or(self.tag) == Tag::InstaSwap
    }
}

fn tag_index(t: Option<Tag>) -> usize {
    t.map_or(0, |t| t as usize + 1)
}

pub struct Cooldown {
    pub frames: f64,
    pub charges: f64,
    pub waits: Vec<(f64, ActId)>,
}

#[derive(Clone, Copy)]
pub struct CdState {
    pub charges: f64,
    pub next: f64,
}

/* ------------------------------------------------------------------------------ pools */

#[derive(Clone)]
pub struct Cap {
    pub list: Rc<Vec<GearId>>,
    pub counts: Rc<Vec<f64>>,
    pub hooks: Rc<Vec<Rc<Vec<u32>>>>,
}

#[derive(Clone)]
pub struct Pool {
    pub list: Rc<Vec<GearId>>,
    pub counts: Rc<Vec<f64>>,
    pub hooks: Rc<Vec<Rc<Vec<u32>>>>,
    pub global_hooks: Rc<Vec<GearId>>,
    at: Vec<i32>,
    dead: u32,
    pub expires: Vec<f64>,
    pub next_expiry: f64,
    pub progress: Vec<f64>,
    pub ticks: Vec<f64>,
    list_ver: u64,
    tick_ver: u64,
    pub tick_idx: Vec<usize>,
}

/// What a Pool needs of a Gear to file it.
#[derive(Clone, Copy)]
pub struct Meta {
    pub mask: u32,
    pub global: bool,
    pub constant: bool,
}

impl Pool {
    fn new() -> Pool {
        Pool {
            list: Rc::new(vec![]),
            counts: Rc::new(vec![]),
            hooks: Rc::new((0..9).map(|_| Rc::new(vec![])).collect()),
            global_hooks: Rc::new(vec![]),
            at: vec![],
            dead: 0,
            expires: vec![],
            next_expiry: f64::INFINITY,
            progress: vec![],
            ticks: vec![],
            list_ver: 1,
            tick_ver: 0,
            tick_idx: vec![],
        }
    }
    pub fn cap(&self) -> Cap {
        Cap { list: self.list.clone(), counts: self.counts.clone(), hooks: self.hooks.clone() }
    }
    #[inline]
    pub fn pos(&self, g: GearId) -> i32 {
        let k = g as usize;
        if k < self.at.len() {
            self.at[k] - 1
        } else {
            -1
        }
    }
    fn reach(&mut self, g: GearId) {
        let k = g as usize;
        if k >= self.at.len() {
            self.at.resize((k + 1).max(self.at.len() * 2), 0);
        }
    }
    pub fn has(&self, g: GearId) -> bool {
        self.pos(g) >= 0
    }
    pub fn get(&self, g: GearId) -> Option<f64> {
        let i = self.pos(g);
        if i < 0 {
            None
        } else {
            Some(self.counts[i as usize])
        }
    }
    fn stamp(&mut self, i: usize, dur: f64, frame: f64) {
        if dur == 0.0 {
            return;
        }
        let at = frame + dur;
        self.expires[i] = at;
        if at < self.next_expiry {
            self.next_expiry = at;
        }
    }
    pub fn touch(&mut self, g: GearId, dur: f64, frame: f64) {
        let i = self.pos(g);
        if i >= 0 {
            self.stamp(i as usize, dur, frame);
        }
    }
    pub fn extend(&mut self, g: GearId, frames: f64) {
        let i = self.pos(g);
        if i < 0 || self.expires[i as usize] == 0.0 {
            return;
        }
        self.expires[i as usize] += frames;
    }
    pub fn expired(&mut self, now: f64) -> Option<Vec<GearId>> {
        if self.next_expiry > now {
            return None;
        }
        let mut out: Option<Vec<GearId>> = None;
        let mut next = f64::INFINITY;
        for i in 0..self.list.len() {
            let at = self.expires[i];
            if at == 0.0 || self.pos(self.list[i]) != i as i32 {
                continue;
            }
            if at <= now {
                out.get_or_insert_with(Vec::new).push(self.list[i]);
            } else if at < next {
                next = at;
            }
        }
        self.next_expiry = next;
        out
    }
    /// Frames `g` has left at `frame`, 0 where it is untimed or not held.
    pub fn left(&self, g: GearId, frame: f64) -> f64 {
        let i = self.pos(g);
        if i < 0 {
            return 0.0;
        }
        let at = self.expires[i as usize];
        if at == 0.0 {
            0.0
        } else {
            at - frame
        }
    }
    pub fn ticks_of(&self, g: GearId) -> f64 {
        let i = self.pos(g);
        if i < 0 {
            0.0
        } else {
            self.ticks[i as usize]
        }
    }
    pub fn has_ticks(&mut self, gears: &[Gear]) -> bool {
        if self.tick_ver != self.list_ver {
            self.tick_ver = self.list_ver;
            self.tick_idx.clear();
            for i in 0..self.list.len() {
                if gears[self.list[i] as usize].tick_fn.is_some() {
                    self.tick_idx.push(i);
                }
            }
        }
        !self.tick_idx.is_empty()
    }
    /// `dur`: what a stamp of this write lasts (already read off the count it lands on).
    pub fn set(&mut self, g: GearId, n: f64, refresh: bool, dur: f64, frame: f64, meta: Meta) -> bool {
        let i = self.pos(g);
        if i >= 0 {
            Rc::make_mut(&mut self.counts)[i as usize] = n;
            if refresh {
                self.stamp(i as usize, dur, frame);
            }
            return false;
        }
        let k = self.list.len();
        self.reach(g);
        self.at[g as usize] = k as i32 + 1;
        Rc::make_mut(&mut self.list).push(g);
        Rc::make_mut(&mut self.counts).push(n);
        self.list_ver += 1;
        self.expires.push(0.0);
        self.progress.push(0.0);
        self.ticks.push(0.0);
        self.stamp(k, dur, frame);
        if meta.mask != 0 {
            let hooks = Rc::make_mut(&mut self.hooks);
            let mut mask = meta.mask;
            let mut p = 0;
            while mask != 0 {
                if mask & 1 != 0 {
                    Rc::make_mut(&mut hooks[p]).push(k as u32);
                }
                mask >>= 1;
                p += 1;
            }
        }
        if meta.global {
            Rc::make_mut(&mut self.global_hooks).push(g);
        }
        meta.constant
    }
    /// Returns whether a constant-stat gear left.
    pub fn delete(&mut self, g: GearId, meta: Meta, gears: &[Gear]) -> bool {
        let i = self.pos(g);
        if i < 0 {
            return false;
        }
        self.at[g as usize] = 0;
        if meta.mask != 0 {
            let hooks = Rc::make_mut(&mut self.hooks);
            let mut mask = meta.mask;
            let mut p = 0;
            while mask != 0 {
                if mask & 1 != 0 {
                    Rc::make_mut(&mut hooks[p]).retain(|&k| k != i as u32);
                }
                mask >>= 1;
                p += 1;
            }
        }
        if meta.global {
            Rc::make_mut(&mut self.global_hooks).retain(|&x| x != g);
        }
        self.dead += 1;
        if self.dead > 32 {
            self.compact(gears);
        }
        meta.constant
    }
    fn compact(&mut self, gears: &[Gear]) {
        let mut list = vec![];
        let mut counts = vec![];
        let mut expires = vec![];
        let mut progress = vec![];
        let mut ticks = vec![];
        let mut hooks: Vec<Vec<u32>> = (0..9).map(|_| vec![]).collect();
        for i in 0..self.list.len() {
            let g = self.list[i];
            if self.pos(g) != i as i32 {
                continue;
            }
            let k = list.len();
            self.at[g as usize] = k as i32 + 1;
            list.push(g);
            counts.push(self.counts[i]);
            expires.push(self.expires[i]);
            progress.push(self.progress[i]);
            ticks.push(self.ticks[i]);
            let mut mask = gears[g as usize].hook_mask;
            let mut p = 0;
            while mask != 0 {
                if mask & 1 != 0 {
                    hooks[p].push(k as u32);
                }
                mask >>= 1;
                p += 1;
            }
        }
        self.list = Rc::new(list);
        self.counts = Rc::new(counts);
        self.hooks = Rc::new(hooks.into_iter().map(Rc::new).collect());
        self.dead = 0;
        self.expires = expires;
        self.progress = progress;
        self.ticks = ticks;
        self.list_ver += 1;
    }
}

/// A member's live hook set: JS Set iteration order, entries added mid-walk visited, dropped ones not.
#[derive(Clone)]
pub struct LiveSet {
    pub items: Vec<(GearId, bool)>,
    pos: Vec<i32>,
    dead: usize,
}
impl LiveSet {
    fn new() -> LiveSet {
        LiveSet { items: vec![], pos: vec![], dead: 0 }
    }
    pub fn add(&mut self, g: GearId) {
        let k = g as usize;
        if k >= self.pos.len() {
            self.pos.resize(k + 1, -1);
        }
        if self.pos[k] >= 0 {
            return;
        }
        self.pos[k] = self.items.len() as i32;
        self.items.push((g, true));
    }
    pub fn delete(&mut self, g: GearId) {
        let k = g as usize;
        if k < self.pos.len() && self.pos[k] >= 0 {
            self.items[self.pos[k] as usize].1 = false;
            self.pos[k] = -1;
            self.dead += 1;
        }
    }
    /// Squeeze dropped entries out — only between walks.
    pub fn compact(&mut self) {
        if self.dead < 32 {
            return;
        }
        self.items.retain(|x| x.1);
        for (i, &(g, _)) in self.items.iter().enumerate() {
            self.pos[g as usize] = i as i32;
        }
        self.dead = 0;
    }
}

pub struct Member {
    pub name: String,
    pub index: usize,
    pub resonator: Option<GearId>,
    pub mainslot: Option<GearId>,
    pub forte: [f64; 5],
    pub energy: f64,
    pub concerto: f64,
    pub cooldowns: Vec<Option<CdState>>,
    pub real_energy: f64,
    pub stacks: Pool,
    pub global_hooks: LiveSet,
    pub effective: Stats,
    pub const_base: Vec<(u32, Box<Stats>)>,
    pub const_base_version: i64,
    pub every_other: i32,
    pub equipped: Vec<GearId>,
    pub entries: Vec<StatEntry>,
    pub er_gain: f64,
    pub er_gain_er: f64,
    pub er_before: f64,
    pub er_a: f64,
    pub er_g: f64,
    pub lib_casts: u32,
    pub const_er: f64,
    pub er_worst: f64,
    pub er_guard: bool,
    pub variant_of: Option<GearId>,
    pub variants: Vec<GearId>,
    pub variant_sub_of: Option<GearId>,
    pub variant_subs: Vec<Option<GearId>>,
    pub variant_rolls: Vec<u32>,
    pub variant_at: Vec<(u32, Rc<VariantAt>)>,
    pub variant_unsafe: Vec<bool>,
    pub variant_eff: Vec<Stats>,
    pub variant_dry: Vec<bool>,
}

/// A member's variants' constant bases for one tag word, and where each differs from the real one.
pub struct VariantAt {
    pub bases: Vec<Stats>,
    pub diffs: Vec<Vec<usize>>,
}

/// What a dry run can move of one member (state.ts's MemberSnapshot).
#[derive(Clone)]
pub struct MemberSnap {
    pub pool: Pool,
    pub global_hooks: LiveSet,
    pub forte: [f64; 5],
    pub concerto: f64,
}

impl Member {
    fn new(name: &str, index: usize) -> Member {
        Member {
            name: name.to_string(),
            index,
            resonator: None,
            mainslot: None,
            forte: [0.0; 5],
            energy: 0.0,
            concerto: 0.0,
            cooldowns: vec![],
            real_energy: 0.0,
            stacks: Pool::new(),
            global_hooks: LiveSet::new(),
            effective: [0.0; NSTAT],
            const_base: vec![],
            const_base_version: -1,
            every_other: 0,
            equipped: vec![],
            entries: vec![],
            er_gain: 0.0,
            er_gain_er: 0.0,
            er_before: 0.0,
            er_a: 0.0,
            er_g: 0.0,
            lib_casts: 0,
            const_er: 0.0,
            er_worst: 0.0,
            er_guard: false,
            variant_of: None,
            variants: vec![],
            variant_sub_of: None,
            variant_subs: vec![],
            variant_rolls: vec![],
            variant_at: vec![],
            variant_unsafe: vec![],
            variant_eff: vec![],
            variant_dry: vec![],
        }
    }
}

/// runtime.ts's GrantRecord: per-action counts by Gear, current only under this action's stamp.
pub struct GrantRecord {
    stamp: Vec<i32>,
    now: Vec<f64>,
    by_stamp: Vec<i32>,
    by: Vec<f64>,
    list: Vec<GearId>,
    list_stamp: i32,
}
pub const MEMBERS: usize = 4;
impl GrantRecord {
    fn new() -> GrantRecord {
        GrantRecord { stamp: vec![], now: vec![], by_stamp: vec![], by: vec![], list: vec![], list_stamp: i32::MIN }
    }
    pub fn add(&mut self, g: GearId, n: f64, who: i32, stamp: i32) {
        let id = g as usize;
        if id >= self.stamp.len() {
            let size = (id + 1).max(self.stamp.len() * 2).max(64);
            self.stamp.resize(size, i32::MIN);
            self.now.resize(size, 0.0);
            self.by_stamp.resize(size * MEMBERS, i32::MIN);
            self.by.resize(size * MEMBERS, 0.0);
        }
        if self.list_stamp != stamp {
            self.list_stamp = stamp;
            self.list.clear();
        }
        if self.stamp[id] != stamp {
            self.stamp[id] = stamp;
            self.now[id] = n;
            self.list.push(g);
        } else {
            self.now[id] += n;
        }
        if who < 0 {
            return;
        }
        let k = id * MEMBERS + who as usize;
        if self.by_stamp[k] != stamp {
            self.by_stamp[k] = stamp;
            self.by[k] = n;
        } else {
            self.by[k] += n;
        }
    }
    /// The Gear recorded under `stamp`, in order.
    pub fn gears(&self, stamp: i32) -> &[GearId] {
        if self.list_stamp == stamp {
            &self.list
        } else {
            &[]
        }
    }
    /// Everything recorded under `stamp`, summed.
    pub fn total(&self, stamp: i32) -> f64 {
        let mut t = 0.0;
        for id in 0..self.stamp.len() {
            if self.stamp[id] == stamp {
                t += self.now[id];
            }
        }
        t
    }
    pub fn get(&self, g: GearId, stamp: i32) -> f64 {
        let id = g as usize;
        if id < self.stamp.len() && self.stamp[id] == stamp {
            self.now[id]
        } else {
            0.0
        }
    }
    pub fn get_by(&self, g: GearId, who: usize, stamp: i32) -> f64 {
        let k = g as usize * MEMBERS + who;
        if k < self.by_stamp.len() && self.by_stamp[k] == stamp {
            self.by[k]
        } else {
            0.0
        }
    }
}

/// What queued a follow-up (state.ts's HeldBuff): the Gear's name and whose kit it came from.
pub type By = Option<Rc<(String, String)>>;

/// One stat contribution, traced (state.ts's StatEntry).
#[derive(Clone)]
pub struct StatEntry {
    pub key: u32,
    pub value: f64,
    pub source: String,
    pub owner: String,
    pub gear: Option<GearId>,
}

#[derive(Clone)]
pub enum Apply {
    OutroQueue(usize),
    Hook(Hook),
}

#[derive(Clone)]
pub struct Timed {
    pub due: f64,
    pub action: Option<ActId>,
    pub slot: i32,
    pub into: Option<RowId>,
    pub by: By,
    pub away: bool,
    pub apply: Option<Apply>,
    pub losses: Option<Vec<GearId>>,
    pub frames: Option<f64>,
    pub closes: bool,
    pub triggered: Option<bool>,
    pub uid: u32,
}

#[derive(Clone)]
pub struct Pending {
    pub action: ActId,
    pub slot: i32,
    pub by: By,
    pub event: bool,
}

#[derive(Clone)]
pub struct Row {
    pub act: ActId,
    pub member: usize,
    pub triggered: bool,
    pub mv: f64,
    pub avg: f64,
    pub starts: f64,
    pub ends: f64,
    pub hit_at: Option<f64>,
    pub group: Option<Rc<crate::rotation::Group>>,
    pub group_end: bool,
    pub spill: Option<Rc<crate::rotation::Group>>,
    pub queued: bool,
    pub variant_avg: Option<Vec<f64>>,
    pub swap_frames: f64,
    pub source: By,
    pub trace: Option<Box<crate::trace::RowTrace>>,
}

/// Engine-level ids a kit or the engine itself reaches for by name.
#[derive(Default, Clone)]
pub struct Common {
    pub heals: GearId,
    pub heal_moment: ActId,
    pub echo_marker: ActId,
    pub dodge: ActId,
    pub jump: ActId,
    pub intro_marker: ActId,
}

pub struct Eng {
    pub gears: Vec<Gear>,
    pub acts: Vec<Act>,
    pub cds: Vec<Cooldown>,
    pub members: Vec<Member>,
    pub nslots: usize,
    pub global: Pool,
    pub active: usize,
    pub on_field: i32,
    pub presser: i32,
    pub plays_to: f64,
    pub play_stop: f64,
    pub outro_dir: i32,
    pub frame: f64,
    pub timestop_bank: f64,
    pub motion_stop_bank: f64,
    pub enemy_max_increase: Vec<f64>,
    pub enemy_max_sources: HashSet<(GearId, String)>,
    pub outro_queue: Vec<GearId>,
    pub timed: Vec<Timed>,
    pub intro_queue: Vec<Pending>,
    pub offtune: f64,
    pub source_of: Vec<i32>,
    // ambient pointers (runtime.ts's ctx)
    pub slot: usize,
    pub buff: Option<GearId>,
    pub act: ActId,
    pub act_frames: f64,
    pub triggered: bool,
    pub tick_at: Option<f64>,
    pub stacks: f64,
    pub tag_word: u32,
    pub wrote: u32,
    pub const_version: i64,
    pub swap_losses: Vec<GearId>,
    pub dropped_cast: Option<Cast>,
    pub press_frames: f64,
    pub off_field_shift: f64,
    pub press_start: f64,
    pub action_stamp: i32,
    pub inside_group: bool,
    pub in_cast: bool,
    pub cast_gain: [f64; 7],
    pub applied_rec: GrantRecord,
    pub consumed_rec: GrantRecord,
    pub pending: Vec<Pending>,
    pub phase_mask: u32,
    pub cap: [Cap; 3],
    pub rows: Vec<Row>,
    pub share_base: [f64; 10],
    pub next_uid: u32,
    pub common: Common,
    pub trace: Option<Vec<String>>,
    pub empty_cap: Cap,
    pub due_buf: Vec<(GearId, f64, f64, usize)>,
    pub mk: crate::rotation::Markers,
    pub breakdowns: Vec<(GearId, crate::loadout::Breakdown)>,
    pub fields: Vec<String>,
    pub override_type: u32,
    pub override_subtype: u32,
    pub dry_run: bool,
    pub mut_hash: i32,
    pub recording: bool,
    pub read_phase: i32,
    pub read_stamp: i32,
    pub read_stamps: [i32; NSTAT],
    pub read_phases: [i32; NSTAT],
    pub replay: Vec<(usize, f64)>,
    /// A Liberation fired on a bar its build could never fill: the member and the ER it wanted.
    pub er_short: Option<(usize, f64)>,
    /// Capturing the report's own trace (context.ts's setTracing).
    pub tracing: bool,
    pub cast_adds: Vec<(String, String, [f64; 7])>,
    /// Which equipped piece each granted buff traces back to, and on whose turn it landed.
    pub granted_by: std::collections::HashMap<GearId, GearId>,
    pub granted_on: std::collections::HashMap<GearId, usize>,
    /// The row the next resonator's swap frames go on.
    pub swap_row: Option<RowId>,
    by_marker: Rc<(String, String)>,
}

impl Eng {
    pub fn new() -> Eng {
        let empty = Pool::new().cap();
        let mut e = Eng {
            gears: vec![],
            acts: vec![],
            cds: vec![],
            members: vec![],
            nslots: 0,
            global: Pool::new(),
            active: 0,
            on_field: 0,
            presser: -1,
            plays_to: 0.0,
            play_stop: 0.0,
            outro_dir: 1,
            frame: 0.0,
            timestop_bank: 0.0,
            motion_stop_bank: 0.0,
            enemy_max_increase: vec![],
            enemy_max_sources: HashSet::new(),
            outro_queue: vec![],
            timed: vec![],
            intro_queue: vec![],
            offtune: 0.0,
            source_of: vec![],
            slot: 0,
            buff: None,
            act: 0,
            act_frames: 0.0,
            triggered: false,
            tick_at: None,
            stacks: -1.0,
            tag_word: 0,
            wrote: 0,
            const_version: 0,
            swap_losses: vec![],
            dropped_cast: None,
            press_frames: 0.0,
            off_field_shift: 0.0,
            press_start: 0.0,
            action_stamp: 0,
            inside_group: false,
            in_cast: false,
            cast_gain: [0.0; 7],
            applied_rec: GrantRecord::new(),
            consumed_rec: GrantRecord::new(),
            pending: vec![],
            phase_mask: 0x1ff,
            cap: [empty.clone(), empty.clone(), empty],
            rows: vec![],
            share_base: [0.0; 10],
            next_uid: 0,
            common: Common::default(),
            trace: None,
            empty_cap: Pool::new().cap(),
            due_buf: vec![],
            mk: Default::default(),
            breakdowns: vec![],
            fields: vec![],
            override_type: 0,
            override_subtype: 0,
            dry_run: false,
            mut_hash: 0,
            recording: false,
            read_phase: 0,
            read_stamp: 0,
            read_stamps: [0; NSTAT],
            read_phases: [0; NSTAT],
            replay: vec![],
            er_short: None,
            tracing: false,
            cast_adds: vec![],
            granted_by: std::collections::HashMap::new(),
            granted_on: std::collections::HashMap::new(),
            swap_row: None,
            by_marker: Rc::new((String::new(), String::new())),
        };
        let heals = e.gear(GDef { name: "Healed".into(), is_buff: true, max_stacks: 9999.0, ..Default::default() });
        let heal_moment = e.action(ADef { name: "Heal".into(), ..Default::default() });
        let dodge = e.action(ADef { name: "Dodge".into(), anim: 20.0, ..Default::default() });
        let jump = e.action(ADef { name: "Jump".into(), anim: 15.0, ..Default::default() });
        e.common = Common { heals, heal_moment, echo_marker: u32::MAX, dodge, jump, intro_marker: u32::MAX };
        e.build_markers();
        e
    }

    /* -------------------------------------------------------------- building gear */

    pub fn reserve(&mut self, name: &str) -> GearId {
        self.gears.push(Gear::new(name));
        self.source_of.push(-1);
        self.enemy_max_increase.push(0.0);
        (self.gears.len() - 1) as GearId
    }

    pub fn gear(&mut self, d: GDef) -> GearId {
        let id = self.reserve(&d.name);
        self.define(id, d);
        id
    }

    /// gear.ts's Gear then Buff constructors, compiling the data half into the hook slots.
    pub fn define(&mut self, id: GearId, d: GDef) {
        let mut g = Gear::new(&d.name);
        g.combat_start = d.combat_start.clone();
        g.hooks[PH_DEBUFFS] = d.update_debuffs.clone();
        g.hit_global = d.hit_global.clone();
        g.update_global = d.update_global.clone().or_else(|| if d.hit_global.is_some() { Some(Rc::new(|_: &mut Eng| {}) as Hook) } else { None });
        g.hooks[PH_BUFFS] = d.update_buffs.clone();
        g.hooks[PH_APPLY] = d.apply_stats.clone();
        g.hooks[PH_CONVERT] = d.convert_stats.clone();
        g.hooks[PH_AFTER] = d.after_action.clone();
        g.hooks[PH_ON_HIT] = d.after_hit.clone();
        g.hooks[PH_LATE] = d.late_convert.clone();
        // a non-Buff's `stats` are constant, ahead of its own constantStats; a Buff's pay while held
        let mut lines = if d.is_buff { vec![] } else { d.stats.clone() };
        if !d.constant.is_empty() {
            let c = &d.constant;
            lines.extend(c.iter().cloned());
        }
        if (!d.is_buff && !d.stats.is_empty()) || !d.constant.is_empty() || d.constant_fn.is_some() {
            g.constant = Some(Rc::new(lines));
        }
        g.hooks[PH_CONST] = d.constant_fn.clone();
        if !d.grants.is_empty() {
            let on_hit: Rc<Vec<Grant>> = Rc::new(d.grants.iter().filter(|x| x.on_hit).cloned().collect());
            let on_inflict: Rc<Vec<Grant>> = Rc::new(d.grants.iter().filter(|x| !x.on_hit && x.inflicts).cloned().collect());
            let on_cast: Rc<Vec<Grant>> = Rc::new(d.grants.iter().filter(|x| !x.on_hit && !x.inflicts).cloned().collect());
            let (c1, i1) = (on_cast.clone(), on_inflict.clone());
            g.fire_grants = Some(Rc::new(move |e: &mut Eng| {
                e.fire(id, &c1);
                e.fire(id, &i1);
            }));
            if !on_cast.is_empty() || !on_inflict.is_empty() {
                let own = d.update_buffs.clone();
                let (c2, i2) = (on_cast.clone(), on_inflict.clone());
                g.hooks[PH_BUFFS] = Some(Rc::new(move |e: &mut Eng| {
                    if let Some(o) = &own {
                        o(e);
                    }
                    e.fire(id, &c2);
                    if e.acts[e.act as usize].half == Half::Cast {
                        e.fire(id, &i2);
                    }
                }));
            }
            if !on_inflict.is_empty() {
                let i3 = on_inflict.clone();
                g.hooks[PH_HIT_GRANTS] = Some(Rc::new(move |e: &mut Eng| e.fire(id, &i3)));
            }
            if !on_hit.is_empty() {
                let own = d.after_hit.clone();
                let h = on_hit.clone();
                g.hooks[PH_ON_HIT] = Some(Rc::new(move |e: &mut Eng| {
                    if let Some(o) = &own {
                        o(e);
                    }
                    e.fire(id, &h);
                }));
            }
        }
        if d.is_buff {
            g.max_stacks = if d.max_stacks > 0.0 { d.max_stacks } else { 1.0 };
            g.duration = d.duration;
            g.duration_fn = d.duration_fn.clone();
            if d.tick_fn.is_some() {
                g.tick_every = d.tick_every.clone();
                g.tick_fn = d.tick_fn.clone();
                g.tick_skips = d.tick_skips;
                g.tick_owner = d.tick_owner;
            }
            if !d.stats.is_empty() {
                let lines = Rc::new(d.stats.clone());
                let when = d.when.clone();
                let per_stack = d.per_stack;
                let own = d.apply_stats.clone();
                g.hooks[PH_APPLY] = Some(Rc::new(move |e: &mut Eng| {
                    let pays = match &when {
                        Some(w) => w(e),
                        None => true,
                    };
                    if pays {
                        let n = if per_stack { e.frozen_stacks() } else { 1.0 };
                        for &(st, v, tag) in lines.iter() {
                            e.add_stat(st, if per_stack { v * n } else { v }, tag);
                        }
                    }
                    if let Some(o) = &own {
                        o(e);
                    }
                }));
            }
            if d.lost_on_swap {
                let own = g.hooks[PH_BUFFS].clone();
                g.hooks[PH_BUFFS] = Some(Rc::new(move |e: &mut Eng| {
                    let a = &e.acts[e.act as usize];
                    if a.swaps_after_hit() {
                        if !e.swap_losses.contains(&id) {
                            e.swap_losses.push(id);
                        }
                    } else if a.swap_out() {
                        e.revoke_current(id);
                    }
                    if let Some(o) = &own {
                        o(e);
                    }
                }));
            }
        }
        g.hidden = d.hidden;
        g.field = (d.field != 0).then_some(d.field);
        g.display = d.display.clone();
        g.kind = if d.is_buff { crate::loadout::Kind::Buff } else { crate::loadout::Kind::Gear };
        g.wire();
        // what setup already stamped on the reserved Gear stays
        let old = &mut self.gears[id as usize];
        g.res = old.res.take();
        g.meta = old.meta.take();
        g.weapon = old.weapon.take();
        g.mainslot = old.mainslot.take();
        g.sonata2pc = old.sonata2pc.take();
        g.act = old.act.take();
        if old.kind != crate::loadout::Kind::Gear {
            g.kind = old.kind;
        }
        self.gears[id as usize] = g;
    }

    fn fire(&mut self, me: GearId, grants: &[Grant]) {
        for g in grants {
            if !(g.on)(self) {
                continue;
            }
            let n = match &g.stacks_fn {
                Some(f) => f(self),
                None => g.stacks,
            };
            if n <= 0.0 {
                continue;
            }
            let buff = g.buff.unwrap_or(me);
            match g.to {
                To::Team => {
                    self.apply_team(buff, n);
                }
                To::Enemy => {
                    self.apply_enemy(buff, n);
                }
                To::Next => self.queue_outro(buff),
                To::Me => {
                    self.apply_current(buff, n);
                }
            }
        }
    }

    pub fn new_cooldown(&mut self, frames: f64) -> u32 {
        self.cds.push(Cooldown { frames, charges: 1.0, waits: vec![] });
        (self.cds.len() - 1) as u32
    }

    /// rotation.ts's Action constructor.
    pub fn action(&mut self, mut d: ADef) -> ActId {
        let gid = self.reserve(&d.name);
        let mut gd = GDef { name: d.name.clone(), ..Default::default() };
        gd.update_global = d.update_global.clone();
        gd.update_buffs = d.update_buffs.clone();
        gd.update_debuffs = d.update_debuffs.clone();
        gd.hit_global = d.hit_global.clone();
        gd.apply_stats = d.apply_stats.clone();
        gd.convert_stats = d.convert_stats.clone();
        gd.late_convert = d.late_convert.clone();
        gd.after_action = d.after_action.clone();
        gd.after_hit = d.after_hit.clone();
        self.define(gid, gd);
        let sum = |d: &ADef, f: &dyn Fn(&BulletDef) -> f64| -> Option<f64> {
            (!d.bullets.is_empty()).then(|| d.bullets.iter().fold(0.0, |n, h| n + f(h)))
        };
        let mv = sum(&d, &|h| h.mv).unwrap_or(d.mv);
        let bullets_def: Vec<BulletDef> = if !d.bullets.is_empty() {
            d.bullets.clone()
        } else if mv != 0.0 {
            vec![BulletDef { hit: d.anim, mv, energy: d.energy, concerto: d.concerto, offtune: d.offtune, forte: d.forte, ..Default::default() }]
        } else {
            vec![]
        };
        let tagv = |own: u32, shared: u32| if own == INHERIT { shared } else { own };
        let bullets: Vec<Bullet> = bullets_def
            .iter()
            .map(|h| Bullet {
                hit: h.hit,
                commit: if h.commit < 0.0 { h.hit } else { h.commit },
                mv: h.mv,
                energy: h.energy,
                concerto: h.concerto,
                offtune: h.offtune,
                forte: h.forte,
                element: tagv(h.element, d.element),
                typ: tagv(h.typ, d.typ),
                subtype: tagv(h.subtype, d.subtype),
                update_debuffs: h.update_debuffs.clone(),
                hit_global: h.hit_global.clone(),
            })
            .collect();
        if mv != 0.0 && d.scaling == Scaling::None {
            panic!("{}: an action with a motion value must declare its scaling", d.name);
        }
        let energy = sum(&d, &|h| h.energy).unwrap_or(d.energy) + d.cast_energy;
        let concerto = sum(&d, &|h| h.concerto).unwrap_or(d.concerto) + d.cast_concerto;
        let offtune = sum(&d, &|h| h.offtune).unwrap_or(d.offtune);
        let mut forte = [0.0; 5];
        for i in 0..5 {
            forte[i] = sum(&d, &|h| h.forte[i]).unwrap_or(d.forte[i]) + d.cast_forte[i];
        }
        let tag = if d.tag == Tag::Default && d.cast == Cast::Outro { Tag::Field } else { d.tag };
        let cooldown = match d.cooldown {
            CdSpec::None => None,
            CdSpec::Frames(f) => {
                let c = self.new_cooldown(f);
                d.cooldown = CdSpec::Shared(c);
                Some(c)
            }
            CdSpec::Shared(c) => Some(c),
        };
        let tag_word = bullets.last().map_or(0, |h| h.element | h.typ | h.subtype);
        let id = self.acts.len() as ActId;
        self.acts.push(Act {
            gear: gid,
            name: Rc::from(d.name.as_str()),
            cast: (d.cast != Cast::None).then_some(d.cast),
            subcast: (d.subcast != Cast::None).then_some(d.subcast),
            scaling: (d.scaling != Scaling::None).then_some(d.scaling),
            mv,
            energy,
            concerto,
            offtune,
            half: Half::Whole,
            hits_at_cast: false,
            mv_share: 1.0,
            bullets,
            cast_forte: d.cast_forte,
            slot_enemy: d.slot_enemy,
            reset_energy: d.reset_energy,
            forte,
            reset_forte: d.reset_forte,
            resolve: d.resolve.clone(),
            skip_next: d.skip_next.clone(),
            anim: d.anim,
            prio: d.prio,
            qte: d.qte,
            on_hit_at: None,
            timestop: d.timestop,
            motion_stop: d.motion_stop,
            cooldown,
            cooldown_frames: d.cooldown_frames,
            tag,
            cancel_of: None,
            form_of: None,
            def: d,
            tag_word,
            dash_after: None,
            costs: [None; 15],
            cast_copy: None,
            hit_copies: vec![],
            end_copy: None,
            hitless: [None; 15],
        });
        self.gears[gid as usize].act = Some(id);
        self.gears[gid as usize].kind = crate::loadout::Kind::Action;
        let field = self.acts[id as usize].def.field;
        self.gears[gid as usize].field = (field != 0).then_some(field);
        id
    }

    pub fn variant(&mut self, a: ActId, f: impl FnOnce(&mut ADef)) -> ActId {
        let mut d = self.acts[a as usize].def.clone();
        f(&mut d);
        self.action(d)
    }

    pub fn cost(&mut self, a: ActId, cut: Option<Tag>) -> Cost {
        let k = tag_index(cut);
        if let Some(c) = self.acts[a as usize].costs[k] {
            return c;
        }
        let c = self.cancel_cost(a, cut);
        self.acts[a as usize].costs[k] = Some(c);
        c
    }

    fn cancel_cost(&self, a: ActId, cut: Option<Tag>) -> Cost {
        let act = &self.acts[a as usize];
        let full = act.anim;
        let tag = cut.unwrap_or(act.tag);
        let insta = matches!(tag, Tag::InstaCancel | Tag::InstaDodge | Tag::InstaJump | Tag::InstaSwap);
        let whole = if act.half == Half::Cast { act.form_of.map_or(act, |w| &self.acts[w as usize]) } else { act };
        let action = if tag == Tag::Default {
            full
        } else if tag == Tag::Field || insta {
            0.0
        } else {
            whole.on_hit_at.unwrap_or_else(|| whole.cut_frame()).min(full)
        };
        let timestop = act.timestop.min(action);
        let global = if tag == Tag::InstaSwap || tag == Tag::SwapCancel {
            0.0
        } else if insta {
            INSTA_DELAY
        } else if tag == Tag::EasyCancel {
            EASY_DELAY
        } else if matches!(tag, Tag::Cancel | Tag::DodgeCancel | Tag::JumpCancel | Tag::HitCancel | Tag::DodgeOnHit | Tag::JumpOnHit) {
            CANCEL_DELAY
        } else {
            0.0
        };
        Cost { action, timestop, global, total: action - timestop + global }
    }

    pub fn hitless(&mut self, a: ActId, kind: Tag) -> ActId {
        let k = tag_index(Some(kind));
        if let Some(x) = self.acts[a as usize].hitless[k] {
            return x;
        }
        let bullets = &self.acts[a as usize].bullets;
        let n = bullets.len();
        let kept: Vec<usize> = (0..n).filter(|&i| bullets[i].commit <= INSTA_DELAY).collect();
        let out = if kept.len() == n {
            self.variant(a, |d| d.tag = kind)
        } else if !kept.is_empty() {
            let defs = self.bullet_defs(a, &kept);
            self.variant(a, |d| {
                d.tag = kind;
                d.bullets = defs;
            })
        } else {
            self.variant(a, |d| {
                d.tag = kind;
                d.bullets = vec![];
                d.mv = 0.0;
                d.energy = 0.0;
                d.concerto = 0.0;
                d.offtune = 0.0;
                d.forte = [0.0; 5];
            })
        };
        self.acts[out as usize].cancel_of = Some(a);
        if kept.is_empty() && n > 0 {
            self.acts[out as usize].half = Half::Cast;
        }
        self.acts[a as usize].hitless[k] = Some(out);
        out
    }

    /// The original defs of bullets `kept` (as the def declared them).
    pub fn bullet_defs(&self, a: ActId, kept: &[usize]) -> Vec<BulletDef> {
        let act = &self.acts[a as usize];
        if !act.def.bullets.is_empty() {
            return kept.iter().map(|&i| act.def.bullets[i].clone()).collect();
        }
        kept.iter()
            .map(|&i| {
                let h = &act.bullets[i];
                BulletDef { hit: h.hit, mv: h.mv, energy: h.energy, concerto: h.concerto, offtune: h.offtune, forte: h.forte, ..Default::default() }
            })
            .collect()
    }

    pub fn splits_hit(&mut self, a: ActId, cut: Option<Tag>) -> bool {
        let act = &self.acts[a as usize];
        if act.half != Half::Whole {
            return false;
        }
        if act.bullets.is_empty() {
            let inst = act.casts_instantly();
            return !inst && self.cost(a, cut).total > 0.0;
        }
        if act.cast == Some(Cast::Outro) || act.tag == Tag::InstaSwap || act.bullets.len() > 1 {
            return true;
        }
        let hd = act.hit_delay(0);
        let inst = act.casts_instantly();
        hd > 0.0 || (!inst && self.cost(a, cut).total > 0.0)
    }

    pub fn cast_part(&mut self, a: ActId) -> ActId {
        if let Some(x) = self.acts[a as usize].cast_copy {
            return x;
        }
        let instant = self.acts[a as usize].casts_instantly();
        let has = !self.acts[a as usize].bullets.is_empty();
        let out = self.variant(a, |d| {
            if has {
                d.bullets = vec![];
                d.mv = 0.0;
                d.energy = 0.0;
                d.offtune = 0.0;
                d.concerto = 0.0;
                d.forte = [0.0; 5];
            }
            if instant {
                d.anim = 0.0;
                d.prio = 0.0;
                d.timestop = 0.0;
            }
        });
        let c = &mut self.acts[out as usize];
        c.form_of = Some(a);
        c.half = Half::Cast;
        c.hits_at_cast = !has;
        self.acts[a as usize].cast_copy = Some(out);
        out
    }

    pub fn hit_part(&mut self, a: ActId, k: usize) -> ActId {
        if self.acts[a as usize].hit_copies.len() <= k {
            self.acts[a as usize].hit_copies.resize(k + 1, None);
        }
        if let Some(x) = self.acts[a as usize].hit_copies[k] {
            return x;
        }
        let h = self.acts[a as usize].bullets[k].clone();
        let tag = if self.acts[a as usize].tag == Tag::Field { Tag::Field } else { Tag::Default };
        let out = self.variant(a, |d| {
            d.bullets = vec![BulletDef {
                hit: 0.0,
                commit: 0.0,
                mv: h.mv,
                energy: h.energy,
                concerto: h.concerto,
                offtune: h.offtune,
                forte: h.forte,
                element: h.element,
                typ: h.typ,
                subtype: h.subtype,
                update_debuffs: h.update_debuffs.clone(),
                hit_global: h.hit_global.clone(),
            }];
            d.anim = 0.0;
            d.prio = 0.0;
            d.timestop = 0.0;
            d.motion_stop = 0.0;
            d.cooldown = CdSpec::None;
            d.cast_energy = 0.0;
            d.cast_concerto = 0.0;
            d.cast_forte = [0.0; 5];
            d.reset_energy = false;
            d.reset_forte = [false; 5];
            d.tag = tag;
        });
        let whole_mv = self.acts[a as usize].mv;
        let n = self.acts[a as usize].bullets.len() as f64;
        let c = &mut self.acts[out as usize];
        c.form_of = Some(a);
        c.half = Half::Hit;
        c.mv_share = if whole_mv != 0.0 { h.mv / whole_mv } else { 1.0 / n };
        self.acts[a as usize].hit_copies[k] = Some(out);
        out
    }

    pub fn end_part(&mut self, a: ActId) -> ActId {
        if let Some(x) = self.acts[a as usize].end_copy {
            return x;
        }
        let tag = if self.acts[a as usize].tag == Tag::Field { Tag::Field } else { Tag::Default };
        let out = self.variant(a, |d| {
            d.bullets = vec![];
            d.mv = 0.0;
            d.energy = 0.0;
            d.offtune = 0.0;
            d.concerto = 0.0;
            d.forte = [0.0; 5];
            d.anim = 0.0;
            d.prio = 0.0;
            d.timestop = 0.0;
            d.motion_stop = 0.0;
            d.cooldown = CdSpec::None;
            d.cast_energy = 0.0;
            d.cast_concerto = 0.0;
            d.cast_forte = [0.0; 5];
            d.reset_energy = false;
            d.reset_forte = [false; 5];
            d.tag = tag;
        });
        let c = &mut self.acts[out as usize];
        c.form_of = Some(a);
        c.half = Half::End;
        self.acts[a as usize].end_copy = Some(out);
        out
    }

    pub fn cut_as(&mut self, a: ActId, kind: Option<Tag>) -> (ActId, Option<Tag>) {
        if kind.is_some() && self.acts[a as usize].tag != Tag::Default {
            panic!("{}: already {:?}, can't also be {:?}", self.acts[a as usize].name, self.acts[a as usize].tag, kind);
        }
        match kind {
            Some(k @ (Tag::InstaCancel | Tag::InstaDodge | Tag::InstaJump)) => (self.hitless(a, k), None),
            _ => (a, kind),
        }
    }

    pub fn swap_cancel(&mut self, a: ActId) -> ActId {
        let out = self.variant(a, |d| d.tag = Tag::SwapCancel);
        self.acts[out as usize].form_of = Some(a);
        out
    }

    pub fn insta_swap(&mut self, a: ActId) -> ActId {
        let out = self.variant(a, |d| d.tag = Tag::InstaSwap);
        self.acts[out as usize].form_of = Some(a);
        out
    }

    /// A marker's dash after `after` (rotation.ts's DashMarker).
    pub fn dash_marker(&mut self, is_jump: bool, after: ActId) -> ActId {
        let echo = self.common.echo_marker;
        let (dodge, jump) = (self.common.dodge, self.common.jump);
        let intro_marker = self.common.intro_marker;
        let resolve: Resolve = Rc::new(move |e: &mut Eng| {
            let m = e.slot;
            if after == echo {
                if let Some(ms) = e.members[m].mainslot {
                    let f = e.gears[ms as usize].mainslot.unwrap();
                    if f.onfield == f.outro || e.echo_pressed_whole(ms) {
                        return None;
                    }
                }
            }
            let res = e.members[m].resonator;
            let info = res.and_then(|r| e.gears[r as usize].res.clone());
            let pressed = if after == intro_marker { info.as_ref().and_then(|i| i.intro).unwrap_or(after) } else { after };
            let f = info.as_ref().and_then(|i| if is_jump { i.jump.clone() } else { i.dodge.clone() });
            let own = f.and_then(|f| f(e, pressed));
            Some(own.unwrap_or(if is_jump { jump } else { dodge }))
        });
        let id = self.action(ADef { name: if is_jump { "Jump Placeholder".into() } else { "Dodge Placeholder".into() }, resolve: Some(resolve), ..Default::default() });
        self.acts[id as usize].dash_after = Some(after);
        id
    }

    pub fn echo_pressed_whole(&mut self, ms: GearId) -> bool {
        let f = self.gears[ms as usize].mainslot.unwrap();
        let m = self.slot;
        let echo = self.common.echo_marker;
        let dodge_fn = self.members[m].resonator.and_then(|r| self.gears[r as usize].res.as_ref().and_then(|i| i.dodge.clone()));
        let dash = dodge_fn.and_then(|f| f(self, echo)).unwrap_or(self.common.dodge);
        self.acts[f.onfield as usize].anim <= self.acts[dash as usize].anim + INSTA_DELAY
    }

    /* -------------------------------------------------------------- setup */

    /// A fresh fight on the same gear: runTeamInner's `new State(...)`.
    pub fn reset_fight(&mut self, names: &[&str]) {
        self.set_team(names);
        self.global = Pool::new();
        self.active = 0;
        self.on_field = 0;
        self.presser = -1;
        self.plays_to = 0.0;
        self.play_stop = 0.0;
        self.outro_dir = 1;
        self.frame = 0.0;
        self.timestop_bank = 0.0;
        self.motion_stop_bank = 0.0;
        for x in self.enemy_max_increase.iter_mut() {
            *x = 0.0;
        }
        self.enemy_max_sources.clear();
        self.outro_queue.clear();
        self.timed.clear();
        self.intro_queue.clear();
        self.offtune = 0.0;
        for x in self.source_of.iter_mut() {
            *x = -1;
        }
        self.slot = 0;
        self.buff = None;
        self.tick_at = None;
        self.stacks = -1.0;
        self.swap_losses.clear();
        self.pending.clear();
        self.rows.clear();
        self.inside_group = false;
        self.phase_mask = 0x1ff;
        self.er_short = None;
        self.dry_run = false;
        self.recording = false;
        self.granted_by.clear();
        self.granted_on.clear();
        self.swap_row = None;
        self.cast_adds.clear();
    }


    pub fn set_team(&mut self, names: &[&str]) {
        self.members = names.iter().enumerate().map(|(i, n)| Member::new(n, i)).collect();
        self.nslots = names.len();
        self.members.push(Member::new("", names.len()));
    }

    pub fn equip(&mut self, g: GearId) {
        self.attribute(g);
        let m = self.slot;
        self.add_stack(m, g, 1.0);
        self.members[m].equipped.push(g);
        if let Some(f) = self.gears[g as usize].mainslot {
            self.members[m].mainslot = Some(g);
            if self.tracing {
                for a in [f.action, f.onfield, f.outro, f.cancel] {
                    let ag = self.acts[a as usize].gear;
                    self.granted_by.insert(ag, g);
                }
            }
        }
        let prev = self.buff;
        self.buff = Some(g);
        if let Some(r) = self.gears[g as usize].res.clone() {
            self.members[m].resonator = Some(g);
            if r.enemy {
                self.members[m].name = self.gears[g as usize].name.clone();
            }
            self.members[m].real_energy = r.max_energy;
        }
        if let Some(h) = self.gears[g as usize].combat_start.clone() {
            h(self);
        }
        self.buff = prev;
    }

    /* -------------------------------------------------------------- stacks */

    fn meta(&self, g: GearId) -> Meta {
        let gear = &self.gears[g as usize];
        Meta { mask: gear.hook_mask, global: gear.update_global.is_some(), constant: gear.constant.is_some() }
    }
    pub fn dur_of(&self, g: GearId, n: f64) -> f64 {
        let gear = &self.gears[g as usize];
        match &gear.duration_fn {
            Some(f) => f(self, n),
            None => gear.duration,
        }
    }
    pub fn record_consumed(&mut self, g: GearId, n: f64) {
        if n <= 0.0 || self.dry_run {
            return;
        }
        let who = self.members[self.slot].index as i32;
        self.consumed_rec.add(g, n, who, self.action_stamp);
    }
    fn record_applied(&mut self, g: GearId, n: f64) {
        if n <= 0.0 || self.dry_run {
            return;
        }
        let who = self.source_of[g as usize];
        self.applied_rec.add(g, n, who, self.action_stamp);
    }
    fn pool_set(&mut self, m: Option<usize>, g: GearId, n: f64, refresh: bool) {
        let dur = self.dur_of(g, n);
        let meta = self.meta(g);
        let frame = self.frame;
        let pool = match m {
            Some(m) => &mut self.members[m].stacks,
            None => &mut self.global,
        };
        if pool.set(g, n, refresh, dur, frame, meta) {
            self.const_version += 1;
        }
    }
    fn pool_touch(&mut self, m: Option<usize>, g: GearId) {
        let cur = match m {
            Some(m) => self.members[m].stacks.get(g),
            None => self.global.get(g),
        };
        let dur = self.dur_of(g, cur.unwrap_or(0.0));
        let frame = self.frame;
        let pool = match m {
            Some(m) => &mut self.members[m].stacks,
            None => &mut self.global,
        };
        pool.touch(g, dur, frame);
    }
    fn pool_delete(&mut self, m: Option<usize>, g: GearId) {
        let meta = self.meta(g);
        let gears = &self.gears;
        let pool = match m {
            Some(m) => &mut self.members[m].stacks,
            None => &mut self.global,
        };
        if pool.delete(g, meta, gears) {
            self.const_version += 1;
        }
    }

    pub fn stacks_on(&self, m: usize, g: GearId) -> f64 {
        self.members[m].stacks.get(g).unwrap_or(0.0)
    }
    /// runtime.ts's noteMutation: a running hash of every mutation attempted.
    pub fn note(&mut self, id: i64, n: f64) {
        let x = (self.mut_hash as i64 ^ id) as i32;
        let m = x.wrapping_mul(0x9e3779b1u32 as i32) as f64 + n;
        self.mut_hash = to_int32(m);
    }
    pub fn add_stack(&mut self, m: usize, g: GearId, n: f64) -> f64 {
        self.note(g as i64, n);
        self.record_applied(g, n);
        let cur = self.members[m].stacks.get(g);
        let next = self.gears[g as usize].max_stacks.min(cur.unwrap_or(0.0) + n);
        if cur == Some(next) {
            self.pool_touch(Some(m), g);
            return next;
        }
        self.pool_set(Some(m), g, next, true);
        if self.gears[g as usize].update_global.is_some() {
            self.members[m].global_hooks.add(g);
        }
        next
    }
    pub fn remove_stack(&mut self, m: usize, g: GearId, n: f64) -> f64 {
        self.note(g as i64, -n);
        let next = (self.stacks_on(m, g) - n).max(0.0);
        if next == 0.0 {
            if !self.members[m].stacks.has(g) {
                return 0.0;
            }
            self.pool_delete(Some(m), g);
            self.members[m].global_hooks.delete(g);
            return 0.0;
        }
        if self.members[m].stacks.get(g) == Some(next) {
            return next;
        }
        self.pool_set(Some(m), g, next, false);
        next
    }
    pub fn set_stacks(&mut self, m: usize, g: GearId, n: f64) -> f64 {
        self.note(g as i64, 1e6 + n);
        let d = n - self.stacks_on(m, g);
        self.record_applied(g, d);
        let next = self.gears[g as usize].max_stacks.min(n).max(0.0);
        if next == 0.0 {
            if !self.members[m].stacks.has(g) {
                return 0.0;
            }
            self.pool_delete(Some(m), g);
            self.members[m].global_hooks.delete(g);
            return 0.0;
        }
        if self.members[m].stacks.get(g) == Some(next) {
            self.pool_touch(Some(m), g);
            return next;
        }
        self.pool_set(Some(m), g, next, true);
        if self.gears[g as usize].update_global.is_some() {
            self.members[m].global_hooks.add(g);
        }
        next
    }
    pub fn revoke(&mut self, m: usize, g: GearId) {
        self.note(g as i64, -1e6);
        if !self.members[m].stacks.has(g) {
            return;
        }
        self.pool_delete(Some(m), g);
        self.members[m].global_hooks.delete(g);
    }

    pub fn add_stack_global(&mut self, g: GearId, n: f64) -> f64 {
        self.note(g as i64, n);
        let cur = self.global.get(g);
        let next = self.gears[g as usize].max_stacks.min(cur.unwrap_or(0.0) + n);
        self.record_applied(g, n);
        if cur == Some(next) {
            self.pool_touch(None, g);
            return next;
        }
        self.pool_set(None, g, next, true);
        next
    }
    pub fn remove_stack_global(&mut self, g: GearId, n: f64) -> f64 {
        self.note(g as i64, -n);
        let next = (self.global.get(g).unwrap_or(0.0) - n).max(0.0);
        if next == 0.0 {
            if !self.global.has(g) {
                return 0.0;
            }
            self.pool_delete(None, g);
            return 0.0;
        }
        if self.global.get(g) == Some(next) {
            return next;
        }
        self.pool_set(None, g, next, false);
        next
    }
    pub fn revoke_global(&mut self, g: GearId) {
        self.note(g as i64, -1e6);
        if !self.global.has(g) {
            return;
        }
        self.pool_delete(None, g);
    }

    fn enemy_max(&self, g: GearId) -> f64 {
        self.gears[g as usize].max_stacks + self.enemy_max_increase[g as usize]
    }
    pub fn enemy(&self) -> usize {
        self.nslots
    }
    pub fn add_stack_enemy(&mut self, g: GearId, n: f64) -> f64 {
        self.note(g as i64, n);
        let e = self.enemy();
        let cur = self.members[e].stacks.get(g);
        let next = self.enemy_max(g).min(cur.unwrap_or(0.0) + n);
        self.record_applied(g, n);
        if cur == Some(next) {
            self.pool_touch(Some(e), g);
            return next;
        }
        self.pool_set(Some(e), g, next, true);
        next
    }
    pub fn remove_stack_enemy(&mut self, g: GearId, n: f64) -> f64 {
        self.note(g as i64, -n);
        let e = self.enemy();
        let next = (self.stacks_on(e, g) - n).max(0.0);
        if next == 0.0 {
            if !self.members[e].stacks.has(g) {
                return 0.0;
            }
            self.pool_delete(Some(e), g);
            return 0.0;
        }
        if self.members[e].stacks.get(g) == Some(next) {
            return next;
        }
        self.pool_set(Some(e), g, next, false);
        next
    }
    pub fn revoke_enemy(&mut self, g: GearId) {
        self.note(g as i64, -1e6);
        let e = self.enemy();
        if !self.members[e].stacks.has(g) {
            return;
        }
        self.pool_delete(Some(e), g);
    }

    pub fn expire_buffs(&mut self) {
    #[cfg(feature = "prof")]
    let _p = crate::prof::span("expire_buffs");
        let now = self.frame;
        for m in 0..self.nslots {
            if let Some(gone) = self.members[m].stacks.expired(now) {
                for g in gone {
                    self.revoke(m, g);
                }
            }
        }
        if let Some(gone) = self.global.expired(now) {
            for g in gone {
                self.revoke_global(g);
            }
        }
        let e = self.enemy();
        if let Some(gone) = self.members[e].stacks.expired(now) {
            for g in gone {
                self.revoke_enemy(g);
            }
        }
    }

    pub fn member_of(&self, resonator: GearId) -> usize {
        (0..self.nslots).find(|&m| self.members[m].resonator == Some(resonator)).expect("resonator is not on this team")
    }

    /* -------------------------------------------------------------- ticks */

    fn off_field(&self, g: GearId, holder: Option<usize>) -> bool {
        let gear = &self.gears[g as usize];
        if gear.tick_skips {
            return true;
        }
        let owner = match gear.tick_owner {
            Some(r) => Some(self.member_of(r)),
            None => holder,
        };
        let presser = if self.presser >= 0 && (self.presser as usize) < self.nslots { Some(self.presser as usize) } else { None };
        owner.is_some() && presser.is_some() && owner != presser
    }

    /// Pool.advance over pool `which` (a member index, or None for the team's).
    fn advance(&mut self, which: Option<usize>, a: f64, b: f64, due: &mut Vec<(GearId, f64, f64, usize)>, motion_stop: f64, holder: Option<usize>, slot: usize) {
        let gears = &self.gears;
        let pool = match which {
            Some(m) => &mut self.members[m].stacks,
            None => &mut self.global,
        };
        if !pool.has_ticks(gears) {
            return;
        }
        let count = match which {
            Some(m) => self.members[m].stacks.tick_idx.len(),
            None => self.global.tick_idx.len(),
        };
        for t in 0..count {
            let (g, at, prog, i) = {
                let pool = match which {
                    Some(m) => &self.members[m].stacks,
                    None => &self.global,
                };
                let i = pool.tick_idx[t];
                let g = pool.list[i];
                if pool.pos(g) != i as i32 {
                    continue;
                }
                (g, pool.expires[i], pool.progress[i], i)
            };
            let skip = if self.off_field(g, holder) { motion_stop } else { 0.0 };
            let span = (if at == 0.0 || at >= b { b } else { at }) - a - skip;
            if span <= 0.0 {
                continue;
            }
            self.buff = Some(g);
            let mut every = self.tick_every_of(g);
            if every <= 0.0 {
                continue;
            }
            let mut tick = a - prog + skip;
            let mut progress = prog + span;
            while progress >= every {
                progress -= every;
                tick += every;
                let pool = match which {
                    Some(m) => &mut self.members[m].stacks,
                    None => &mut self.global,
                };
                pool.ticks[i] += 1.0;
                due.push((g, pool.ticks[i], a.max(js_round(tick)), slot));
                every = self.tick_every_of(g);
                if every <= 0.0 {
                    break;
                }
            }
            let pool = match which {
                Some(m) => &mut self.members[m].stacks,
                None => &mut self.global,
            };
            pool.progress[i] = progress;
        }
    }

    pub fn run_ticks(&mut self, a: f64, b: f64, motion_stop: f64) {
    #[cfg(feature = "prof")]
    let _p = crate::prof::span("run_ticks");
        let mut due = std::mem::take(&mut self.due_buf);
        due.clear();
        let acting = self.active;
        for m in 0..self.nslots {
            self.slot = m;
            self.advance(Some(m), a, b, &mut due, motion_stop, Some(m), m);
        }
        self.slot = acting;
        self.advance(None, a, b, &mut due, motion_stop, None, acting);
        let e = self.enemy();
        self.advance(Some(e), a, b, &mut due, motion_stop, None, acting);
        for k in 0..due.len() {
            let (g, n, at, slot) = due[k];
            self.slot = slot;
            self.buff = Some(g);
            self.stacks = -1.0;
            self.tick_at = Some(at);
            let f = self.gears[g as usize].tick_fn.clone().unwrap();
            f(self, n);
        }
        self.tick_at = None;
        self.slot = acting;
        self.buff = None;
        self.due_buf = due;
    }

    /* -------------------------------------------------------------- cooldowns */

    pub fn cooldown_at(&mut self, m: usize, cd: u32, now: f64) -> CdState {
        let max = self.cds[cd as usize].charges;
        let frames = self.cds[cd as usize].frames;
        let v = &mut self.members[m].cooldowns;
        if v.len() <= cd as usize {
            v.resize(cd as usize + 1, None);
        }
        let s = v[cd as usize].get_or_insert(CdState { charges: max, next: f64::INFINITY });
        if s.charges < max && s.next == f64::INFINITY {
            s.next = now + frames;
        }
        while s.charges < max && s.next <= now {
            s.charges += 1.0;
            s.next = if s.charges < max { s.next + frames } else { f64::INFINITY };
        }
        if s.charges > max {
            s.charges = max;
        }
        *s
    }
    fn cd_mut(&mut self, m: usize, cd: u32) -> &mut CdState {
        self.members[m].cooldowns[cd as usize].as_mut().unwrap()
    }
    pub fn spend_cooldown(&mut self, m: usize, cd: u32, now: f64, frames: Option<f64>) {
        let frames = frames.unwrap_or(self.cds[cd as usize].frames);
        self.cooldown_at(m, cd, now);
        let s = self.cd_mut(m, cd);
        if s.next == f64::INFINITY {
            s.next = now + frames;
        }
        if s.charges > 0.0 {
            s.charges -= 1.0;
        }
    }
    pub fn wait_action(&mut self, cd: u32, frames: f64) -> ActId {
        if let Some(&(_, a)) = self.cds[cd as usize].waits.iter().find(|w| w.0 == frames) {
            return a;
        }
        let a = self.action(ADef { name: format!("Wait {:.2}s", frames / 60.0), anim: frames, ..Default::default() });
        self.cds[cd as usize].waits.push((frames, a));
        a
    }

    /* -------------------------------------------------------------- the kit API */

    pub fn cur(&self) -> &Act {
        &self.acts[self.act as usize]
    }
    pub fn is_cast(&self, a: ActId, c: Cast) -> bool {
        let act = &self.acts[a as usize];
        act.cast == Some(c) || act.subcast == Some(c)
    }
    pub fn casting(&self, c: Cast) -> bool {
        self.is_cast(self.act, c) && self.dropped_cast != Some(c)
    }
    pub fn running_action(&self, a: ActId) -> bool {
        let mut x = Some(self.act);
        while let Some(y) = x {
            if y == a {
                return true;
            }
            let act = &self.acts[y as usize];
            x = act.cancel_of.or(act.form_of);
        }
        false
    }
    pub fn is_type(&self, t: u32) -> bool {
        match self.cur().last_bullet() {
            None => false,
            Some(h) => {
                let typ = if self.override_type != 0 { self.override_type } else { h.typ };
                let sub = if self.override_subtype != 0 { self.override_subtype } else { h.subtype };
                typ == t || sub == t
            }
        }
    }
    pub fn pressed(&self) -> ActId {
        let a = self.cur();
        if a.half != Half::Whole {
            a.form_of.unwrap_or(self.act)
        } else {
            self.act
        }
    }
    pub fn is_active(&self) -> bool {
        self.on_field >= 0 && self.active == self.on_field as usize
    }
    pub fn applied(&self, g: GearId) -> f64 {
        self.applied_rec.get(g, self.action_stamp)
    }
    pub fn applied_by_me(&self, g: GearId) -> f64 {
        self.applied_rec.get_by(g, self.members[self.slot].index, self.action_stamp)
    }
    pub fn frozen_stacks(&self) -> f64 {
        if self.stacks >= 0.0 {
            self.stacks
        } else {
            self.stacks_on(self.slot, self.buff.unwrap())
        }
    }
    pub fn push_stat(&mut self, stat: usize, tag: u32, value: f64) {
        if tag == 0 || (self.tag_word & tag_band(tag)) == tag {
            let e = &mut self.members[self.slot].effective;
            e[stat] += value;
            self.wrote += 1;
            if self.recording {
                self.replay.push((stat, value));
            }
            if tag != 0 && tag & SUBTYPE_BITS != 0 {
                let x = match stat {
                    s::AMP => Some(s::SUB_AMP),
                    s::CRIT_RATE => Some(s::SUB_CR),
                    s::CRIT_DMG => Some(s::SUB_CD),
                    s::TOTAL_DMG => Some(s::SUB_TOTAL),
                    s::DAMAGE_TAKEN => Some(s::SUB_TAKEN),
                    _ => None,
                };
                if let Some(x) = x {
                    e[x] += value;
                    self.wrote += 1;
                    if self.recording {
                        self.replay.push((x, value));
                    }
                }
            }
            if stat == s::DMG_BONUS && tag == T_BASIC {
                e[s::BASIC_DB] += value;
                self.wrote += 1;
                if self.recording {
                    self.replay.push((s::BASIC_DB, value));
                }
            }
        }
    }
    pub fn add_stat(&mut self, stat: usize, value: f64, tag: u32) {
        self.push_stat(stat, tag, value);
        if self.tracing {
            let source = self.buff.map_or(String::new(), |g| self.label(g));
            let owner = self.owner_name(self.buff);
            let slot = self.slot;
            self.members[slot].entries.push(StatEntry { key: stat as u32 | tag, value, source, owner, gear: self.buff });
        }
    }
    /// gear.ts's Gear.toString: its display, else its name and a stack count where it stacks.
    pub fn label(&mut self, g: GearId) -> String {
        if let Some(f) = self.gears[g as usize].display.clone() {
            return f(self);
        }
        let n = if self.stacks >= 0.0 { self.stacks } else { self.stacks_on(self.slot, g) };
        let gear = &self.gears[g as usize];
        if gear.max_stacks > 1.0 || n > 1.0 {
            format!("{} x{}", gear.name, n)
        } else {
            gear.name.clone()
        }
    }
    /// Whose kit a Gear came from, by member name; the acting slot's where it was never attributed.
    pub fn owner_name(&self, g: Option<GearId>) -> String {
        let src = g.map_or(-1, |g| self.source_of[g as usize]);
        if src >= 0 {
            self.members[src as usize].name.clone()
        } else if src == -2 {
            String::new()
        } else {
            self.members[self.slot].name.clone()
        }
    }
    /// context.ts's inheritPiece: which equipped piece a granted Gear came off (traced only).
    pub fn inherit_piece(&mut self, g: GearId) {
        let Some(b) = self.buff else { return };
        if !self.tracing {
            return;
        }
        self.granted_on.entry(g).or_insert(self.slot);
        let root = *self.granted_by.get(&b).unwrap_or(&b);
        self.granted_by.entry(g).or_insert(root);
    }
    pub fn get_stat(&mut self, stat: usize) -> f64 {
        if self.recording {
            self.record_read(stat);
        }
        self.members[self.slot].effective[stat]
    }
    pub fn record_read(&mut self, i: usize) {
        if self.read_stamps[i] != self.read_stamp {
            self.read_stamps[i] = self.read_stamp;
            self.read_phases[i] = self.read_phase;
        } else {
            self.read_phases[i] |= self.read_phase;
        }
    }
    pub fn read_any(&self, idx: &[usize], phases: i32) -> bool {
        idx.iter().any(|&i| self.read_stamps[i] == self.read_stamp && (self.read_phases[i] & phases) != 0)
    }
    pub fn stacks_of(&self, g: GearId) -> f64 {
        self.stacks_on(self.slot, g)
    }
    pub fn is_held(&self, g: GearId) -> bool {
        self.members[self.slot].stacks.has(g)
    }
    pub fn stacks_of_team(&self, g: GearId) -> f64 {
        self.global.get(g).unwrap_or(0.0)
    }
    pub fn stacks_of_enemy(&self, g: GearId) -> f64 {
        self.stacks_on(self.enemy(), g)
    }
    pub fn forte(&self, i: usize) -> f64 {
        self.members[self.slot].forte[i]
    }
    pub fn set_forte(&mut self, i: usize, v: f64) {
        self.note(-1 - i as i64, v);
        self.members[self.slot].forte[i] = v;
    }
    pub fn add_to_cast(&mut self, gains: [f64; 7]) {
        if !self.in_cast {
            panic!("addToCast() outside a cast hook");
        }
        for i in 0..7 {
            self.cast_gain[i] += gains[i];
        }
        if self.tracing {
            let source = self.buff.map_or(String::new(), |g| self.label(g));
            let owner = self.owner_name(self.buff);
            self.cast_adds.push((source, owner, gains));
        }
    }
    pub fn tick_every_of(&self, g: GearId) -> f64 {
        match &self.gears[g as usize].tick_every {
            TickEvery::Every(x) => *x,
            TickEvery::Fn(f) => f(self),
        }
    }
    pub fn attribute(&mut self, g: GearId) {
        // -2: sourced to a member not yet named (the enemy, before its Resonator lands) — nobody
        let inherited = self.buff.map(|b| self.source_of[b as usize]).filter(|&x| x >= 0 || x == -2);
        let own = if self.members[self.slot].name.is_empty() { -2 } else { self.members[self.slot].index as i32 };
        self.source_of[g as usize] = inherited.unwrap_or(own);
        self.inherit_piece(g);
    }
    pub fn apply_current(&mut self, g: GearId, n: f64) -> f64 {
        self.attribute(g);
        let m = self.slot;
        self.add_stack(m, g, n)
    }
    pub fn revoke_current(&mut self, g: GearId) {
        let m = self.slot;
        self.revoke(m, g);
    }
    pub fn remove_stack_current(&mut self, g: GearId, n: f64) -> f64 {
        let m = self.slot;
        self.remove_stack(m, g, n)
    }
    pub fn set_stacks_self(&mut self, g: GearId, n: f64) -> f64 {
        self.attribute(g);
        let m = self.slot;
        self.set_stacks(m, g, n)
    }
    pub fn apply_team(&mut self, g: GearId, n: f64) -> f64 {
        self.attribute(g);
        self.add_stack_global(g, n)
    }
    pub fn revoke_team(&mut self, g: GearId) {
        self.revoke_global(g);
    }
    pub fn apply_enemy(&mut self, g: GearId, n: f64) -> f64 {
        self.attribute(g);
        self.add_stack_enemy(g, n)
    }
    pub fn add_buff(&mut self, resonator: GearId, g: GearId, n: f64) -> f64 {
        self.attribute(g);
        let m = self.member_of(resonator);
        self.add_stack(m, g, n)
    }
    pub fn max_stack_increase(&mut self, g: GearId, n: f64) {
        self.note(g as i64, 2e6 + n);
        if self.dry_run {
            return;
        }
        let source = match self.buff {
            Some(b) => self.gears[b as usize].name.clone(),
            None => self.members[self.slot].name.clone(),
        };
        if !self.enemy_max_sources.insert((g, source)) {
            return;
        }
        self.enemy_max_increase[g as usize] += n;
    }
    pub fn queue_outro(&mut self, g: GearId) {
        self.note(g as i64, 3e6);
        if self.dry_run {
            return;
        }
        self.attribute(g);
        self.outro_queue.push(g);
    }
    pub fn queued_by(&self) -> By {
        let g = self.buff?;
        let name = &self.gears[g as usize].name;
        if name.is_empty() {
            return None;
        }
        if !self.tracing {
            return Some(self.by_marker.clone());
        }
        Some(Rc::new((name.clone(), self.owner_name(Some(g)))))
    }
    pub fn slot_index(&self) -> i32 {
        if self.slot < self.nslots {
            self.slot as i32
        } else {
            -1
        }
    }
    pub fn queue(&mut self, a: ActId) {
        self.inherit_piece(self.acts[a as usize].gear);
        self.note(self.acts[a as usize].gear as i64, 4e6);
        if self.dry_run {
            return;
        }
        let s = self.slot_index();
        self.queue_on_slot(s, a);
    }
    pub fn queue_on(&mut self, resonator: GearId, a: ActId) {
        self.inherit_piece(self.acts[a as usize].gear);
        self.note(self.acts[a as usize].gear as i64, 6e6);
        if self.dry_run {
            return;
        }
        let s = self.member_of(resonator) as i32;
        self.queue_on_slot(s, a);
    }
    fn queue_on_slot(&mut self, slot: i32, a: ActId) {
        let by = self.queued_by();
        match self.tick_at {
            None => self.pending.push(Pending { action: a, slot, by, event: false }),
            Some(at) => {
                let uid = self.uid();
                self.timed.push(Timed { due: at, action: Some(a), slot, into: None, by, away: false, apply: None, losses: None, frames: None, closes: false, triggered: None, uid });
                self.sort_timed();
            }
        }
    }
    pub fn queue_event(&mut self, a: ActId) {
        self.inherit_piece(self.acts[a as usize].gear);
        self.note(self.acts[a as usize].gear as i64, 5e6);
        if self.dry_run {
            return;
        }
        let by = self.queued_by();
        self.pending.push(Pending { action: a, slot: -1, by, event: true });
    }
    pub fn apply_on(&mut self, resonator: Option<GearId>, f: Hook) {
        if self.dry_run {
            return;
        }
        let slot = match resonator {
            Some(r) => self.member_of(r),
            None => self.slot,
        };
        match self.tick_at {
            None => {
                let prev = self.slot;
                self.slot = slot;
                f(self);
                self.slot = prev;
            }
            Some(at) => {
                let by = self.queued_by();
                let uid = self.uid();
                self.timed.push(Timed { due: at, action: None, slot: slot as i32, into: None, by, away: false, apply: Some(Apply::Hook(f)), losses: None, frames: None, closes: false, triggered: None, uid });
                self.sort_timed();
            }
        }
    }
    pub fn uid(&mut self) -> u32 {
        self.next_uid += 1;
        self.next_uid
    }
    pub fn sort_timed(&mut self) {
    #[cfg(feature = "prof")]
    let _p = crate::prof::span("sort_timed");
        self.timed.sort_by(|p, q| p.due.partial_cmp(&q.due).unwrap());
    }
    pub fn reduce_cooldown(&mut self, a: ActId, frames: f64) {
        self.note(0x5d, frames);
        if self.dry_run {
            return;
        }
        let Some(cd) = self.acts[a as usize].cooldown else { return };
        let m = self.slot;
        let now = self.frame;
        let s = self.cooldown_at(m, cd, now);
        if s.next == f64::INFINITY {
            return;
        }
        self.cd_mut(m, cd).next -= frames;
        self.cooldown_at(m, cd, now);
    }
    pub fn reset_cooldown(&mut self, a: ActId) {
        self.note(0x5c, 1.0);
        if self.dry_run {
            return;
        }
        let Some(cd) = self.acts[a as usize].cooldown else { return };
        let m = self.slot;
        let now = self.frame;
        self.cooldown_at(m, cd, now);
        let max = self.cds[cd as usize].charges;
        let s = self.cd_mut(m, cd);
        s.charges = max.min(s.charges + f64::INFINITY);
        if s.charges == max {
            s.next = f64::INFINITY;
        }
    }
    /// status.ts's heal(): the Healed marker in a moment of its own, and every held "on heal" grant.
    pub fn heal(&mut self) {
        let prev = self.act;
        self.act = self.common.heal_moment;
        self.action_stamp += 1;
        let heals = self.common.heals;
        self.apply_current(heals, 1.0);
        self.fire_held_grants();
        self.act = prev;
    }
    pub fn fire_held_grants(&mut self) {
        let m = self.slot;
        let prev = self.buff;
        let list = self.members[m].stacks.list.clone();
        for &g in list.iter() {
            let f = self.gears[g as usize].fire_grants.clone();
            let Some(f) = f else { continue };
            if !self.members[m].stacks.has(g) {
                continue;
            }
            self.buff = Some(g);
            f(self);
        }
        self.buff = prev;
    }
}

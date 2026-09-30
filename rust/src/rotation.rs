//! rotation.ts: the forms a rotation writes a press in, the markers, the Rotation compiler and the
//! scheduler that plays a team's rotations.
use crate::eng::*;
use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::rc::Rc;

/// One written rotation entry: a press, a press cut short (`CancelledStep`), or an ActionGroup.
#[derive(Clone)]
pub enum W {
    A(ActId),
    Cut(ActId, Tag),
    G(Rc<Group>),
}

pub struct Group {
    pub id: u32,
    pub name: String,
    pub actions: Vec<W>,
    pub trailing: usize,
}

static NEXT_GROUP: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
pub fn group_of(name: &str, actions: Vec<W>, trailing: usize) -> W {
    let id = NEXT_GROUP.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
    W::G(Rc::new(Group { id, name: name.to_string(), actions, trailing }))
}

/// The markers every rotation writes, and the plain dash and jump.
#[derive(Clone, Default)]
pub struct Markers {
    pub start: [ActId; 3],
    pub nointro: ActId,
    pub intro_entry: ActId,
    pub intro: ActId,
    pub intro_n: [ActId; 3],
    pub nointro_n: [ActId; 3],
    pub echo: ActId,
    pub echo_swap_form: ActId,
    pub echo_insta_form: ActId,
    pub echo_insta_swap_form: ActId,
    pub every_other: ActId,
    pub double_entry: ActId,
    pub double_intro: ActId,
    pub first_intro: ActId,
    pub nointro_first: ActId,
}

impl Eng {
    /// rotation.ts's markers, built once per engine.
    pub fn build_markers(&mut self) {
        let named = |e: &mut Eng, n: &str| e.action(ADef { name: n.into(), ..Default::default() });
        let start = [named(self, "Start of Combat (1st)"), named(self, "Start of Combat (2nd)"), named(self, "Start of Combat (3rd)")];
        let nointro = named(self, "No Intro");
        let intro_entry = named(self, "Intro");
        let intro = self.action(ADef {
            name: "Intro Placeholder".into(),
            cast: Cast::Intro,
            resolve: Some(Rc::new(|e: &mut Eng| {
                let m = e.slot;
                let r = e.members[m].resonator;
                let intro = r.and_then(|r| e.gears[r as usize].res.as_ref().and_then(|i| i.intro));
                let Some(intro) = intro else { panic!("{} casts INTRO but their Resonator declares no intro", e.members[m].name) };
                match e.acts[intro as usize].resolve.clone() {
                    Some(f) => f(e),
                    None => Some(intro),
                }
            })),
            ..Default::default()
        });
        let intro_n = [named(self, "Intro (1st)"), named(self, "Intro (2nd)"), named(self, "Intro (3rd)")];
        let nointro_n = [named(self, "No Intro (1st)"), named(self, "No Intro (2nd)"), named(self, "No Intro (3rd)")];
        let form = |e: &mut Eng, name: &str, written: &'static str, pick: fn(&mut Eng, GearId) -> ActId| -> ActId {
            e.action(ADef {
                name: name.into(),
                resolve: Some(Rc::new(move |e: &mut Eng| {
                    let Some(ms) = e.members[e.slot].mainslot else { panic!("{} casts {} but has no Mainslot equipped", e.members[e.slot].name, written) };
                    Some(pick(e, ms))
                })),
                ..Default::default()
            })
        };
        let echo = form(self, "Echo Placeholder (on field)", "ECHO", |e, ms| e.gears[ms as usize].mainslot.unwrap().onfield);
        let echo_swap_form = form(self, "Echo Placeholder (swap)", "ECHO.swap()", |e, ms| e.gears[ms as usize].mainslot.unwrap().outro);
        let echo_insta_form = form(self, "Echo Placeholder (insta dash)", "ECHO.instaDodge()", |e, ms| {
            let f = e.gears[ms as usize].mainslot.unwrap();
            if e.echo_pressed_whole(ms) {
                f.onfield
            } else {
                f.cancel
            }
        });
        let echo_insta_swap_form = form(self, "Echo Placeholder (insta swap)", "ECHO.instaSwap()", |e, ms| e.gears[ms as usize].mainslot.unwrap().insta_out);
        let every_other = self.action(ADef {
            name: "Every Other".into(),
            skip_next: Some(Rc::new(|e: &mut Eng| {
                let m = e.slot;
                e.members[m].every_other += 1;
                e.members[m].every_other % 2 == 0
            })),
            ..Default::default()
        });
        let double_entry = named(self, "Double Intro");
        let double_intro = named(self, "Double Intro Marker");
        let first_intro = named(self, "First Intro");
        let nointro_first = named(self, "First No Intro");
        self.common.echo_marker = echo;
        self.common.intro_marker = intro;
        self.mk = Markers { start, nointro, intro_entry, intro, intro_n, nointro_n, echo, echo_swap_form, echo_insta_form, echo_insta_swap_form, every_other, double_entry, double_intro, first_intro, nointro_first };
    }

    /* ------------------------------------------------------------------ the forms */

    /// `a.cancel()` and the other plain cuts: the press itself, cut short by `kind`.
    pub fn cut(&self, a: ActId, kind: Tag) -> W {
        W::Cut(a, kind)
    }
    pub fn instaform(&mut self, a: ActId, kind: Tag) -> W {
        if self.acts[a as usize].resolve.is_some() {
            W::Cut(a, kind)
        } else {
            W::A(self.hitless(a, kind))
        }
    }
    fn dashed(&mut self, a: ActId, kind: Tag) -> W {
        let insta = matches!(kind, Tag::InstaDodge | Tag::InstaJump);
        let cut = if insta { self.instaform(a, kind) } else { W::Cut(a, kind) };
        let jump = matches!(kind, Tag::JumpCancel | Tag::InstaJump);
        let dash = self.dash_marker(jump, a);
        let name = if self.acts[a as usize].resolve.is_some() { String::new() } else { self.acts[a as usize].name.to_string() };
        group_of(&name, vec![cut, W::A(dash)], 1)
    }
    pub fn dodge_cancel(&mut self, a: ActId) -> W {
        self.dashed(a, Tag::DodgeCancel)
    }
    pub fn jump_cancel(&mut self, a: ActId) -> W {
        self.dashed(a, Tag::JumpCancel)
    }
    pub fn insta_cancel(&mut self, a: ActId) -> W {
        self.instaform(a, Tag::InstaCancel)
    }
    pub fn insta_dodge(&mut self, a: ActId) -> W {
        if a == self.mk.echo {
            let dash = self.dash_marker(false, a);
            return group_of("", vec![W::A(self.mk.echo_insta_form), W::A(dash)], 1);
        }
        self.dashed(a, Tag::InstaDodge)
    }
    pub fn insta_jump(&mut self, a: ActId) -> W {
        self.dashed(a, Tag::InstaJump)
    }
    pub fn hit_cancel(&mut self, a: ActId) -> W {
        if self.acts[a as usize].resolve.is_some() {
            return W::A(self.swap_resolver(a, |e, x| e.cut_on_hit(x, Tag::HitCancel)));
        }
        W::A(self.cut_on_hit(a, Tag::HitCancel))
    }
    pub fn dodge_on_hit(&mut self, a: ActId) -> W {
        self.dash_on_hit(a, Tag::DodgeOnHit)
    }
    pub fn jump_on_hit(&mut self, a: ActId) -> W {
        self.dash_on_hit(a, Tag::JumpOnHit)
    }
    fn dash_on_hit(&mut self, a: ActId, kind: Tag) -> W {
        let marker = self.acts[a as usize].resolve.is_some();
        let cut = if marker { self.swap_resolver(a, move |e, x| e.cut_on_hit(x, kind)) } else { self.cut_on_hit(a, kind) };
        let dash = self.dash_marker(kind == Tag::JumpOnHit, a);
        let name = if marker { String::new() } else { self.acts[a as usize].name.to_string() };
        group_of(&name, vec![W::A(cut), W::A(dash)], 1)
    }
    /// The swap forms as a rotation writes them (`.swapCancel()`, `.instaSwap()`).
    pub fn swap_w(&mut self, a: ActId) -> W {
        if a == self.mk.echo {
            return W::A(self.mk.echo_swap_form);
        }
        if self.acts[a as usize].resolve.is_some() {
            return W::A(self.swap_resolver(a, |e, x| e.swap_cancel(x)));
        }
        W::A(self.swap_cancel(a))
    }
    pub fn insta_swap_w(&mut self, a: ActId) -> W {
        if a == self.mk.echo {
            return W::A(self.mk.echo_insta_swap_form);
        }
        if self.acts[a as usize].resolve.is_some() {
            return W::A(self.swap_resolver(a, |e, x| e.insta_swap(x)));
        }
        W::A(self.insta_swap(a))
    }
    pub fn cut_on_hit(&mut self, a: ActId, kind: Tag) -> ActId {
        let bullets = &self.acts[a as usize].bullets;
        let first = bullets.iter().fold(f64::INFINITY, |m, h| m.min(h.hit));
        if bullets.len() < 2 || bullets.iter().all(|h| h.hit == first) {
            panic!("{}: {:?} needs bullets hitting on more than one frame", self.acts[a as usize].name, kind);
        }
        let kept: Vec<usize> = (0..bullets.len()).filter(|&i| bullets[i].commit <= first).collect();
        let defs = self.bullet_defs(a, &kept);
        let out = self.variant(a, |d| {
            d.tag = kind;
            d.bullets = defs;
        });
        self.acts[out as usize].on_hit_at = Some(first);
        self.acts[out as usize].cancel_of = Some(a);
        out
    }
    /// A marker's swap form: resolves to the form of whatever the marker resolves to, each made once.
    fn swap_resolver(&mut self, a: ActId, swap: impl Fn(&mut Eng, ActId) -> ActId + 'static) -> ActId {
        let resolve = self.acts[a as usize].resolve.clone().unwrap();
        let made: RefCell<Vec<(ActId, ActId)>> = RefCell::new(vec![]);
        let name = self.acts[a as usize].name.to_string();
        self.action(ADef {
            name,
            resolve: Some(Rc::new(move |e: &mut Eng| {
                let x = resolve(e)?;
                if let Some(&(_, out)) = made.borrow().iter().find(|m| m.0 == x) {
                    return Some(out);
                }
                let out = swap(e, x);
                made.borrow_mut().push((x, out));
                Some(out)
            })),
            ..Default::default()
        })
    }
    /// A group, the forms writing onto its last press.
    pub fn group_last(&mut self, g: &W, f: impl FnOnce(&mut Eng, &W) -> W) -> W {
        let W::G(g) = g else { panic!("not a group") };
        let mut actions = g.actions.clone();
        let last = actions.pop().unwrap();
        let cut = f(self, &last);
        match (&cut, is_dash(self, &cut)) {
            (W::G(tail), true) => {
                actions.extend(tail.actions.iter().cloned());
                group_of(&g.name, actions, tail.trailing)
            }
            _ => {
                actions.push(cut);
                group_of(&g.name, actions, 0)
            }
        }
    }
}

/// Whether a written form is a dash group (a cut press and its DashMarker).
fn is_dash(e: &Eng, w: &W) -> bool {
    match w {
        W::G(g) => matches!(g.actions.last(), Some(W::A(a)) if e.acts[*a as usize].dash_after.is_some()),
        _ => false,
    }
}

/* ---------------------------------------------------------------------- the rotation */

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Entry {
    NoIntro,
    Intro,
    Double,
}

#[derive(Clone)]
pub struct Chain {
    pub entry: Entry,
    pub cast: Option<W>,
    pub body: Vec<W>,
    /// None: the chain leaves on its last cast's `.swap()` (rotation.ts's SWAP_EXIT).
    pub exit: Option<W>,
}

pub struct Rotation {
    pub start: [Option<Vec<W>>; 3],
    pub opener: Option<Chain>,
    pub intro: Chain,
    pub double_intro: Option<Chain>,
    pub first_intro: Option<Chain>,
    pub first_opener: Option<Chain>,
    pub intros: [Option<Chain>; 3],
    pub openers: [Option<Chain>; 3],
}

#[derive(Clone, Copy, PartialEq)]
enum Phase {
    None,
    Opener,
    Double,
    Intro,
    First,
    FirstOpener,
    IntroAt(usize),
    OpenerAt(usize),
}

#[derive(Clone, Copy, PartialEq)]
enum Into {
    Main,
    N(usize),
}

fn unstep(w: &W) -> (W, Option<Tag>) {
    match w {
        W::Cut(a, k) => (W::A(*a), Some(*k)),
        _ => (w.clone(), None),
    }
}
fn bare_id(w: &W) -> Option<ActId> {
    match w {
        W::A(a) => Some(*a),
        _ => None,
    }
}

impl Eng {
    fn intro_of(&self, w: &W) -> Option<ActId> {
        let first = match w {
            W::G(g) => g.actions[0].clone(),
            _ => w.clone(),
        };
        match unstep(&first).0 {
            W::A(a) => Some(a),
            _ => None,
        }
    }
    fn is_intro(&self, w: &W) -> bool {
        self.intro_of(w).map_or(false, |a| self.acts[a as usize].cast == Some(Cast::Intro))
    }
    fn is_outro(&self, w: &W) -> bool {
        matches!(w, W::A(a) if self.acts[*a as usize].cast == Some(Cast::Outro))
    }
    fn opens_chain(&self, w: &W) -> bool {
        let m = &self.mk;
        self.is_intro(w)
            || bare_id(w).map_or(false, |a| a == m.nointro || a == m.nointro_first || a == m.first_intro || a == m.double_intro || m.nointro_n.contains(&a) || m.intro_n.contains(&a))
    }
    pub fn leaves_field(&self, w: &W) -> bool {
        let last = match w {
            W::G(g) => g.actions.last().unwrap().clone(),
            _ => w.clone(),
        };
        let W::A(a) = last else { return false };
        if a == self.mk.echo_swap_form || a == self.mk.echo_insta_swap_form {
            return true;
        }
        let act = &self.acts[a as usize];
        (act.swaps_after_hit() || act.tag == Tag::InstaSwap) && act.form_of.or(act.cancel_of).is_some()
    }
    fn stays_on_field(&self, w: &W) -> W {
        match w {
            W::G(g) => {
                let mut actions = g.actions.clone();
                let last = actions.pop().unwrap();
                actions.push(self.stays_on_field(&last));
                group_of(&g.name, actions, 0)
            }
            W::A(a) => {
                if *a == self.mk.echo_swap_form || *a == self.mk.echo_insta_swap_form {
                    return W::A(self.mk.echo);
                }
                let act = &self.acts[*a as usize];
                W::A(act.form_of.or(act.cancel_of).unwrap_or(*a))
            }
            W::Cut(..) => w.clone(),
        }
    }

    /// rotation.ts's Rotation constructor.
    pub fn rotation(&self, actions: Vec<W>) -> Rotation {
        let m = self.mk.clone();
        let start_pos = |w: &W| bare_id(w).and_then(|a| m.start.iter().position(|&s| s == a));
        let intro_pos = |w: &W| bare_id(w).and_then(|a| m.intro_n.iter().position(|&s| s == a));
        let nointro_pos = |w: &W| bare_id(w).and_then(|a| m.nointro_n.iter().position(|&s| s == a));
        let is = |w: &W, a: ActId| bare_id(w) == Some(a);
        let mut phase = Phase::None;
        let (mut prefix, mut lp, mut dbl, mut first, mut first_pre): (Vec<W>, Vec<W>, Vec<W>, Vec<W>, Vec<W>) = (vec![], vec![], vec![], vec![], vec![]);
        let mut loops: [Vec<W>; 3] = Default::default();
        let mut prefixes: [Vec<W>; 3] = Default::default();
        let mut in_start: Vec<usize> = vec![];
        let mut starts: [Option<Vec<W>>; 3] = Default::default();
        let (mut shared, mut shared_double, mut shared_first) = (false, false, false);
        // Some(None) is SWAP_EXIT
        let mut opener_exit: Option<Option<W>> = None;
        let mut intro_exit: Option<Option<W>> = None;
        let mut double_exit: Option<Option<W>> = None;
        let mut first_exit: Option<Option<W>> = None;
        let mut first_opener_exit: Option<Option<W>> = None;
        let mut intro_exits: [Option<Option<W>>; 3] = Default::default();
        let mut opener_exits: [Option<Option<W>>; 3] = Default::default();
        let mut shared_into: [Option<Into>; 3] = [None; 3];
        let mut cuts: HashMap<String, W> = HashMap::new();
        let mut cast_for: Option<String> = None;
        let mut entries: VecDeque<W> = actions.into();

        macro_rules! body {
            () => {
                match phase {
                    Phase::Opener => Some(&mut prefix),
                    Phase::Intro => Some(&mut lp),
                    Phase::Double => Some(&mut dbl),
                    Phase::First => Some(&mut first),
                    Phase::FirstOpener => Some(&mut first_pre),
                    Phase::IntroAt(n) => Some(&mut loops[n]),
                    Phase::OpenerAt(n) => Some(&mut prefixes[n]),
                    Phase::None => None,
                }
            };
        }
        macro_rules! close {
            ($x:expr) => {{
                let x: Option<W> = $x;
                match phase {
                    Phase::Opener => opener_exit = Some(x),
                    Phase::Intro => intro_exit = Some(x),
                    Phase::Double => double_exit = Some(x),
                    Phase::First => first_exit = Some(x),
                    Phase::FirstOpener => first_opener_exit = Some(x),
                    Phase::IntroAt(n) => intro_exits[n] = Some(x),
                    Phase::OpenerAt(n) => opener_exits[n] = Some(x),
                    Phase::None => panic!("rotation: an exit closes a chain that was never opened"),
                }
                phase = Phase::None;
            }};
        }
        macro_rules! left_on_swap {
            () => {{
                let empty = in_start.is_empty();
                match body!() {
                    Some(into) => empty && !into.is_empty() && self.leaves_field(into.last().unwrap()),
                    None => false,
                }
            }};
        }

        while let Some(written) = entries.pop_front() {
            let (bare, step) = unstep(&written);
            if let Some(k) = step {
                if is(&bare, m.first_intro) || is(&bare, m.double_intro) || intro_pos(&bare).is_some() {
                    entries.push_front(W::Cut(m.intro, k));
                    entries.push_front(bare);
                    continue;
                }
            }
            let action = written.clone();
            if self.is_intro(&written) && self.intro_of(&written) != Some(m.intro) {
                panic!("rotation: write INTRO, not {}", self.acts[self.intro_of(&written).unwrap() as usize].name);
            }
            if let Some(cf) = cast_for.take() {
                let own = !self.is_intro(&written);
                cuts.insert(cf, if own { W::A(m.intro) } else { written.clone() });
                if !own {
                    continue;
                }
            }
            if step.is_some() && (self.is_outro(&bare) || is(&bare, m.nointro) || start_pos(&bare).is_some()) {
                panic!("rotation: this entry can't be cut short");
            }
            if let Some(at) = start_pos(&action) {
                if starts[at].is_some() {
                    panic!("rotation: only one start section per position");
                }
                if phase != Phase::None {
                    panic!("rotation: a start section opens inside a chain");
                }
                starts[at] = Some(vec![]);
                in_start.push(at);
            } else if !in_start.is_empty() {
                if self.is_outro(&action) || self.opens_chain(&action) {
                    panic!("rotation: a start section is never closed by a cast's .swap()");
                }
                for &at in &in_start {
                    starts[at].as_mut().unwrap().push(action.clone());
                }
                if self.leaves_field(&action) {
                    in_start.clear();
                }
            } else if self.opens_chain(&action) && left_on_swap!() {
                close!(None);
                entries.push_front(written);
            } else if is(&action, m.nointro) {
                if opener_exit.is_some() || !prefix.is_empty() || shared || shared_double {
                    panic!("rotation: only one NOINTRO chain");
                }
                if phase != Phase::None {
                    panic!("rotation: NOINTRO opens a chain while one is still open");
                }
                phase = Phase::Opener;
            } else if is(&action, m.double_intro) {
                if double_exit.is_some() || !dbl.is_empty() {
                    panic!("rotation: only one DOUBLE_INTRO section");
                }
                cast_for = Some("double".into());
                if phase == Phase::Opener {
                    shared_double = true;
                } else if phase != Phase::None {
                    panic!("rotation: DOUBLE_INTRO opens a chain while one is still open");
                }
                phase = Phase::Double;
            } else if is(&action, m.first_intro) {
                if first_exit.is_some() || !first.is_empty() {
                    panic!("rotation: only one FIRST_INTRO chain");
                }
                cast_for = Some("first".into());
                if phase == Phase::FirstOpener {
                    shared_first = true;
                } else if phase != Phase::None {
                    panic!("rotation: FIRST_INTRO opens a chain while one is still open");
                }
                phase = Phase::First;
            } else if is(&action, m.nointro_first) {
                if first_opener_exit.is_some() || !first_pre.is_empty() || shared_first {
                    panic!("rotation: only one NOINTRO_FIRST chain");
                }
                if phase != Phase::None {
                    panic!("rotation: NOINTRO_FIRST opens a chain while one is still open");
                }
                phase = Phase::FirstOpener;
            } else if let Some(n) = nointro_pos(&action) {
                if opener_exits[n].is_some() || !prefixes[n].is_empty() || shared_into[n].is_some() {
                    panic!("rotation: only one NOINTRO_n chain");
                }
                if phase != Phase::None {
                    panic!("rotation: NOINTRO_n opens a chain while one is still open");
                }
                phase = Phase::OpenerAt(n);
            } else if let Some(n) = intro_pos(&action) {
                cast_for = Some(format!("intro@{}", n));
                if intro_exits[n].is_some() || !loops[n].is_empty() {
                    panic!("rotation: only one INTRO_n chain");
                }
                if phase == Phase::OpenerAt(n) {
                    shared_into[n] = Some(Into::N(n));
                } else if phase != Phase::None {
                    panic!("rotation: INTRO_n opens a chain while one is still open");
                }
                phase = Phase::IntroAt(n);
            } else if self.is_intro(&action) {
                if phase == Phase::Intro || phase == Phase::First {
                    body!().unwrap().push(written);
                    continue;
                }
                if let Phase::IntroAt(n) = phase {
                    loops[n].push(written);
                    continue;
                }
                if intro_exit.is_some() {
                    panic!("rotation: only one Intro chain");
                }
                cuts.insert("intro".into(), written.clone());
                if phase == Phase::Opener {
                    shared = true;
                }
                if let Phase::OpenerAt(n) = phase {
                    shared_into[n] = Some(Into::Main);
                }
                if phase == Phase::Double {
                    panic!("rotation: a DOUBLE_INTRO section runs into the Intro without leaving on a cast's .swap()");
                }
                phase = Phase::Intro;
            } else if self.is_outro(&action) {
                close!(Some(action));
            } else {
                match body!() {
                    Some(into) => into.push(action),
                    None => panic!("rotation: an entry sits outside any action chain"),
                }
            }
        }
        if !in_start.is_empty() {
            panic!("rotation: a start section is never closed by a cast's .swap()");
        }
        if phase != Phase::None && left_on_swap!() {
            close!(None);
        }
        if phase != Phase::None {
            panic!("rotation: a chain is left open with neither an outro nor a .swap() to close it");
        }
        let stand = intro_exits.iter().position(|x| x.is_some());
        if intro_exit.is_none() && stand.is_none() {
            panic!("rotation: every rotation needs an Intro chain closed by an outro");
        }
        if intro_exit.is_none() {
            let s = stand.unwrap();
            intro_exit = intro_exits[s].clone();
            lp.extend(loops[s].iter().cloned());
        }
        let intro_exit = intro_exit.unwrap();
        let start = starts.map(|c| c.filter(|c| !c.is_empty()));
        let mut opener = None;
        if shared_double {
            let Some(Some(dx)) = &double_exit else { panic!("rotation: a NOINTRO chain shared with a DOUBLE_INTRO section needs that section closed by an outro") };
            opener = Some(Chain { entry: Entry::NoIntro, cast: None, body: [prefix.clone(), dbl.clone()].concat(), exit: Some(dx.clone()) });
        } else if opener_exit.is_some() || shared {
            let body = if shared { [prefix.clone(), lp.clone()].concat() } else { prefix.clone() };
            opener = Some(Chain { entry: Entry::NoIntro, cast: None, body, exit: opener_exit.clone().unwrap_or(intro_exit.clone()) });
        } else if !prefix.is_empty() {
            panic!("rotation: the NOINTRO chain is closed by neither an outro nor an Intro");
        }
        let double_intro = double_exit.map(|x| Chain { entry: Entry::Double, cast: cuts.get("double").cloned(), body: dbl.clone(), exit: x });
        let first_intro = first_exit.clone().map(|x| Chain { entry: Entry::Intro, cast: cuts.get("first").cloned(), body: first.clone(), exit: x });
        let mut first_opener = None;
        if first_opener_exit.is_some() || shared_first {
            let body = if shared_first { [first_pre.clone(), first.clone()].concat() } else { first_pre.clone() };
            first_opener = Some(Chain { entry: Entry::NoIntro, cast: None, body, exit: first_opener_exit.unwrap_or_else(|| first_exit.unwrap()) });
        } else if !first_pre.is_empty() {
            panic!("rotation: the NOINTRO_FIRST chain is closed by neither an outro nor a FIRST_INTRO");
        }
        let cast = cuts.get("intro").cloned().or_else(|| stand.and_then(|s| cuts.get(&format!("intro@{}", s)).cloned()));
        let intro = Chain { entry: Entry::Intro, cast, body: lp.clone(), exit: intro_exit.clone() };
        let mut intros: [Option<Chain>; 3] = Default::default();
        let mut openers: [Option<Chain>; 3] = Default::default();
        for n in 0..3 {
            let exit = intro_exits[n].clone();
            if let Some(x) = &exit {
                intros[n] = Some(Chain { entry: Entry::Intro, cast: cuts.get(&format!("intro@{}", n)).cloned(), body: loops[n].clone(), exit: x.clone() });
            }
            if let Some(x) = &opener_exits[n] {
                openers[n] = Some(Chain { entry: Entry::NoIntro, cast: None, body: prefixes[n].clone(), exit: x.clone() });
            } else if shared_into[n] == Some(Into::Main) {
                openers[n] = Some(Chain { entry: Entry::NoIntro, cast: None, body: [prefixes[n].clone(), lp.clone()].concat(), exit: intro_exit.clone() });
            } else if shared_into[n].is_some() {
                let Some(x) = exit else { panic!("rotation: a NOINTRO_n chain runs into an INTRO_n that is never closed") };
                openers[n] = Some(Chain { entry: Entry::NoIntro, cast: None, body: [prefixes[n].clone(), loops[n].clone()].concat(), exit: x });
            } else if !prefixes[n].is_empty() {
                panic!("rotation: a NOINTRO_n chain is closed by neither an outro nor an Intro");
            }
        }
        Rotation { start, opener, intro, double_intro, first_intro, first_opener, intros, openers }
    }
}

/// rotation.ts's teamPlayable(): why a team can't be scheduled, or None.
pub fn team_playable(rotations: &[Rc<Rotation>], names: &[String]) -> Option<String> {
    let opener_chain = |i: usize| -> Option<&Chain> { rotations[i].openers[i].as_ref().or(rotations[i].opener.as_ref()).or(rotations[i].first_opener.as_ref()) };
    if opener_chain(0).is_none() {
        return Some(format!("{} leads the team but declares no NOINTRO chain", names[0]));
    }
    let n = rotations.len();
    for i in 0..n {
        let r = &rotations[i];
        let nxt = (i + 1) % n;
        let swap_exit = |c: Option<&Chain>| c.map_or(false, |c| c.exit.is_none());
        if (swap_exit(Some(r.intros[i].as_ref().unwrap_or(&r.intro))) || swap_exit(r.first_intro.as_ref()) || swap_exit(r.first_opener.as_ref()) || swap_exit(opener_chain(i))) && opener_chain(nxt).is_none() {
            return Some(format!("{} follows {}'s swap-out but declares no NOINTRO chain", names[nxt], names[i]));
        }
        let Some(d) = &r.double_intro else { continue };
        let prev = (i + n - 1) % n;
        if d.exit.is_none() && opener_chain(prev).is_none() {
            return Some(format!("{} plays during {}'s double Intro but declares no NOINTRO chain", names[prev], names[i]));
        }
        if d.exit.is_none() && rotations[0].double_intro.is_some() {
            return Some(format!("{}: a swap-form double Intro can't play in a team whose leader has a double Intro", names[i]));
        }
        let third_pairs = rotations.get(2).and_then(|r| r.double_intro.as_ref()).map_or(false, |d| d.exit.is_some());
        if d.exit.is_some() && i == 1 && rotations[0].double_intro.is_none() && !third_pairs {
            return Some(format!("{}'s double Intro has nobody to hand back to", names[i]));
        }
    }
    None
}

/* ---------------------------------------------------------------------- the scheduler */

struct Sched<'a> {
    rotations: &'a [Rc<Rotation>],
    visited: Vec<bool>,
    out: Vec<Vec<RowId>>,
    section: usize,
    count: usize,
    closing: bool,
    awaiting: u32,
    close_pending: bool,
    doubled: Vec<bool>,
    mained: Vec<usize>,
    cycle_start: usize,
    swapped: bool,
    handed_back: Option<usize>,
}

impl<'a> Sched<'a> {
    fn going(&self) -> bool {
        self.section + (if self.closing { 1 } else { 0 }) < self.count
    }
    fn place(&mut self, snaps: Vec<RowId>) {
        if self.closing {
            self.section += 1;
            self.closing = false;
            self.out.push(vec![]);
        }
        self.out[self.section].extend(snaps);
    }
    fn opener_chain(&self, i: usize) -> Option<Chain> {
        let r = &self.rotations[i];
        let main = r.openers[i].as_ref().or(r.opener.as_ref());
        if !self.visited[i] && r.first_opener.is_some() {
            r.first_opener.clone()
        } else {
            main.or(r.first_opener.as_ref()).cloned()
        }
    }
    fn intro_chain(&self, i: usize) -> Chain {
        let r = &self.rotations[i];
        let main = r.intros[i].as_ref().unwrap_or(&r.intro);
        if !self.visited[i] && r.first_intro.is_some() {
            r.first_intro.clone().unwrap()
        } else {
            main.clone()
        }
    }
    fn arrival(&mut self, e: &Eng, i: usize) -> Chain {
        if !self.swapped {
            return self.intro_chain(i);
        }
        self.swapped = false;
        match self.opener_chain(i) {
            Some(c) => c,
            None => panic!("{} is swapped into but declares no NOINTRO chain", e.members[i].name),
        }
    }
    fn close_if_pending(&mut self) {
        if self.awaiting > 0 || !self.close_pending {
            return;
        }
        self.close_pending = false;
        self.closing = true;
    }
}

impl Eng {
    fn run_chain(&mut self, s: &mut Sched, i: usize, chain: &Chain) {
        self.active = i;
        if self.members[i].resonator.is_none() {
            panic!("{} outros but has no Resonator equipped", self.members[i].name);
        }
        self.outro_dir = if chain.entry == Entry::Double { -1 } else { 1 };
        s.visited[i] = true;
        if chain.entry != Entry::Double {
            if s.mained.is_empty() {
                s.cycle_start = i;
            }
            if !s.mained.contains(&i) {
                s.mained.push(i);
            }
        }
        s.swapped = chain.exit.is_none();
        let mut list = vec![];
        if chain.entry == Entry::Intro || chain.entry == Entry::Double {
            list.push(chain.cast.clone().expect("an Intro chain with no Intro cast"));
        }
        list.extend(chain.body.iter().cloned());
        if let Some(x) = &chain.exit {
            list.push(x.clone());
        }
        let snaps = self.run(&list, false);
        self.outro_dir = 1;
        if s.swapped {
            self.active = (i + 1) % s.rotations.len();
        }
        s.place(snaps);
        if i == s.rotations.len() - 1 && chain.entry != Entry::Double {
            if s.awaiting > 0 {
                s.close_pending = true;
            } else {
                s.closing = true;
            }
        }
    }

    fn visit(&mut self, s: &mut Sched, i: usize) {
        let n = s.rotations.len();
        let from = s.handed_back.take();
        let nxt = (i + 1) % n;
        if s.mained.contains(&i) {
            if i != s.cycle_start || s.mained.len() < n {
                self.active = nxt;
                return;
            }
            s.mained.clear();
        }
        let mut giver = from.unwrap_or((i + n - 1) % n);
        let pre_visit_due = |s: &Sched, at: usize| !s.mained.contains(&at) && !s.doubled[at] && s.rotations[at].double_intro.as_ref().map_or(false, |d| d.exit.is_some());
        let paired = !s.mained.is_empty() && pre_visit_due(s, i) && pre_visit_due(s, nxt);
        let d = if !s.mained.is_empty() && !s.mained.contains(&nxt) && !paired { s.rotations[nxt].double_intro.clone() } else { None };
        if let Some(d) = d {
            if !s.doubled[nxt] {
                s.doubled[nxt] = true;
                if d.exit.is_some() {
                    self.run_chain(s, nxt, &d);
                    giver = nxt;
                } else {
                    self.active = nxt;
                    self.outro_dir = -1;
                    let mut list = vec![d.cast.clone().unwrap()];
                    list.extend(d.body.iter().cloned());
                    let snaps = self.run(&list, false);
                    s.place(snaps);
                    self.outro_dir = 1;
                    self.active = i;
                    let c = s.opener_chain(i).unwrap();
                    self.run_chain(s, i, &c);
                    return;
                }
            }
        }
        let own = if !s.mained.is_empty() { s.rotations[i].double_intro.clone() } else { None };
        let mut waited = false;
        if let Some(own) = own {
            if own.exit.is_some() && !s.doubled[i] {
                s.doubled[i] = true;
                self.run_chain(s, i, &own);
                s.handed_back = Some(i);
                self.active = if paired { nxt } else { giver };
                s.mained.retain(|&x| x != i);
                s.awaiting += 1;
                waited = true;
                while self.active != i && !s.mained.contains(&i) && s.going() && self.er_short.is_none() {
                    let a = self.active;
                    self.visit(s, a);
                }
                s.awaiting -= 1;
                if s.mained.contains(&i) {
                    s.close_if_pending();
                    return;
                }
            }
        }
        s.doubled[i] = false;
        let c = s.arrival(self, i);
        self.run_chain(s, i, &c);
        if waited {
            s.close_if_pending();
        }
    }

    /// rotation.ts's runRotations(): the sections, and the frame the fight ends on.
    pub fn run_rotations(&mut self, rotations: &[Rc<Rotation>], count: usize) -> (Vec<Vec<RowId>>, f64) {
        let names: Vec<String> = (0..self.nslots).map(|i| self.members[i].name.clone()).collect();
        if let Some(why) = team_playable(rotations, &names) {
            panic!("{}", why);
        }
        let n = rotations.len();
        let mut s = Sched {
            rotations,
            visited: vec![false; n],
            out: vec![vec![]],
            section: 0,
            count,
            closing: false,
            awaiting: 0,
            close_pending: false,
            doubled: vec![false; n],
            mained: vec![],
            cycle_start: 0,
            swapped: false,
            handed_back: None,
        };
        let starters: Vec<usize> = (0..n).filter(|&i| rotations[i].start[i].is_some()).collect();
        for k in 0..starters.len() {
            let i = starters[k];
            let next = starters.get(k + 1).copied().unwrap_or(0);
            self.active = i;
            let opening = rotations[i].start[i].clone().unwrap();
            let last = opening.last().unwrap().clone();
            let chain = if next == i && self.leaves_field(&last) {
                let mut c = opening[..opening.len() - 1].to_vec();
                c.push(self.stays_on_field(&last));
                c
            } else {
                opening
            };
            let rows = self.run(&chain, false);
            s.out[s.section].extend(rows);
            self.active = next;
        }
        let opener = s.opener_chain(0).unwrap();
        self.run_chain(&mut s, 0, &opener);

        if rotations[0].double_intro.is_some() {
            let mut first = true;
            let mut trips = 0;
            while s.going() && self.er_short.is_none() {
                trips += 1;
                if trips > 1000 {
                    panic!("rotation scheduler never closed its sections");
                }
                let mut i = if first { 1 } else { 0 };
                while i < n && s.going() {
                    if let Some(d) = rotations[i].double_intro.clone() {
                        self.run_chain(&mut s, i, &d);
                    }
                    i += 1;
                }
                first = false;
                let mut i = 0;
                while i < n && s.going() {
                    let c = s.arrival(self, i);
                    self.run_chain(&mut s, i, &c);
                    i += 1;
                }
            }
        } else {
            let mut guard = 0;
            while s.going() && self.er_short.is_none() {
                guard += 1;
                if guard > 1000 {
                    panic!("rotation scheduler never closed its sections");
                }
                let a = self.active;
                self.visit(&mut s, a);
            }
        }
        let end = self.frame.max(self.plays_to) + SWAP_DELAY;
        if !self.timed.is_empty() {
            let rows = self.run(&[], true);
            s.out[s.section].extend(rows);
        }
        (s.out, end)
    }
}

/// The cuts and swap forms a rotation writes on an entry (`X.cancel()`, `X.instaSwap()`, ...).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Form {
    Cancel,
    EasyCancel,
    DodgeCancel,
    Jump,
    InstaCancel,
    InstaDodge,
    InstaJump,
    SwapCancel,
    InstaSwap,
    HitCancel,
    DodgeOnHit,
    JumpOnHit,
}

impl Eng {
    /// `w` written in `form`: a press's own form, or a group's (on its last press).
    pub fn form(&mut self, w: &W, form: Form) -> W {
        match w {
            W::A(a) => {
                let a = *a;
                match form {
                    Form::Cancel => W::Cut(a, Tag::Cancel),
                    Form::EasyCancel => W::Cut(a, Tag::EasyCancel),
                    Form::DodgeCancel => self.dodge_cancel(a),
                    Form::Jump => self.jump_cancel(a),
                    Form::InstaCancel => self.insta_cancel(a),
                    Form::InstaDodge => self.insta_dodge(a),
                    Form::InstaJump => self.insta_jump(a),
                    Form::SwapCancel => self.swap_w(a),
                    Form::InstaSwap => self.insta_swap_w(a),
                    Form::HitCancel => self.hit_cancel(a),
                    Form::DodgeOnHit => self.dodge_on_hit(a),
                    Form::JumpOnHit => self.jump_on_hit(a),
                }
            }
            W::G(_) => self.group_last(w, move |e, last| e.form(last, form)),
            W::Cut(..) => panic!("an entry already cut can't be cut again"),
        }
    }
}

/** Mainslot echoes and sonatas from Lahairoi (versions 2.8-3.4), plus the 3.5-3.6 pieces that
 *  have no region file of their own yet (Hyvatia, Reactor Husk, Spacetrek Explorer, Hiyuki's own
 *  Voidborne Construct/Glommoth/Wishes of Quiet Snowfall, the sonatas in the middle, and the
 *  Cyberpunk collab echo at the bottom) — split them out when that
 *  region gets a name. Buling and Lucilla, also
 *  Lahairoi-era, own no mainslot echo/sonata of their own — Lucilla reuses Bell-Borne
 *  Geochelone/Moonlit Clouds from jinzhou.ts and Dream of the Lost from septimont.ts. */
import { isType,
  Buff, Sonata, Sonata2pc, Mainslot, Action, Stat, Attribute, Type1, Cast, Scaling,
  addStat, applyCurrent, applyTeam, casting, currentAction, getStat, queue, queueOutro, removeStack, revokeCurrent, revokeTeam,
  frozenStacks, stacksOf, isHeld,
  lostOnSwap,
  isCast,
} from "../engine/kit.js";
import { applied, appliedByMe } from "../engine/kit.js";
import { SHIELD, FUSION_BURST, HEALS, GLACIO_CHAFE, HAVOC_BANE } from "../shared/status.js";
import { TUNE_HACK_SHIFTING, TUNE_RUPTURE_SHIFTING, TUNE_STRAIN_SHIFTING } from "../shared/tunebreak.js";

/* ------------------------------------------------------------------------------ Sigrika, 3.2 */

/** Nameless Explorer, Sigrika's own mainslot echo — flat Aero/Echo Skill DMG Bonus for whoever
 *  wears it, no trigger. */
export const ACTION_NAMELESS_EXPLORER = new Action("Echo - Nameless Explorer", {
  cast: Cast.Echo, element: Attribute.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6, energy: 3.8,
});
export const NAMELESS_EXPLORER = new Mainslot({
  name: "Nameless Explorer",
  action: ACTION_NAMELESS_EXPLORER,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Aero); addStat(Stat.DmgBonus, 20, Type1.Echo); },
});

/** Sound of True Name, Sigrika's own sonata (paired directly with Nameless Explorer above).
 *  2pc: +10% Aero DMG Bonus flat. 5pc: dealing Echo Skill DMG grants +20% Echo Skill Crit Rate
 *  and +15% Aero DMG Bonus for 5s — short window, lost after the outro action gains stats. */
export const SOUND_OF_TRUE_NAME_2PC = new Sonata2pc({ name: "Sound of True Name 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Aero) });
export const SOUND_OF_TRUE_NAME_BUFF = new Buff({
  name: "Sound of True Name 5pc",
  applyStats: () => { addStat(Stat.CritRate, 20, Type1.Echo); addStat(Stat.DmgBonus, 15, Attribute.Aero); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(SOUND_OF_TRUE_NAME_BUFF); },
});
export const SOUND_OF_TRUE_NAME_5PC = new Sonata({
  name: "Sound of True Name 5pc",
  updateBuffs: () => { if (isType(Type1.Echo)) applyCurrent(SOUND_OF_TRUE_NAME_BUFF, 1); },
});

/* -------------------------------------------------------------------------------- Lynae, 3.6 */

/** Hyvatia: ten lasers at 27.36% apiece. */
export const ACTION_HYVATIA = new Action("Echo - Hyvatia", {
  cast: Cast.Echo, element: Attribute.Spectro, scaling: Scaling.Atk, type: Type1.Echo,
  mv: 27.36 * 10,
  updateBuffs: () => queueOutro(HYVATIA_HANDOFF),
});

/** Its own handoff: an Outro within 15s of the summon hands the next resonator's Intro +10%
 *  All-Attribute DMG Bonus for 15s. Modelled the way every other echo handoff here is — queued
 *  onto the outro rather than tracking the 15s window, which a rotation never misses. */
export const HYVATIA_HANDOFF = new Buff({
  name: "Hyvatia: Outro",
  applyStats: () => addStat(Stat.DmgBonus, 10),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(HYVATIA_HANDOFF); },
});

export const HYVATIA = new Mainslot({
  name: "Hyvatia",
  action: ACTION_HYVATIA,
});

/* ------------------------------------------------------------------------------- Mornye, 3.6 */

/** Reactor Husk: one heavy slash at 351%, and a flat +10% Energy Regen for whoever wears it —
 *  which is the reason Mornye wants it, her Liberation turning every point of ER past 100% into
 *  crit. */
export const ACTION_REACTOR_HUSK = new Action("Echo - Reactor Husk", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 351, active: false,
});
export const REACTOR_HUSK = new Mainslot({
  name: "Reactor Husk",
  action: ACTION_REACTOR_HUSK,
  constantStats: () => addStat(Stat.Er, 10),
});

/** Spacetrek Explorer: a 10%-of-Max-HP team shield and nothing else — no damage of its own, so
 *  only the cast exists here. Kept because it is a real mainslot option for a sustain build. */
export const ACTION_SPACETREK = new Action("Echo - Spacetrek Explorer", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Atk, updateDebuffs: () => applyCurrent(SHIELD, 1)
});
export const SPACETREK_EXPLORER = new Mainslot({
  name: "Spacetrek Explorer",
  action: ACTION_SPACETREK,
});

/* ------------------------------------------------------------------------------- Hiyuki, 3.6 */

/** Reminiscence: Threnodian - Voidborne Construct, Hiyuki's own mainslot echo: Aleph-1's Creation
 *  lands five 21.88% Glacio hits and one 164.16%. The main-slot wearer also gets a flat +12%
 *  Glacio DMG Bonus and +12% Resonance Liberation DMG Bonus. */
export const ACTION_VOIDBORNE_CONSTRUCT = new Action("Echo - Reminiscence: Voidborne Construct", {
  cast: Cast.Echo, element: Attribute.Glacio, scaling: Scaling.Atk, type: Type1.Echo,
  mv: 21.88 * 5 + 164.16, energy: 0.12 * 5 + 1.36,
});
export const VOIDBORNE_CONSTRUCT = new Mainslot({
  name: "Reminiscence: Threnodian - Voidborne Construct",
  action: ACTION_VOIDBORNE_CONSTRUCT,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Glacio); addStat(Stat.DmgBonus, 12, Type1.Liberation); },
});

/** Glommoth: one 273.6% Glacio stomp, and an Outro within 15s of the summon hands the incoming
 *  resonator +12% Glacio DMG Bonus for 15s — queued onto the outro rather than tracking the
 *  window, the same way Hyvatia's own handoff above is. */
export const ACTION_GLOMMOTH = new Action("Echo - Glommoth", {
  cast: Cast.Echo, element: Attribute.Glacio, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6, energy: 3.8,
  updateBuffs: () => queueOutro(GLOMMOTH_HANDOFF),
});
export const GLOMMOTH_HANDOFF = new Buff({
  name: "Glommoth: Outro",
  applyStats: () => addStat(Stat.DmgBonus, 12, Attribute.Glacio),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(GLOMMOTH_HANDOFF); },
});
export const GLOMMOTH = new Mainslot({
  name: "Glommoth",
  action: ACTION_GLOMMOTH,
});

/** Wishes of Quiet Snowfall, the Glacio Chafe sonata (paired with either echo above). 2pc: +10%
 *  Glacio DMG Bonus flat. 5pc: inflicting Glacio Chafe grants +10% Glacio DMG for 15s, and — once
 *  every 25s — Snowfall, which is then spent one of two ways and one only. Dealing Resonance
 *  Liberation DMG spends it for +25% Crit. Rate (6s, extended 4s by every Liberation hit after,
 *  up to six times, so it stands for the rest of the visit); casting an Outro instead spends it
 *  to hand the incoming resonator +25% Glacio DMG Bonus. The Liberation branch is what actually
 *  reaches it — the kits that wear this deal Resonance Liberation DMG long before their outro —
 *  so that is the one modelled, and the outro branch is left out rather than double-counted. The
 *  25s the grant sits behind carries no stat of its own, so nothing here counts it off. */
export const QUIET_SNOWFALL_2PC = new Sonata2pc({ name: "Wishes of Quiet Snowfall 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Glacio) });
export const QUIET_SNOWFALL_5PC = new Sonata({
  name: "Wishes of Quiet Snowfall 5pc",
  // `appliedByMe`: a "when *you* inflict" payout, so the two extra stacks Lucilla's Film Roll
  // adds to the wearer's own are hers and pay nothing here
  updateBuffs: () => {
    if (appliedByMe(GLACIO_CHAFE) && !isHeld(SNOWFALL_CRIT)) { 
      applyCurrent(QUIET_SNOWFALL_GLACIO, 1); 
      applyCurrent(SNOWFALL, 1); 
    }
  },
});

export const QUIET_SNOWFALL_GLACIO = new Buff({
  name: "Wishes of Quiet Snowfall (chafe)",
  applyStats: () => addStat(Stat.DmgBonus, 10, Attribute.Glacio),
});

/** The marker itself — carries no stat, it is only ever the thing one of the two branches spends. */
export const SNOWFALL = new Buff({ 
  name: "Wishes of Quiet Snowfall: Snowfall" ,
  updateBuffs: () => {
    if (casting(Cast.Outro)) {
      revokeCurrent(SNOWFALL); 
      queueOutro(SNOWFALL_OUTRO);
    } else if (isType(Type1.Liberation)) { 
      revokeCurrent(SNOWFALL); 
      applyCurrent(SNOWFALL_CRIT, 1); 
    }
  },
});

export const SNOWFALL_CRIT = new Buff({
  name: "Wishes of Quiet Snowfall (liberation)",
  applyStats: () => addStat(Stat.CritRate, 25),
});

export const SNOWFALL_OUTRO = new Buff({
  name: "Wishes of Quiet Snowfall (outro)",
  applyStats: () => addStat(Stat.DmgBonus, 25, Attribute.Glacio),
});

/* --------------------------------------------------------------------------- 3.5-3.6 sonatas */

/** Pact of Neonlight Leap. 2pc: +10% Spectro DMG Bonus flat. 5pc: the classic Outro→Intro
 *  handoff — the incoming resonator gets +15% ATK, plus 0.3% more per point of their own Tune
 *  Break Boost, capped at another +15% (50 points), for 15s or until switched out — the
 *  receiver's own outro is both, so it's the Moonlit Clouds shape. */
export const NEONLIGHT_LEAP_2PC = new Sonata2pc({ name: "Pact of Neonlight Leap 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Spectro) });
export const NEONLIGHT_LEAP_5PC = new Sonata({
  name: "Pact of Neonlight Leap 5pc",
  updateBuffs: () => { if (casting(Cast.Outro)) queueOutro(NEONLIGHT_LEAP_HANDOFF); },
});
export const NEONLIGHT_LEAP_HANDOFF = new Buff({
  name: "Pact of Neonlight Leap (outro)",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => addStat(Stat.BonusAtk, 15),
  // the TBB half is read late so every contribution has landed this action — the era's flat 10,
  // Reel of Spliced Memories' +20, and Denia's Etched Colors, which grants from its own
  // convertStats() and an ordinary convertStats() here would race
  lateConvertStats: () => {
    addStat(Stat.BonusAtk, Math.min(15, 0.3 * getStat(Stat.Tbb)));
  },
});

/** Halo of Starry Radiance, Mornye's own sonata. 2pc: +10% Healing Bonus flat. 5pc: healing a
 *  teammate grants the whole team ATK, 0.2% per 1% of the healer's own Off-Tune Buildup Rate —
 *  taken at the 25% cap per CLAUDE.md's own-stats rule (125% needed; base 100% plus Mornye's
 *  field's +50 clears it). 4s team window, so lost on the wearer's next intro. */
export const STARRY_RADIANCE_2PC = new Sonata2pc({ name: "Halo of Starry Radiance 2pc", constantStats: () => addStat(Stat.HealingBonus, 10) });
export const STARRY_RADIANCE_5PC = new Sonata({
  name: "Halo of Starry Radiance 5pc",
  updateBuffs: () => {
    if (applied(HEALS)) applyTeam(STARRY_RADIANCE_TEAM, 1);
  },
});
export const STARRY_RADIANCE_TEAM = new Buff({
  name: "Halo of Starry Radiance (team)",
  convertStats: () => {
    addStat(Stat.BonusAtk, Math.min(25, 0.2 * getStat(Stat.OfftuneBuildup)));
  }
});

/** Chromatic Foam. 2pc: +10% Fusion DMG Bonus flat. 5pc: inflicting Fusion Burst grants +10%
 *  Fusion DMG Bonus for 15s; while that window is up, the wearer's Outro hands the incoming
 *  resonator +25% Fusion DMG Bonus for 15s. */
export const CHROMATIC_FOAM_2PC = new Sonata2pc({ name: "Chromatic Foam 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Fusion) });
export const CHROMATIC_FOAM_5PC = new Sonata({
  name: "Chromatic Foam 5pc",
  updateBuffs: () => { if (appliedByMe(FUSION_BURST)) applyCurrent(CHROMATIC_FOAM_BUFF, 1); },
});
export const CHROMATIC_FOAM_BUFF = new Buff({
  name: "Chromatic Foam",
  applyStats: () => addStat(Stat.DmgBonus, 10, Attribute.Fusion),
  updateBuffs: () => { if (casting(Cast.Outro)) queueOutro(CHROMATIC_FOAM_HANDOFF); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(CHROMATIC_FOAM_BUFF); }, // TODO last a bit longer for denia
});
export const CHROMATIC_FOAM_HANDOFF = new Buff({
  name: "Chromatic Foam (outro)",
  applyStats: () => addStat(Stat.DmgBonus, 25, Attribute.Fusion),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(CHROMATIC_FOAM_HANDOFF); },
});

/** Trailblazing Star, the other Fusion sonata of the era. 2pc: +10% Fusion DMG Bonus flat. 5pc:
 *  inflicting either Fusion Burst or Tune Rupture - Shifting grants +20% Crit. Rate and +20%
 *  Fusion DMG Bonus for 8s — a short self window, so lost after the outro. */
export const TRAILBLAZING_STAR_2PC = new Sonata2pc({ name: "Trailblazing Star 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Fusion) });
export const TRAILBLAZING_STAR_5PC = new Sonata({
  name: "Trailblazing Star 5pc",
  updateBuffs: () => {
    if (appliedByMe(FUSION_BURST) || appliedByMe(TUNE_RUPTURE_SHIFTING)) applyCurrent(TRAILBLAZING_STAR_BUFF, 1);
  },
});
export const TRAILBLAZING_STAR_BUFF = new Buff({
  name: "Trailblazing Star",
  applyStats: () => { addStat(Stat.CritRate, 20); addStat(Stat.DmgBonus, 20, Attribute.Fusion); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(TRAILBLAZING_STAR_BUFF); },
});

/** Rite of Gilded Revelation, Luuk's own sonata. 2pc: +10% Spectro DMG Bonus flat. 5pc: dealing
 *  Basic Attack DMG grants +10% Spectro DMG Bonus a stack, up to 3, 5s each — short windows, lost
 *  after the outro. At 3 frozenStacks, casting Resonance Liberation grants +40% Basic Attack DMG Bonus;
 *  the page states no duration for it, so it's a short self buff like the frozenStacks, lost after the
 *  outro, and pays into the Liberation itself when that deals Basic Attack DMG. */
export const GILDED_REVELATION_2PC = new Sonata2pc({ name: "Rite of Gilded Revelation 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Spectro) });
export const GILDED_REVELATION_5PC = new Sonata({
  name: "Rite of Gilded Revelation 5pc",
  updateBuffs: () => {
    if (isType(Type1.Basic)) applyCurrent(GILDED_REVELATION_STACKS, 1);
  },
});
export const GILDED_REVELATION_STACKS = new Buff({
  name: "Rite of Gilded Revelation", maxStacks: 3,
  applyStats: () => {
    addStat(Stat.DmgBonus, 10 * frozenStacks(), Attribute.Spectro);
    if (frozenStacks() >= 3 && casting(Cast.Liberation)) addStat(Stat.DmgBonus, 40, Type1.Basic);
  },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(GILDED_REVELATION_STACKS); },
});

/* --------------------------------------------------------------------------------- Luuk, 3.6 */

/** Twin Nova: Nebulous Cannon, Luuk's own mainslot echo: two 80.51% Spectro slashes, and a flat
 *  +12% Spectro DMG Bonus and +12% Basic Attack DMG Bonus for whoever wears it. Its pairing with
 *  Twin Nova: Collapsar Blade (alternating casts, Dyad Origins off Basic/Skill casts) needs the
 *  Blade in a second 4-cost slot and the Blade's own hit count, which the page doesn't give — not
 *  modelled; this is the Cannon on its own. */
export const ACTION_NEBULOUS_CANNON = new Action("Echo - Twin Nova: Nebulous Cannon", {
  cast: Cast.Echo, element: Attribute.Spectro, scaling: Scaling.Atk, type: Type1.Echo, mv: 80.51 * 2, energy: 0.55 * 2, active: false,
});
export const NEBULOUS_CANNON = new Mainslot({
  name: "Twin Nova: Nebulous Cannon",
  action: ACTION_NEBULOUS_CANNON,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Spectro); addStat(Stat.DmgBonus, 12, Type1.Basic); },
});

/* -------------------------------------------------------------------------------- Denia, 3.6 */

/** Reminiscence: Denia — "Trickster", her own mainslot echo: one 273.6% Fusion hit, and an Outro
 *  within 15s of the summon hands the incoming resonator +12% Fusion DMG Bonus for 15s — queued
 *  onto the outro the way every other echo handoff here is. Pairs with Chromatic Foam above. */
export const ACTION_TRICKSTER = new Action("Echo - Trickster", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6, energy: 3.8,
  updateBuffs: () => queueOutro(TRICKSTER_HANDOFF),
});
export const TRICKSTER_HANDOFF = new Buff({
  name: "Trickster: Outro",
  applyStats: () => addStat(Stat.DmgBonus, 12, Attribute.Fusion),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(TRICKSTER_HANDOFF); },
});
export const TRICKSTER = new Mainslot({
  name: "Reminiscence: Denia",
  action: ACTION_TRICKSTER,
});

/** Voidwing Moth: a 405% Spectro tap, or held on for twelve more 49.33% hits. The tap is what a
 *  rotation places (the hold is a long channel), the hold kept as its own cast. Either way an
 *  Outro within 15s hands the incoming resonator +12% ATK for 15s. */
export const ACTION_VOIDWING_MOTH = new Action("Echo - Voidwing Moth", {
  cast: Cast.Echo, element: Attribute.Spectro, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.62,
  updateBuffs: () => queueOutro(VOIDWING_HANDOFF),
});
export const VOIDWING_HANDOFF = new Buff({
  name: "Voidwing Moth: Outro",
  applyStats: () => addStat(Stat.BonusAtk, 12),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(VOIDWING_HANDOFF); },
});
export const VOIDWING_MOTH = new Mainslot({
  name: "Voidwing Moth",
  action: ACTION_VOIDWING_MOTH,
});

/** Reel of Spliced Memories, Voidwing Moth's own sonata. 2pc: +10% ATK flat. 5pc: the wearer
 *  inflicting Tune Rupture/Strain - Shifting grants the
 *  whole team +20 Tune Break Boost for 30s — permanent uptime, same name doesn't stack. The real
 *  stat, so tuneStrainBonus() and the damage formula's own tbbFactor both see it. */
export const REEL_2PC = new Sonata2pc({ name: "Reel of Spliced Memories 2pc", constantStats: () => addStat(Stat.BonusAtk, 10) });
export const REEL_5PC = new Sonata({
  name: "Reel of Spliced Memories 5pc",
  updateBuffs: () => { if (appliedByMe(TUNE_RUPTURE_SHIFTING) || appliedByMe(TUNE_STRAIN_SHIFTING)) applyTeam(REEL_TEAM, 1); },
});
export const REEL_TEAM = new Buff({ name: "Reel of Spliced Memories (team)", applyStats: () => addStat(Stat.Tbb, 20) });

/* ---------------------------------------------------------------- Rebecca and Lucy, the collab */

/** "Reminiscence - Nightmare: Adam Smasher" is one echo with three casts — a generic 16-hit
 *  Physical one for anybody else, and a special one each for the two resonators who unlock it. Only
 *  the two special forms exist here, as a Mainslot apiece, because a Mainslot carries exactly one
 *  Action and the two differ in element as well as shape (Lucy's single 273.6% Spectro slam,
 *  Rebecca's 16 x 17.10% Electro missile volley). Both also carry a flat +15% Crit. Rate.
 *
 *  Its sonata, Shadow of Shattered Dreams, has a *one*-piece bonus and nothing else, so it rides on
 *  the mainslot itself (there is no 5pc/2pc pair to equip) and the other four echoes go to two
 *  ordinary 2-piece sets instead — see each resonator's own `echoLoadouts`. Inflicting Hack -
 *  Shifting grants +35% Basic Attack DMG Bonus and +35% Heavy Attack DMG Bonus for 15s — a short
 *  self window, so lost after the outro. */
export const SHATTERED_DREAMS = new Buff({
  name: "Shadow of Shattered Dreams 1pc",
  applyStats: () => { addStat(Stat.DmgBonus, 35, Type1.Basic); addStat(Stat.DmgBonus, 35, Type1.Heavy); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(SHATTERED_DREAMS); },
});

export const ACTION_ADAM_SMASHER_LUCY = new Action("Echo - Adam Smasher", {
  cast: Cast.Echo, element: Attribute.Spectro, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6, energy: 3.8,
});
export const ADAM_SMASHER_LUCY = new Mainslot({
  name: "Reminiscence - Nightmare: Adam Smasher",
  action: ACTION_ADAM_SMASHER_LUCY,
  constantStats: () => addStat(Stat.CritRate, 15),
  updateBuffs: () => { if (appliedByMe(TUNE_HACK_SHIFTING)) applyCurrent(SHATTERED_DREAMS, 1); },
});

export const ACTION_ADAM_SMASHER_REBECCA = new Action("Echo - Adam Smasher", {
  cast: Cast.Echo, element: Attribute.Electro, scaling: Scaling.Atk, type: Type1.Echo,
  mv: 17.1 * 16, energy: 0.23 * 16,
});
export const ADAM_SMASHER_REBECCA = new Mainslot({
  name: "Reminiscence - Nightmare: Adam Smasher",
  action: ACTION_ADAM_SMASHER_REBECCA,
  constantStats: () => addStat(Stat.CritRate, 15),
  updateBuffs: () => { if (appliedByMe(TUNE_HACK_SHIFTING)) applyCurrent(SHATTERED_DREAMS, 1); },
});

/** Mainslot echoes and sonatas from Mengzhou (versions 3.5-3.8). */
import { Stat, Attribute, Type1, Cast, Scaling } from "../engine/stats.js";
import { Buff, Sonata, Sonata2pc, Mainslot, EchoType } from "../engine/gear.js";
import {
  addStat,
  frozenStacks,
  applyCurrent,
  applyTeam,
  queue,
  removeStack,
  revokeTeam,
  currentAction,
  casting,
  revokeCurrent,
  triggeredAction,
  queueOutro,
  currentMember,
} from "../engine/context.js";
import { Action } from "../engine/rotation.js";
import { applied, appliedByMe } from "../engine/context.js";
import { SHIELD, HAVOC_BANE, GLACIO_CHAFE, ELECTRO_FLARE, HEALS } from "../shared/status.js";
import { handoff } from "../shared/helpers.js";
import { gainedUnison, unisonResponse } from "../shared/unison.js";
import { TUNE_STRAIN_SHIFTING } from "../shared/tunebreak.js";

/* ------------------------------------------------------------------------------ Jingran, 3.6 */

/** Myriad Snare, Jingran's own mainslot echo — flat Fusion/Heavy Attack DMG Bonus for whoever
 *  wears it, no trigger. */
export const ACTION_MYRIAD_SNARE = new Action("Echo - Myriad Snare", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Hp, type: Type1.Echo, mv: 17.23, energy: 3.8,
});
export const MYRIAD_SNARE = new Mainslot({
  name: "Myriad Snare",
  action: ACTION_MYRIAD_SNARE,
  echoType: EchoType.SUMMON,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Fusion); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/** Lamp of Nether Road, Jingran's own sonata (paired directly with Myriad Snare above). 5pc: a
 *  shield grants 5% crit rate, four frozenStacks, full four pay 15% fusion damage on top. 2pc: +10%
 *  Bonus HP flat. Short window, so it still counts on the wearer's own outro (see jinzhou.ts's
 *  HERON_HANDOFF), then is lost. */
export const LAMP_STACKS = new Buff({
  name: "Lamp of Nether Road", maxStacks: 4,
  applyStats: () => {
    addStat(Stat.CritRate, 5 * frozenStacks());
    if (frozenStacks() >= 4) addStat(Stat.DmgBonus, 15, Attribute.Fusion);
  },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(LAMP_STACKS); },
});
export const LAMP_2PC = new Sonata2pc({ name: "Lamp of Nether Road 2pc", constantStats: () => addStat(Stat.BonusHp, 10) });
export const LAMP_5PC = new Sonata({
  name: "Lamp of Nether Road 5pc",
  sonata2pc: LAMP_2PC,
  updateBuffs: () => { if (applied(SHIELD)) applyCurrent(LAMP_STACKS, applied(SHIELD)); },
});

/* ----------------------------------------------------------------------------- Qingxiao, 3.6 */

/** Calamity Effigy, Qingxiao's own mainslot echo: one 405% Aero hit. Whoever wears it gets +10%
 *  Aero DMG Bonus flat, and +10% more for 15s on inflicting Tune Strain - Shifting — short and
 *  their own, so lost after the outro. Pairs with Heart of Evil's Purge below. */
export const ACTION_CALAMITY_EFFIGY = new Action("Echo - Calamity Effigy", {
  cast: Cast.Echo, element: Attribute.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.62,
});
export const CALAMITY_EFFIGY_STRAIN = new Buff({
  name: "Calamity Effigy (strain)",
  applyStats: () => addStat(Stat.DmgBonus, 10, Attribute.Aero),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(CALAMITY_EFFIGY_STRAIN); },
});
export const CALAMITY_EFFIGY = new Mainslot({
  name: "Calamity Effigy",
  action: ACTION_CALAMITY_EFFIGY,
  echoType: EchoType.TRANSFORM,
  constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Aero),
  updateBuffs: () => { if (appliedByMe(TUNE_STRAIN_SHIFTING)) applyCurrent(CALAMITY_EFFIGY_STRAIN, 1); },
});

/** Heart of Evil's Purge, Calamity Effigy's own sonata. 2pc: +10% Aero DMG Bonus flat. 5pc:
 *  inflicting Tune Strain - Shifting grants +20% Crit. DMG and +30% Aero DMG Bonus for 15s — the
 *  wearer's own short window, lost after the outro. */
export const HEART_OF_EVILS_PURGE_2PC = new Sonata2pc({ name: "Heart of Evil's Purge 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Aero) });
export const HEART_OF_EVILS_PURGE_5PC = new Sonata({
  name: "Heart of Evil's Purge 5pc",
  sonata2pc: HEART_OF_EVILS_PURGE_2PC,
  updateBuffs: () => { if (appliedByMe(TUNE_STRAIN_SHIFTING)) applyCurrent(HEART_OF_EVILS_PURGE_BUFF, 1); },
});
export const HEART_OF_EVILS_PURGE_BUFF = new Buff({
  name: "Heart of Evil's Purge",
  applyStats: () => { addStat(Stat.CritDmg, 20); addStat(Stat.DmgBonus, 30, Attribute.Aero); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(HEART_OF_EVILS_PURGE_BUFF); },
});

/* ------------------------------------------------------------------ Yangyang: Xuanling */

/** Thousand-Puppet Pavilion, Yangyang: Xuanling's own mainslot echo. The cast itself is one 60.80%
 *  Havoc hit that also summons 4 Blades of Thousand Memories for 15s; while any are out, the
 *  wearer inflicting Havoc Bane spends one for a 22.80% Havoc hit — `appliedByMe`, so a stack
 *  Chisa's Thread of Bane hands out off the wearer's swing is hers and spends no blade. The blade's own 1s cooldown isn't modelled — nothing here has a
 *  clock — but the four blades are, as the buff's own stacks, so a visit only ever cashes what the
 *  cast actually summoned, and never off a triggered action, which is what stops one blade's own
 *  hit from spending the next three beside a kit that inflicts on every hit. */
export const ACTION_THOUSAND_PUPPET_PAVILION = new Action("Echo - Thousand-Puppet Pavilion", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 	109.44, energy: 1.52,
  updateBuffs: () => queue(ACTION_BLADE_OF_THOUSAND_MEMORIES),
});
export const ACTION_BLADE_OF_THOUSAND_MEMORIES = new Action("Echo - Blade of Thousand Memories x4", {
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 41.04*4, energy: 0.57*4,
});
export const THOUSAND_PUPPET_PAVILION = new Mainslot({
  name: "Thousand-Puppet Pavilion",
  action: ACTION_THOUSAND_PUPPET_PAVILION,
  echoType: EchoType.SUMMON,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Havoc); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/** Song of Feathered Trace, Thousand-Puppet Pavilion's own sonata. 2pc: +10% Energy Regen flat.
 *  5pc has one branch per Negative Status, and a wearer only ever reaches one of them: inflicting
 *  Havoc Bane grants Xuanling's Feather (+20% Crit. Rate, +35% Heavy Attack DMG Bonus, 15s), and
 *  inflicting Glacio Chafe grants the whole team Chongming's Feather (+0.1% ATK per 1% of the
 *  wearer's own Energy Regen, capped at +25%, 10s). Both are short windows — the self one is lost
 *  after the outro, the team one on the wearer's next intro. Chongming's is taken at its own cap
 *  per CLAUDE.md's rule for a team buff scaled by the applier's own stats, the same way Halo of
 *  Starry Radiance takes its. Both branches read `appliedByMe`: they are "when *you* inflict"
 *  payouts, so a stack one of the markers that inflict off somebody else's cast adds (Chisa's
 *  Thread of Bane, Lucilla's Film Roll) belongs to that marker's owner, not to the wearer. */
export const FEATHERED_TRACE_2PC = new Sonata2pc({ name: "Song of Feathered Trace 2pc", constantStats: () => addStat(Stat.Er, 10) });
export const FEATHERED_TRACE_5PC = new Sonata({
  name: "Song of Feathered Trace 5pc",
  sonata2pc: FEATHERED_TRACE_2PC,
  updateBuffs: () => {
    if (appliedByMe(HAVOC_BANE)) applyCurrent(XUANLINGS_FEATHER, 1);
    if (appliedByMe(GLACIO_CHAFE)) applyTeam(CHONGMINGS_FEATHER, 1);
  },
});
export const XUANLINGS_FEATHER = new Buff({
  name: "Song of Feathered Trace: Xuanling's Feather",
  applyStats: () => { addStat(Stat.CritRate, 20); addStat(Stat.DmgBonus, 35, Type1.Heavy); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(XUANLINGS_FEATHER); },
});
export const CHONGMINGS_FEATHER = new Buff({
  name: "Song of Feathered Trace: Chongming's Feather",
  applyStats: () => addStat(Stat.BonusAtk, 25),
});

/* -------------------------------------------------------------------------------- Suisui, 3.6 */

/** Forbidden Bastion, Suisui's own mainslot echo: one 237.60% Glacio bash, and +10% Healing Bonus
 *  for whoever wears it — a healer's echo, so the flat half is a stat this calculator never reads
 *  (statuses.ts's own note on Healing Bonus). It carries no sonata of its own; Suisui pairs it
 *  with Song of Feathered Trace above, whose Chongming's Feather branch is written for exactly her
 *  — Glacio Chafe into an Energy-Regen-scaled team ATK buff. */
export const ACTION_FORBIDDEN_BASTION = new Action("Echo - Forbidden Bastion", {
  cast: Cast.Echo, element: Attribute.Glacio, scaling: Scaling.Atk, type: Type1.Echo, mv: 237.60, energy: 3.30,
});
export const FORBIDDEN_BASTION = new Mainslot({
  name: "Forbidden Bastion",
  action: ACTION_FORBIDDEN_BASTION,
  echoType: EchoType.SUMMON,
  constantStats: () => addStat(Stat.HealingBonus, 10),
});

/* ------------------------------------------------------------------------ Suoming and Hsin, 3.7 */

/** "Stay tuned" (encore's placeholder name — the echo has none yet), the 3.7 Electro mainslot:
 *  4 x 27.36% + 164.16% Electro for anybody, 5 x 13.68% + 232.56% when Hsin wears it — the one
 *  cast, with the difference added on when the wearer is her. Carries +10% Electro DMG Bonus flat,
 *  and inflicting Electro Flare, obtaining Unison or triggering Unison Response adds another +10%
 *  for 30s, so permanent once granted. Summon/transform is unconfirmed — the text says only "Cast
 *  Echo Skill to deal", the same wording as Nameless Explorer. */
export const STAY_TUNED_BUFF = new Buff({
  name: "Stay tuned 4c",
  applyStats: () => addStat(Stat.DmgBonus, 10, Attribute.Electro),
});
export const ACTION_STAY_TUNED = new Action("Echo - Stay tuned", {
  cast: Cast.Echo, element: Attribute.Electro, scaling: Scaling.Atk, type: Type1.Echo,
  mv: 27.36 * 4 + 164.16, energy: 0.38 * 4 + 2.28,
  applyStats: () => {
    if (currentMember().resonator?.name !== "Hsin") return;
    addStat(Stat.AddMv, 13.68 * 5 + 232.56 - (27.36 * 4 + 164.16));
    addStat(Stat.AddEnergy, 0.19 * 5 + 3.23 - (0.38 * 4 + 2.28));
  },
});
export const STAY_TUNED = new Mainslot({
  name: "Stay tuned 4c",
  action: ACTION_STAY_TUNED,
  echoType: EchoType.SUMMON,
  constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Electro),
  updateBuffs: () => { if (appliedByMe(ELECTRO_FLARE) || gainedUnison() || unisonResponse()) applyCurrent(STAY_TUNED_BUFF, 1); },
});

/** Soul of Despair (6000224, the 3-cost "Stay tuned"), Electro Rover's own mainslot: three
 *  91.18% Electro hits, and the Impermanence Heron shape — its cast primes an Outro handoff, the
 *  incoming resonator's +12% Electro DMG Bonus for 15s, long enough to outlast their own visit
 *  (helpers.ts's `handoff`). Text is the CN translation ("conductive" = Electro); encore's own
 *  data lists the hit once — the three instances are the CN text's. Summon by that text. */
export const ACTION_SOUL_OF_DESPAIR = new Action("Echo - Soul of Despair", {
  cast: Cast.Echo, element: Attribute.Electro, scaling: Scaling.Atk, type: Type1.Echo, mv: 91.18 * 3, energy: 1.26 * 3,
  updateBuffs: () => queueOutro(SOUL_OF_DESPAIR_HANDOFF),
});
export const SOUL_OF_DESPAIR = new Mainslot({
  name: "Soul of Despair",
  action: ACTION_SOUL_OF_DESPAIR,
  echoType: EchoType.SUMMON,
});
export const SOUL_OF_DESPAIR_HANDOFF = handoff("Soul of Despair: Outro", () => addStat(Stat.DmgBonus, 12, Attribute.Electro));

/** Heart of Sworn Vigil. 2pc: +10% Electro DMG Bonus flat. 5pc: inflicting Electro Flare,
 *  obtaining Unison or triggering Unison Response grants +15% Crit. Rate and +22.5% Electro DMG
 *  Bonus for 30s — permanent once granted. `appliedByMe`: a "when *you* inflict" payout, so a
 *  stack one of the markers adds off the wearer's swing pays nothing here. */
export const SWORN_VIGIL_2PC = new Sonata2pc({ name: "Heart of Sworn Vigil 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Electro) });
export const SWORN_VIGIL_5PC = new Sonata({
  name: "Heart of Sworn Vigil 5pc",
  sonata2pc: SWORN_VIGIL_2PC,
  updateBuffs: () => { if (appliedByMe(ELECTRO_FLARE) || gainedUnison() || unisonResponse()) applyCurrent(SWORN_VIGIL_BUFF, 1); },
});
export const SWORN_VIGIL_BUFF = new Buff({
  name: "Heart of Sworn Vigil",
  applyStats: () => { addStat(Stat.CritRate, 15); addStat(Stat.DmgBonus, 22.5, Attribute.Electro); },
});

/** Flash of Electric Reflection. 2pc: +10% Electro DMG Bonus flat. 5pc: inflicting Electro Flare
 *  grants +10% Electro DMG Bonus for 15s — a short self window, lost after the outro — and an
 *  Outro cast while it stands hands the incoming resonator +25% Electro DMG Bonus for 15s, the
 *  Impermanence Heron-style handoff that outlasts their own visit. */
export const ELECTRIC_REFLECTION_2PC = new Sonata2pc({ name: "Flash of Electric Reflection 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Electro) });
export const ELECTRIC_REFLECTION_5PC = new Sonata({
  name: "Flash of Electric Reflection 5pc",
  sonata2pc: ELECTRIC_REFLECTION_2PC,
  updateBuffs: () => { if (appliedByMe(ELECTRO_FLARE)) applyCurrent(ELECTRIC_REFLECTION_BUFF, 1); },
});
export const ELECTRIC_REFLECTION_BUFF = new Buff({
  name: "Flash of Electric Reflection",
  applyStats: () => addStat(Stat.DmgBonus, 10, Attribute.Electro),
  updateBuffs: () => { if (casting(Cast.Outro)) queueOutro(ELECTRIC_REFLECTION_HANDOFF); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(ELECTRIC_REFLECTION_BUFF); },
});
export const ELECTRIC_REFLECTION_HANDOFF = handoff("Flash of Electric Reflection: Outro", () => addStat(Stat.DmgBonus, 25, Attribute.Electro));

/** Formless Demon (6000223 — "Sound Remains" in the CN text), the 3.7 healing mainslot: one 273.60%
 *  Fusion hit ("Molten" DMG in the CN translation — unconfirmed against EN text), and +10% Energy
 *  Regen for whoever wears it. Pairs with Flower of Tinged Yearning below. Summon by its text
 *  ("summon the Formless Demon"). */
export const ACTION_FORMLESS_DEMON = new Action("Echo - Formless Demon", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6, energy: 3.8,
});
export const FORMLESS_DEMON = new Mainslot({
  name: "Formless Demon",
  action: ACTION_FORMLESS_DEMON,
  echoType: EchoType.SUMMON,
  constantStats: () => addStat(Stat.Er, 10),
});

/** Flower of Tinged Yearning. 2pc: +10% Healing Bonus flat. 5pc: healing a teammate grants the
 *  whole team +10% ATK for 30s — permanent uptime, and "effects of the same name cannot be
 *  stacked" is the one stack. While it stands, *any* member who obtains Unison or triggers Unison
 *  Response gains a further +15% ATK of their own — watched from the team buff itself, so it
 *  lands on whoever is acting, not on the wearer; no duration of its own is stated, so it is
 *  taken as the team effect's — permanent once granted. */
export const TINGED_YEARNING_2PC = new Sonata2pc({ name: "Flower of Tinged Yearning 2pc", constantStats: () => addStat(Stat.HealingBonus, 10) });
export const TINGED_YEARNING_5PC = new Sonata({
  name: "Flower of Tinged Yearning 5pc",
  sonata2pc: TINGED_YEARNING_2PC,
  updateBuffs: () => { if (applied(HEALS)) applyTeam(TINGED_YEARNING_TEAM, 1); },
});
export const TINGED_YEARNING_TEAM = new Buff({
  name: "Flower of Tinged Yearning",
  updateBuffs: () => { if (gainedUnison() || unisonResponse()) applyCurrent(TINGED_YEARNING_UNISON, 1); },
  applyStats: () => addStat(Stat.BonusAtk, 10),
});
export const TINGED_YEARNING_UNISON = new Buff({
  name: "Flower of Tinged Yearning (unison)",
  applyStats: () => addStat(Stat.BonusAtk, 15),
});

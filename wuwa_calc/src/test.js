/**
 * Engine tests.  node --test src/test.js
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  State, add, outro, queue, counter, gain, gainTeam, grantTeam, grantSelf,
} from "./state.js";
import { defineBuff, defineAction, defineChain, PRIORITY } from "./registry.js";
import { damage, constantStat, mvPercent } from "./damage.js";
import { collapseChains } from "./chain.js";
import { buildReport, renderReport, explain } from "./display.js";
import "./shared.js";
import {
  JINGRAN, JINGRAN_CONVERSION, WEAPON, MAINSLOT, SONATA_5PC, SONATA_2PC,
  LOADOUT, ROTATION, ECHO, CHIMEI, QI, MINGFIRE, FORTUNE, GHOST_SHROUD,
  EARTH_CHARM, BA_CHAIN, GAUGES, allyGainedShield, SHROUD_PER_ALLY_SHIELD,
} from "./resonators/jingran.js";
import {
  LOADOUT as IO_LOADOUT, LOADOUT_F2P as IO_LOADOUT_F2P,
  ROTATION as IO_ROTATION, ROTATION_MDPS as IO_ROTATION_MDPS,
  BA123 as IO_BA123, HEAVY_WINDOW, FORTE as IO_FORTE, BLESSING as IO_BLESSING,
} from "./resonators/iuno.js";
import {
  LOADOUT as SK_LOADOUT, LOADOUT_ALT as SK_LOADOUT_ALT,
  ROTATION as SK_ROTATION, BA123 as SK_BA123, BA1234 as SK_BA1234,
  REALM_BLUE, REALM_PURPLE, REALM_GOLD, VARIATION_READY, VARIATION_COOLDOWN,
} from "./resonators/shorekeeper.js";
import {
  CRIT_RATE, CRIT_DMG, ER, MV, DEF_IGNORE, FLAT_ATK, BONUS_HP, BONUS_ATK, COUNT_FUSION,
  DMG_BONUS, FUSION_DMG, SHIELDS, TBB, FORTE1, FORTE2, SPECIAL_AMP,
  ENERGY, CONCERTO, OFFTUNE, isPercent,
} from "./stats.js";

const levels = JSON.parse(readFileSync(new URL("../data/levels.json", import.meta.url), "utf8"));
const CONFIG = { level: 90, enemyLevel: 100, res: 20, maxOfftune: 39.2 };

const jingran = () => {
  const s = new State({ team: ["Jingran"], ...CONFIG });
  s.config.maxOfftune = CONFIG.maxOfftune;
  s.startFight({ Jingran: LOADOUT });
  return s;
};
const plain = (team, loadouts) => {
  const s = new State({ team, ...CONFIG });
  s.startFight(loadouts);
  return s;
};
const byId = (rows, id) => rows.find((r) => r.action.id === id);
const steps1000 = (hp, lo = 0, hi = 50000) =>
  Math.max(0, Math.floor((Math.min(hp, hi) - lo) / 1000));

/* --------------------------------------------------- innate stats per resonator */

describe("innate stats live in the resonator file", () => {
  test("Jingran carries the universal baseline himself", () => {
    const r = jingran().run(["Jingran: BA1"])[0];
    assert.equal(r.stat(ER), 100, "energy regen starts at 100%");
    assert.equal(r.stat(CRIT_DMG), 150, "crit damage is a total multiplier, not a bonus");
    // 5 innate + 8 his own. No shield stack: those need Earth Charm, which only the intro
    // or a resonance skill opens.
    assert.equal(r.stat(CRIT_RATE), 5 + 8);
  });

  test("a resonator with no gear at all contributes nothing", () => {
    defineAction("Bare: Hit", { source: "Bare", type: "basic", mv: 100 });
    const r = plain(["Bare"], { Bare: [] }).run(["Bare: Hit"])[0];
    assert.equal(r.stat(ER), 0, "there is no shared global buff");
    assert.equal(r.stat(CRIT_RATE), 0);
  });

  test("tune break boost is an ordinary ratio stat, like ER", () => {
    defineBuff("Tbb: source", { apply() { add(40, TBB); add(15, ER); } });
    defineAction("Tbb: Hit", { source: "Tbb", type: "basic", mv: 100 });
    const s = plain(["Tbb"], { Tbb: ["Tbb: source"] });
    const rows = s.run(["Tbb: Hit", "Tbb: Hit", "Tbb: Hit"]);
    assert.deepEqual(rows.map((r) => r.stat(TBB)), [40, 40, 40], "rebuilt, not accumulated");
    assert.equal(isPercent(TBB), true, "held in percent units");
    assert.equal(s.counter(TBB), 0, "not a counter");
  });
});

/* -------------------------------------------------------------------- Jingran */

describe("Jingran", () => {
  test("derives HP from base x (1 + bonus%)", () => {
    const r = jingran().run(["Jingran: BA1"])[0];
    assert.equal(r.stat(BONUS_HP), 12 + 72.2 + 10, "resonator + signature weapon + 2pc");
    assert.equal(r.hp, Math.floor(13713 * 1.942));
  });

  test("the HP conversion runs late, so it sees fully summed HP", () => {
    const r = byId(jingran().run(["Jingran: Intro", "Jingran: BA1"]), "Jingran: BA1");
    assert.equal(r.stat(FLAT_ATK), 36 * steps1000(r.hp));
    assert.equal(r.atk, 350 + 413 + 36 * steps1000(r.hp));
  });

  test("HP conversions pay out in whole 1000 HP steps, not continuously", () => {
    const r = byId(jingran().run(["Jingran: Intro", "Jingran: BA1"]), "Jingran: BA1");
    assert.equal(r.hp, 26630);
    assert.equal(r.stat(FLAT_ATK), 36 * 26, "26 steps, not 26.63");

    const bigger = jingran();
    bigger.slots[0].addBuff(defineBuff("Test: +900 flat hp", {
      apply() { add(900, "flatHP"); },
    }));
    const r2 = byId(bigger.run(["Jingran: Intro", "Jingran: BA1"]), "Jingran: BA1");
    assert.equal(r2.hp, 27530);
    assert.equal(r2.stat(FLAT_ATK), 36 * 27, "27530 crosses into the 27th step");
  });

  test("the conversion is gated on being on field", () => {
    const rows = jingran().run(ROTATION);
    const intro = byId(rows, "Jingran: Intro");
    const out = byId(rows, "Jingran: Outro");
    assert.equal(intro.onField, true);
    assert.equal(out.onField, false, "the intro->outro window is half-open");
    assert.equal(out.stat(FLAT_ATK), 0, "no HP conversion off field");
    assert.equal(out.atk, 350 + 413, "base attack only");
  });

  test("the intro converts Ghost Shroud into Fortune in Disguise", () => {
    const s = jingran();
    assert.equal(s.slots[0].counter(GHOST_SHROUD), 18, "seeded at fight start, his own uptime");
    const r = s.run(["Jingran: Intro"])[0];
    assert.equal(r.counters[FORTUNE], 18, "converted one for one");
    assert.equal(r.counters[GHOST_SHROUD], 0, "and consumed");
  });

  test("Fortune in Disguise adds fusion damage scaled on max HP", () => {
    const lib = byId(jingran().run(ROTATION), "Jingran: Lib1");
    const expected = 0.05 * 18 * steps1000(lib.hp);   // 0.05% fusion per 1000 HP per stack
    const contributions = lib.entries
      .filter((e) => e.source === JINGRAN_CONVERSION && e.stat === FUSION_DMG)
      .map((e) => e.value);
    assert.ok(contributions.some((v) => Math.abs(v - expected) < 1e-9),
              `expected a ${expected.toFixed(2)}% contribution, got ${contributions}`);
  });

  test("other resonators feed his Ghost Shroud when they shield", () => {
    defineBuff("Shielder: kit", { apply() { allyGainedShield(); } });
    defineAction("Shielder: Hit", { source: "Shielder", type: "basic", mv: 100 });
    const s = plain(["Jingran", "Shielder"], { Jingran: LOADOUT, Shielder: ["Shielder: kit"] });
    s.slots[0].setCounter(GHOST_SHROUD, 0);
    s.active = 1;
    s.run(["Shielder: Hit", "Shielder: Hit", "Shielder: Hit"]);
    assert.equal(s.slots[0].counter(GHOST_SHROUD), 3 * SHROUD_PER_ALLY_SHIELD,
                 "the ally fed Jingran across the team");
  });

  test("the ghost shroud hook is safe with no Jingran on the team", () => {
    defineBuff("Lonely: kit", { apply() { assert.equal(allyGainedShield(), 0); } });
    defineAction("Lonely: Hit", { source: "Lonely", type: "basic", mv: 1 });
    plain(["Lonely"], { Lonely: ["Lonely: kit"] }).run(["Lonely: Hit"]);
  });

  test("his echo cast lives in his file and is part of his rotation", () => {
    assert.equal(ECHO, "Echo: Myriad Snare");
    assert.ok(ROTATION.includes(ECHO));
    assert.equal(byId(jingran().run(ROTATION), ECHO).action.scaling, "hp");
  });
});

/* ---------------------------------------------------------------- Shorekeeper */

describe("Shorekeeper", () => {
  const sk = (loadout = SK_LOADOUT) => {
    const s = new State({ team: ["Shorekeeper"], ...CONFIG });
    s.config.maxOfftune = CONFIG.maxOfftune;
    s.startFight({ Shorekeeper: loadout });
    return s;
  };
  const pair = (loadout = SK_LOADOUT) => {
    const s = new State({ team: ["Shorekeeper", "Jingran"], ...CONFIG });
    s.config.maxOfftune = CONFIG.maxOfftune;
    s.startFight({ Shorekeeper: loadout, Jingran: LOADOUT });
    return s;
  };
  const realmOn = (s) => [
    [REALM_BLUE, "blue"], [REALM_PURPLE, "purple"], [REALM_GOLD, "gold"],
  ].filter(([b]) => s.slots[0].hasBuff(b)).map(([, n]) => n);

  // 250% ER assumed, which is exactly where both caps bite
  const REALM_CR = 12.5, REALM_CD = 25;

  test("an intro is recognised by its node, not its damage type", () => {
    const rows = sk().run(SK_ROTATION);
    assert.equal(rows[0].action.type, "skill", "her intro's damage type");
    assert.equal(rows[0].action.node, "intro");
    assert.equal(rows[0].onField, true, "and it still opens the on-field window");
  });

  test("her outro and the echo cast are marked by node, dealing no such damage", () => {
    const rows = sk().run(SK_ROTATION);
    const out = byId(rows, "Shorekeeper: Outro");
    assert.equal(out.action.node, "outro");
    assert.equal(out.action.mv, 0, "it deals nothing at all");
    assert.equal(out.onField, false, "and still closes the window");
    assert.equal(byId(rows, "Echo: Fallacy").action.node, "echo");
  });

  test("Discernment is a guaranteed critical hit and ends the realm", () => {
    const s = sk();
    s.run(["Shorekeeper: Liberation"]);
    assert.deepEqual(realmOn(s), ["blue"]);

    const r = s.run(["Shorekeeper: EIntro"])[0];
    assert.ok(r.stat(CRIT_RATE) >= 100, "enough crit rate to force a crit");
    const d = damage(r, CONFIG, levels);
    assert.equal(d.avg, d.crit);
    assert.equal(r.action.scaling, "hp", "and it scales off HP");
    assert.deepEqual(realmOn(s), [], "the realm is gone");
  });

  test("the realm advances a colour on every outro", () => {
    const s = pair();
    assert.deepEqual(realmOn(s), [], "nothing before her liberation");

    s.run(["Shorekeeper: Liberation"]);
    assert.deepEqual(realmOn(s), ["blue"], "her liberation opens the outer realm");

    s.run(["Shorekeeper: Outro"]);
    assert.deepEqual(realmOn(s), ["purple"], "the first outro evolves it");

    s.active = 1;
    s.run(["Jingran: Intro", "Jingran: Outro"]);
    assert.deepEqual(realmOn(s), ["gold"], "the next outro evolves it again");
    assert.equal(s.active, 0, "and an outro hands the field to the next slot");
  });

  test("purple pays crit rate only; gold pays crit rate and crit damage", () => {
    const s = pair();
    s.run(["Shorekeeper: Liberation", "Shorekeeper: Outro"]);
    s.active = 1;

    // his own 13, the Lamp's 5 per shield stack, and the realm on top
    const lamp = (row) => 5 * Math.min(row.counters[SHIELDS] ?? 0, 4);

    const purple = s.run(["Jingran: Intro", "Jingran: BA1"]).at(-1);
    assert.equal(purple.stat(CRIT_RATE), 13 + lamp(purple) + REALM_CR);
    assert.equal(purple.stat(CRIT_DMG), 150, "purple gives no crit damage");

    s.run(["Jingran: Outro"]);
    s.active = 1;              // his outro passed the field on; take it back
    const gold = s.run(["Jingran: Intro", "Jingran: BA1"]).at(-1);
    assert.equal(gold.stat(CRIT_DMG), 150 + REALM_CD, "gold does");
    assert.equal(gold.stat(CRIT_RATE), 13 + lamp(gold) + REALM_CR, "and still pays crit rate");
  });

  test("the realm reaches whoever is on the field, not just her", () => {
    const s = pair();
    s.run(["Shorekeeper: Liberation", "Shorekeeper: Outro"]);
    assert.ok(s.slots[0].hasBuff(REALM_PURPLE), "she is standing in it");
    assert.ok(s.slots[1].hasBuff(REALM_PURPLE), "and so is Jingran");
  });

  test("her team buffs reach the other slot", () => {
    const s = pair();
    s.run(["Shorekeeper: Intro"]);
    s.active = 1;
    const f = s.run(["Jingran: Intro", "Jingran: BA1"]).at(-1);
    assert.equal(f.stat(BONUS_ATK), 14 + 15 + 10, "Stellar Symphony + Rejuv Glow + Fallacy");
    assert.equal(f.stat("amplification"), 15, "Binary Butterfly");
  });

  test("Empirical Data is her forte gauge, held between 0 and 5", () => {
    const s = sk();
    assert.equal(s.run([SK_BA123]).at(-1).counters[FORTE1], 4, "1 + 1 + 2");
    assert.equal(s.run([SK_BA1234]).at(-1).counters[FORTE1], 5, "capped, not 9");
    assert.equal(s.run(["Shorekeeper: FHA"]).at(-1).counters[FORTE1], 0, "the forte spends it");
  });

  test("her basic combos are chains that sum to the sheet's pre-summed rows", () => {
    const rows = sk().run([SK_BA123]);
    assert.equal(rows.length, 3);
    // the sheet carried BA123 as one action worth 149.46%
    assert.ok(Math.abs(rows.reduce((n, r) => n + r.action.mv, 0) - 149.46) < 1e-9);
  });

  test("Stellar Symphony returns concerto on any liberation node", () => {
    const rows = sk().run(["Shorekeeper: BA1", "Shorekeeper: Liberation"]);
    // the liberation declares +28 concerto and the weapon adds 8 on top
    assert.equal(rows[1].counters[CONCERTO] - rows[0].counters[CONCERTO], 28 + 8);
  });

  test("Variation fires on a skill, then waits for a liberation to come back", () => {
    const s = sk(SK_LOADOUT_ALT);
    assert.ok(s.slots[0].hasBuff(VARIATION_READY), "armed at the start of the fight");

    const rows = s.run(["Shorekeeper: BA1", "Shorekeeper: Skill", "Shorekeeper: BA2"]);
    assert.equal(rows[1].counters[CONCERTO] - rows[0].counters[CONCERTO], 30 + 16,
                 "the skill's own 30 plus the weapon's 16");
    assert.ok(s.slots[0].hasBuff(VARIATION_COOLDOWN), "and it went on cooldown");
    assert.ok(!s.slots[0].hasBuff(VARIATION_READY));

    // a second skill does nothing while it cools
    const cooling = s.run(["Shorekeeper: Skill"]);
    assert.equal(cooling[0].counters[CONCERTO] - rows[2].counters[CONCERTO], 30,
                 "no weapon concerto this time");

    s.run(["Shorekeeper: Liberation"]);
    assert.ok(s.slots[0].hasBuff(VARIATION_READY), "the liberation rearms it");
    assert.ok(!s.slots[0].hasBuff(VARIATION_COOLDOWN));
  });

  test("Variation R5 matches the signature on nothing but concerto", () => {
    const withSig = sk().run(["Shorekeeper: BA1"])[0];
    const withAlt = sk(SK_LOADOUT_ALT).run(["Shorekeeper: BA1"])[0];
    assert.ok(withSig.atk > withAlt.atk, "the five-star has more base attack");
    assert.equal(withAlt.stat(ER), 100 + 10 + 51.84 + 10);
  });
});

/* ---------------------------------------------------------------------- Iuno */

describe("Iuno", () => {
  const iuno = (loadout = IO_LOADOUT) => {
    const s = new State({ team: ["Iuno"], ...CONFIG });
    s.config.maxOfftune = CONFIG.maxOfftune;
    s.startFight({ Iuno: loadout });
    return s;
  };

  test("Waxing Ascent shields on basics, dodge, skill, liberation and intro", () => {
    const rows = iuno().run(["Iuno: BA1", "Iuno: Skill", "Iuno: DC"]);
    assert.deepEqual(rows.map((r) => r.counters[SHIELDS]), [1, 2, 3]);
  });

  test("the shield stack caps at five", () => {
    const s = iuno();
    const rows = s.run(["Iuno: BA1", "Iuno: BA1", "Iuno: BA1", "Iuno: BA1",
                        "Iuno: BA1", "Iuno: BA1", "Iuno: BA1"]);
    assert.equal(rows.at(-1).counters[SHIELDS], 5, "capped, not 7");
  });

  test("her own gear scales on her shield stacks, one cast behind", () => {
    // Waxing Ascent's shield is her own action's buff, which the engine applies after her
    // gear in the same priority band — so Crown of Valor reads the count as of the start of
    // the cast, and this cast's own gain shows up on the next one.
    const rows = iuno().run(["Iuno: BA1", "Iuno: BA1", "Iuno: BA1"]);
    assert.deepEqual(rows.map((r) => r.stat(CRIT_DMG)), [150, 154, 158]);
    // 12% resonator + 12% weapon baseline, then 6% per lagged shield stack
    assert.deepEqual(rows.map((r) => r.stat(BONUS_ATK)), [24, 30, 36]);
  });

  test("shielding feeds Jingran's Ghost Shroud through the shared hook", () => {
    const s = new State({ team: ["Jingran", "Iuno"], ...CONFIG });
    s.config.maxOfftune = CONFIG.maxOfftune;
    s.startFight({ Jingran: LOADOUT, Iuno: IO_LOADOUT });
    s.slots[0].setCounter(GHOST_SHROUD, 0);
    s.active = 1;
    s.run(["Iuno: BA1", "Iuno: BA2", "Iuno: BA3"]);
    assert.equal(s.slots[0].counter(GHOST_SHROUD), 3 * SHROUD_PER_ALLY_SHIELD,
                 "three of her shields fed him across the team");
  });

  test("intro and liberation set Blessing to its max, not add to it", () => {
    const rows = iuno().run(["Iuno: Intro", "Iuno: BA1", "Iuno: Liberation"]);
    assert.deepEqual(rows.map((r) => r.counters[IO_BLESSING]), [5, 5, 5]);
  });

  test("Blessing feeds the weapon's defence ignore, not the sonata", () => {
    const r = iuno().run(["Iuno: Intro", "Iuno: Liberation"]).at(-1);
    assert.equal(r.stat(DEF_IGNORE), 7.2 * 5, "five stacks through Moongazer's Sigil");
  });

  test("her real forte gauge (Sentience) is separate from Blessing", () => {
    const rows = iuno().run(["Iuno: BA1", "Iuno: BA1", "Iuno: Liberation", "Iuno: FMA1"]);
    // BA1 fills forte1 by 4.25 each, the liberation by 60, FMA1 spends 11
    assert.equal(rows.at(-1).counters[IO_FORTE], 4.25 * 2 + 60 - 11);
    assert.equal(rows.at(-1).counters[IO_BLESSING], 5, "unaffected by any of that");
  });

  test("her outro hands the next resonator a Heavy Attack amplification window", () => {
    const s = new State({ team: ["Iuno", "Jingran"], ...CONFIG });
    s.config.maxOfftune = CONFIG.maxOfftune;
    s.startFight({ Iuno: IO_LOADOUT, Jingran: LOADOUT });

    s.run(["Iuno: Outro"]);
    assert.deepEqual(s.outroQueue, [HEAVY_WINDOW]);

    s.active = 1;
    const rows = s.run(["Jingran: Intro"]);
    assert.ok(s.slots[1].hasBuff(HEAVY_WINDOW), "adopted on his intro");
    // his own heavy attacks and Chimei Wangliang are heavy; the intro itself is not
    assert.equal(rows[0].stat("amplification:heavy"), 50);
    const heavy = byId(s.run(["Jingran: FSkill"]), "Jingran: FSkill");
    assert.ok(Math.abs(heavy.amp - 50) < 1e-9, "resolved into the scoped total");
  });

  test("her basic combo is a chain summing to the sheet's pre-summed row", () => {
    const rows = iuno().run([IO_BA123]);
    assert.equal(rows.length, 3);
    assert.ok(Math.abs(rows.reduce((n, r) => n + r.action.mv, 0) - 493.87) < 1e-9);
  });

  test("Pulsation Bracer matches the sheet's flat half-uptime numbers", () => {
    const r = iuno(IO_LOADOUT_F2P).run(["Iuno: BA1"])[0];
    assert.equal(r.stat(CRIT_RATE), 5 + 8 + 24.3);
    assert.equal(r.stat("dmgBonus:basic"), 24);
  });

  test("both rotations run end to end without a thrown warning", () => {
    for (const rot of [IO_ROTATION, IO_ROTATION_MDPS]) {
      const s = iuno();
      s.run(rot);
      assert.equal(s.log.filter((l) => l.includes("check the rotation")).length, 0);
    }
  });
});

/* ---------------------------------------------------------------- counters */

describe("counters", () => {
  test("fusion count is set once at fight start, not once per action", () => {
    const s = jingran();
    assert.equal(s.counter(COUNT_FUSION), 1, "contributed by onFightStart()");
    s.run(ROTATION);
    assert.equal(s.counter(COUNT_FUSION), 1, "still one after the whole rotation");
  });

  test("two fusion resonators sum to a fusion count of two", () => {
    defineBuff("Ally: fusion", {
      onFightStart() { gainTeam(COUNT_FUSION, 1); },
      apply() {},
    });
    const s = plain(["Jingran", "Ally"], { Jingran: LOADOUT, Ally: ["Ally: fusion"] });
    assert.equal(s.counter(COUNT_FUSION), 2);
  });

  test("shield count is per resonator, not shared with the team", () => {
    defineAction("Mate: Hit", { source: "Mate", type: "basic", mv: 100 });
    const s = plain(["Jingran", "Mate"], { Jingran: LOADOUT, Mate: [] });
    const rows = s.run(["Jingran: Intro", "Jingran: BA2", "Jingran: BA3"]);
    assert.equal(rows.at(-1).counters[SHIELDS], 2, "his own count");
    assert.equal(s.slots[0].counter(SHIELDS), 2, "held on his slot");
    assert.equal(s.slots[1].counter(SHIELDS), 0, "Mate never gained any");
  });

  test("energy, concerto and the forte gauges are per-resonator running totals", () => {
    defineAction("Res: A", {
      source: "Res", type: "basic", mv: 1, energy: 10, concerto: 5, forte1: 20,
    });
    defineAction("Res2: A", {
      source: "Res2", type: "basic", mv: 1, energy: 100, concerto: 50, forte1: 200,
    });
    const s = plain(["Res", "Res2"], { Res: [], Res2: [] });

    s.run(["Res: A", "Res: A", "Res: A"]);
    assert.equal(s.slots[0].counter(ENERGY), 30, "running total across actions");
    assert.equal(s.slots[0].counter(CONCERTO), 15);
    assert.equal(s.slots[0].counter(FORTE1), 60);

    s.active = 1;
    s.run(["Res2: A"]);
    assert.equal(s.slots[1].counter(ENERGY), 100, "not shared with the first");
    assert.equal(s.slots[0].counter(ENERGY), 30, "and the first is untouched");
    assert.equal(s.counter(ENERGY), 0, "nothing lands on the team");
  });

  test("off-tune is one bar the whole team fills", () => {
    defineAction("Off: A", { source: "Off", type: "basic", mv: 1, offtune: 3 });
    defineAction("Off2: A", { source: "Off2", type: "basic", mv: 1, offtune: 5 });
    const s = plain(["Off", "Off2"], { Off: [], Off2: [] });

    s.run(["Off: A", "Off: A"]);
    assert.equal(s.counter(OFFTUNE), 6, "held on the team, not the slot");
    s.active = 1;
    s.run(["Off2: A"]);
    assert.equal(s.counter(OFFTUNE), 11, "the second resonator adds to the same bar");
    assert.equal(s.slots[0].counter(OFFTUNE), 0, "and no slot keeps its own");
  });
});

/* ------------------------------------------------------------------ shields */

describe("shield stacks are simulated", () => {
  test("a shield needs Earth Charm, which the intro and resonance skills open", () => {
    const s = jingran();
    assert.equal(s.run(["Jingran: BA1", "Jingran: BA2"]).at(-1).counters[SHIELDS] ?? 0, 0);
    assert.ok(!s.slots[0].hasBuff(EARTH_CHARM));

    const rows = s.run(["Jingran: Intro", "Jingran: BA2", "Jingran: BA3"]);
    assert.ok(s.slots[0].hasBuff(EARTH_CHARM), "held as an ordinary buff");
    assert.equal(rows.at(-1).counters[SHIELDS], 2, "stacks from the action after the intro");

    s.slots[0].removeBuff(EARTH_CHARM);
    s.run(["Jingran: Skill1"]);
    assert.ok(s.slots[0].hasBuff(EARTH_CHARM), "a resonance skill re-opens it");
  });

  test("it stacks on every action while on field, and stops once he leaves", () => {
    const rows = jingran().run(ROTATION);
    // the shield triggers on damage dealt, so his echo cast and the tune break count too
    assert.equal(byId(rows, "Tune Break").counters[SHIELDS],
                 byId(rows, ECHO).counters[SHIELDS] + 1);
    // the outro is already off field, so it adds nothing
    const out = byId(rows, "Jingran: Outro");
    assert.equal(out.onField, false);
    assert.equal(out.counters[SHIELDS], byId(rows, "Tune Break").counters[SHIELDS]);
  });

  test("Earth Charm is EARLY, so buffs scaling on shields see this action's stack", () => {
    const rows = jingran().run(ROTATION);
    // Lamp of Nether Road: 5% crit per stack, capped at four
    assert.equal(rows[0].stat(CRIT_RATE), 13 + 5 * 0, "the intro only opens Earth Charm");
    assert.equal(rows[1].stat(CRIT_RATE), 13 + 5 * 1);
    assert.equal(rows[2].stat(CRIT_RATE), 13 + 5 * 2);
    assert.equal(rows[4].stat(CRIT_RATE), 13 + 5 * 4);
    assert.equal(rows[5].stat(CRIT_RATE), 13 + 5 * 4, "capped");
  });

  test("each snapshot keeps its own totals", () => {
    // regression: the snapshot used to read through to the live slot, so every row
    // reported the final action's stats
    const crs = new Set(jingran().run(ROTATION).slice(0, 4).map((r) => r.stat(CRIT_RATE)));
    assert.equal(crs.size, 4, "crit rate climbs as shields ramp");
  });
});

/* -------------------------------------------------- action-local contributions */

describe("action-local buffs", () => {
  test("heavy attacks carry their own HP-scaled motion value and the weapon's def ignore", () => {
    const f = byId(jingran().run(ROTATION), "Jingran: FSkill");
    assert.equal(f.stat(MV), 9.003 * steps1000(f.hp, 25000), "9.003% per 1000 HP above 25k");
    assert.equal(f.stat(MV), 9.003);
    assert.equal(f.stat(DEF_IGNORE), 30);
  });

  test("dropping the signature weapon costs the def ignore and the MV threshold", () => {
    const s = plain(["Jingran"],
      { Jingran: [JINGRAN, JINGRAN_CONVERSION, MAINSLOT, SONATA_5PC, SONATA_2PC] });
    const f = byId(s.run(["Jingran: Intro", "Jingran: FSkill"]), "Jingran: FSkill");
    assert.equal(f.stat(DEF_IGNORE), 0, "no weapon, no def ignore");
    // without the weapon's 72.2% HP he lands under the 25k threshold, so the bonus is
    // genuinely zero rather than merely smaller
    assert.equal(f.stat(BONUS_HP), 12 + 10);
    assert.ok(f.hp < 25000, `hp ${f.hp} is under the threshold`);
    assert.equal(f.stat(MV), 0);
  });

  test("scoped damage bonuses only reach actions of that element or type", () => {
    const rows = jingran().run(ROTATION);
    // Myriad Snare gives +12% fusion and +12% heavy; a basic gets only the fusion half
    const basic = byId(rows, "Jingran: BA2");
    const heavy = byId(rows, "Jingran: BA3");
    assert.equal(heavy.dmgBonus - basic.dmgBonus, 12);
    assert.equal(basic.stat(DMG_BONUS), 12, "the weapon's unscoped 12% is all that is generic");
  });
});

/* ------------------------------------------------------- the three mechanisms */

describe("buff delivery", () => {
  test("1 — gear is seeded onto its own resonator at the start of the fight", () => {
    const s = jingran();
    const held = [...s.slots[0].list.keys()];
    for (const g of [JINGRAN, WEAPON, MAINSLOT, SONATA_5PC, SONATA_2PC]) {
      assert.ok(held.includes(g), `${g} is on the list`);
    }
    assert.equal(s.slots[0].list.get(WEAPON).via, "gear");
  });

  test("2 — an outro buff is handed to the next resonator and expires on its outro", () => {
    const GIFT = defineBuff("Test: outro gift", { apply() { add(40, CRIT_RATE); } });
    const PUBLISH = defineBuff("Test: publish gift", { apply() { outro(GIFT); } });
    defineAction("A: Outro", { source: "A", type: "outro", mv: 100, buffs: [PUBLISH] });
    defineAction("B: Intro", { source: "B", type: "intro", mv: 100 });
    defineAction("B: Hit", { source: "B", type: "basic", mv: 100 });
    defineAction("B: Outro", { source: "B", type: "outro", mv: 100 });

    const s = plain(["A", "B"], { A: [], B: [] });

    s.evaluate("A: Outro");
    assert.deepEqual(s.outroQueue, [GIFT], "queued, not yet delivered");
    assert.equal(s.active, 1, "an outro passes the field to the next slot");

    const intro = s.evaluate("B: Intro");
    assert.ok(s.slots[1].hasBuff(GIFT), "delivered on intro");
    assert.deepEqual(s.outroQueue, [], "queue drained");
    assert.equal(intro.stat(CRIT_RATE), 40, "and it contributes stats");
    assert.equal(s.evaluate("B: Hit").stat(CRIT_RATE), 40, "still held mid-rotation");

    s.evaluate("B: Outro");
    assert.ok(!s.slots[1].hasBuff(GIFT), "revoked when B outros");
    assert.equal(s.evaluate("B: Hit").stat(CRIT_RATE), 0, "gone");
  });

  test("3 — a direct grant reaches the whole team and is idempotent", () => {
    const SHARED = defineBuff("Test: shared crit", { apply() { add(25, CRIT_RATE); } });
    defineBuff("Test: giver", { apply() { grantTeam(SHARED); } });
    defineAction("G: Hit", { source: "G", type: "basic", mv: 100 });
    defineAction("H: Hit", { source: "H", type: "basic", mv: 100 });

    const s = plain(["G", "H"], { G: ["Test: giver"], H: [] });
    s.run(["G: Hit", "G: Hit"]);
    assert.ok(s.slots[1].hasBuff(SHARED), "the ally got it");
    assert.equal(s.slots[1].list.get(SHARED).via, "grant");
    assert.equal(s.log.filter((l) => l.startsWith("granted")).length, 1,
                 "re-asserted every action, logged once");

    s.active = 1;
    assert.equal(s.evaluate("H: Hit").stat(CRIT_RATE), 25);
  });

  test("a named buff can be removed again", () => {
    const opener = ["Jingran: Intro", "Jingran: BA1"];
    const before = jingran().run(opener).at(-1).stat(CRIT_RATE);
    const without = jingran();
    without.slots[0].removeBuff(SONATA_5PC);
    const after = without.run(opener).at(-1).stat(CRIT_RATE);
    assert.equal(before - after, 5, "lost the shield-scaled crit");
    assert.equal(after, 13, "innate crit only");
  });

  test("an unknown buff name fails loudly instead of silently doing nothing", () => {
    assert.throws(() => jingran().slots[0].addBuff("Nope"), /unknown buff/);
  });

  test("an action's own buffs apply for that action only", () => {
    const MARK = defineBuff("Act: mark", { apply() { add(50, CRIT_RATE); } });
    defineAction("Act: WithBuff", { source: "Act", type: "basic", mv: 1, buffs: [MARK] });
    defineAction("Act: Plain", { source: "Act", type: "basic", mv: 1 });

    const s = plain(["Act"], { Act: [] });
    const rows = s.run(["Act: WithBuff", "Act: Plain"]);
    assert.equal(rows[0].stat(CRIT_RATE), 50, "applied on the action that brings it");
    assert.equal(rows[1].stat(CRIT_RATE), 0, "and gone on the next one");
    assert.ok(!s.slots[0].hasBuff(MARK), "never joins the resonator's list");
  });

  test("an action's buffs run after the resonator's gear in the same band", () => {
    const order = [];
    defineBuff("Ord: gear", { apply() { order.push("gear"); } });
    defineBuff("Ord: action", { apply() { order.push("action"); } });
    defineAction("Ord: Hit", {
      source: "Ord", type: "basic", mv: 1, buffs: ["Ord: action"],
    });
    plain(["Ord"], { Ord: ["Ord: gear"] }).evaluate("Ord: Hit");
    assert.deepEqual(order, ["gear", "action"], "so the action can read the gear's totals");
  });

  test("an action naming a buff that does not exist is rejected at definition", () => {
    assert.throws(
      () => defineAction("Bad: Action", { source: "Bad", mv: 1, buffs: ["Nope"] }),
      /unknown buff/);
  });
});

/* --------------------------------------------------------------- general rules */

describe("rules every resonator shares", () => {
  test("a liberation contributes nothing to energy, but keeps its cost for display", () => {
    defineAction("Gen: Lib", {
      source: "Gen", node: "liberation", type: "heavy", mv: 100, energy: -125,
    });
    defineAction("Gen: Hit", { source: "Gen", type: "basic", mv: 1, energy: 40 });
    const rows = plain(["Gen"], { Gen: [] }).run(["Gen: Hit", "Gen: Hit", "Gen: Lib"]);
    assert.equal(rows[1].counters[ENERGY], 80, "banked normally");
    assert.equal(rows[2].counters[ENERGY], 80, "the liberation does not move the total");
    assert.equal(rows[2].action.energy, -125, "the declared cost survives for display");
  });

  test("an outro contributes nothing to concerto, but keeps its cost for display", () => {
    defineAction("Gen2: Hit", { source: "Gen2", type: "basic", mv: 1, concerto: 30 });
    defineAction("Gen2: Outro", { source: "Gen2", type: "outro", mv: 1, concerto: -100 });
    const rows = plain(["Gen2"], { Gen2: [] }).run(["Gen2: Hit", "Gen2: Hit", "Gen2: Outro"]);
    assert.equal(rows[1].counters[CONCERTO], 60);
    assert.equal(rows[2].counters[CONCERTO], 60, "not 60 - 100, and not reset to 0");
    assert.equal(rows[2].action.concerto, -100, "the declared cost survives for display");
  });

  test("any declared energy or concerto cost spends the bar, whatever the action is", () => {
    // the rule is just "the cost is negative" — it does not care about node or type
    defineAction("Cost: Bank", { source: "Cost", type: "basic", mv: 1, energy: 20, concerto: 20 });
    defineAction("Cost: Spend", { source: "Cost", type: "basic", mv: 1, energy: -5, concerto: -5 });
    const rows = plain(["Cost"], { Cost: [] })
      .run(["Cost: Bank", "Cost: Bank", "Cost: Spend"]);
    assert.equal(rows[1].counters[ENERGY], 40);
    assert.equal(rows[2].counters[ENERGY], 40, "not 35");
    assert.equal(rows[2].counters[CONCERTO], 40, "not 35");
  });

  test("a forte gauge is decremented normally — only energy and concerto are special", () => {
    defineAction("Forte: Bank", { source: "Forte", type: "basic", mv: 1, forte1: 40 });
    defineAction("Forte: Spend", { source: "Forte", type: "basic", mv: 1, forte1: -10 });
    const rows = plain(["Forte"], { Forte: [] }).run(["Forte: Bank", "Forte: Spend"]);
    assert.equal(rows[1].counters[FORTE1], 30, "a gauge really does go down by 10");
  });

  test("the liberation grants Mingfire and leaves the energy total alone", () => {
    const lib = byId(jingran().run(["Jingran: Intro", "Jingran: Lib1"]), "Jingran: Lib1");
    assert.equal(lib.counters[MINGFIRE], 100);
    assert.equal(lib.counters[ENERGY], 2.5, "only the intro's energy");
    assert.equal(lib.action.energy, -125);
  });

  test("the outro closes his state and leaves the concerto total alone", () => {
    const s = jingran();
    const rows = s.run(ROTATION);
    const out = byId(rows, "Jingran: Outro");
    assert.ok(!s.slots[0].hasBuff(EARTH_CHARM), "Earth Charm revoked on outro");
    assert.equal(s.slots[0].counter(MINGFIRE), 0);
    assert.equal(s.slots[0].counter(FORTUNE), 0);
    assert.equal(out.counters[CONCERTO], rows[rows.length - 2].counters[CONCERTO]);
    assert.equal(out.action.concerto, -100);
  });
});

/* ---------------------------------------------------------- his kit mechanics */

describe("Jingran's forte and liberation", () => {
  test("Qi is forte1 and the rotation's economy balances exactly", () => {
    const trace = jingran().run(ROTATION)
      .map((r) => [r.action.id.replace("Jingran: ", ""), r.counters[QI]]);
    assert.deepEqual(trace.slice(0, 7), [
      ["Intro", 100],              // the intro restores 100
      ["Lib1", 300],               // liberation +200, capped at the 300 gauge
      ["FSkill", 200],             // spends 300, a mark refunds 200
      ["Chimei Wangliang", 200],   // the follow-up costs nothing
      ["Skill1", 200],
      ["ESkill2", 300],            // the hold follow-up restores 100
      ["EFSkill", 200],            // spends 300, second mark refunds 200
    ]);
    assert.equal(trace.at(-1)[1], 0, "and it lands on empty");
  });

  test("Mingfire alone drives both the follow-up and the refund", () => {
    const heavies = jingran().run(ROTATION).filter((r) => r.action.id.endsWith("FSkill"));
    assert.equal(heavies.length, 4);
    // 100 Mingfire, 25 a heavy: above 25 there is still a mark to spend, above 0 the window
    // is still open. So three refunds and four follow-ups.
    assert.deepEqual(heavies.map((r) => r.counters[MINGFIRE]), [75, 50, 25, 0]);
    assert.deepEqual(heavies.map((r) => r.counters[QI]), [200, 200, 200, 0],
                     "the fourth heavy gets no refund");
  });

  test("each heavy attack during the window summons the follow-up, right after it", () => {
    const ids = jingran().run(ROTATION).map((r) => r.action.id);
    assert.equal(ids.filter((i) => i === CHIMEI).length, 4, "one per heavy attack");
    for (const [i, id] of ids.entries()) {
      if (id === CHIMEI) assert.ok(ids[i - 1].endsWith("FSkill"), "directly after its heavy");
    }
  });

  test("no Mingfire means no follow-ups and no refund", () => {
    const rows = jingran().run(["Jingran: Intro", "Jingran: ESkill2", "Jingran: FSkill"]);
    assert.ok(!rows.map((r) => r.action.id).includes(CHIMEI));
    assert.equal(byId(rows, "Jingran: FSkill").counters[QI], 0, "spent, nothing refunded");
  });

  test("the follow-up is fusion heavy damage, and is not itself a liberation", () => {
    const chimei = byId(jingran().run(ROTATION), CHIMEI);
    assert.equal(chimei.action.element, "fusion");
    assert.equal(chimei.action.type, "heavy");
    assert.equal(chimei.action.node, null, "a summon, so it must not empty the energy bar");
    assert.equal(chimei.action.mv, 83.51, "the sheet's bundled 334.04 / 4");
  });

  test("a heavy attack without the Qi to pay for it is reported", () => {
    const s = jingran();
    s.run(["Jingran: FSkill"]);
    assert.ok(s.log.some((l) => l.includes("check the rotation")),
              `expected a warning, log was ${JSON.stringify(s.log)}`);
  });
});

/* --------------------------------------------------------------------- chains */

describe("skill chains", () => {
  const chainRun = (rotation) => {
    const s = jingran();
    const rows = s.run(rotation).map((x) => ({ snap: x, dmg: damage(x, s.config, levels) }));
    return { s, rows, lines: collapseChains(rows) };
  };

  test("one entry expands into its members, each evaluated on its own", () => {
    const ids = jingran().run(["Jingran: Intro", BA_CHAIN]).map((r) => r.action.id);
    assert.deepEqual(ids, [
      "Jingran: Intro",
      "Jingran: BA1", "Jingran: BA2", "Jingran: BA3", "Jingran: BA4",
    ]);
  });

  test("the parts are calculated individually, with their own snapshots", () => {
    const rows = jingran().run(["Jingran: Intro", BA_CHAIN]).slice(1);
    assert.deepEqual(rows.map((r) => r.counters[SHIELDS]), [1, 2, 3, 4]);
    assert.ok(new Set(rows.map((r) => r.stat(CRIT_RATE))).size > 1);
  });

  test("collapsing reports the whole chain's motion value and the hardest part's stats", () => {
    const { lines } = chainRun(["Jingran: Intro", BA_CHAIN]);
    assert.equal(lines.length, 2, "intro plus one chain line");
    const chain = lines[1];
    assert.equal(chain.id, BA_CHAIN);
    assert.equal(chain.isChain, true);
    assert.equal(chain.parts.length, 4);

    const total = chain.parts.reduce((n, p) => n + mvPercent(p.snap), 0);
    assert.ok(Math.abs(chain.mv - total) < 1e-9);
    assert.ok(Math.abs(chain.mv - (39.82 + 99.47 + 159.1 + 124.24)) < 1e-9);
    assert.ok(Math.abs(chain.avg - chain.parts.reduce((n, p) => n + p.dmg.avg, 0)) < 1e-9);

    const best = chain.parts.reduce((a, b) => (b.dmg.avg > a.dmg.avg ? b : a));
    assert.equal(chain.snap, best.snap, "the stats shown are the hardest part's");
  });

  test("a chain of mixed types is allowed", () => {
    const chain = chainRun(["Jingran: Intro", BA_CHAIN]).lines[1];
    assert.deepEqual([...new Set(chain.parts.map((p) => p.snap.action.type))],
                     ["basic", "heavy"], "stages 1-2 basic, 3-4 heavy");
    assert.equal(chain.snap.action.type, "heavy");
  });

  test("follow-ups queued mid-chain stay out of the chain's group", () => {
    defineAction("Ch: Follow", { source: "Ch", type: "basic", mv: 5 });
    defineBuff("Ch: follow up", { apply() { queue("Ch: Follow"); } });
    defineAction("Ch: A", {
      source: "Ch", type: "basic", mv: 10, buffs: ["Ch: follow up"],
    });
    defineAction("Ch: B", { source: "Ch", type: "basic", mv: 10 });
    const CH = defineChain("Ch: AB", ["Ch: A", "Ch: B"]);

    const s = plain(["Ch"], { Ch: [] });
    const snaps = s.run([CH]);
    assert.deepEqual(snaps.map((x) => x.action.id), ["Ch: A", "Ch: Follow", "Ch: B"]);
    const lines = collapseChains(
      snaps.map((x) => ({ snap: x, dmg: damage(x, s.config, levels) })));
    assert.equal(lines.length, 2);
    assert.deepEqual(lines[0].parts.map((p) => p.snap.action.id), ["Ch: A", "Ch: B"]);
    assert.equal(lines[1].id, "Ch: Follow", "the follow-up is its own line");
  });

  test("an unknown member is rejected when the chain is defined", () => {
    assert.throws(() => defineChain("Bad: chain", ["Nope: Nope"]), /unknown action/);
  });
});

/* -------------------------------------------------------------------- display */

describe("display", () => {
  const reportFor = (rotation) => {
    const s = jingran();
    const rows = s.run(rotation).map((x) => ({ snap: x, dmg: damage(x, s.config, levels) }));
    return buildReport(collapseChains(rows), { gauges: GAUGES, strip: /^Jingran: / });
  };

  test("one row per step, with the stats and resources snapshotted at it", () => {
    const report = reportFor(ROTATION);
    assert.equal(report.rows.length, 21);

    const lib = report.rows.find((r) => r.raw.action === "Lib1").raw;
    assert.equal(lib.atk, 1699);
    assert.equal(lib.hp, 26630);
    assert.equal(lib.cd, 150);
    assert.equal(lib.energy, 2.5, "the running energy total at that point");
    assert.equal(lib.concerto, 30);
    assert.equal(lib.offtune, 17.6, "team-wide off-tune");
    assert.equal(lib[`gauge:${QI}`], 300, "his forte gauge, labelled qi");
    assert.equal(lib[`gauge:${MINGFIRE}`], 100);
  });

  test("gauges are labelled by the resonator, not shown as forte1..4", () => {
    const labels = reportFor(ROTATION).columns.map((c) => c.label);
    assert.ok(labels.includes("qi"));
    assert.ok(labels.includes("mingfire"));
    assert.ok(!labels.some((l) => /^forte\d$/.test(l)));
  });

  test("a resource nobody moves gets no column", () => {
    const labels = reportFor(ROTATION).columns.map((c) => c.label);
    // his intro converts Ghost Shroud before anything is snapshotted, so it reads zero
    assert.ok(!labels.includes("shroud"));
    assert.ok(labels.includes("energy"), "but energy does move");
  });

  test("a chain is one row, with its parts listed underneath", () => {
    const report = reportFor(["Jingran: Intro", BA_CHAIN]);
    assert.equal(report.rows.length, 2);
    const chain = report.rows[1];
    assert.equal(chain.raw.action, "BA1234 (x4)");
    assert.deepEqual(chain.parts.map((p) => p.type), ["basic", "basic", "heavy", "heavy"]);
    assert.equal(chain.parts.filter((p) => p.isShown).length, 1, "one part supplies the stats");
    assert.ok(Math.abs(chain.raw.mv - (39.82 + 99.47 + 159.1 + 124.24)) < 1e-9);
  });

  test("renders to text, and the total matches the rows", () => {
    const report = reportFor(ROTATION);
    const text = renderReport(report, { showParts: false });
    assert.ok(text.includes("avg dmg"));
    assert.ok(text.includes("Chimei Wangliang"));
    assert.equal(text.split("\n").length, 21 + 4, "header, rule, 21 rows, rule, total");
    assert.ok(Math.abs(report.total - report.rows.reduce((n, r) => n + r.raw.avg, 0)) < 1e-9);
  });

  test("explain() attributes every contribution behind a row", () => {
    const report = reportFor(ROTATION);
    const lines = explain(report.rows[1].line.snap).map((e) => e.label);
    assert.ok(lines.some((l) => l.startsWith("Jingran →")));
    assert.ok(lines.some((l) => l.startsWith(`${WEAPON} →`)));
    assert.ok(lines.some((l) => l.startsWith(`${JINGRAN_CONVERSION} →`)));
  });
});

/* ------------------------------------------------------------ action queueing */

describe("action queue", () => {
  test("follow-ups are inserted directly after the current action, in order", () => {
    defineAction("Q: One", { source: "Q", type: "basic", mv: 1 });
    defineAction("Q: Two", { source: "Q", type: "basic", mv: 1 });
    defineBuff("Q: trigger", { apply() { queue("Q: One"); queue("Q: Two"); } });
    defineAction("Q: Trigger", { source: "Q", type: "skill", mv: 100, buffs: ["Q: trigger"] });
    defineAction("Q: After", { source: "Q", type: "basic", mv: 1 });

    const ids = plain(["Q"], { Q: [] }).run(["Q: Trigger", "Q: After"]).map((r) => r.action.id);
    assert.deepEqual(ids, ["Q: Trigger", "Q: One", "Q: Two", "Q: After"]);
  });

  test("a follow-up may itself queue another, still landing directly after itself", () => {
    defineAction("N: Inner", { source: "N", type: "basic", mv: 1 });
    defineBuff("N: mid", { apply() { queue("N: Inner"); } });
    defineBuff("N: trigger", { apply() { queue("N: Mid"); } });
    defineAction("N: Mid", { source: "N", type: "basic", mv: 1, buffs: ["N: mid"] });
    defineAction("N: Trigger", { source: "N", type: "skill", mv: 1, buffs: ["N: trigger"] });
    defineAction("N: After", { source: "N", type: "basic", mv: 1 });

    const ids = plain(["N"], { N: [] }).run(["N: Trigger", "N: After"]).map((r) => r.action.id);
    assert.deepEqual(ids, ["N: Trigger", "N: Mid", "N: Inner", "N: After"]);
  });

  test("conditional consumption only fires when the resource is there", () => {
    let fired = 0;
    defineBuff("C: spend", {
      apply() { if (counter(FORTE2) >= 25) { gain(FORTE2, -25); fired++; } },
    });
    defineAction("C: Spend", { source: "C", type: "skill", mv: 100, buffs: ["C: spend"] });
    const s = plain(["C"], { C: [] });
    s.evaluate("C: Spend");
    assert.equal(fired, 0, "nothing banked yet");
    s.slots[0].setCounter(FORTE2, 30);
    s.evaluate("C: Spend");
    assert.equal(fired, 1);
    assert.equal(s.slots[0].counter(FORTE2), 5);
  });
});

/* ----------------------------------------------------------- damage formula */

describe("damage", () => {
  test("returns exactly no-crit, crit and average", () => {
    const d = damage(jingran().run(["Jingran: BA1"])[0], CONFIG, levels);
    assert.deepEqual(Object.keys(d).sort(), ["avg", "crit", "noCrit"]);
  });

  test("the tune base stat is floored to exactly 10027 at level 90", () => {
    assert.equal(constantStat("tune", CONFIG, levels), 10027);
    const raw = levels.find((x) => x.level === 90).tuneRate * 39.2 * 10000;
    assert.ok(raw > 10027 && raw < 10028, `unfloored it is ${raw}`);
  });

  /**
   * Ground truth from the TUNETEST sheet: an off-tune break against a level 90 enemy with no
   * shred and no break bar was observed in game at 64343.
   */
  test("reproduces the observed tune-break number", () => {
    const cfg = { ...CONFIG, enemyLevel: 90 };
    const s = new State({ team: ["T"], ...cfg });
    s.startFight({ T: [] });
    const d = damage(s.evaluate("Tune Break"), cfg, levels);
    assert.equal(Math.ceil(d.avg), 64343, "matches the in-game observation");
    assert.equal(d.crit, d.noCrit, "tune damage cannot crit");
  });

  test("the tune break's conversion is LATE, so it sees break boost added late", () => {
    // a conversion passive that only grants TBB once other stats are summed
    defineBuff("Late: tbb", { priority: PRIORITY.LATE, apply() { add(30, TBB); } });
    const s = plain(["Lt"], { Lt: ["Late: tbb"] });
    const snap = s.evaluate("Tune Break");
    assert.equal(snap.stat(TBB), 30);
    assert.equal(snap.stat(SPECIAL_AMP), 30,
                 "converted after the LATE buff ran, not before it");
  });

  test("tune break boost converts one for one into special amplification", () => {
    defineBuff("Break: boost", { apply() { add(80, TBB); } });
    const bare = plain(["Br"], { Br: [] });
    const buffed = plain(["Br2"], { Br2: ["Break: boost"] });

    const a = bare.evaluate("Tune Break");
    const b = buffed.evaluate("Tune Break");
    assert.equal(a.stat(SPECIAL_AMP), 0);
    assert.equal(b.stat(SPECIAL_AMP), 80, "80 TBB -> +80% special amp");

    const dA = damage(a, CONFIG, levels);
    const dB = damage(b, CONFIG, levels);
    assert.ok(Math.abs(dB.avg / dA.avg - 1.8) < 1e-9, "so the break hits for 1.8x");
  });

  test("dot and tune bypass damage bonus and crit; attack scaling does not", () => {
    const rows = jingran().run(ROTATION);
    const dTune = damage(byId(rows, "Tune Break"), CONFIG, levels);
    const dHit = damage(byId(rows, "Jingran: BA3"), CONFIG, levels);
    assert.equal(dTune.crit, dTune.noCrit);
    assert.ok(dHit.crit > dHit.noCrit);
    assert.ok(dHit.avg > dHit.noCrit && dHit.avg < dHit.crit);
  });

  test("motion values are percent, so a 307.34% skill is a 3.07x multiplier", () => {
    const f = byId(jingran().run(ROTATION), "Jingran: FSkill");
    assert.equal(f.action.mv, 307.34);
    const d = damage(f, CONFIG, levels);
    const bare = damage({ ...f, action: { ...f.action, mv: 100 } }, CONFIG, levels);
    assert.ok(Math.abs(d.noCrit / bare.noCrit - 3.0734) < 1e-9);
  });
});

/* ------------------------------------------------------------------ guardrails */

describe("guardrails", () => {
  test("the ambient namespace refuses to be used outside a calculation", () => {
    assert.throws(() => add(1, CRIT_RATE), /no active calculation/);
  });

  test("a cyclic follow-up is caught rather than hanging", () => {
    defineBuff("Loop: again", { apply() { queue("Loop: Self"); } });
    defineAction("Loop: Self", {
      source: "Loop", type: "basic", mv: 1, buffs: ["Loop: again"],
    });
    assert.throws(() => plain(["Loop"], { Loop: [] }).run(["Loop: Self"]), /did not drain/);
  });

  test("a buff registered twice is rejected", () => {
    assert.throws(() => defineBuff(JINGRAN, { apply() {} }), /already defined/);
  });

  test("the four stages run in order, whatever order the list is in", () => {
    const order = [];
    const stage = (name, priority) =>
      defineBuff(`P: ${name}`, { priority, apply() { order.push(name); } });
    stage("default", PRIORITY.DEFAULT);
    stage("late", PRIORITY.LATE);
    stage("later", PRIORITY.LATER);
    stage("latest", PRIORITY.LATEST);
    defineBuff("P: action", { apply() { order.push("action"); } });
    defineAction("P: Hit", { source: "P", type: "basic", mv: 1, buffs: ["P: action"] });

    plain(["P"], { P: ["P: latest", "P: later", "P: late", "P: default"] }).evaluate("P: Hit");
    // the action's own buff is DEFAULT, and runs after the resonator's gear in that stage
    assert.deepEqual(order, ["default", "action", "late", "later", "latest"]);
    assert.ok(PRIORITY.DEFAULT < PRIORITY.LATE);
    assert.ok(PRIORITY.LATE < PRIORITY.LATER);
    assert.ok(PRIORITY.LATER < PRIORITY.LATEST);
  });

  test("a state applies before the gear that scales on the counter it moves", () => {
    const order = [];
    defineBuff("St: gear", { apply() { order.push("gear"); } });
    defineBuff("St: state", { apply() { order.push("state"); } });
    defineBuff("St: opener", { apply() { grantSelf("St: state"); } });
    defineAction("St: Open", { source: "St", type: "basic", mv: 1, buffs: ["St: opener"] });
    defineAction("St: Hit", { source: "St", type: "basic", mv: 1 });

    const s = plain(["St"], { St: ["St: gear"] });
    s.run(["St: Open", "St: Hit"]);
    // on the second action the state is held, and sits ahead of the gear
    assert.deepEqual(order.slice(-2), ["state", "gear"]);
  });

  test("onFightStart runs once per buff, before any action", () => {
    const calls = [];
    defineBuff("F: once", {
      onFightStart() { calls.push("start"); },
      apply() { calls.push("apply"); },
    });
    defineAction("F: Hit", { source: "F", type: "basic", mv: 1 });
    const s = plain(["F"], { F: ["F: once"] });
    assert.deepEqual(calls, ["start"]);
    s.run(["F: Hit", "F: Hit"]);
    assert.deepEqual(calls, ["start", "apply", "apply"]);
  });
});

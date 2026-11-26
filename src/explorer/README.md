# explorer

Rotation optimizers: they play candidate rotations through the engine and rank them. Scratch tools, not part of
the site.

## Shorekeeper (TypeScript, built with everything else)

- `sksearch.ts`: her fastest loop and the fastest opener it plays behind, then her fastest opener and the
  fastest loop behind that (every loop steady, leaving the forte it arrived with). It's a shortest-path search on
  worker threads (`skworker.ts` playing each candidate through `skbench.ts`, untraced, on a fresh State). The
  Liberation goes anywhere once, the echoes right before it or as the swap, and every string runs to an Outro
  with 100 Concerto. The presses are the kit's own (`SHOREKEEPER_PRESSES`), the Concerto and forte it prunes on
  are read off her bars by hooks, and a string with a press cast outside its condition is dropped.
  - loops are searched behind the 5 fastest openers for each forte left (`SEEDS`), the 200 fastest openers
    (`OPENERS`) each get every loop found tried behind them, and loops are searched again behind the 3
    winning openers until they hold
  - `PRELOAD=1`: the opener leaves 1 forte; `START=ba123 | ba1`: the opener starts on Basic 1-3 or Basic 1,
    cancelled into the Liberation; `WEAPON`/`REFINE`: her weapon (an index into her loadout's) and its rank
  - `KEEP`, `WORKERS`, `BATCH`: how many results to show, threads, strings grown a round
- `skcheck.ts`: her shipped rotation over an opener and two loops, with each visit's time and energy

        npx tsc && node dist/src/explorer/sksearch.js
        npx tsc && node dist/src/explorer/skcheck.js

Both use the bench's duo: Lily stands in for the rest of the team (her First Bloom, 19s, her Outro).
`PRECISION`, `MASH` and `HOLD_BUFFER` (frames) override the engine's delays for a test. Results also land in
`dist/src/explorer/out/`.

## Lily (older .mjs, run against a patched copy of dist/)

- `lilysearch.mjs <opener|first|loop|eternalft>`: her opener, First Bloom arrival, Eternal Bloom loop, or
  Eternal Bloom arrival in Fairytale form; `FORM=fairytale` plays the slow heavy instead. It needs
  `prepare.mjs` first, which copies `dist/src` into `build/` with her presses exported and every warning kept:

        npx tsc && node src/explorer/prepare.mjs && node src/explorer/lilysearch.mjs loop

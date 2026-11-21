# general
- never change the engine (`src/engine/`, the solver, the run harness) unless I specifically tell you to. a kit request, a check or a search is kit-side or scratch-side work; where it seems to need an engine change, say so and ask
- do not read TODO.md
- comments: 1-2 lines max
- read web pages as a human would; never screenshot them
- DO NOT stage changes, commit changes, or push changes to git
- use LF for newlines not CRLF

# where the rest lives
- `docs/resonators.md` — implementing a kit: reading its text, gauges and conditions, buff wording, naming, units, and sourcing/importing its numbers (wuwalab, nanoka, encore, frames, concerto): before adding, changing or re-syncing a kit or an echo
- `docs/rotations.md` — SWAPIN and Intro chains, `ResonanceMode`, `after`/`notAfter`, positions: before writing or changing a rotation
- `docs/engine.md` — how a press plays (cuts, hold/mash and `heldInput`, priority, echo casts, hooks, timers): before writing hooks or cuts

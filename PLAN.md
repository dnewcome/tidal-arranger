# Plan

## Project Goal

This is a **song builder**, not a live-coding or real-time performance tool. The intended workflow is:

1. Write the arrangement in the pattern language
2. Preview playback via Web MIDI as you compose
3. Export a finished MIDI file to take into a DAW for final audio production

Real-time playback is a composition aid, not the end product.

## Next Up: MIDI File Export

The highest-priority feature. The data is already all present in `currentArrangement` — this is primarily a serialization task.

### Format
- MIDI format 1 (multi-track): one MIDI track per arrangement track
- 480 PPQ tick resolution is a safe standard default
- Timing conversion: one arrangement step = 4 beats (matches `getStepDurationMs() = (60000 / bpm) * 4`)
- Tick conversion: `ticks = event.start * 4 * 480` for start, same scale for duration

### Scope
- Note-on / note-off events for all note tracks
- MIDI CC events for all CC automation tracks
- Respect channel assignments already computed in `assignEventIds`
- BPM written into the MIDI tempo track (format 1 track 0)
- Export as a browser download (no server needed — just a `Blob` + `URL.createObjectURL`)

### Open questions before building
- Export one pass through the arrangement, or the full looped form as laid out?
- Include CC automation in the initial export or defer to a follow-up?

## Mini-Notation Gaps (vs. pattrns / TidalCycles spec)

Prior art: Renoise's [pattrns library](https://renoise.github.io/pattrns/guide/cycles.html) implements the same mini-notation. Their spec highlights features worth adding:

- `<c4 e4 g4>` — alternating values, one per cycle (rotate through on each repetition)
- `c4|d4|e4` — random choice each cycle
- `_` — elongation, sustains the previous note into the next step slot

These are well-defined and a natural next step after MIDI export.

## Language Features (longer term)

- Add `ur` for repeating or extending higher-level pattern structures without forcing density-style subdivision
- Revisit `seqP` to move closer to real Tidal semantics instead of the current equal-step model
- Expand sequence-expression support beyond `cat` and `replicate`
- `midichan` override per voice or CC track
- Patterned `ccn` (multiple CC controllers in one voice expression)

## Section-Oriented Authoring

### The problem with track-first organization

In the current model, the arrangement is written track-first: each `track` block owns its full timeline. For a 4-track, 8-section song this means writing eight separate `seqP` lines across four track blocks — the song structure (intro, verse, chorus, bridge…) is implicit and scattered. Adding or reordering a section requires editing every track in parallel.

Section-oriented authoring inverts this: each `section` block describes *all* the tracks for that section. The song structure is explicit in one place. This is how most DAW arrangers work — horizontal rows are sections, vertical columns are instruments.

### Proposed syntax

Both forms should be supported. The two are equivalent and the parser can normalize either to the same internal track model.

**Track-oriented (current):**

```tidal
let d_verse = stack [ s "bd cp bd cp", s "hh*8" ]
let d_chorus = stack [ s "bd*4", s "[hh oh]*4" ]

track drums {
  seqP [ d_verse.16 d_chorus.16 d_verse.16 d_chorus.16 ]
}
track bass {
  seqP [ b_verse.16 b_chorus.16 b_verse.16 b_chorus.16 ]
}
```

**Section-oriented (proposed):**

```tidal
let verse = section {
  drums:  stack [ s "bd cp bd cp", s "hh*8" ],
  bass:   n "c2 ~ g2 ~ f2 ~ g2 ~" # s "bass",
  chords: stack [ n "c3 ~ a2 ~" # s "pad", n "e3 ~ c3 ~" # s "pad" ],
  lead:   n "c4 ~ e4 ~ g4 ~ e4 ~" # s "lead"
}

let chorus = section {
  drums:  stack [ s "bd*4", s "[hh oh]*4" ],
  bass:   n "c2 e2 g2 e2 f2 a2 g2 ~" # s "bass",
  chords: stack [ n "c3 c3 f2 ~" # s "keys", n "e3 e3 a2 ~" # s "keys" ],
  lead:   n "c5 b4 a4 g4 e4 ~ c4 e4" # s "lead"
}

song [
  intro.8 verse.16 chorus.16 verse.16 chorus.16 bridge.16 verse.16 chorus.16 outro.8
]
```

The `song [...]` line uses the same sequence expression syntax as `seqP` — `.N` repetition, space-separated references, parenthesized groups all work.

### Parser normalization

The section-oriented form transposes to track-oriented before arrangement parsing:

1. Collect all `section` blocks; record each `trackname: pattern` assignment.
2. Parse the `song [...]` line into an ordered sequence of section references with counts.
3. For each unique track name found across all sections, synthesize a `track` block containing a `seqP` with the section patterns in order.
4. If a section omits a track that other sections define, insert silence (`~ ~ ~ ~`) for that track in that slot so timing stays aligned.
5. Pass the synthesized track blocks to the existing arrangement parser unchanged.

Nothing downstream — rendering, playback, MIDI export — changes. The section form is purely a front-end authoring syntax.

### Design decisions before building

- **`song` required or optional?** If omitted, sections render in source order. This makes quick sketches possible without a separate `song` line.
- **Omitted tracks.** A section that doesn't define a track fills that slot with rest events equal in duration to the section length. The track still appears in the arrangement view.
- **Mixed usage.** A file can contain both `track` blocks and `section` blocks. The `track` blocks are added directly; `section` + `song` blocks are normalized and merged in. Track names that appear in both are combined in timeline order (sections resolve first, tracks appended after, or vice versa — needs a decision).
- **Nested let bindings in sections.** A section block should respect `let` bindings defined above it in the same scope, consistent with how `track` blocks work today.

### Implementation sketch

New parser entry points in `parser.js`:

- `parseSectionBlock(src)` → `{ name, tracks: Map<string, patternExpr> }`
- `parseSongLine(src)` → sequence expression (same as `seqP` item expansion)
- `normalizeSections(sections, songOrder, bindings)` → array of standard track objects, ready for `parseArrangement`

The normalization step is where the transpose happens. It is a pure data transformation with no rendering dependencies, so it can be tested independently.

## Parser Strategy: Roll Our Own vs. Adopt an Existing Implementation

The current parser is hand-rolled and covers a useful subset of Tidal mini-notation. It works well for the features implemented so far, but it will hit limits as the language grows. Each new combinator or edge case requires careful regex surgery and bracket-depth accounting. The question is whether to keep extending it or to replace it with a real parser.

### Risk of continuing to roll our own

The Tidal language is not simple. It has a richer type system (Patterns are applicative functors), polyphony, time transformations, and combinators that interact in non-trivial ways. A hand-rolled regex parser will get progressively harder to extend correctly, especially for:

- overlapping or nested pattern combinators (`ur`, `slow`, `fast`, `every`, etc.)
- proper cycle-time semantics (vs. our current discrete-step model)
- simultaneous voice merging in `ur`-style bracket syntax
- transformations/effects passed as first-class values

### Candidate implementations to evaluate

**tidal-mondo** (Codeberg: uzu/tidal)
`https://codeberg.org/uzu/tidal/src/branch/main/tidal-mondo`
A PEG/mondo-based parser for Tidal mini-notation. Could potentially be compiled to JS or WASM and run in-browser. Worth evaluating whether it produces an AST we could walk to generate our arrangement events.

**tidal-parse** (Codeberg: uzu/tidal)
`https://codeberg.org/uzu/tidal/src/branch/main/tidal-parse`
The parsing layer of the same project. May be more separable from the full runtime than the full tidal-mondo package.

**zwirn** (Codeberg: uzu/zwirn)
`https://codeberg.org/uzu/zwirn`
A Tidal-compatible pattern engine. More complete runtime semantics. Could potentially drive playback and arrangement generation directly if it has a JS target or can be called via WASM.

### Broader research and prior art

The idea of a first-class pattern language for music has a longer history worth knowing:

**Common Music** (Heinrich Taube, 1989–present)
`https://commonmusic.sourceforge.net/cm/res/doc/cm.html`
A Lisp-based composition system with a rich pattern and scheduling model. One of the earliest environments to treat musical patterns as composable, transformable data structures. The pattern classes (`cycle`, `palindrome`, `heap`, `line`, etc.) are a direct ancestor of what Tidal is doing. Worth reading for the vocabulary it established.

**"Manipulations of Musical Patterns"** (Laurie Spiegel, 1981)
`https://www.researchgate.net/profile/Laurie-Spiegel/publication/266316606_Manipulations-of-Musical-Patterns/links/5bd8b7e34585150b2b92049f/Manipulations-of-Musical-Patterns.pdf`
A short paper from 1981 that describes musical patterns as abstract objects subject to systematic transformation (retrograde, inversion, rotation, augmentation, etc.). Predates most of the software in this space and frames the problem in terms that hold up well. Good grounding for understanding *why* these pattern languages look the way they do.

### Decision criteria

Before switching parsers, evaluate:

1. **Browser-deployable?** The app is a single static HTML file. Any dependency must either compile to JS/WASM or be small enough to inline.
2. **AST-first or eval?** We need an AST or event-stream we can query — not a live audio output. If the implementation is eval-only (feeds directly to an audio engine), it may be hard to adapt.
3. **Cycle semantics vs. step semantics.** Real Tidal operates in continuous cycle time. Our app uses discrete steps. Bridging these is the core conceptual challenge regardless of which parser is used.
4. **Maintenance surface.** A dependency on an external project shifts the risk from "parser bugs" to "upstream changes and integration complexity."

### Recommended approach

Keep the current parser for now — it is good enough for the song-builder use case and the features planned in the near term. When a specific feature cannot be cleanly added without rewriting a large chunk of the parser, that is the signal to revisit. At that point, prototype with tidal-mondo or zwirn first before committing to a full migration.

## Conditional Triggers, Micro-timing, and Playhead Rules

### The core idea: patterns as entire songs

The Elektron sequencer boxes have a concept called *trig conditions* — a note in a pattern can be marked so it only fires on every 2nd pass, every 8th pass, with 50% probability, only the first time, never the first time, etc. The implication is profound: a single 16-step pattern can carry far more musical information than it appears to. With enough trig conditions, fills, variations, and probability gates all co-exist in the same pattern object, and the song emerges from the interaction of conditions over time rather than from explicit arrangement.

The goal here is to push this further — combining conditional triggers, probabilistic firing, micro-timing offsets, and multi-playhead evaluation to the point where a single pattern expression can represent an entire song.

### Trig conditions (pass-count and modular logic)

Every note or event in a pattern can carry a *condition* that gates whether it fires on a given pass through. Conditions reference the playhead's pass count — the number of times the playhead has completed the full pattern — and evaluate to true or false.

Proposed condition types:

| Syntax | Meaning |
|---|---|
| `bd` | always fires (default, no condition) |
| `bd!2` | fires every 2nd pass (passes 2, 4, 6, ...) |
| `bd!8` | fires every 8th pass (long-period events: crashes, fills) |
| `bd!1` | fires only on the 1st pass (intros, pickups) |
| `bd!>1` | fires on all passes after the 1st (skip intro) |
| `bd!1:8` | fires on passes 1 through 8 (verse section) |
| `bd!9:` | fires on pass 9 and beyond (post-chorus) |
| `bd%2` | fires on odd passes (1, 3, 5, ...) |
| `bd?50` | fires with 50% probability each pass |
| `bd?75` | fires with 75% probability |

The pass counter is per-playhead, not global — so two playheads on the same pattern at different rates accumulate pass counts independently. A "chorus playhead" that runs only when the chorus section is active would see its own pass count starting from 1 when it first enters.

These are annotations on individual events, not on the whole pattern. A pattern with a mix of always-on and conditional events can contain a full arrangement in one expression:

```
stack [
  s "bd cp bd cp",           -- always
  s "hh!2*8",                -- hi-hats only on even passes
  s "oh!4",                  -- open hat every 4th pass
  s "crash!8",               -- crash every 8th (downbeat of new section)
  n "c4 e4 g4 ~" # s "lead", -- always
  n "b3!>4" # s "lead"       -- counter-melody enters after 4 passes
]
```

### Probabilistic firing

Probabilistic conditions (`?P`) sample a uniform random value each time the note is reached and fire if the value falls below P. Unlike pass-count conditions, probability is evaluated fresh on every pass, every playhead, every evaluation — no memory.

Probability and pass-count conditions can be combined: `bd!>2?50` means "after the 2nd pass, fire with 50% probability." The condition evaluates left-to-right: pass-count gates first, then probability.

For reproducible randomness (important for preview/export consistency), the RNG can be seeded from `(playhead_id, pass_count, event_position)` — making the "random" variation deterministic and repeatable given the same starting conditions.

### Micro-timing: trip notes ("Dilla mode")

A *trip* annotation on a note nudges its onset forward or backward in time by some amount, without changing its duration or its position in the pattern grid. This is the quantitative version of what J Dilla did by hand — placing beats slightly ahead or behind the grid to create a feeling of looseness, heaviness, or groove.

Proposed syntax:

| Syntax | Meaning |
|---|---|
| `cp` | on the grid |
| `cp+8` | 8ms late (pushed back, heavy feel) |
| `cp-6` | 6ms early (pushed forward, urgent feel) |
| `cp~16` | random nudge ±16ms, resampled each pass |
| `cp~8!2` | random nudge ±8ms, but only on even passes |
| `cp^sine` | nudge follows a sine curve over the pattern cycle |

The `~` form makes the groove feel human and inconsistent. The `^shape` form creates a systematic micro-timing drift — the beat slowly breathes in and out of time, which at slow speeds creates a floating, disorienting effect.

Trip amounts are in milliseconds, independent of BPM, because the perceptual effect of micro-timing is absolute rather than proportional. (At 80 BPM, 16ms is a very small fraction of a beat; at 200 BPM it is significant — this asymmetry is part of how groove works.)

### Playhead rules and named playheads

A playhead is not just a position counter. It can carry:

- **An identity** (name or label, e.g. `"verse"`, `"chorus"`, `"fill"`)
- **A pass counter** (how many loops completed)
- **A rate** (already implemented in explore.html)
- **A filter predicate** — determines which events the playhead "sees" and fires
- **A transform** — modifies events before firing (transpose, velocity scale, reverse, etc.)

#### Filter predicates

A playhead's filter predicate is evaluated against each event it encounters. The playhead only fires events for which the predicate returns true. Examples:

- `playhead.filter = (ev) => ev.tags.includes("chorus")` — only fires events tagged `chorus`
- `playhead.filter = (ev) => ev.isDrum` — drums-only playhead
- `playhead.filter = (ev) => ev.pitch > 60` — only fires notes above middle C
- `playhead.filter = (ev) => Math.random() < 0.3` — fires any event with 30% probability

Pattern syntax for tagging events: `bd#verse` or `s "bd cp bd cp" # tag verse`. Tags are metadata that do not affect pitch or timing but are visible to playhead predicates.

#### Transform functions

A playhead's transform is applied to every event it fires, after filtering:

- **Transpose**: shift all pitches by N semitones
- **Velocity scale**: multiply velocity by a factor (e.g. 0.5 for ghost notes)
- **Reverse**: play events in reverse time order within each cycle
- **Swing**: apply a global swing offset to all events this playhead sees
- **Phase offset**: the playhead starts at a non-zero phase, hearing the pattern from a different entry point

Multiple playheads on the same pattern with different filters and transforms can produce layered results that would require multiple separate tracks to write explicitly. A "fill playhead" with filter `ev.tags.includes("fill")` and rate `!8` would produce a fill every 8th pass without any explicit fill section.

### Fills and layers via playhead composition

Concrete example of a full-song pattern using these ideas:

```
-- One pattern, multiple playheads:
--   main playhead: rate 1×, no filter, always running
--   fill playhead: rate 1×, filter=tag("fill"), only active every 8 passes
--   chorus playhead: rate 1×, filter=tag("chorus") OR tag("main"), active on passes 5-8, 13-16, ...
--   ghost playhead: rate 1×, transform=velocity(0.3), filter=tag("ghost"), always running

stack [
  s "bd cp bd cp",
  s "bd#fill cp#fill bd cp",          -- these events visible to fill playhead only
  s "hh*8",
  s "oh#chorus",                       -- open hat only when chorus playhead is active
  n "c4 e4 g4 ~" # s "lead",
  n "f4 a4 c5 ~" # s "lead" # tag chorus,
  n "g3?50" # s "bass",               -- probabilistic bass ghost notes
  n "g3#ghost*4" # s "bass"           -- ghost bass, handled by ghost playhead at low velocity
]
```

The same physical pattern object produces verse texture, chorus texture, fills, and ghost notes depending on which playheads are currently active and what their pass counts are. No separate sections or arrangement needed — the song emerges from the playhead schedule.

### Sub-cycles and condition clocks

Pass-count conditions (`!N`) count full loops of the pattern. But you might want conditions that count something else:

- **Bar count**: fires every N bars, where a bar is smaller than the full pattern
- **External clock**: fires on beat 1 of every N measures coming from a MIDI clock
- **Playhead-relative count**: fires every Nth time *this specific playhead* encounters this event (not total loops)
- **Cross-playhead**: fires only when playhead A is on an even pass AND playhead B has completed at least 4 loops

The last form is the most powerful — it allows coordination between playheads without explicit arrangement. A crash cymbal that fires when both the main playhead is on pass 8 AND the "section" playhead has just wrapped is a section boundary marker that emerges from the interaction of two independent counters.

### Connection to the homoiconic IR

All of these annotations can be represented as decorators on S-expression leaf nodes:

```
(note bd)                              -- plain trigger
(note bd (cond (every 2)))             -- fires every 2nd pass
(note bd (cond (prob 0.5)))            -- 50% probability
(note bd (trip (rand 16)))             -- ±16ms random micro-timing
(note bd (tag fill))                   -- tagged for fill playhead
(note bd (cond (every 8)) (tag crash)) -- every 8th, tagged crash

-- Combined:
(note cp (cond (after 2) (prob 0.75)) (trip (rand 8)))
-- "After pass 2, fire with 75% probability, with ±8ms random timing"
```

This is clean because the base note is unmodified — the decorators are pure metadata visible to the evaluation engine. A simple evaluator that ignores all decorators produces a dense, always-on version. A full evaluator applies each decorator in order. The S-expression representation makes it easy to strip, add, or transform decorators with rewrite rules.

## Ahead-of-Time Condition Evaluation and Pass Counting

### The core distinction from Tidal

Tidal evaluates patterns lazily in real time — each cycle is computed as the clock reaches it, and stochastic events (probability gates, random choices) are rolled fresh on each pass. You cannot see the "future" of a Tidal pattern without playing it.

This project takes the opposite approach in the arranger: patterns are evaluated **ahead of time**, before playback begins. The full timeline is computed once when you press Execute, stochastic dice rolls happen during that render pass, and the result is a committed, deterministic event list. This is what makes the piano-roll visualization possible — you are looking at a rasterized future, not a live stream.

The tradeoff is that stochastic events have no single "true" future — each render produces a different realization. This is a feature, not a bug. Pressing Execute is equivalent to rolling the dice and choosing one universe to inhabit. If you want a different stochastic outcome, you press Execute again. The arrangement you export to MIDI is always the committed version.

The pattern explorer (`explore.html`) takes the opposite approach: conditions are evaluated JIT per playhead pass, probabilistic events flicker on and off, and the visualization shows the live state of the pattern. Both views are useful; they answer different questions.

### Pass count threading

For AOT condition evaluation to work, the renderer needs to know which **repetition** of a named pattern each segment is. When `.N` expands `verse.16`, the 16 resulting segments are repetitions 1 through 16 of `verse`. A `crash!8` condition inside `verse` should fire on segments 8 and 16 — the 8th and 16th repetition.

The pass count is tracked as a `pass` field on step objects produced by `expandSequenceExpression`. The `.N` and `replicate` operators stamp each repetition with its 1-based index. Steps that don't come from a repetition context get `pass: 1`.

**Reset-per-phrase semantics**: pass counts reset at each `.N` boundary. In `(verse.3 chorus).4`, the outer `.4` creates 4 repetitions of the phrase. Within each phrase repetition, `verse.3` creates its own passes 1, 2, 3. The verse pattern inside the second outer repetition still sees passes 1, 2, 3 — not 4, 5, 6. This is the right musical behavior: the inner recurrence structure is self-contained and does not need to know which outer cycle it is in.

Accumulated pass counting (where verse in the second outer cycle would see passes 4, 5, 6) would be a different and sometimes useful mode. A future "bake" operator could collapse one level of recurrence into a flat sequence that then accumulates pass counts into the outer cycle — similar to Tidal's `mask` which applies a Boolean pattern to gate another pattern's events.

### Stochastic visualization and the parallel universes problem

In the arranger, stochastic events collapse to a single committed timeline at render. In the explorer, they remain undetermined until a playhead pass fires them. A third mode — not yet implemented — would show the **probability distribution** across realizations rather than any single one:

- `?P` events could be rendered at opacity `P` — visually present but semi-transparent, indicating uncertainty
- K sample runs could be overlaid to show the range of possible outcomes (color density = frequency)
- A pass-matrix view (time-within-pass × pass-number, 2D grid) would show which conditions fire on which passes, with stochastic events shown as gradient cells

This is most useful in the explorer as a "preview all futures at once" mode. The arranger's AOT model is incompatible with this — once you've committed a timeline, there is only one universe.

### Future: baking and outer-cycle operations

The reset-per-phrase semantics described above means inner recurrences are opaque to the outer cycle. A future `bake` operator would "flatten" one level of recurrence, converting pass-conditional events into a fully expanded sequence. After baking, a new outer recurrence could reference the baked result and apply fresh conditions to it — similar to how Tidal's `mask` applies a pattern of Booleans over another pattern's output.

```tidal
-- hypothetical syntax:
let verse_expanded = bake verse.8    -- evaluates 8 passes of verse, commits them
seqP [
  (verse_expanded chorus).4!>2       -- outer condition on the baked result
]
```

This gives you a two-level recurrence structure where the inner and outer cycles can carry independent condition clocks. Without `bake`, the inner pass count is always local; with `bake`, the inner structure is frozen and only the outer structure counts.

## Homoiconic Intermediate Representation

The idea: define an S-expression intermediate language (IL) that sits between the terse human-writable tidal surface syntax and the runtime event model. Pattern expressions would be writable tersely as tidal notation, transpiled to S-expressions for storage, manipulation, and rewriting, and optionally pretty-printed back to something approximating the original tidal notation.

### Why homoiconicity matters here

A homoiconic language is one where the program and its data share the same representation — the canonical example being Lisp, where code is S-expressions and S-expressions are lists you can manipulate as data. The payoff:

- **Serialization is free.** An S-expression pattern is already a data structure. You can store it to JSON, transmit it over a wire, diff two patterns structurally, or render it as a tree without a separate serialization step.
- **Rewriting is composition.** A macro or rewrite rule is just a function from S-expression to S-expression. You can chain rules, apply them selectively, memoize expansions, or run them in reverse. Pattern transformations like `slow`, `fast`, `rev`, `every` become rewrite rules rather than runtime operators — they transform the expression before evaluation, not during.
- **The AST is the patch.** In chunkseq terms, an S-expression tree is a wiring diagram. Inner nodes are combinators (functions); leaves are values. Rendering the tree visually gives you a patch graph for free.

### Proposed S-expression primitives

A minimal core that can represent all current tidal-arranger patterns:

```
(seq e1 e2 ... eN)       -- time-sequential: divide span evenly, one child per slot
(stack e1 e2 ... eN)     -- polyphonic: all children play simultaneously over full span
(rep N e)                -- repeat e N times within the current span
(note pitch instrument)  -- leaf: a single note event
(cc n v)                 -- leaf: a CC value
(rest)                   -- leaf: silence
(with-inst name e)       -- bind instrument name to all note leaves in e
(ur N schedule)          -- ur combinator: schedule is a (seq ...) of named patterns
(slow N e)               -- stretch e to N times its natural duration
(fast N e)               -- compress e to 1/N of its natural duration
(every N f e)            -- apply rewrite rule f to e on every Nth cycle
```

This is a closed set at the core. Extensions (LFO shapes, CC automation, custom combinators) are added as new named forms without changing the evaluator's core loop.

### Tidal surface → S-expression transpiler

The current tidal-arranger parser already walks the surface syntax and produces events. A transpiler would produce an S-expression AST instead, which could then be evaluated to events as a second pass. Example mappings:

| Tidal surface | S-expression |
|---|---|
| `s "bd cp hh"` | `(seq (note 36 bd) (note 39 cp) (note 42 hh))` |
| `s "bd*4"` | `(rep 4 (note 36 bd))` |
| `s "[bd hh] cp"` | `(seq (seq (note 36 bd) (note 42 hh)) (note 39 cp))` |
| `n "c4 e4 g4" # s "lead"` | `(with-inst lead (seq (note 60) (note 64) (note 67)))` |
| `stack [a, b]` | `(stack a b)` |
| `cat [a, b, c]` | `(seq a b c)` |
| `ur 12 "a b c"` | `(ur 12 (seq a b c))` |
| `ccn 74 # ccv (sine 16 10 110)` | `(cc 74 (sine 16 10 110))` |

The transpiler is straightforward because the current parser already does most of this work — it just emits events instead of an AST node. Separating those two concerns (parse → AST, AST → events) is the structural change needed.

### Macro-style rewriting rules

Once patterns are S-expressions, rewrite rules are functions `SExpr -> SExpr`. Examples:

```
-- Expansion rules (sugar → core)
(ur N (seq a b c))  →  (seq (rep 4 a) (rep 4 b) (rep 4 c))   [when N/3 = 4]
(rep 1 e)           →  e
(seq e)             →  e
(stack e)           →  e

-- Normalization rules (for canonical form / comparison)
(rep N (rep M e))   →  (rep (* N M) e)
(seq (seq ...))     →  (seq ...)         [flatten nested seqs at same time level]

-- Factoring rules (for display / compression)
(seq e e e e)       →  (rep 4 e)         [when all children identical]
(stack e e)         →  (rep-voices 2 e)  [hypothetical]
```

Rules can be run forward (expansion, for evaluation) or as recognizers in reverse (compression, for display). A pattern editor could apply normalization before display to collapse verbose expanded forms back to readable expressions.

### S-expression → tidal round-trip

Full round-tripping is not possible in general — the surface syntax is lossy (e.g., `bd*4` and `[bd bd bd bd]` are the same pattern; the transpiler picks one). But a pretty-printer with recognition heuristics can produce a reasonable approximation:

1. **Leaf recognition**: `(note 36 bd)` → `bd`, `(note 60)` → `c4`
2. **Rep compression**: `(seq x x x x)` where all children are equal → `x*4`
3. **Bracket grouping**: nested `(seq ...)` inside a parent `(seq ...)` → `[...]`
4. **Stack flattening**: `(stack a b)` → `stack [ a, b ]`
5. **Instrument hoisting**: if all notes in a `(seq ...)` share the same instrument, emit `n "..." # s "instrument"`

The result will not be identical to what the human typed but should be semantically equivalent and human-readable. This is the same challenge compilers face when pretty-printing decompiled code — it is a heuristic best-effort, not a bijection.

### Why this matters for chunkseq

If chunks in chunkseq store their note content as S-expression patterns rather than raw note arrays, then:

- A chunk's behavior can be edited either graphically (piano roll modifies the `(seq ...)` leaves) or textually (type a tidal expression, transpile to S-expression, store)
- Chunk-to-chunk connections become rewrite rules: connecting chunk A's output to chunk B's transpose input is equivalent to wrapping B's pattern in `(transpose (output-of A) ...)` in the S-expression
- Saving a project is just serializing a map of S-expression trees to JSON
- Generative patches can construct S-expressions as data and evaluate them as patterns

### Open questions

- Should the IL be pure S-expressions (lists + atoms) or typed nodes (tagged objects)? Typed nodes are easier to validate and pattern-match in JS; pure lists are more flexible and closer to Lisp.
- How should time be represented in the IL? As a continuous rational ratio (like Tidal's `Time = Rational`) or as discrete steps? This is the same cycle-vs-step tension that appears elsewhere.
- What is the right granularity for a leaf node? A single note? A beat? A step? The granularity determines how much structure is visible to rewrite rules.
- Is `(every N f e)` rewriting at macro-expand time (static, compile-time-like) or at evaluation time (dynamic, each cycle)? The answer changes whether the IL is a static AST or a running interpreter.

## Re-entrant Patterns and Multi-Playhead Evaluation

Most pattern languages — including Tidal — assume a single linear playhead that sweeps forward through time and samples each pattern expression at each point. This is clean and composable, but it forecloses a class of musically interesting behaviors that require multiple, conditionally-active, or recursively-nested playheads.

### What re-entrancy means here

A pattern expression is *re-entrant* if evaluating it can cause it to be evaluated again with a different (or displaced) time position before the first evaluation has completed. This is the pattern equivalent of a recursive function. Simple examples:

- A pattern that spawns a copy of itself at some offset (echo, canon, imitation)
- A pattern whose output feeds back as input to modulate its own parameters on the next cycle
- A pattern that, upon reaching a certain state, jumps back to an earlier point (loop with conditional exit)

These cannot be expressed in a purely applicative model like Tidal's (where `Pattern a = Time -> [Event a]`) without either threading explicit state through the time function or lifting the feedback to a higher level.

### Multi-playhead evaluation

Instead of one playhead per track, imagine a track having a *set* of active playheads, each with its own position and (optionally) its own state. New playheads can be spawned, paused, or killed by pattern expressions. This maps naturally to musical ideas:

- **Polyrhythmic independence**: two playheads on the same pattern running at different rates (one at ×1, one at ×3/4) without needing to pre-compute a common LCM grid
- **Stochastic branching**: a playhead forks at a decision point; each branch plays out independently and then rejoins (or one wins based on a condition)
- **Canon/round**: a single pattern expression evaluated by N playheads staggered by a fixed offset — no need to write out each voice explicitly

The evaluation model shifts from *"what events are active at time T?"* to *"what is the current set of active playheads, and what does each one emit right now?"* This is closer to how a concurrent process model (CSP, actors) works than how a pure function model works.

### Conditional playheads

A conditional playhead only advances (or only triggers events) when some predicate holds. The predicate can be:

- **External**: a gate signal, a CC value crossing a threshold, a MIDI clock pulse
- **Internal**: the playhead's own position modulo N, the count of times a loop has repeated, the output of another pattern
- **Structural**: the playhead is inside a branch of a pattern that only activates on odd cycles, or only when another track is silent

This starts to look like a dataflow graph where patterns are nodes and playheads are tokens moving through the graph — which is exactly the metaphor behind modular patchable sequencers.

### Connection to chunkseq

The chunkseq project (`~/sandbox/dnewcome/chunkseq`) is a natural home for these ideas. It is already built on a node-graph paradigm: each "chunk" is a sequence node with explicit trigger inputs, loop-point inputs, a transpose input, and a loop-end output port. The goal is eventually to connect chunk outputs to other chunks' inputs via visual patch cables. The patch metaphor makes multi-playhead evaluation concrete: each cable carries a signal stream, each chunk is a pattern transformer, and routing a cable back would create the feedback path needed for re-entrancy.

ChunkSeq currently uses Tone.js for scheduling and a canvas piano roll for note entry. All chunks share one synthesizer (triangle oscillator). There is no persistent storage or MIDI export yet, and chunk-to-chunk connections are planned but not yet wired up.

Specific ideas that could translate from tidal-arranger's pattern language to chunkseq:

- **Pattern expressions as chunk behavior descriptors**: instead of drawing notes in the piano roll, a chunk's output could be described by a pattern expression. The expression language from this project could specify what values the chunk emits and when, making it programmable rather than only graphical.
- **Functional combinators as patch topologies**: `stack`, `cat`, `ur` are essentially wiring diagrams. `stack` is a merge node; `cat` is a sequential switch; `ur` is a demultiplexer with a schedule. Making these visual in a patch UI would make the language more discoverable to non-coders.
- **Playhead as a first-class routable signal**: chunkseq already has an implicit global clock via Tone.js Transport. Making the playhead an explicit signal that can be split, delayed, gated, or reversed before reaching a chunk node would be the modular equivalent of Tidal's time-transforming functions (`slow`, `fast`, `rev`, `iter`).
- **Conditional routing**: a chunk node that only passes its playhead signal downstream when a condition holds — enabling the conditional playhead model described above without requiring the pattern language itself to have conditional syntax. This maps directly to chunkseq's planned "probability gates and conditional logic nodes."

### Open questions

- What is the minimal state a playhead needs to carry? (position, rate, loop count, identity, parent reference?)
- Should re-entrancy be bounded (max recursion depth, max active playheads) or unlimited?
- How do you render a multi-playhead arrangement in a piano-roll style view? (Each playhead's events could be a different shade or layer.)
- Is there a clean functional encoding of multi-playhead semantics that remains referentially transparent, or does it require explicit concurrency primitives?

## Pattern Language for Granular Synthesis (wavmulch connection)

`~/sandbox/dnewcome/wavmulch` is a granular synthesizer that already exists as a working prototype. It analyzes a corpus of WAV files into grains (100ms Hann-windowed segments), runs NMF to learn an 8-dimensional timbral feature space, and uses MIDI knobs to navigate that space in real time — selecting and triggering grains by nearest-neighbor in the feature space. The grain rate, randomness, and volume are also MIDI-controllable.

The connection to the multi-playhead pattern language is direct: **granular synthesis is already multi-playhead evaluation, just operating on audio samples instead of MIDI events.** Each voice of polyphony in a granular synthesizer is a playhead reading through a source file; the grain density, position, and feature-space location are the parameters the playhead carries. The trig condition and recurrence grammar developed here could describe all of these.

### The two levels of granularity

**Grain level (100ms windows) — traditional granular**

This is what wavmulch currently does. Each "event" in the pattern is a grain — a windowed slice of a source audio file with a position, duration, and location in the NMF feature space. A pattern of grains describes where in the source file to read, how often, and with what conditions:

```
-- pseudocode: grain pattern syntax
grain_voice [
  pos "0.0 0.25 0.5 0.75",    -- step through 4 positions in the source file
  feat0 "0.2 0.8 0.5 0.3",    -- NMF component 0 value at each grain
  rate "1 2 1 4",              -- grains per second at each step
  grain!2,                     -- whole voice only fires every other pass
  grain?75                     -- and with 75% probability when it does
]
```

The trig conditions already implemented (`!N`, `?P`, `!>N`, etc.) transfer directly to grains. A grain that fires `!8` creates a sparse texture that only appears every 8th cycle — the same structural thinking as a crash cymbal, but in the audio grain domain.

**Sample point level — wavetable / phase vocoder territory**

At the extreme, the "events" are individual sample points in the PCM data. A playhead sweeping through the sample file at audio rate and reading each point is just a wavetable oscillator. Multiple playheads at different phases, rates, and positions through the same wavetable produce classical wavetable synthesis effects — chorus, phasing, beating. Trig conditions on sample points that skip or repeat certain regions would create glitch, stutter, and interpolation artifacts that are musically interesting.

This is a much more computationally intensive model than grain-level, but the pattern language grammar could be the same — only the event resolution changes.

### Playheads as grain voices

Directly mapping the multi-playhead model from the pattern explorer onto wavmulch:

- **Each playhead is one grain voice** — an independent reader of the grain library with its own phase, rate, and pass counter
- **Rate** controls how fast the playhead sweeps through the pattern, which translates to grain density (grains per second)
- **Phase offset** between playheads creates the classic granular widening/chorus effect — the same source material heard slightly displaced in time
- **Trig conditions** create rhythmic grain patterns: `grain!2` fires on alternate passes, creating a pulsing texture without any explicit sequencing
- **Playhead rules** (from the conditional playhead section) filter which grains a voice can select: one playhead might only select bright grains (NMF component 0 > 0.6), another only selects low-frequency grains, and together they produce a timbral counterpoint

### The NMF feature space as pattern coordinates

wavmulch's 8-dimensional feature space is essentially a coordinate system for timbre. A pattern expression over those coordinates navigates the timbre space over time, exactly like a melodic pattern navigates pitch space:

```
-- CC automation syntax extended to NMF coordinates:
feat0 # ccv (sine 16 0.1 0.9)   -- sweep NMF component 0 with a sine LFO
feat1 # ccv "0.2 0.8 0.2 0.5"   -- step component 1 through 4 values
```

The existing CC automation grammar (`ccv (sine N lo hi)`, `ccv "v0 v1 v2 ..."`) already describes this shape. The only change is that the "CC number" becomes an NMF component index and the range is 0.0–1.0 instead of 0–127. The pattern language doesn't need to change at all — just the synthesis backend that evaluates it.

### A pattern-based granular instrument

The combination of these ideas describes a new kind of instrument:

1. **Load a sample or corpus** — the grain library is the instrument's "tuning"
2. **Write a pattern** — describes grain positions, feature-space coordinates, density, and conditions using the existing mini-notation
3. **Run playheads through it** — multiple playheads at different rates and phases produce polyphonic granular texture; their trig conditions and pass counters determine the large-scale structure
4. **Export the result** — either as a WAV file (audio render) or as a MIDI file that drives the synthesizer in real time

This closes the loop between the pattern language and audio synthesis: the same grammar that describes a drum loop (`s "bd cp hh*2"`) could describe a granular texture, with the drum names replaced by grain selectors and the MIDI output replaced by audio sample playback.

### Specific extensions worth prototyping in wavmulch

- **Pattern-driven grain triggering**: replace the continuous `GrainNote` thread with a step sequencer that evaluates a pattern expression each step, selecting grains based on the current pattern position
- **Grain conditions**: attach trig conditions to individual grains in the library at analysis time (e.g., tag bright grains, transient grains, or grains from a specific source file); playheads with matching filters then fire or skip those grains
- **Multi-playhead grain engine**: instead of one `GrainNote` per MIDI note, maintain a set of named playheads each with independent rate, phase, feature-space target, and condition set
- **Feature-space path patterns**: express NMF coordinate trajectories as patterns (using the existing LFO shapes — sine, saw, tri — applied to component values over time)
- **Cross-sample stack**: `stack` multiple grain sources — grains from kick samples layered with grains from a crash sample — with conditions controlling which layer is active at any pass

### Open questions

- At what time resolution does a "pass" make sense for granular? At grain rate (50ms–2s), it maps cleanly. At sample rate (22µs at 44100 Hz), pass counting becomes meaningless. The recurrence grammar probably needs a time-scale parameter.
- How do you render a granular pattern in a piano-roll style view? The x-axis is still time, but the y-axis could be sample position, NMF component value, or pitch (if the grains are pitched). Three very different visualizations of the same data.
- The NMF feature space has no natural ordering — component 3 is not "higher" than component 2 in any musical sense. This makes the grid metaphor of a piano roll awkward. A 2D scatter plot (two NMF components as axes, dots as grains) might be a better visualization primitive.
- Is it worth forking wavmulch into a version that can read a pattern expression file and render to WAV offline, without real-time MIDI control? That would be the granular equivalent of this project's MIDI export.

## Real-Time Linear Score Generation from Multi-Playhead Patterns

### The idea

The multi-playhead view in `explore.html` runs patterns in real time with independent playhead rates and pass counters. Right now the view shows the static piano roll and highlights notes as they fire. A compelling extension would be to record the live output and render it as a scrolling linear arrangement — a score that grows rightward as the pattern plays, accumulating a permanent record of what actually happened.

This is closer to what Tidal does visually (pattern → time → events), but built around the specific strengths of this project: readable, zoomable, WebGL-rendered piano rolls rather than the minimal dot-matrix displays typically built into Tidal tools.

### What this would look like

As a multi-playhead pattern plays, each fired event gets appended to a growing event buffer. A second canvas panel (below or beside the existing pattern view) renders this buffer as a conventional left-to-right piano roll — the same WebGL arrangement renderer used in `index.html`, but driven by the live event stream instead of a pre-computed arrangement. The scroll position advances with playback so the most recent events are always visible, while earlier history remains scrollable.

The result is a two-panel view:
- **Top**: the static pattern definition (as in `explore.html` today)
- **Bottom**: the living score — the actual sequence of events generated so far, laid out in real time

### Why this is interesting

Multi-playhead patterns with trig conditions produce structures that are not obvious from reading the pattern alone. The combination of independent rates, pass counters, and stochastic conditions creates emergent long-form structure. The linear score makes that structure legible: you can see phrases form, conditions accumulate, and recurring motifs appear at different time scales — things that are hard to perceive while listening but obvious on a timeline.

It also functions as a composition tool: you run a pattern, read the generated score, identify what you like, and transcribe or refine it back into the static arrangement format.

### Relationship to Tidal

This puts the project in direct conversation with Tidal's visualization ecosystem. Tidal has pattern visualizers (Estuary, the built-in scope in SuperCollider), but they are generally real-time only — they show the current cycle, not an accumulating history. A high-quality scrolling score that persists and is legible at multiple zoom levels would be meaningfully better.

The question of whether to build this inside the current project or as a standalone Tidal visualizer is worth thinking through:

**Inside this project**: straightforward, since the WebGL renderer and event model are already in place. Works with the existing pattern language. Limited to patterns expressible in this system (not full Tidal).

**As a standalone Tidal visualizer**: broader applicability, but requires a different input — either OSC messages from SuperCollider/Tidal, or parsing actual Tidal syntax (which is a much larger problem). The OSC approach is feasible: Tidal can send OSC, and a browser tool could receive it via a small WebSocket bridge. The score renderer itself would be largely the same WebGL code.

**As a visualizer for a Tidal-derived language**: the middle path. Rather than targeting full Tidal + SuperCollider, target one of the self-contained Tidal-derived systems (pattrns, Strudel, or this project's own language) where the full stack is accessible from JavaScript. Strudel in particular runs entirely in the browser and has an OSC/MIDI output layer — it would be possible to hook its event stream directly into this renderer without any bridge process.

### What "readable score" means here

The existing piano roll is already more readable than most Tidal visualizations. The additional properties that would make it genuinely score-like:

- **Segment labels**: each phrase or section boundary annotated with the pattern name or pass number that produced it
- **Multi-rate alignment**: if two playheads are at rates 1× and 1.5×, their events appear on a shared timeline so the polyrhythmic relationship is visually clear
- **Condition annotations**: events that fired conditionally could be marked (e.g., a subtle dot or color shift indicating "this fired on pass 4 of the inner pattern")
- **Export**: the accumulated score is a complete `currentArrangement`-compatible data structure, so it can be exported directly as a MIDI file or saved as a tidal arrangement text

### Open questions

- How long should the history buffer be? Unlimited (with virtual scrolling) or capped at N bars?
- Should the score be exportable mid-playback as a MIDI file or tidal arrangement?
- For the Tidal visualizer direction: is OSC-over-WebSocket a viable bridge, or does it require too much infrastructure? Strudel's event model may be easier to target since it runs in-browser.
- Does the "readable score" goal eventually push toward actual music notation (staves, note heads) rather than a piano roll? For rhythmically complex patterns, standard notation may be harder to read than a piano roll; for melodic content, the inverse is often true.

## Notes

### Currently implemented sequence helpers
- `cat [a, b, c]`
- `cat (replicate 4 p)`
- top-level and track-local `let name = expression`

### CC automation (implemented)
- `ccn N # ccv "0 32 64 127"` — stepped pattern
- `ccn N # ccv (sine 16 10 110)` — LFO shapes: sine, saw, tri, square
- `ccn N # ccv 64` — constant value
- CC tracks render as step-function line graphs in the arrangement view
- Note tracks include a velocity lane (needle bars at note start)

### Timing model note
One arrangement step = 4 beats at the current BPM. This is the conversion factor needed for MIDI file export tick calculations.

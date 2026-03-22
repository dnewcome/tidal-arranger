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

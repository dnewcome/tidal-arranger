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

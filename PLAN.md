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

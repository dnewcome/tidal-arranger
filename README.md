# Tidal Clip Prototype

Static HTML proof of concept for turning a small Tidal-inspired pattern language into a DAW-style piano roll.

## Current State

The prototype lives in `index.html` and runs without a build step.

Current behavior:

- A text area accepts a Tidal-style pattern input.
- `Ctrl+Enter` / `Cmd+Enter` reparses the input and replaces the current arrangement view.
- Multiple tracks render top to bottom like a traditional DAW.
- Multiple instruments render in different colors on the same piano roll.
- `--` line comments are supported.
- Empty or fully commented patterns clear the view instead of leaving stale notes behind.

## Current Language Model

The current direction is:

- Keep `stack` for simultaneous layering.
- Use `track ... { ... }` for vertical DAW lanes.
- Use `seqP [ ... ]` for linear sequencing within a track.
- Remove the earlier `clip` implementation.

Example:

```tidal
track drums {
  seqP [
    stack [
      s "bd*4 [cp hh cp] bd"
    ],
    stack [
      s "[bd hh] cp hh bd*2"
    ]
  ]
}

track synth {
  seqP [
    stack [
      n "c4 [e4 g4] a4*2 ~" # s "superpiano",
      n "[60 62] ~ [67 69]*2 72" # s "lead"
    ],
    stack [
      n "a3 [c4 e4] g4*2 ~" # s "superpiano"
    ]
  ]
}
```

## Supported Syntax In The Prototype

This is a proof-of-concept parser, not full Tidal evaluation.

Supported pieces:

- `track name { ... }`
- `seqP [ patternA, patternB, ... ]`
- `stack [ ... ]`
- `s "..."` and `n "..."`
- note names such as `c4`, `f#3`, and numeric MIDI notes like `60`
- bracket subdivision like `[bd hh cp]`
- repetition with `*`, such as `bd*4`
- rests with `~`
- `--` comments

Important simplifications:

- In this prototype, each `seqP` entry occupies one equal-length time slot in its track.
- Top-level plain `stack [...]` input still works and becomes a default single-track arrangement.
- The parser does not implement the full Tidal language or runtime semantics.

## Implementation Notes

- Rendering is done with inline SVG.
- Drum tokens are mapped to fixed MIDI-note lanes.
- Pitched note names are converted to MIDI note numbers.
- The parser is intentionally lightweight and written directly in browser JavaScript.

## Reference Notes

These links are useful for aligning the prototype with real Tidal semantics as the language grows.

### The meaning of `$`

Tidal’s `$` comes from Haskell. It passes the expression on the right into the function on the left and is mainly used to control evaluation order without extra parentheses. The docs also contrast `$` with `#`, where `#` combines patterns rather than just applying a function.

Source:

- https://tidalcycles.org/docs/innards/meaning_of_dollar/

### Maxwell Tfirn TidalCycles Overview

This post gives a practical explanation of cycles, pattern density, nested bracket rhythm structure, and how `*` changes repetition density inside a cycle. It is a useful musical intuition reference for how sequences fit into a fixed cycle duration.

Source:

- https://maxwelltfirn.com/2017/08/12/tidalcycles/

### Tidal Composition Reference

The composition docs are directly relevant to the current design direction.

- `ur` is described as a long-form composition tool for patterns of patterns.
- `seqP` is defined as sequencing patterns with explicit start and end times.
- The docs show `seqP` as a time-oriented composition primitive rather than a layered pattern combinator.

Source:

- https://tidalcycles.org/docs/reference/composition/

### Tidal Accumulation Reference

The accumulation docs are relevant for the layered side of the model.

- `stack` layers patterns so they play simultaneously.
- `overlay` and `<>` are related superposition tools.
- `superimpose` and `layer` are useful references for future transformations on top of a base pattern.

Source:

- https://tidalcycles.org/docs/reference/accumulation/

## Design Direction

Likely next steps:

- Move `seqP` closer to actual Tidal semantics by supporting explicit `(start, end, pattern)` tuples.
- Distinguish arrangement time from pattern-internal cycle time more clearly.
- Add viewport controls for zoom and horizontal scrolling as track counts and arrangement length increase.
- Decide whether the prototype should remain Tidal-inspired or try to mirror real Tidal syntax more strictly.

# Tidal Pattern Arranger

`Tidal Pattern Arranger` is a static HTML application for exploring a small Tidal-inspired arrangement language in a DAW-style piano-roll view.

The entire app currently lives in `index.html`. There is no build step, no bundler, and no server requirement beyond opening the file in a browser. The parser, arrangement model, transport, Web MIDI integration, and WebGL renderer all run in-browser.

This README documents:

- what the app does
- how to use the UI
- what is currently implemented in the parser
- what the arrangement language means in this project
- where the implementation intentionally differs from real Tidal

## Project Goal

This is a **song builder**. The intended workflow is:

1. Write an arrangement in the pattern language
2. Preview it with Web MIDI playback as you compose
3. Export a finished MIDI file to take into a DAW for final audio production

Real-time playback is a composition aid, not the end product. The pattern language is inspired by TidalCycles mini-notation — the same notation used by Renoise's [pattrns library](https://renoise.github.io/pattrns/guide/cycles.html) — but the goal here is a visual arrangement tool with MIDI export rather than a live-coding environment.

## What The App Does

The project has two HTML files:

**`index.html`** — the main song arrangement view

- type pattern source into a slide-out editor
- parse that source into a multi-track arrangement
- render the arrangement as a piano-roll style WebGL view
- send note output over Web MIDI
- visually highlight notes as they play instead of using a separate playhead bar
- export the arrangement as a MIDI file

**`explore.html`** — the pattern explorer

- two-panel layout: code editor on the left, piano roll on the right
- multiple independent playheads, each with its own rate and pass counter
- trig conditions rendered as hatched/dimmed notes until they fire
- designed for experimenting with single patterns and multi-playhead interaction

Both files import from `parser.js`, which contains all parsing logic and has no DOM dependencies.

The current language is Tidal-inspired, not a full Tidal interpreter.

## Current UI

The interface is built around four pieces:

### 1. Top Bar

The top bar contains the global transport controls:

- MIDI output selection
- BPM input
- Execute Pattern
- Refresh MIDI
- Play
- Stop

### 2. Arrangement View

The main panel shows the arrangement as stacked tracks.

Each track renders:

- its own local pitch range
- sequence boundaries
- notes colored by instrument

The arrangement panel height is fixed to the viewport so the legend remains visible at the bottom.

### 3. Pattern Editor Drawer

The pattern editor is a right-side slide-out drawer.

You can open and close it by:

- clicking the vertical handle tab
- pressing `Ctrl+B` or `Cmd+B`

The drawer is sized to make roughly 80 columns of text comfortable to view.

### 4. Status Footer

The bottom of the drawer shows app status such as:

- render summaries
- playback status
- MIDI refresh status
- parser errors

## How To Use The App

### Open The App

Open `index.html` in a browser.

For MIDI output, use a browser that supports Web MIDI and grant MIDI permissions when prompted.

### Write A Pattern

Use the editor drawer to write arrangement source.

Press:

- `Ctrl+Enter` on Windows/Linux
- `Cmd+Enter` on macOS

to reparse the source and redraw the arrangement.

### Play The Arrangement

1. Choose a MIDI output from the top bar.
2. Set BPM.
3. Press `Play`.

If no MIDI output is selected, the app still performs visual playback highlighting.

Press `Stop` to:

- stop the loop
- clear highlights
- send all-notes-off to the selected MIDI output

## Arrangement Language Overview

The current arrangement model has three levels:

1. Track level
2. Sequence level
3. Pattern level

The language supports two complementary authoring styles that can be mixed in the same file:

- **Track-oriented** — each `track` block defines one row and lists all patterns for that row
- **Section-oriented** — each `section` block defines all tracks for one musical section; a `song [...]` line orders the sections

Both styles compile to the same internal model.

### Track Level

Tracks are the vertical lanes in the arrangement view.

Syntax:

```tidal
track drums {
  ...
}
```

Each `track` block becomes one row in the arrangement panel.

### Sequence Level

Inside a track, time is arranged using `seqP`.

Syntax:

```tidal
track drums {
  seqP [
    patternA,
    patternB,
    patternC
  ]
}
```

In the current implementation:

- each `seqP` entry occupies one equal-length step in time
- the first item starts at step `0`
- the second item starts at step `1`
- and so on

This is intentionally simpler than real Tidal `seqP`.

### Section-Oriented Authoring

As an alternative to defining tracks individually, you can define the arrangement as a set of named musical sections and then order them with a `song [...]` block.

A `section` block contains `trackName: pattern` entries — one per track:

```tidal
let verse = section {
  drums:  stack [ s "bd ~ cp ~", s "hh*8" ],
  bass:   n "c2 ~ g2 ~ f2 ~ g2 ~" # s "bass",
  lead:   n "c4 ~ e4 ~ g4 ~ e4 ~" # s "lead"
}

let chorus = section {
  drums:  stack [ s "bd cp bd cp", s "[hh oh]*4" ],
  bass:   n "c2 e2 g2 e2 f2 a2 g2 ~" # s "bass",
  lead:   n "c5 b4 a4 g4 e4 ~ c4 e4" # s "lead"
}

song [ intro.8 verse.16 chorus.16 verse.16 chorus.16 outro.8 ]
```

The `song [...]` line is a space-separated sequence expression — the same `.N` repetition notation used inside `seqP` — and determines the order and count of each section in the arrangement.

If a track is omitted from a section, that track produces silence for those steps.

Section-oriented and track-oriented blocks can be mixed in the same file. Explicit `track {}` blocks are merged with the tracks derived from sections.

### Pattern Level

Each sequence step contains a pattern expression.

That expression is parsed into simultaneous voices and step-level events.

The most important current pattern container is `stack`.

Syntax:

```tidal
stack [
  s "bd cp hh",
  n "c4 e4 g4" # s "lead"
]
```

`stack` means layer these voices together in the same step.

## Core Parser Features

This section describes the parser as it exists today.

### 1. Top-Level Statement Splitting

The parser keeps track of:

- brackets `[]`
- braces `{}`
- parentheses `()`
- quoted strings

This allows it to split source only at valid top-level boundaries instead of breaking nested expressions.

That logic is the basis for:

- top-level statements
- comma-separated `seqP` items
- comma-separated `stack` voices
- repeat suffix parsing

### 2. Line Comments

Tidal-style line comments are supported with `--`.

Example:

```tidal
track drums {
  seqP [
    stack [
      s "bd cp hh"
    ] -- first bar
  ]
}
```

Comment stripping preserves quoted strings, so `--` inside a string is not treated as a comment.

### 3. `track` Blocks

Tracks are parsed from:

```tidal
track name {
  ...
}
```

Track names currently support:

- bare identifiers such as `drums`
- quoted names such as `"main drums"`

Each parsed track becomes one arrangement row.

### 4. `seqP`

The parser looks for:

```tidal
seqP [ ... ]
```

Each top-level comma-separated item inside `seqP` becomes a sequence step after expression expansion.

The current implementation treats `seqP` as a simple time-ordered step container, not as real timed Tidal segments.

### 5. `stack`

`stack` is the main simultaneous-layering construct.

Example:

```tidal
stack [
  s "bd cp hh",
  n "c4 e4 g4" # s "lead"
]
```

Inside a `stack`:

- each comma-separated item is treated as a voice
- all voices share the same time span
- events from all voices are merged together

### 6. `s "..."` Sound Voices

Sample-style voices are supported with `s`.

Example:

```tidal
s "bd cp hh bd"
```

The app treats sound tokens such as `bd`, `cp`, `hh`, `sd`, and similar names as drum-style note lanes mapped to MIDI note numbers.

### 7. `n "..."` Note Voices

Pitched note voices are supported with `n`.

Example:

```tidal
n "c4 e4 g4 72" # s "superpiano"
```

The parser supports:

- note names like `c4`
- accidentals like `f#3`
- flats like `bb3`
- numeric MIDI notes like `60`

When used with `# s "name"`, that sound name is used as the instrument label in the arrangement and legend.

### 8. Bracket Subdivision

Bracket groups subdivide the current time span.

Example:

```tidal
s "[bd hh cp]"
```

If a span is divided into three items, each item gets one third of that span.

Bracket subdivision works recursively.

Example:

```tidal
s "[bd [hh hh] cp]"
```

### 9. Token Repetition With `*`

Token-level repetition is implemented.

Example:

```tidal
s "bd*4"
```

This divides the current span into four equal slices and places `bd` in each slice.

This also works on bracket groups.

Example:

```tidal
s "[bd cp]*2"
```

### 10. Whole-Pattern Repetition With `*n`

The parser also supports repeating an entire pattern expression.

Example:

```tidal
stack [
  s "bd cp hh bd*2"
]*2
```

In the current implementation, this repeats the pattern by subdividing the current step into equal repeated slices.

That means:

- `pattern*2` duplicates the whole pattern twice
- both copies are compressed into the original span

This is useful when you want “repeat this whole stack within the current step”.

If instead you want the same pattern to happen multiple times sequentially as a longer form, use `cat`.

### 11. `cat`

`cat` is now implemented as a sequence-expression helper.

Examples:

```tidal
cat [p, p]
```

```tidal
cat (replicate 4 p)
```

In this project, `cat` means:

- expand the provided sequence expression into multiple sequence steps
- preserve one full step per expanded item
- do not compress those items into one step

This makes `cat` the right tool for “repeat this pattern multiple times in sequence”.

### 12. `replicate`

`replicate` is implemented as a sequence-expression helper.

Example:

```tidal
replicate 4 p
```

This expands to four copies of the expression `p`.

`replicate` becomes especially useful when combined with `cat`.

Example:

```tidal
cat (replicate 4 p)
```

### 13. `.N` Step Repetition

The `.N` suffix repeats a sequence expression N times, expanding time rather than subdividing it. It is the sequential counterpart to `*N` (which subdivides).

```tidal
verse.4          -- 4 copies of verse, one per step
```

It works on any expression including parenthesized groups:

```tidal
(verse.3 chorus).4    -- [verse verse verse chorus] repeated 4 times = 16 steps
```

This makes `.N` the primary tool for building song structure:

```tidal
let verse  = stack [ s "bd cp bd cp" ]
let chorus = stack [ s "bd*4" ]

seqP [
  (verse.3 chorus).4   -- AAAB × 4 = 16 steps
]
```

### 14. Space-Separated Sequence Expressions

Inside a `seqP` item, bare identifiers separated by spaces expand into sequential steps. Each identifier is resolved from `let` bindings, and `.N` suffixes are expanded inline.

```tidal
seqP [
  intro.8 verse.16 chorus.16 bridge.8 outro.8
]
```

This expands to 56 steps without any `cat` or `replicate` syntax. The guard is that all space-separated parts must be bare identifiers (optionally with `.N`) or parenthesized groups — complex expressions like `stack [...]` are not split.

### 16. `let` Bindings

Top-level and track-local `let` bindings are implemented.

Example:

```tidal
let p = stack [
  s "bd cp hh bd*2"
]

track drums {
  seqP [
    cat (replicate 4 p)
  ]
}
```

Current behavior:

- `let` names are simple identifiers
- bindings are expanded in order
- later expressions can reference earlier bindings
- bindings currently expand to sequence expressions, not general Tidal values

Track-local bindings also work:

```tidal
track drums {
  let p = stack [
    s "bd cp hh"
  ]

  seqP [
    cat (replicate 2 p)
  ]
}
```

### 17. `ur`

`ur` is the primary arrangement combinator. It builds a longer sequence from named patterns distributed across a fixed number of steps.

Syntax:

```tidal
ur N "name1 name2 name3 ..."
```

- `N` — total number of steps in the expanded sequence
- the quoted string — space-separated pattern names, each filling `N / count` steps
- names are resolved from `let` bindings in the current scope

Example:

```tidal
let verse = stack [
  s "bd cp bd cp"
]

let chorus = stack [
  s "bd*4",
  n "c4 e4 g4 e4" # s "lead"
]

let bridge = stack [
  s "hh*8"
]

track main {
  seqP [
    ur 12 "verse verse chorus verse verse chorus bridge chorus"
  ]
}
```

Here `ur 12 "..."` has 8 tokens so each fills `12 / 8 = 1.5` steps, rounded per token to distribute evenly.

If the number of total steps divides evenly across all tokens, each named pattern is simply repeated the same number of times:

```tidal
-- 3 tokens × 4 steps each = 12 steps total
ur 12 "a b c"
```

`ur` also accepts `name:effect` token syntax for named transformations (effects are reserved for future use and currently passed through unchanged).

### 18. Trig Conditions

Trig conditions are terse suffixes appended directly to individual tokens. They gate whether a note fires on a given pass through the pattern, based on a playhead's pass counter or a probability value.

The pass counter is **per-playhead** and **1-based** — the first time a playhead completes the full pattern it is on pass 1, the second time pass 2, and so on. Different playheads accumulate their own independent counts.

#### Condition types

| Syntax | Fires when | Example |
|---|---|---|
| `!N` | every Nth pass (passes N, 2N, 3N, …) | `hh!2` — hi-hat every other pass |
| `!1` | first pass only | `crash!1` — crash on the intro |
| `!>N` | after pass N (passes N+1, N+2, …) | `b3!>4` — melody enters on pass 5 |
| `!N:M` | passes N through M inclusive | `fill!5:8` — fill runs for passes 5–8 |
| `!N:` | passes N and beyond (open-ended) | `lead!3:` — lead stays in once introduced |
| `%N` | complement — fires when `pass % N ≠ 0` | `oh%2` — open hat on odd passes only |
| `?P` | P% probability each pass, independent | `bd?75` — kick fires 75% of the time |

#### Combining conditions

Conditions can be chained on the same token. All conditions must be satisfied for the note to fire.

```
bd!>2?50
```

After pass 2, fires with 50% probability. The pass-count gate is evaluated first; probability is only rolled if the gate passes.

#### Conditions on groups

A condition placed after a bracketed group applies to every event inside it.

```
s "[bd cp]!2"
```

Both `bd` and `cp` are gated to every 2nd pass. The same works with repetition: `hh*4!2` produces four hi-hats that only fire every other pass, all at once.

#### A full example

```tidal
stack [
  s "bd cp bd cp",         -- always fires
  s "hh!2*8",              -- 8 hi-hats, but only on even passes
  s "oh!4",                -- open hat every 4th pass
  s "crash!8",             -- crash marks every 8th pass
  n "c4 [e4 g4] a4 g4" # s "lead",
  n "b3!>4" # s "lead"     -- counter-melody enters on pass 5
]
```

With a single 1× playhead this pattern cycles through 8 passes before the crash fires and the counter-melody has been present for 4 passes. With a second playhead at a different rate, each playhead's independent pass counter means the two voices accumulate conditions at different speeds, creating structural variety from one pattern.

#### Conditions at every level

Conditions can be applied at any level of the pattern hierarchy:

| Level | Example | Meaning |
|---|---|---|
| Token | `hh!2` | this note every 2nd pass |
| Group | `[bd cp]!2` | both notes every 2nd pass |
| Voice | `s "bd cp"!2` | entire voice every 2nd pass |
| Step | `stack [...]!2:` | entire seqP step from pass 2 onward |
| Let binding ref | `verse!2` | named pattern every 2nd pass |

#### Ahead-of-time evaluation in the arrangement view

In the **Arrangement View** (`index.html`), trig conditions are evaluated **ahead of time** when you press Execute. The full timeline is computed once: pass-count conditions are checked, and stochastic `?P` events have their dice rolled then and there. The result is a committed, deterministic event list — what you see in the piano roll is one realized version of the arrangement.

Each time you press Execute you get a new roll for any stochastic events. This is intentional: Execute is how you explore different stochastic outcomes and keep the one you want.

Pass counts are derived from the `.N` repetition context. In `verse.16`, the 16 segments are passes 1–16, so `crash!8` fires only on segments 8 and 16. Pass counts **reset per phrase** — in `(verse.3 chorus).4`, verse always sees passes 1, 2, 3 regardless of which outer repetition it is in.

In the **Pattern Explorer** (`explore.html`), conditions are evaluated JIT per playhead pass at play time, and probabilistic events flicker live.

### 19. Segment Labels

`let` binding names are preserved through the evaluation pipeline as **content labels**. Each `seqP` step that originated from a named binding carries that name as its label.

In the arrangement view, segment blocks show their label instead of a generic index:

```tidal
let verse  = stack [ s "bd cp bd cp" ]
let chorus = stack [ s "bd*4" ]

seqP [ verse.3 chorus ]
```

The four rendered segments are labeled `verse`, `verse`, `verse`, and `chorus`.

Content labels propagate through `.N`, `replicate`, `cat`, and `ur` — so `(verse.3 chorus).4` produces 16 correctly labeled segments. Intermediate composition names do not overwrite the underlying content labels: if `let phrase = verse.3 chorus`, using `phrase.4` still labels each segment as `verse` or `chorus`, not `phrase`.

### 20. Section Blocks And `song [...]`

The parser supports section-oriented authoring as an alternative to `track` blocks.

A `section` block is defined with `let name = section { ... }` (or `section name { ... }`):

```tidal
let verse = section {
  drums:  stack [ s "bd ~ cp ~", s "hh*8" ],
  bass:   n "c2 ~ g2 ~ f2 ~ g2 ~" # s "bass"
}
```

Each line inside the braces is `trackName: patternExpression`. The colon is the separator; everything to its right is the same pattern syntax used everywhere else.

A `song [...]` block orders the sections:

```tidal
song [ intro.8 verse.16 chorus.16 outro.8 ]
```

This is a space-separated sequence expression — `.N` repetition, parenthesized groups, and bare identifiers all work identically to `seqP` content.

The parser normalizes sections into the standard track model:

1. Collect all track names that appear across all sections
2. For each track, build a timeline by iterating the song steps in order
3. Sections that do not mention a track contribute silent steps for that track

Explicit `track {}` blocks in the same file are preserved and merged with the section-derived tracks.

### 21. Fallback Single-Step Parsing

If you do not use `track`, the parser still works.

Example:

```tidal
stack [
  s "bd cp hh",
  n "c4 e4 g4" # s "lead"
]
```

This is interpreted as:

- one default track
- one sequence step

That fallback is useful for quick experiments.

### 22. CC Automation Tracks

MIDI CC (Control Change) messages can be sent alongside notes using `ccn` and `ccv` inside any track.

`ccn` sets the CC controller number. `ccv` sets the value pattern.

**Stepped pattern:**

```tidal
track cutoff {
  seqP [
    ccn 74 # ccv "0 32 64 96 127 96 64 32"
  ]
}
```

Each token in the `ccv` string is a CC value (0–127) sent at evenly spaced steps within the cycle, following the same subdivision rules as note patterns.

**LFO shapes:**

Instead of a quoted string, `ccv` accepts a parenthesized LFO expression:

```
ccv (shape steps lo hi)
```

| shape    | description          |
|----------|----------------------|
| `sine`   | smooth sine wave     |
| `saw`    | rising ramp          |
| `tri`    | triangle wave        |
| `square` | two-state on/off     |

`steps` is how many discrete values to generate. `lo` and `hi` are the minimum and maximum CC values.

Example — slow sine sweep on filter cutoff:

```tidal
track cutoff {
  seqP [
    ccn 74 # ccv (sine 16 10 110)
  ]
}
```

Example — sawtooth on resonance:

```tidal
track resonance {
  seqP [
    ccn 71 # ccv (saw 8 0 100)
  ]
}
```

**Multiple CC parameters:**

Use separate tracks or `stack` multiple CC voices:

```tidal
track modulation {
  seqP [
    stack [
      ccn 74 # ccv (sine 16 10 110),
      ccn 71 # ccv (tri 8 20 80)
    ]
  ]
}
```

**Constant value:**

```tidal
ccn 74 # ccv 64
```

**CC tracks in the arrangement view:**

Tracks that contain only CC events render as automation lanes rather than piano rolls. Each step is drawn as a bottom-anchored bar whose height represents the CC value on a 0–127 scale. Horizontal guide lines are drawn at 0, 32, 64, 96, and 127.

**MIDI output:**

CC events are sent as standard MIDI CC messages (`0xB0`) on the track's assigned channel. There is no note-off for CC — the value simply holds until the next message, which is standard MIDI behavior.

**Inspiration:**

The `ccn`/`ccv` parameter convention follows the SuperDirt MIDI tutorial:
https://userbase.tidalcycles.org/SuperDirt_MIDI_Tutorial.html

## Examples

### Basic Drum Track

```tidal
track drums {
  seqP [
    stack [
      s "bd cp hh bd*2"
    ]
  ]
}
```

### Two-Track Arrangement

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

### Repeating A Pattern In Sequence

```tidal
let p = stack [
  s "bd cp hh bd*2"
]

track drums {
  seqP [
    cat (replicate 4 p)
  ]
}
```

### Repeating A Whole Pattern Inside One Step

```tidal
stack [
  s "bd cp hh bd*2"
]*2
```

### Section-Oriented Arrangement

```tidal
let intro = section {
  drums: stack [ s "bd ~ ~ ~", s "hh ~ hh ~" ],
  bass:  n "c2 ~ ~ ~" # s "bass"
}

let verse = section {
  drums: stack [ s "bd ~ cp ~ bd ~ cp ~", s "hh*8" ],
  bass:  n "c2 ~ g2 ~ f2 ~ g2 ~" # s "bass",
  lead:  n "c4 ~ e4 ~ g4 ~ e4 ~" # s "lead"
}

let chorus = section {
  drums: stack [ s "bd cp bd cp", s "[hh oh]*4" ],
  bass:  n "c2 e2 g2 e2 f2 a2 g2 ~" # s "bass",
  lead:  n "c5 b4 a4 g4 e4 ~ c4 e4" # s "lead"
}

let outro = section {
  drums: stack [ s "bd ~ ~ ~", s "hh ~ hh ~" ],
  bass:  n "c2 ~ ~ ~" # s "bass"
}

song [ intro.8 verse.16 chorus.16 verse.16 chorus.16 outro.8 ]
```

This produces four tracks (`drums`, `bass`, `lead`, `intro`/`outro` sections) across 72 bars. The `lead` track is silent for `intro` and `outro` steps because those sections do not define a `lead` entry.

### CC Automation With LFO

```tidal
track cutoff {
  seqP [
    ccn 74 # ccv (sine 16 10 110),
    ccn 74 # ccv "110 90 70 50 30 10 30 60"
  ]
}

track resonance {
  seqP [
    ccn 71 # ccv (saw 8 0 100)
  ]
}
```

### Trig Conditions Across All Levels

This example exercises conditions at every level of the hierarchy — individual tokens, bracket groups, let binding references with conditions, and whole `seqP` steps.

```tidal
let fill = cat ["bd sd bd sd", "bd bd sd sd"]
let drop = s "oh*4"

seqP [
  stack [
    s "bd cp bd cp",
    s "hh!2*8",
    drop?75
  ],
  stack [
    s "bd cp bd cp",
    s "[hh oh]!>2*4",
    drop?75
  ]!2:,
  fill!3
]
```

What each line tests:

- `hh!2` — token condition: hi-hat fires only on even passes
- `[hh oh]!>2` — group condition: both hats are silent for passes 1 and 2
- `drop?75` — condition on a let binding reference: `oh*4` fires with 75% probability
- `]!2:` — step condition: the entire second `seqP` slot is silent on pass 1, active from pass 2 onward
- `fill!3` — condition on a let binding reference: the fill sequence only replaces the third step on every 3rd pass

### AOT Condition Evaluation

This example demonstrates ahead-of-time condition evaluation in the arrangement view. Paste it in and press Execute — the piano roll shows a committed result with conditions already resolved.

```tidal
let pattern = stack [
  s "bd cp bd cp",    -- always fires
  s "crash!4",        -- every 4th pass → segments 4 and 8 only
  s "oh!>2",          -- after pass 2 → absent in segments 1–2, present in 3–8
  s "hh?50*4"         -- 4 hi-hats, each 50% — re-rolled every Execute
]

track drums {
  seqP [ pattern.8 ]
}
```

What to look for in the piano roll:

- Segments 1–2: kick and snare only, no open hat, no crash
- Segment 3: open hat appears for the first time
- Segment 4: open hat and crash together
- Segments 5–7: open hat only
- Segment 8: open hat and crash again
- Hi-hats: different notes present or absent across segments; the whole distribution changes each time you press Execute

### Reset-Per-Phrase

Pass counts reset at each `.N` boundary so inner recurrences are self-contained. This example shows the difference between global accumulation (which this project does *not* do) and reset-per-phrase (which it does).

```tidal
let phrase = stack [
  s "bd cp bd cp",
  s "crash!4"         -- fires on pass 4 of each phrase
]

track drums {
  seqP [ (phrase.4).3 ]   -- 3 outer repetitions of a 4-step phrase
}
```

Crash appears at segments 4, 8, and 12 — the 4th step of each outer phrase repetition. If pass counts accumulated globally, crash would only appear once at segment 4. Reset-per-phrase means each outer repetition runs its own local passes 1–4 independently.

### Comments

```tidal
track drums {
  seqP [
    stack [
      s "bd cp hh"
    ] -- first step
  ]
}
```

## Rendering Model

The renderer converts parsed arrangement data into a piano roll using WebGL for geometry and Canvas 2D for text.

### Architecture

The arrangement panel uses three stacked canvas layers:

- **`#roll-base`** (WebGL) — all solid-color geometry: note rectangles, grid lines, piano key row tints, velocity bars, CC step-function fills and strokes. All geometry is batched into a single instanced draw call per render.
- **`#roll-text`** (Canvas 2D) — text only: bar numbers, track names, pitch labels, segment labels, note labels.
- **`#roll-highlight`** (Canvas 2D) — active note glow during playback, redrawn only when highlight state changes.

The base canvas is always viewport-sized. An invisible spacer div drives the native horizontal scrollbar to the full world width (`viewport × zoomX`). On every scroll or zoom event the base and text layers are redrawn from the current scroll offset, culling off-screen elements before they reach the GPU.

### Performance

Because all geometry is submitted as one batched WebGL draw call, render cost scales with the number of visible events rather than total events. A 128-bar, 4-track song with thousands of notes renders in a single GPU pass. Zooming and scrolling trigger one redraw each via the scroll listener.

### Track Rendering

Each track:

- gets its own vertical lane
- computes a local pitch range from its events
- draws local pitch rows
- shows sequence boundaries

The track view compresses vertically as more tracks are added so the arrangement panel stays at a fixed height.

### Instrument Colors

Each unique instrument label gets a color from a fixed palette.

These colors are used for:

- note rectangles
- legend entries

### Sequence Boundaries

Each `seqP` step is outlined in the track view so it reads like an arrangement region.

### Note Labels

Notes render labels when there is enough visual room.

This avoids clutter when many tracks or many dense events are visible at once.

## MIDI Playback

The app includes browser-side Web MIDI support.

### What Happens During Playback

When you press `Play`:

- the app loops the current arrangement
- it schedules note-on and note-off events for note tracks
- it schedules CC messages for automation tracks
- the selected MIDI output receives all messages
- the corresponding note or automation bars are highlighted in the piano roll

### Highlighting Model

The app deliberately highlights active notes instead of drawing a vertical playhead bar.

This means playback visibility comes from:

- which notes are currently lit
- which notes are currently sounding

### Drum And Pitch Channels

Current behavior:

- drum-style events are sent on MIDI channel 10
- other tracks are assigned channels based on track index

This is a pragmatic implementation detail, not a final routing system.

### If No MIDI Device Is Selected

The app still performs visual playback highlighting even if no output is selected.

That makes it possible to inspect timing without external gear.

## Keyboard Shortcuts

- `Ctrl+Enter` / `Cmd+Enter`: execute and rerender the pattern
- `Ctrl+B` / `Cmd+B`: open or close the pattern editor drawer

## Arrangement View Navigation

- **Scroll wheel**: zoom in/out centered on the mouse cursor (up to 256×)
- **Shift + scroll wheel**: pan left/right
- **Scrollbar**: pan left/right

## Parser And App Limitations

This is important: the current implementation is intentionally small and is not a full Tidal runtime.

### Not Implemented

The parser does not currently implement:

- full Tidal parsing
- full operator precedence
- arbitrary Haskell syntax
- real Tidal timing semantics for `seqP`
- full composition/operator coverage
- Euclidean or advanced Tidal combinators
- polymetric or polymetric composition semantics
- named pattern routing and full sound engine behavior

### Important Differences From Real Tidal

1. `seqP` is currently equal-step sequencing.
   Real Tidal `seqP` is a timed composition primitive.

2. `cat` and `replicate` are currently arrangement helpers.
   They are implemented to expand into sequence steps in this app’s arrangement model.

3. Whole-pattern `*n` repetition currently compresses repeated copies into the current span.
   That is useful for this prototype, but not the same as extending arrangement length.

4. `let` bindings are lightweight arrangement-expression bindings, not general Tidal/Haskell bindings.

## Implementation Notes

The project is split across three files:

- **`parser.js`** — all parsing logic, no DOM dependencies. Can be imported by any HTML file.
- **`index.html`** — song arrangement view (editor drawer, WebGL piano roll, Web MIDI, MIDI export)
- **`explore.html`** — pattern explorer (multi-playhead, trig condition visualization)

Both HTML files use `<script type="module">` and require a local web server (`python3 -m http.server 8080`) — `file://` URLs block ES module imports.

Key implementation areas in `parser.js`:

- `splitTopLevel` — token splitting for space/comma-separated structures
- `splitRepeat` — repeat suffix (`*N`) detection
- `parseCondition` / `evalCondition` / `conditionLabel` — trig condition parsing and evaluation
- `expandPattern` — recursive mini-notation expansion with condition propagation
- `voiceFromExpression` — voice type detection (`s`, `n`, `ccn`, custom)
- `parseSource` — one pattern expression into a list of events
- `expandSequenceExpression` — `cat`, `replicate`, `ur`, `.N`, space-separated sequences
- `extractLetBindings` — `let` binding collection with content label stamping
- `parseSectionBody` — splits `trackName: pattern` entries inside a `section` block
- `extractSectionDefs` — scans top-level statements for `let name = section { ... }` and `section name { ... }` blocks
- `extractSongBlock` — finds and removes the `song [ ... ]` ordering block
- `normalizeSections` — transposes the section × track matrix into a standard per-track timeline
- `parseArrangement` — full arrangement parsing into tracks and segments; routes through section normalization when section/song blocks are present

Key areas in `index.html`:

- `renderArrangement` — WebGL geometry batch + Canvas 2D text for note tracks and CC automation lanes
- `startPlayback` / `triggerEvent` — Web MIDI scheduling and note-on/off dispatch
- `exportMidi` — MIDI file export via Blob download
- `setDrawerOpen` — editor drawer toggle

## Current Design Direction

See `PLAN.md` for the full research context and language roadmap.

Short version:

- `cat`, `replicate`, `ur`, `.N` repetition, and space-separated sequences are all implemented
- trig conditions work at all levels of the pattern hierarchy
- segment content labels are preserved through composition
- section-oriented authoring (`section` blocks + `song [...]`) is implemented alongside track-oriented authoring
- `seqP` likely needs to move closer to actual Tidal semantics over time

## Future Work

### Mini-Notation Gaps

These features are part of the standard mini-notation spec (see pattrns prior art) and are natural next additions:

- `<c4 e4 g4>` — alternating values, rotating one per cycle repetition
- `c4|d4|e4` — random choice each cycle
- `_` — elongation, sustains the previous note into the next step slot

### Language Features (longer term)

- Refine `seqP` timing semantics toward real Tidal semantics
- `midichan` override per voice or CC track
- Support patterned `ccn` (multiple CC controllers in one expression)
- Trig condition evaluation in the main arrangement view

### UI / Rendering

- Pattern validation and better parser diagnostics
- CC: continuous LFO interpolation between steps (currently discrete)

## Reference Material

These references are helpful for aligning the project with real Tidal semantics as it evolves:

- https://tidalcycles.org/docs/innards/meaning_of_dollar/
- https://maxwelltfirn.com/2017/08/12/tidalcycles/
- https://tidalcycles.org/docs/reference/composition/
- https://tidalcycles.org/docs/reference/accumulation/
- https://userbase.tidalcycles.org/SuperDirt_MIDI_Tutorial.html (CC automation)

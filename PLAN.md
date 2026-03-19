# Plan

## Next Language Features

- Add `ur` support for repeating or extending higher-level pattern structures without forcing density-style subdivision.
- Revisit `seqP` so it can move closer to real Tidal semantics instead of the current equal-step prototype model.
- Expand sequence-expression support beyond `cat` and `replicate` once the intended arrangement language is clearer.

## Notes

- Current implemented sequence helpers:
  - `cat [a, b, c]`
  - `cat (replicate 4 p)`
  - top-level and track-local `let name = expression`

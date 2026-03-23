// Tidal Pattern Arranger — pure parser module
// No DOM dependencies. Import this from any HTML file.

export const palette = [
  "#d85f45",
  "#2d6a4f",
  "#7c5cff",
  "#ca6702",
  "#0f4c5c",
  "#b23a48",
  "#227c9d",
  "#5f0f40",
  "#6b8f71",
  "#8a5a44"
];

export const drumNotes = {
  bd: 36, kick: 36,
  sd: 38, sn: 38,
  cp: 39, rim: 37,
  hh: 42, ch: 42,
  oh: 46, hc: 42, ho: 46,
  lt: 45, mt: 47, ht: 50,
  rs: 37, cb: 56, cym: 49
};

export function splitTopLevel(source, separator) {
  const parts = [];
  let depth = 0;
  let quote = "";
  let current = "";

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const prev = source[i - 1];

    if (quote) {
      current += char;
      if (char === quote && prev !== "\\") quote = "";
      continue;
    }

    if (char === "\"" || char === "'") { quote = char; current += char; continue; }
    if (char === "[" || char === "<" || char === "(") { depth += 1; current += char; continue; }
    if (char === "]" || char === ">" || char === ")") { depth = Math.max(0, depth - 1); current += char; continue; }

    if (depth === 0) {
      if (separator === "space" && /\s/.test(char)) {
        if (current.trim()) { parts.push(current.trim()); current = ""; }
        continue;
      }
      if (separator === "comma" && char === ",") {
        if (current.trim()) { parts.push(current.trim()); current = ""; }
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function unwrapOuterBrackets(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;

  let depth = 0;
  let quote = "";
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    const prev = trimmed[i - 1];
    if (quote) { if (char === quote && prev !== "\\") quote = ""; continue; }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0 && i !== trimmed.length - 1) return null;
    }
  }

  return trimmed.slice(1, -1);
}

export function splitRepeat(item) {
  let depth = 0;
  let quote = "";

  for (let i = item.length - 1; i >= 0; i -= 1) {
    const char = item[i];
    const prev = item[i - 1];
    if (quote) { if (char === quote && prev !== "\\") quote = ""; continue; }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "]" || char === ">" || char === ")") { depth += 1; continue; }
    if (char === "[" || char === "<" || char === "(") { depth -= 1; continue; }
    if (char === "*" && depth === 0) {
      const countText = item.slice(i + 1).trim();
      if (/^\d+$/.test(countText)) {
        return { base: item.slice(0, i).trim(), count: Number.parseInt(countText, 10) };
      }
    }
  }

  return null;
}

export function parseNoteValue(token) {
  const trimmed = token.trim();
  if (!trimmed || trimmed === "~") return null;

  const drum = drumNotes[trimmed.toLowerCase()];
  if (typeof drum === "number") return drum;
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);

  const match = trimmed.match(/^([a-gA-G])([#b]?)(-?\d+)$/);
  if (!match) return null;

  const [, name, accidental, octaveText] = match;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[name.toLowerCase()];
  const accidentalOffset = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return (Number.parseInt(octaveText, 10) + 1) * 12 + base + accidentalOffset;
}

export function extractQuotedArgument(source, keyword) {
  const pattern = new RegExp(`\\b${keyword}\\b\\s*(?:\\$\\s*)?([\"'])(.*?)\\1`, "i");
  const match = source.match(pattern);
  return match ? match[2] : null;
}

export function extractCcvLfo(source) {
  const match = source.match(/\bccv\b\s*\(([^)]*)\)/i);
  return match ? match[1].trim() : null;
}

export function expandLfo(lfoExpr) {
  const match = lfoExpr.match(/^(sine|saw|tri|square)\s+(\d+)\s+(\d+)\s+(\d+)$/i);
  if (!match) return null;
  const [, shape, stepsStr, loStr, hiStr] = match;
  const n = parseInt(stepsStr, 10);
  const lo = parseInt(loStr, 10);
  const hi = parseInt(hiStr, 10);
  const values = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / n;
    let norm;
    switch (shape.toLowerCase()) {
      case "sine":   norm = (Math.sin(t * 2 * Math.PI - Math.PI / 2) + 1) / 2; break;
      case "saw":    norm = t; break;
      case "tri":    norm = t < 0.5 ? t * 2 : (1 - t) * 2; break;
      case "square": norm = t < 0.5 ? 1 : 0; break;
      default:       norm = 0.5;
    }
    values.push(Math.round(lo + norm * (hi - lo)));
  }
  return values.join(" ");
}

export function stripLineComments(source) {
  let result = "";
  let quote = "";
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    const prev = source[i - 1];
    if (quote) {
      result += char;
      if (char === quote && prev !== "\\") quote = "";
      continue;
    }
    if (char === "\"" || char === "'") { quote = char; result += char; continue; }
    if (char === "-" && next === "-") {
      while (i < source.length && source[i] !== "\n") i += 1;
      if (i < source.length) result += "\n";
      continue;
    }
    result += char;
  }
  return result;
}

export function findMatchingDelimiter(source, openIndex, openChar, closeChar) {
  let depth = 0;
  let quote = "";
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    const prev = source[i - 1];
    if (quote) { if (char === quote && prev !== "\\") quote = ""; continue; }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === openChar) depth += 1;
    else if (char === closeChar) { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

export function unwrapOuterParens(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) return null;
  const closeIndex = findMatchingDelimiter(trimmed, 0, "(", ")");
  if (closeIndex !== trimmed.length - 1) return null;
  return trimmed.slice(1, -1).trim();
}

export function splitTopLevelStatements(source) {
  const statements = [];
  let depth = 0;
  let quote = "";
  let current = "";

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const prev = source[i - 1];
    if (quote) { current += char; if (char === quote && prev !== "\\") quote = ""; continue; }
    if (char === "\"" || char === "'") { quote = char; current += char; continue; }
    if (char === "[" || char === "{" || char === "(") { depth += 1; current += char; continue; }
    if (char === "]" || char === "}" || char === ")") { depth = Math.max(0, depth - 1); current += char; continue; }
    if (char === "\n" && depth === 0) {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

export function extractStackVoices(source) {
  const stackIndex = source.search(/\bstack\b/i);
  if (stackIndex === -1) return null;
  const openIndex = source.indexOf("[", stackIndex);
  if (openIndex === -1) return null;

  let depth = 0;
  let quote = "";
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    const prev = source[i - 1];
    if (quote) { if (char === quote && prev !== "\\") quote = ""; continue; }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return splitTopLevel(source.slice(openIndex + 1, i), "comma");
    }
  }
  return null;
}

export function normalizeVoiceList(source) {
  const stackVoices = extractStackVoices(source);
  if (stackVoices !== null) return stackVoices;
  return source
    .split(/\n+/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^,+/, "").trim())
    .filter(Boolean)
    .filter((line) => line !== "[" && line !== "]");
}

export function voiceFromExpression(expression, index) {
  const ccnNumMatch = expression.match(/\bccn\b\s+(\d+)/i);
  if (ccnNumMatch) {
    const ccn = parseInt(ccnNumMatch[1], 10);
    const ccvQuoted = extractQuotedArgument(expression, "ccv");
    const ccvLfoSrc = extractCcvLfo(expression);
    let ccvPattern = "64";
    if (ccvQuoted !== null) ccvPattern = ccvQuoted;
    else if (ccvLfoSrc !== null) ccvPattern = expandLfo(ccvLfoSrc) || "64";
    else {
      const plainMatch = expression.match(/\bccv\b\s+(\d+)/i);
      if (plainMatch) ccvPattern = plainMatch[1];
    }
    return { type: "cc", ccn, instrument: `cc${ccn}`, pattern: ccvPattern, mode: "cc", source: expression };
  }

  const customVoiceMatch = expression.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
  if (customVoiceMatch) {
    return { instrument: customVoiceMatch[1], pattern: customVoiceMatch[2], mode: "auto", source: expression };
  }

  const notePattern = extractQuotedArgument(expression, "n") || extractQuotedArgument(expression, "note");
  const soundPattern = extractQuotedArgument(expression, "s") || extractQuotedArgument(expression, "sound");

  if (notePattern) {
    const instrument = soundPattern
      ? splitTopLevel(soundPattern, "space").find((t) => t !== "~") || `voice-${index + 1}`
      : `voice-${index + 1}`;
    return { instrument, pattern: notePattern, mode: "pitched", source: expression };
  }

  if (soundPattern) {
    const tokens = splitTopLevel(soundPattern, "space");
    const instrument = tokens.find((t) => t !== "~") || `drums-${index + 1}`;
    return { instrument, pattern: soundPattern, mode: "drums", source: expression };
  }

  return { instrument: `voice-${index + 1}`, pattern: expression, mode: "auto", source: expression };
}

// ── Trig conditions ───────────────────────────────────────────────────────────
//
// Conditions are terse suffixes on individual tokens that gate whether an event
// fires on a given pass through the pattern. They are parsed here and evaluated
// at playback time against a playhead's pass counter.
//
// Syntax (appended directly to the token, no spaces):
//   !N      every Nth pass  (passes N, 2N, 3N, ...)   — !1 = first pass only
//   !>N     after pass N    (passes N+1, N+2, ...)
//   !N:M    passes N through M inclusive
//   !N:     passes N and beyond (open-ended range)
//   %N      complement — fires when passCount % N !== 0   (%2 = odd passes)
//   ?P      probability P% per pass, independent of pass count
//
// Conditions can be combined: bd!>2?50  →  after pass 2, 50% probability
// A condition on a group applies to all events in that group: [bd cp]!2
//
// The pass counter is per-playhead and 1-based (first pass = 1).

export function parseCondition(token) {
  let s = token;
  const conds = [];

  // Probability suffix ?N (integer 0-100), parsed first so it can combine
  const probM = s.match(/^(.+)\?(\d+(?:\.\d+)?)$/);
  if (probM) {
    s = probM[1];
    conds.push({ type: "prob", p: parseFloat(probM[2]) / 100 });
  }

  // Open-ended range  !N:
  let m = s.match(/^(.+)!(\d+):$/);
  if (m) { s = m[1]; conds.unshift({ type: "range", lo: parseInt(m[2], 10), hi: Infinity }); }
  else {
    // Closed range  !N:M
    m = s.match(/^(.+)!(\d+):(\d+)$/);
    if (m) { s = m[1]; conds.unshift({ type: "range", lo: parseInt(m[2], 10), hi: parseInt(m[3], 10) }); }
    else {
      // After  !>N
      m = s.match(/^(.+)!>(\d+)$/);
      if (m) { s = m[1]; conds.unshift({ type: "after", n: parseInt(m[2], 10) }); }
      else {
        // Every / first  !N
        m = s.match(/^(.+)!(\d+)$/);
        if (m) {
          s = m[1];
          const n = parseInt(m[2], 10);
          conds.unshift(n === 1 ? { type: "first" } : { type: "every", n });
        }
      }
    }
  }

  // Complement  %N  (fires when passCount % N !== 0)
  m = s.match(/^(.+)%(\d+)$/);
  if (m) { s = m[1]; conds.unshift({ type: "alt", n: parseInt(m[2], 10) }); }

  return { base: s, conds };
}

// Evaluate a conditions array against a playhead's pass count.
// rng is called only for prob conditions — defaults to Math.random but can be
// replaced with a seeded function for reproducible results.
export function evalCondition(conds, passCount, rng = Math.random) {
  if (!conds || conds.length === 0) return true;
  return conds.every((cond) => {
    switch (cond.type) {
      case "every": return passCount % cond.n === 0;
      case "first": return passCount === 1;
      case "after": return passCount > cond.n;
      case "range": return passCount >= cond.lo && passCount <= cond.hi;
      case "alt":   return passCount % cond.n !== 0;
      case "prob":  return rng() < cond.p;
      default:      return true;
    }
  });
}

// Render a conditions array back to its terse string form (for display).
export function conditionLabel(conds) {
  if (!conds || conds.length === 0) return "";
  return conds.map((c) => {
    switch (c.type) {
      case "every": return `!${c.n}`;
      case "first": return "!1";
      case "after": return `!>${c.n}`;
      case "range": return c.hi === Infinity ? `!${c.lo}:` : `!${c.lo}:${c.hi}`;
      case "alt":   return `%${c.n}`;
      case "prob":  return `?${Math.round(c.p * 100)}`;
      default:      return "";
    }
  }).join("");
}

export function resolveInstrument(token, voice) {
  if (voice.mode === "drums") return token.toLowerCase();
  return voice.instrument;
}

export function resolvePitch(token, voice) {
  if (voice.mode === "cc") {
    const val = parseInt(token, 10);
    return isNaN(val) ? 64 : Math.max(0, Math.min(127, val));
  }
  if (voice.mode === "pitched") {
    const midi = parseNoteValue(token);
    return midi === null ? 60 : midi;
  }
  const drumPitch = drumNotes[token.toLowerCase()];
  if (typeof drumPitch === "number") return drumPitch;
  const midi = parseNoteValue(token);
  if (midi !== null) return midi;
  return 48 + (voice.instrument.length % 12);
}

// parentConds: conditions inherited from a containing group (e.g. [bd cp]!2)
export function expandPattern(pattern, start, duration, events, voice, parentConds = []) {
  const trimmed = pattern.trim();
  if (!trimmed) return;

  // Strip any condition syntax from this token/group first.
  // Conditions on a group propagate down to all its children.
  const { base, conds } = parseCondition(trimmed);
  const allConds = [...parentConds, ...conds];

  const repeat = splitRepeat(base);
  if (repeat && repeat.base) {
    const step = duration / repeat.count;
    for (let i = 0; i < repeat.count; i += 1)
      expandPattern(repeat.base, start + step * i, step, events, voice, allConds);
    return;
  }

  const bracketBody = unwrapOuterBrackets(base);
  if (bracketBody !== null) {
    const items = splitTopLevel(bracketBody, "space");
    if (!items.length) return;
    const step = duration / items.length;
    items.forEach((item, i) => expandPattern(item, start + step * i, step, events, voice, allConds));
    return;
  }

  const items = splitTopLevel(base, "space");
  if (items.length > 1) {
    const step = duration / items.length;
    items.forEach((item, i) => expandPattern(item, start + step * i, step, events, voice, allConds));
    return;
  }

  const token = items[0];
  if (!token || token === "~") return;

  events.push({
    instrument: resolveInstrument(token, voice),
    label: token,
    pitch: resolvePitch(token, voice),
    ccn: voice.mode === "cc" ? voice.ccn : undefined,
    type: voice.mode === "cc" ? "cc" : "note",
    isDrum: voice.mode === "cc" ? false : (voice.mode !== "pitched" && typeof drumNotes[token.toLowerCase()] === "number"),
    start,
    duration,
    conds: allConds
  });
}

export function scaleEventsIntoWindow(events, startOffset, durationScale) {
  return events.map((e) => ({
    ...e,
    start: startOffset + e.start * durationScale,
    duration: e.duration * durationScale
  }));
}

export function parseSource(source, options = {}) {
  const { allowEmpty = false, parentConds = [] } = options;
  const sanitized = stripLineComments(source);
  const repeated = splitRepeat(sanitized.trim());

  if (repeated && repeated.base) {
    const repeatedEvents = [];
    const sliceDuration = 1 / repeated.count;
    for (let i = 0; i < repeated.count; i += 1) {
      const baseEvents = parseSource(repeated.base, { allowEmpty: true, parentConds });
      repeatedEvents.push(...scaleEventsIntoWindow(baseEvents, i * sliceDuration, sliceDuration));
    }
    if (!repeatedEvents.length && !allowEmpty)
      throw new Error("No playable events were parsed. The pattern is empty or fully commented out.");
    return repeatedEvents.sort((a, b) => a.start - b.start || b.pitch - a.pitch);
  }

  // Strip conditions from each voice source before processing.
  // A condition on a whole voice (`s "bd cp"!2`) flows down to every event it produces.
  const voices = normalizeVoiceList(sanitized).map((voiceSrc, i) => {
    const { base, conds } = parseCondition(voiceSrc);
    const voice = voiceFromExpression(base, i);
    voice.parentConds = [...parentConds, ...conds];
    return voice;
  });
  const events = [];
  voices.forEach((voice) => expandPattern(voice.pattern, 0, 1, events, voice, voice.parentConds));

  if (!events.length && !allowEmpty)
    throw new Error("No playable events were parsed. The pattern is empty or fully commented out.");
  return events.sort((a, b) => a.start - b.start || b.pitch - a.pitch);
}

export function expandSequenceExpression(expression, env = {}) {
  const trimmed = expression.trim();
  if (!trimmed) return [];
  if (env[trimmed]) return env[trimmed];

  // Let binding reference with a condition suffix, e.g. `a!2` or `myPat?50`
  const { base: condBase, conds: condSuffix } = parseCondition(trimmed);
  if (condSuffix.length > 0 && env[condBase]) {
    const suffix = conditionLabel(condSuffix);
    return env[condBase].map((step) => ({ ...step, source: step.source + suffix }));
  }

  // .N repetition suffix: expr.N → N copies of expr, each stamped with pass: 1..N
  // Pass counts reset per phrase (reset-per-phrase semantics): inner recurrences are
  // self-contained — the outer cycle index does not accumulate into inner pass counts.
  const dotRepeatMatch = trimmed.match(/^([\s\S]+)\.(\d+)$/);
  if (dotRepeatMatch) {
    const base = expandSequenceExpression(dotRepeatMatch[1].trim(), env);
    const count = Number.parseInt(dotRepeatMatch[2], 10);
    const result = [];
    for (let i = 0; i < count; i += 1)
      result.push(...base.map((step) => ({ ...step, pass: i + 1 })));
    return result;
  }

  const parenBody = unwrapOuterParens(trimmed);
  if (parenBody !== null) return expandSequenceExpression(parenBody, env);

  const replicateMatch = trimmed.match(/^replicate\s+(\d+)\s+([\s\S]+)$/);
  if (replicateMatch) {
    const count = Number.parseInt(replicateMatch[1], 10);
    const expanded = expandSequenceExpression(replicateMatch[2].trim(), env);
    const repeated = [];
    for (let i = 0; i < count; i += 1)
      repeated.push(...expanded.map((step) => ({ ...step, pass: i + 1 })));
    return repeated;
  }

  const catListMatch = trimmed.match(/^cat\s*\[(.*)\]$/s);
  if (catListMatch)
    return splitTopLevel(catListMatch[1], "comma").flatMap((item) => expandSequenceExpression(item, env));

  const catParenMatch = trimmed.match(/^cat\s*\(([\s\S]+)\)$/);
  if (catParenMatch) return expandSequenceExpression(catParenMatch[1], env);

  // ur N "pat1 pat2 ..." — Tidal ur combinator
  const urMatch = trimmed.match(/^ur\s+(\d+)\s+"([^"]*)"/);
  if (urMatch) {
    const totalSteps = Number.parseInt(urMatch[1], 10);
    const tokens = urMatch[2].trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const result = [];
    for (let t = 0; t < tokens.length; t += 1) {
      const slotStart = Math.round((t / tokens.length) * totalSteps);
      const slotEnd = Math.round(((t + 1) / tokens.length) * totalSteps);
      const slotCount = slotEnd - slotStart;
      const colonIdx = tokens[t].indexOf(":");
      const name = colonIdx >= 0 ? tokens[t].slice(0, colonIdx) : tokens[t];
      const steps = env[name] || [{ source: name, label: null }];
      for (let i = 0; i < slotCount; i += 1) result.push(steps[i % steps.length]);
    }
    return result;
  }

  // Space-separated sequence: verse chorus, verse.3 chorus
  // Guard: all parts must be bare identifiers (optionally with .N) or paren groups —
  // prevents complex pattern expressions like `stack [ s "bd" ]` from being split.
  const seqParts = splitTopLevel(trimmed, "space");
  if (seqParts.length > 1 && seqParts.every(
    (p) => /^[a-zA-Z_][a-zA-Z0-9_-]*(?:\.\d+)?$/.test(p) || (p.startsWith("(") && p.endsWith(")"))
  )) {
    return seqParts.flatMap((part) => expandSequenceExpression(part, env));
  }

  return [{ source: trimmed, label: null }];
}

export function extractLetBindings(source, inheritedEnv = {}) {
  const env = { ...inheritedEnv };
  const remaining = [];
  splitTopLevelStatements(source).forEach((statement) => {
    const match = statement.match(/^let\s+([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*([\s\S]+)$/);
    if (!match) { remaining.push(statement); return; }
    const bindingName = match[1];
    const expanded = expandSequenceExpression(match[2], env);
    // Content labels: preserve existing labels; stamp binding name only on unlabeled items.
    env[bindingName] = expanded.map((step) => step.label === null ? { ...step, label: bindingName } : step);
  });
  return { env, source: remaining.join("\n") };
}

export function normalizeBlockName(rawName, fallback) {
  const trimmed = rawName.trim();
  if (!trimmed) return fallback;
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
    return trimmed.slice(1, -1);
  return trimmed;
}

export function extractTrackBlocks(source) {
  const blocks = [];
  const regex = /\btrack\b\s+("[^"]+"|'[^']+'|[a-zA-Z0-9_-]+)\s*\{/g;
  let match;
  while ((match = regex.exec(source))) {
    const openIndex = source.indexOf("{", match.index);
    const closeIndex = findMatchingDelimiter(source, openIndex, "{", "}");
    if (closeIndex === -1)
      throw new Error(`Unclosed track block for ${normalizeBlockName(match[1], "track")}.`);
    blocks.push({
      name: normalizeBlockName(match[1], `track-${blocks.length + 1}`),
      body: source.slice(openIndex + 1, closeIndex)
    });
    regex.lastIndex = closeIndex + 1;
  }
  return blocks;
}

export function extractSeqBlocks(source) {
  const sequences = [];
  const regex = /\bseqP\b\s*\[/g;
  let match;
  while ((match = regex.exec(source))) {
    const openIndex = source.indexOf("[", match.index);
    const closeIndex = findMatchingDelimiter(source, openIndex, "[", "]");
    if (closeIndex === -1) throw new Error("Unclosed seqP block.");
    sequences.push(splitTopLevel(source.slice(openIndex + 1, closeIndex), "comma").filter(Boolean));
    regex.lastIndex = closeIndex + 1;
  }
  return sequences;
}

export function scaleSequenceEvents(events, segment, trackName) {
  return events.map((e) => ({
    ...e,
    track: trackName,
    segmentStart: segment.start,
    segmentDuration: segment.duration,
    start: segment.start + e.start * segment.duration,
    duration: e.duration * segment.duration
  }));
}

export function sequenceStepsFromSource(source, env = {}) {
  const sequences = extractSeqBlocks(source);
  if (sequences.length)
    return sequences.flatMap((seq) => seq.flatMap((item) => expandSequenceExpression(item, env)));
  const trimmed = source.trim();
  return trimmed ? expandSequenceExpression(trimmed, env) : [];
}

export function parseArrangement(source) {
  const sanitized = stripLineComments(source);
  const topLevel = extractLetBindings(sanitized);
  const trackBlocks = extractTrackBlocks(topLevel.source);

  if (!trackBlocks.length) {
    const steps = sequenceStepsFromSource(topLevel.source, topLevel.env);
    const segments = steps.map((step, index) => {
      const { base: stepSrc, conds: stepConds } = parseCondition(step.source);
      const stepDef = { start: index, duration: 1 };
      const allEvents = scaleSequenceEvents(parseSource(stepSrc, { allowEmpty: true, parentConds: stepConds }), stepDef, "track-1");
      // AOT condition evaluation: only filter when a repetition context exists (step.pass
      // set by .N or replicate). Without one, all events render unconditionally so that
      // conditions don't silently swallow events in non-repeating contexts.
      const events = step.pass !== undefined
        ? allEvents.filter((e) => evalCondition(e.conds, step.pass))
        : allEvents;
      return { ...stepDef, source: step.source, label: step.label, name: step.label || `seq-${index + 1}`, events };
    });
    return {
      totalLength: Math.max(1, segments.length),
      tracks: [{ name: "track-1", segments, events: segments.flatMap((s) => s.events) }]
    };
  }

  const tracks = trackBlocks.map((trackBlock, trackIndex) => {
    const trackScope = extractLetBindings(trackBlock.body, topLevel.env);
    const segments = sequenceStepsFromSource(trackScope.source, trackScope.env).map((step, stepIndex) => {
      const { base: stepSrc, conds: stepConds } = parseCondition(step.source);
      const stepDef = { start: stepIndex, duration: 1 };
      const allEvents = stepSrc ? scaleSequenceEvents(parseSource(stepSrc, { allowEmpty: true, parentConds: stepConds }), stepDef, trackBlock.name) : [];
      const events = step.pass !== undefined
        ? allEvents.filter((e) => evalCondition(e.conds, step.pass))
        : allEvents;
      return { ...stepDef, source: step.source, label: step.label, name: step.label || `seq-${stepIndex + 1}`, events };
    });
    return {
      name: trackBlock.name || `track-${trackIndex + 1}`,
      segments,
      events: segments.flatMap((s) => s.events)
    };
  });

  return {
    totalLength: Math.max(1, ...tracks.flatMap((t) => t.segments.map((s) => s.start + s.duration))),
    tracks
  };
}

export function assignEventIds(arrangement) {
  let nextId = 1;
  arrangement.tracks.forEach((track, trackIndex) => {
    track.segments.forEach((segment, segmentIndex) => {
      segment.events.forEach((event) => {
        event.id = `t${trackIndex + 1}-s${segmentIndex + 1}-e${nextId}`;
        event.channel = event.isDrum ? 9 : trackIndex % 9;
        event.velocity = event.isDrum ? 108 : 92;
        nextId += 1;
      });
    });
    track.events = track.segments.flatMap((s) => s.events);
  });
  return arrangement;
}

export function instrumentColorMap(events) {
  const instruments = [...new Set(events.map((e) => e.instrument))];
  return new Map(instruments.map((name, index) => [name, palette[index % palette.length]]));
}

export function pitchRange(events) {
  const pitches = events.map((e) => e.pitch);
  const min = Math.min(...pitches);
  const max = Math.max(...pitches);
  const span = Math.max(8, max - min + 1);
  return { min: Math.max(0, min - 1), max: Math.min(127, min + span) };
}

export function noteName(midi) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

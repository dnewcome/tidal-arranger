// midi2tidal.js — convert a MIDI file (ArrayBuffer) to a Tidal arrangement string

// ── Note naming ───────────────────────────────────────────────────────────────

const SHARP_NAMES = ['c','cs','d','ds','e','f','fs','g','gs','a','as','b'];
const FLAT_NAMES  = ['c','db','d','eb','e','f','gb','g','ab','a','bb','b'];

export function noteName(midi, useFlats = false) {
  const names = useFlats ? FLAT_NAMES : SHARP_NAMES;
  return names[midi % 12] + (Math.floor(midi / 12) - 1);
}

// General MIDI drum map (channel 9)
const GM_DRUMS = {
  35:'bd', 36:'bd', 38:'sd', 40:'sd', 37:'sd',
  39:'cp', 42:'hh', 44:'hh', 46:'oh',
  49:'crash', 51:'ride', 52:'crash', 53:'ride',
  55:'crash', 57:'crash', 59:'ride',
  41:'lt', 43:'mt', 45:'mt', 47:'ht', 48:'ht', 50:'ht'
};
export function drumName(pitch) { return GM_DRUMS[pitch] || `n${pitch}`; }

// ── MIDI parser ───────────────────────────────────────────────────────────────
//
// Returns:
//   { format, ppq, numTracks, tracks: [{ name, notes: [{pitch, ch, start, end, vel}] }] }
//
// Only note events are collected. Tempo, CC, and other events are ignored.
// Assumes 4/4 time (PPQ-based division only — SMPTE not supported).

export function parseMidi(buf) {
  const b = new Uint8Array(buf);
  let p = 0;

  function ru32() { const v = ((b[p]<<24)|(b[p+1]<<16)|(b[p+2]<<8)|b[p+3]) >>> 0; p+=4; return v; }
  function ru16() { const v = (b[p]<<8)|b[p+1]; p+=2; return v; }
  function ru8()  { return b[p++]; }
  function rvlq() { let v=0,c; do { c=ru8(); v=(v<<7)|(c&0x7f); } while (c&0x80); return v; }
  function rstr(n){ let s=''; for (let i=0;i<n;i++) s+=String.fromCharCode(b[p++]); return s; }

  if (rstr(4) !== 'MThd') throw new Error('Not a valid MIDI file (missing MThd)');
  const headerLen = ru32();
  const format    = ru16();
  const numTracks = ru16();
  const ppqRaw    = ru16();
  if (ppqRaw & 0x8000) throw new Error('SMPTE timecode not supported — use PPQ-based MIDI');
  const ppq = ppqRaw;

  p = 8 + headerLen; // reposition past header chunk

  const tracks = [];

  for (let t = 0; t < numTracks && p < b.length; t++) {
    if (p + 8 > b.length) break;
    const chunkTag = rstr(4);
    const chunkLen = ru32();
    const chunkEnd = p + chunkLen;

    if (chunkTag !== 'MTrk') { p = chunkEnd; continue; }

    let tick = 0, rs = 0;
    const open  = new Map();  // "ch:pitch" → {tick, vel}
    const notes = [];
    let name = null;

    while (p < chunkEnd) {
      tick += rvlq();

      if (b[p] === 0xFF) {                   // meta event
        p++;
        const mtype = ru8();
        const mlen  = rvlq();
        if      (mtype === 0x03) { name = rstr(mlen); }  // track name
        else if (mtype === 0x2F) { break; }               // end of track
        else                     { p += mlen; }
        continue;
      }

      if (b[p] === 0xF0 || b[p] === 0xF7) { // sysex
        p++;
        p += rvlq();
        continue;
      }

      if (b[p] & 0x80) { rs = b[p]; p++; }  // update running status
      const st   = rs;
      const type = st & 0xF0;
      const ch   = st & 0x0F;

      if (type === 0x90) {
        const pitch = ru8(), vel = ru8();
        if (vel > 0) {
          open.set(`${ch}:${pitch}`, { tick, vel });
        } else {                              // vel=0 treated as note-off
          const o = open.get(`${ch}:${pitch}`);
          if (o) { notes.push({ pitch, ch, start: o.tick, end: tick, vel: o.vel }); open.delete(`${ch}:${pitch}`); }
        }
      } else if (type === 0x80) {
        const pitch = ru8(); ru8();
        const o = open.get(`${ch}:${pitch}`);
        if (o) { notes.push({ pitch, ch, start: o.tick, end: tick, vel: o.vel }); open.delete(`${ch}:${pitch}`); }
      } else if (type === 0xA0 || type === 0xB0 || type === 0xE0) { ru8(); ru8(); }
        else if (type === 0xC0 || type === 0xD0) { ru8(); }
    }

    // Close notes still open at end of track
    for (const [key, o] of open) {
      const [ch, pitch] = key.split(':').map(Number);
      notes.push({ pitch, ch, start: o.tick, end: tick, vel: o.vel });
    }

    p = chunkEnd;
    if (notes.length > 0) tracks.push({ name, notes });
  }

  return { format, ppq, numTracks, tracks };
}

// ── Tidal converter ───────────────────────────────────────────────────────────
//
// options:
//   quantDivisions  — slots per bar (4, 8, 16, 32). Default 16.
//   useFlats        — use flat names (bb, eb…) instead of sharps. Default false.
//
// Output is a `track imported { seqP [...] }` block, one seqP step per bar.
// Each step is either a single voice line or a stack[] of voices.
// Simultaneous notes on a pitched channel are split into separate voice rows.
// Drum channel (9) produces one voice row per unique GM drum sound.

export function convertToTidal(parsed, options = {}) {
  const { quantDivisions = 16, useFlats = false } = options;
  const { ppq, tracks } = parsed;
  const ticksPerBar  = ppq * 4;
  const ticksPerSlot = ticksPerBar / quantDivisions;

  const allNotes = tracks.flatMap(t => t.notes);
  if (!allNotes.length) return '-- No note events found in this MIDI file.';

  const maxTick   = Math.max(...allNotes.map(n => n.end));
  const totalBars = Math.max(1, Math.ceil(maxTick / ticksPerBar));

  // Quantize to nearest slot; deduplicate same channel+pitch+slot
  const seen  = new Set();
  const notes = allNotes
    .map(n => ({ ...n, slot: Math.round(n.start / ticksPerSlot) }))
    .filter(n => {
      const k = `${n.ch}:${n.pitch}:${n.slot}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

  const channels = [...new Set(notes.map(n => n.ch))].sort((a, b) => a - b);

  function buildPitchedVoices(chNotes, bar) {
    const lo = bar * quantDivisions;
    const inBar = chNotes.filter(n => n.slot >= lo && n.slot < lo + quantDivisions);
    if (!inBar.length) return [];

    const bySlot = new Map();
    for (const n of inBar) {
      const ls = n.slot - lo;
      if (!bySlot.has(ls)) bySlot.set(ls, []);
      bySlot.get(ls).push(n);
    }

    const maxV = Math.max(...[...bySlot.values()].map(ns => ns.length));
    const voices = Array.from({ length: maxV }, () => Array(quantDivisions).fill('~'));
    for (const [ls, ns] of bySlot) {
      [...ns].sort((a, b) => a.pitch - b.pitch).forEach((n, vi) => {
        voices[vi][ls] = noteName(n.pitch, useFlats);
      });
    }
    return voices.map(v => v.join(' '));
  }

  function buildDrumVoices(chNotes, bar) {
    const lo = bar * quantDivisions;
    const inBar = chNotes.filter(n => n.slot >= lo && n.slot < lo + quantDivisions);
    if (!inBar.length) return [];

    const byDrum = new Map();
    for (const n of inBar) {
      const dn = drumName(n.pitch);
      if (!byDrum.has(dn)) byDrum.set(dn, new Set());
      byDrum.get(dn).add(n.slot - lo);
    }

    return [...byDrum.entries()].map(([dn, slots]) => {
      const row = Array(quantDivisions).fill('~');
      for (const s of slots) row[s] = dn;
      return row.join(' ');
    });
  }

  const barBlocks = [];

  for (let bar = 0; bar < totalBars; bar++) {
    const lines = [];
    for (const ch of channels) {
      const chNotes = notes.filter(n => n.ch === ch);
      if (ch === 9) {
        buildDrumVoices(chNotes, bar).forEach(v => lines.push(`s "${v}"`));
      } else {
        buildPitchedVoices(chNotes, bar).forEach(v => lines.push(`n "${v}" # s "ch${ch}"`));
      }
    }

    if (lines.length === 0) {
      barBlocks.push(`s "~"`);
    } else if (lines.length === 1) {
      barBlocks.push(lines[0]);
    } else {
      barBlocks.push(`stack [\n      ${lines.join(',\n      ')}\n    ]`);
    }
  }

  const chDesc = channels.map(c => c === 9 ? 'ch9 (drums)' : `ch${c}`).join(', ');
  const out = [
    `-- ${totalBars} bar${totalBars !== 1 ? 's' : ''} · ${quantDivisions} slots/bar · ${chDesc}`,
    `-- Assumes 4/4 time. Rename ch0, ch1… to match your instruments.`,
    '',
    'track imported {',
    '  seqP [',
  ];

  barBlocks.forEach((block, i) => {
    const comma   = i < barBlocks.length - 1 ? ',' : '';
    const indented = block.split('\n').map(l => '    ' + l).join('\n');
    out.push(indented + comma);
  });

  out.push('  ]');
  out.push('}');
  return out.join('\n');
}

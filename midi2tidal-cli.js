#!/usr/bin/env node
// Usage: node midi2tidal-cli.js <file.mid> [--quant 16] [--flats]

import { readFileSync } from 'fs';
import { parseMidi, convertToTidal } from './midi2tidal.js';

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: midi2tidal-cli.js <file.mid> [--quant 8|16|32] [--flats]');
  process.exit(1);
}

const file          = args.find(a => !a.startsWith('--'));
const quantIndex    = args.indexOf('--quant');
const quantDivisions = quantIndex !== -1 ? parseInt(args[quantIndex + 1], 10) : 16;
const useFlats      = args.includes('--flats');

const buf    = readFileSync(file);
const parsed = parseMidi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log(convertToTidal(parsed, { quantDivisions, useFlats }));

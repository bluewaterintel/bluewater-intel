#!/usr/bin/env node
/**
 * Extract inline PNG logo from index.html for PWA icons
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const m = html.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
if (!m) {
  console.error('No inline PNG found in index.html');
  process.exit(1);
}

const png = Buffer.from(m[1], 'base64');
const iconsDir = join(root, 'icons');
mkdirSync(iconsDir, { recursive: true });

// Use same PNG for both sizes (browsers scale); sufficient for PWA install prompt
writeFileSync(join(iconsDir, 'icon-192.png'), png);
writeFileSync(join(iconsDir, 'icon-512.png'), png);
console.log(`Extracted icons (${png.length} bytes) to icons/`);

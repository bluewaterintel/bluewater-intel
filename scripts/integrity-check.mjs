#!/usr/bin/env node
/**
 * Integrity check per BWT handoff: script syntax + HTML/CSS balance
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'index.html');
const html = readFileSync(htmlPath, 'utf8');

// Strip HTML comments (handoff: comments can corrupt script extraction)
const stripped = html.replace(/<!--[\s\S]*?-->/g, '');

const scriptRe = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
const scripts = [];
let m;
while ((m = scriptRe.exec(stripped)) !== null) {
  const body = m[1].trim();
  if (body && !body.includes('src=')) scripts.push(body);
}

const tmp = mkdtempSync(join(tmpdir(), 'bwi-check-'));
let valid = 0;
try {
  scripts.forEach((src, i) => {
    const f = join(tmp, `script-${i}.js`);
    writeFileSync(f, src);
    execFileSync('node', ['--check', f], { stdio: 'pipe' });
    valid++;
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function count(re, s) {
  return (s.match(re) || []).length;
}

const styleBlocks = [...stripped.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((x) => x[1]).join('\n');
const cssOpen = count(/\{/g, styleBlocks);
const cssClose = count(/\}/g, styleBlocks);
const divOpen = count(/<div[\s>]/gi, stripped);
const divClose = count(/<\/div>/gi, stripped);
const svgOpen = count(/<svg[\s>]/gi, stripped);
const svgClose = count(/<\/svg>/gi, stripped);
const labelOpen = count(/<label[\s>]/gi, stripped);
const labelClose = count(/<\/label>/gi, stripped);

console.log(`Scripts: ${valid}/${scripts.length} valid`);
console.log(`CSS braces: ${cssOpen}/${cssClose}`);
console.log(`DIV: ${divOpen}/${divClose}`);
console.log(`SVG: ${svgOpen}/${svgClose}`);
console.log(`LABEL: ${labelOpen}/${labelClose}`);

const ok =
  valid === scripts.length &&
  cssOpen === cssClose &&
  divOpen === divClose &&
  svgOpen === svgClose &&
  labelOpen === labelClose;

if (!ok) {
  console.error('INTEGRITY CHECK FAILED');
  process.exit(1);
}
console.log('INTEGRITY CHECK PASSED');

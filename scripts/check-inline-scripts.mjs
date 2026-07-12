#!/usr/bin/env node
/** Syntax-check every inline <script> block (skips <script src=...>). */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m, i = 0, bad = 0;
while ((m = re.exec(html))) {
  i++;
  const line = html.slice(0, m.index).split("\n").length;
  if (line < 27) continue; // skip the <script src> that sits inside an HTML comment
  try { new vm.Script(m[1], { filename: `block${i}@line${line}` }); }
  catch (e) { bad++; console.log(`BLOCK ${i} (~line ${line}): ${e.message}`); }
}
console.log(`checked ${i} inline blocks, bad: ${bad}`);
process.exit(bad ? 1 : 0);

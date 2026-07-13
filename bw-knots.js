/* Bluewater Intel — Terminal tackle — animated fishing knots
 * Extracted verbatim from an inline <script> block in index.html (Approach A).
 * Loaded as a plain classic <script src> at the SAME document position, so
 * execution order, global scope, and file:// offline all behave identically.
 * DO NOT reorder relative to the other bw-*.js tags. */

// ════════════════════════════════════════════════════════════════════════════
// TERMINAL TACKLE DATA
// ════════════════════════════════════════════════════════════════════════════

// Each knot has SVG-based step animations. Lines/wraps drawn as SVG paths.
// stepN = function(t) returns SVG string at progress t (0 = start of step, 1 = end)
// All knots use a consistent visual vocabulary:
//   • Blue = main line (or braid)
//   • Orange = leader (or tag end)
//   • Red dot = where to focus next

const KN_KNOTS = [
  {
    id: "palomar",
    name: "Palomar Knot",
    color: "#16a34a",
    diff: "easy",
    strength: "95%",
    bestFor: "Tying line directly to a hook, swivel, or lure — works for mono, fluorocarbon, and braid",
    description: "Widely regarded as the single best knot for line-to-terminal connections. The doubled line through the eye spreads load across two strands and resists slipping in every line type — mono, fluoro, or braid. The first knot every angler should master.",
    uses: [
      "Braid to hook, swivel, or jighead — the gold standard",
      "Monofilament to hook, swivel, or lure",
      "Fluorocarbon to hook, swivel, or lure",
      "Drop-shot rig hook attachment",
      "Any time speed and reliability matter more than precision"],
    avoidWhen: [
      "Tying line to line (use FG, Albright, or Double Uni instead)",
      "Very heavy mono/fluoro over 60 lb — knot becomes bulky; crimp instead"],
    steps: [
      "Double 6-8 inches of line and pass the loop through the hook eye.",
      "Tie a loose overhand knot with the doubled line — leave a large loop.",
      "Pass the hook through the loop you just made.",
      "Moisten the knot thoroughly, then pull both the tag end and main line to tighten.",
      "Trim the tag end close to the knot. Done."],
  },
  {
    id: "fg",
    name: "FG Knot",
    color: "#2979b5",
    diff: "hard",
    strength: "98%",
    bestFor: "Braid to fluorocarbon/mono leader — the gold standard for offshore",
    description: "The slimmest, strongest braid-to-leader connection on the planet. Passes through rod guides smoothly. Takes practice — but once you learn it, you'll never use anything else for braid-to-leader.",
    uses: [
      "Braid main line to fluoro/mono leader (THE standard)",
      "Topshot connections on offshore conventional reels",
      "Long casting setups where knot must pass through guides",
      "Tournament fishing where every percentage point of line strength matters"],
    avoidWhen: [
      "You don't have 2-3 minutes and steady hands (use double uni when rushed)",
      "Tying line to a hook (this is line-to-line only)"],
    steps: [
      "Hold the leader (orange) taut. Lay braid (blue) across the leader with a long tag end.",
      "Wrap braid OVER the leader, then UNDER. This is the first wrap.",
      "Continue alternating: OVER-UNDER-OVER-UNDER. Aim for 18-22 wraps total.",
      "Keep wraps tight and stacked against each other. Don't let them spread.",
      "Lock the wraps with a half-hitch using the braid tag end around BOTH lines.",
      "Add 5-6 more half-hitches with braid tag around both lines to lock everything down.",
      "Finish with 3-4 half-hitches around just the braid main line.",
      "Trim the leader tag VERY close, and the braid tag close. Final knot is slim and bullet-shaped."],
    tip: "Practice on a hook hanging from a doorknob to keep tension. Most YouTube tutorials use a stretcher tool — useful for shore practice but real boat-deck tying needs the doorknob method.",
  },
  {
    id: "alberto",
    name: "Crazy Alberto Knot",
    color: "#f59e0b",
    diff: "med",
    strength: "92%",
    bestFor: "Braid to mono/fluoro leader — strong, faster than FG",
    description: "A modified Albright that wraps back through itself. Strong, slim enough to pass through guides, and much faster to tie than FG. Great choice when you need a reliable leader knot in a hurry.",
    uses: [
      "Braid to mono/fluoro when FG is too slow",
      "Inshore and nearshore rigs",
      "When seas are rough and FG is impractical",
      "Surf casting connections"],
    avoidWhen: [
      "Connecting very heavy mono/fluoro (100+ lb) — use FG or crimp",
      "Long-cast tournaments where every knot diameter matters"],
    steps: [
      "Form a loop in the leader (orange) by doubling 4-5 inches back on itself.",
      "Pass the braid (blue) through the leader loop.",
      "Wrap the braid back around BOTH legs of the leader loop — make 7 wraps.",
      "Reverse direction and wrap back through the wraps you just made — 7 more wraps.",
      "Pass the braid tag end back through the leader loop, same direction it entered.",
      "Moisten thoroughly, then pull braid main, braid tag, and leader main together slowly.",
      "Trim both tags close to the knot."],
  },
  {
    id: "doubleuni",
    name: "Double Uni Knot",
    color: "#a855f7",
    diff: "easy",
    strength: "88%",
    bestFor: "Line-to-line connections (mono-to-mono, mono-to-fluoro, even braid-to-mono)",
    description: "Two uni knots that cinch against each other. Easy to tie at sea, slimmer than a blood knot, and works with any combination of line types. Great backup when you can't manage an FG.",
    uses: [
      "Mono main line to fluoro leader",
      "Joining two lengths of mono when respooling",
      "Braid-to-mono when FG is impractical",
      "Wind-on leader connections"],
    avoidWhen: [
      "Heavy braid (50+ lb) to heavy mono — FG or Alberto is stronger",
      "Passing through small rod guides repeatedly (slightly bulky)"],
    steps: [
      "Overlap the two lines by 6-8 inches, running parallel.",
      "Form a loop in line A and wrap line A's tag end around BOTH lines 5-6 times, passing through the loop.",
      "Pull line A's tag to snug — first uni knot is now tied around line B.",
      "Repeat the process with line B: form a loop, wrap 5-6 times around both lines, pass through loop.",
      "Pull line B's tag to snug — second uni knot is now tied around line A.",
      "Moisten, then pull BOTH main lines (not the tags) in opposite directions.",
      "Two knots slide together and lock against each other. Trim both tag ends."],
    tip: "If using braid + mono, do 7-8 wraps with the braid side and only 5 with the mono side. Braid is slippery; mono compresses.",
  },
  {
    id: "albright",
    name: "Albright Knot",
    color: "#dc2626",
    diff: "med",
    strength: "85%",
    bestFor: "Joining lines of very different diameters — like braid to heavy wire leader",
    description: "The classic asymmetric line-to-line knot. Wrap the smaller line around the larger. Useful for unusual connections like braid-to-wire or main-to-heavy-leader where most knots fail.",
    uses: [
      "Braid to single-strand wire leader (sharks, wahoo, kings)",
      "Light line to MUCH heavier line (10 lb to 80 lb)",
      "Backing to fly line",
      "Joining loop-to-loop alternative"],
    avoidWhen: [
      "Similar-diameter lines (Double Uni is easier)",
      "Lines that need to pass through guides repeatedly (use Alberto/FG)"],
    steps: [
      "Form a loop in the HEAVIER line (orange) by doubling back 3-4 inches.",
      "Pass the LIGHTER line (blue) through the loop, leaving 8-10 inches of tag end.",
      "Wrap the lighter line back around BOTH legs of the heavy loop — make 10 tight wraps.",
      "Pass the tag of the lighter line back through the loop from the SAME side it entered.",
      "Moisten thoroughly, then pull all four ends slowly to compress the wraps against the loop's end.",
      "Trim both tags close to the knot."],
    tip: "The direction of the final pass matters — same side as entry. If you pass it the wrong way, the knot slips.",
  },
  {
    id: "bimini",
    name: "Bimini Twist",
    color: "#0d6ea8",
    diff: "hard",
    strength: "100%",
    bestFor: "Creating a 100% strength double-line loop for offshore connections",
    description: "Doubles your main line to create a stronger loop for offshore connections. The starting point for IGFA-legal record fish setups. Combined with an Albright or crimp for big game.",
    uses: [
      "Offshore tuna and billfish rigs (mandatory IGFA)",
      "Wind-on leader main-line connection",
      "Doubling line for added cushion against big-fish runs",
      "Creating a stronger eye to crimp onto"],
    avoidWhen: [
      "Light tackle inshore — overkill",
      "Lines under 20 lb — usually unnecessary"],
    steps: [
      "Double the main line back on itself, forming a loop 18-24 inches long.",
      "Slip your foot or a buddy's hand through the loop. Hold both lines apart with hands.",
      "Twist the doubled section by rotating ONE hand — make 20-25 twists for mono, 30+ for braid.",
      "Hold the twists in place. Apply tension by spreading the loop with your foot.",
      "Let the tag end roll DOWN over the twists, working back from the loop's end toward the standing line.",
      "Keep tension — the tag wraps tighten progressively over the twists.",
      "When tag reaches the end of the twists, lock with 3-4 half-hitches around BOTH lines.",
      "Finish with a 5-wrap finishing knot around both legs of the loop.",
      "Trim tag. The loop is now 95-100% line strength."],
    tip: "Bimini is awkward solo. Bracing it against a fixed object (chair leg, cooler handle, foot) is essential. Practice on dry land with paracord before doing it for real on a rocking boat.",
  }];

// ════════════════════════════════════════════════════════════════════════════
// CRIMPING DATA
// ════════════════════════════════════════════════════════════════════════════
const KN_CRIMPS = [
  {
    type: "Double Barrel Crimp",
    icon: "═",
    strength: 98,
    bestFor: "Mono/fluoro leaders 60-400 lb. The standard for offshore big game.",
    description: "Two separate channels keep the line legs parallel — distributes load evenly. Strongest crimp option available. Use with chafe gear (tubing) for billfish and giant tuna.",
    properUse: "Match crimp size to leader test EXACTLY. Use a calibrated crimper (not pliers). Pass line through, around the eye, back through, and crimp ONCE at the center of the crimp.",
  },
  {
    type: "Aluminum Single Sleeve",
    icon: "◯",
    strength: 92,
    bestFor: "Mono/fluoro leaders 30-130 lb. Most common saltwater crimp.",
    description: "Cheap, effective for most applications. Slightly less ideal load distribution than double-barrel but more than adequate for most game fish.",
    properUse: "Use the right size for your leader test. Single crimp in the center is correct — multiple crimps weaken the sleeve. Pair with chafe gear for big-fish setups.",
  },
  {
    type: "Copper Single Sleeve",
    icon: "🟤",
    strength: 95,
    bestFor: "Wire leaders (single-strand or cable) for sharks, kings, wahoo.",
    description: "Copper is softer and conforms to wire better than aluminum. Standard for toothy-fish wire leader rigs.",
    properUse: "Use the smallest crimp that fits the wire. Single crimp, slight twist of the crimper to lock. Avoid over-crimping (crushes the wire).",
  },
  {
    type: "Crimped Loop on Wind-On",
    icon: "🪢",
    strength: 100,
    bestFor: "Pre-made wind-on leaders for offshore trolling.",
    description: "Factory-crimped Bimini-style loop on a wind-on leader. 100% strength on the loop, perfect for loop-to-loop connections to main line.",
    properUse: "Don't try to make these yourself unless you have the right tools — buy commercial wind-ons from reputable makers.",
  },
  {
    type: "Knot (for comparison)",
    icon: "🪢",
    strength: 85,
    bestFor: "Anything under 60 lb leader. When properly tied, knots are excellent.",
    description: "A well-tied knot in 30-60 lb leader is plenty for most fishing. Only step up to crimps when line gets heavier (80+ lb mono/fluoro) where knot strength drops off.",
    properUse: "Match knot to application: FG/Alberto for braid-to-leader, Uni/Palomar for terminal connections.",
  }];

// ════════════════════════════════════════════════════════════════════════════
// DECISION MATRIX — "Which to Use" data
// ════════════════════════════════════════════════════════════════════════════
const KN_DECISIONS = [
  {q:"Tying any line (mono, fluoro, or braid) to a hook, swivel, or lure?", a:"Palomar Knot", target:"palomar"},
  {q:"Tying braid main line to fluoro/mono leader? (Tournament/offshore)", a:"FG Knot", target:"fg"},
  {q:"Tying braid to leader, but in a hurry or in rough seas?", a:"Crazy Alberto", target:"alberto"},
  {q:"Joining two pieces of mono, or mono-to-fluoro?", a:"Double Uni", target:"doubleuni"},
  {q:"Tying braid (or light line) to wire leader?", a:"Albright Knot", target:"albright"},
  {q:"Setting up an offshore tuna/marlin rig?", a:"Bimini Twist + Crimp", target:"bimini"},
  {q:"Connecting heavy mono leader (80+ lb) to a hook for big game?", a:"Crimp (Double Barrel)", target:"crimps"},
  {q:"Wire leader for sharks, kings, or wahoo?", a:"Crimp (Copper Sleeve)", target:"crimps"},
  {q:"Light tackle inshore — small hook on 20 lb mono?", a:"Palomar Knot", target:"palomar"}];

// ════════════════════════════════════════════════════════════════════════════
// SVG STEP DIAGRAMS
// Each knot has an array of SVG strings, one per step.
// Coordinate system: 400x240 viewbox. Blue=#2979b5 (main), Orange=#f59e0b (leader/tag)
// Red dot = focus point. Hook drawn at right when relevant.
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// KNOT DIAGRAMS — color-coded animated SVGs
//
// Convention used throughout:
//   .kn-line-main   = MAIN LINE (blue, line going back to your reel)
//   .kn-line-tag    = TAG END (orange, the short working end you manipulate)
//   .kn-line-leader = LEADER (dark gray, line-to-line knots only)
//   .kn-active      = The stroke being added/changed in THIS step (animates in)
//   .kn-prior       = Lines drawn in previous steps (rendered faded for context)
//
// Each diagram step is a function of step index. Lines from earlier steps stay
// visible at reduced opacity so the user always sees the full picture, while
// the action of the current step pops via the .kn-active draw-in animation.
// ════════════════════════════════════════════════════════════════════════════

// Hook shape — re-used across all line-to-hook knots
const KN_HOOK = `
  <g stroke="#1f2937" stroke-width="2.5" fill="none" stroke-linecap="round">
    <circle cx="340" cy="125" r="11" stroke-width="3"/>
    <path d="M 340 136 Q 340 188, 368 188 Q 390 188, 386 166"/>
    <path d="M 386 166 L 380 160 M 386 166 L 392 160" stroke-width="2.5"/>
  </g>`;

// ────────────────────────────────────────────────────────────────────────────
// KN_SVGS — array of SVG strings per knot, one per step.
// Each step ONLY marks the newly-introduced strokes as `class="kn-active"`,
// while previously-drawn strokes get `class="kn-prior"`. This way the user's
// eye is drawn to the action of THIS step automatically.
// ────────────────────────────────────────────────────────────────────────────
const KN_SVGS = {

  // ═══════ PALOMAR — line-to-hook ═══════════════════════════════════════════
  palomar: [
    // Step 1: doubled line passes through hook eye
    `<svg viewBox="0 0 420 250">${KN_HOOK}
      <path class="kn-line-main kn-active" d="M 30 118 Q 200 118, 328 122"/>
      <path class="kn-line-tag kn-active"  d="M 30 132 Q 200 132, 328 128"/>
      <g class="kn-pull-arrow left" font-family="Segoe UI,Arial" fill="#2563eb">
        <text x="20" y="100" text-anchor="end">← doubled line</text>
      </g>
    </svg>`,
    // Step 2: loose overhand knot tied with the doubled line
    `<svg viewBox="0 0 420 250">${KN_HOOK}
      <path class="kn-line-main kn-prior" d="M 30 118 Q 130 118, 200 120"/>
      <path class="kn-line-tag kn-prior"  d="M 30 132 Q 130 132, 200 130"/>
      <path class="kn-line-main kn-active" d="M 200 120 Q 240 80, 290 100 Q 330 115, 320 120"/>
      <path class="kn-line-tag kn-active"  d="M 200 130 Q 240 170, 290 150 Q 330 135, 320 130"/>
      <g font-family="Segoe UI,Arial" font-size="10" fill="#475569">
        <text x="265" y="60" text-anchor="middle">loose overhand</text>
      </g>
    </svg>`,
    // Step 3: pass the hook through the loop
    `<svg viewBox="0 0 420 250">${KN_HOOK}
      <path class="kn-line-main kn-prior" d="M 30 118 Q 130 118, 200 120 Q 240 80, 270 110"/>
      <path class="kn-line-tag kn-prior"  d="M 30 132 Q 130 132, 200 130 Q 240 170, 270 140"/>
      <ellipse class="kn-line-main kn-active" cx="285" cy="125" rx="42" ry="32"/>
      <g class="kn-pull-arrow" font-family="Segoe UI,Arial" font-size="11" fill="#16a34a" font-weight="700">
        <text x="285" y="218" text-anchor="middle">↓ pass hook DOWN through loop</text>
      </g>
      <text x="285" y="128" text-anchor="middle" font-family="Segoe UI,Arial" font-size="10" fill="#16a34a" font-weight="600">loop</text>
    </svg>`,
    // Step 4: moisten + pull both ends to tighten
    `<svg viewBox="0 0 420 250">${KN_HOOK}
      <path class="kn-line-main kn-active" d="M 30 119 Q 180 119, 300 122"/>
      <path class="kn-line-tag kn-active"  d="M 30 131 Q 180 131, 300 128"/>
      <g class="kn-line-main" stroke-width="3" stroke-linecap="round">
        <path d="M 300 122 Q 320 110, 332 118"/>
      </g>
      <g class="kn-line-tag" stroke-width="2.5" stroke-linecap="round">
        <path d="M 300 128 Q 320 140, 330 132"/>
      </g>
      <g class="kn-pull-arrow left" font-family="Segoe UI,Arial" font-size="11" fill="#dc2626" font-weight="700">
        <text x="25" y="170">← pull MAIN + TAG</text>
      </g>
      <g font-family="Segoe UI,Arial" font-size="10" fill="#16a34a" font-weight="600">
        <text x="200" y="40" text-anchor="middle">💧 wet the knot before pulling</text>
      </g>
    </svg>`,
    // Step 5: trim tag, done
    `<svg viewBox="0 0 420 250">${KN_HOOK}
      <path class="kn-line-main kn-prior" d="M 30 125 L 300 125"/>
      <circle cx="318" cy="125" r="9" class="kn-line-main" fill="#2563eb" stroke="none"/>
      <g class="kn-line-tag kn-active" stroke-width="2">
        <path d="M 314 125 L 313 134"/>
      </g>
      <g font-family="Segoe UI,Arial" fill="#16a34a" font-weight="700">
        <text x="210" y="215" text-anchor="middle" font-size="14">✓ Strong · Fast · Reliable</text>
      </g>
    </svg>`],

  // ═══════ FG KNOT — braid (main) to leader ════════════════════════════════
  fg: [
    // Step 1: hold leader taut, lay braid across
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-active" d="M 20 130 L 400 130"/>
      <path class="kn-line-main kn-active" d="M 80 70 Q 130 100, 200 130"/>
      <g class="kn-pull-arrow left" font-family="Segoe UI,Arial" font-size="11" fill="#475569" font-weight="700">
        <text x="15" y="120" text-anchor="start">leader →</text>
        <text x="405" y="120" text-anchor="end">← hold taut</text>
      </g>
      <text x="75" y="62" font-family="Segoe UI,Arial" font-size="11" fill="#2563eb" font-weight="700">braid main</text>
    </svg>`,
    // Step 2: first wrap - over then under
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-prior" d="M 20 130 L 400 130"/>
      <path class="kn-line-main kn-prior" d="M 80 70 Q 120 100, 160 125"/>
      <path class="kn-line-main kn-active" d="M 160 125 Q 180 105, 195 130 Q 205 150, 220 125"/>
      <text x="190" y="60" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#16a34a" font-weight="700">wrap #1: OVER → UNDER</text>
    </svg>`,
    // Step 3: continue 18-22 wraps
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-prior" d="M 20 130 L 400 130"/>
      <path class="kn-line-main kn-prior" d="M 80 70 Q 120 100, 140 125"/>
      <g class="kn-line-main kn-active">
        <path d="M 140 125 Q 150 105, 158 130 Q 163 150, 168 125"/>
        <path d="M 168 125 Q 173 105, 180 130 Q 184 150, 189 125"/>
        <path d="M 189 125 Q 193 105, 200 130 Q 204 150, 209 125"/>
        <path d="M 209 125 Q 213 105, 220 130 Q 224 150, 229 125"/>
        <path d="M 229 125 Q 233 105, 240 130 Q 244 150, 249 125"/>
        <path d="M 249 125 Q 253 105, 260 130 Q 264 150, 269 125"/>
        <path d="M 269 125 Q 273 105, 280 130 Q 284 150, 289 125"/>
        <path d="M 289 125 Q 293 105, 300 130 Q 304 150, 309 125"/>
      </g>
      <text x="220" y="60" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#16a34a" font-weight="700">18–22 wraps · alternating OVER/UNDER</text>
      <text x="220" y="200" text-anchor="middle" font-family="Segoe UI,Arial" font-size="10" fill="#dc2626" font-weight="600">keep stacked TIGHT — no gaps</text>
    </svg>`,
    // Step 4: emphasis on tight stacked wraps (no gaps)
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-prior" d="M 20 130 L 400 130"/>
      <path class="kn-line-main kn-prior" d="M 80 70 Q 120 100, 140 125"/>
      <rect class="kn-active" x="138" y="108" width="180" height="36" rx="6"
            fill="none" stroke="#16a34a" stroke-width="2.5" stroke-dasharray="6 3"/>
      <text x="228" y="100" text-anchor="middle" font-family="Segoe UI,Arial" font-size="10" fill="#16a34a" font-weight="700">stacked tight · no gaps</text>
      <g class="kn-line-main">
        <path d="M 140 125 Q 150 105, 158 130 Q 163 150, 168 125"/>
        <path d="M 168 125 Q 173 105, 180 130 Q 184 150, 189 125"/>
        <path d="M 189 125 Q 193 105, 200 130 Q 204 150, 209 125"/>
        <path d="M 209 125 Q 213 105, 220 130 Q 224 150, 229 125"/>
        <path d="M 229 125 Q 233 105, 240 130 Q 244 150, 249 125"/>
        <path d="M 249 125 Q 253 105, 260 130 Q 264 150, 269 125"/>
        <path d="M 269 125 Q 273 105, 280 130 Q 284 150, 289 125"/>
        <path d="M 289 125 Q 293 105, 300 130 Q 304 150, 309 125"/>
      </g>
    </svg>`,
    // Step 5: lock with half-hitch using braid tag around BOTH lines
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-prior" d="M 20 130 L 400 130"/>
      <path class="kn-line-main kn-prior" d="M 80 70 Q 120 100, 140 125 L 309 125"/>
      <path class="kn-line-tag kn-active" d="M 309 125 Q 330 90, 345 125 Q 350 140, 360 130"/>
      <text x="320" y="70" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#ea580c" font-weight="700">half-hitch · BOTH lines</text>
    </svg>`,
    // Step 6: 5-6 more half hitches around both lines
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-prior" d="M 20 130 L 400 130"/>
      <path class="kn-line-main kn-prior" d="M 80 70 Q 120 100, 140 125 L 309 125"/>
      <g class="kn-line-tag kn-active">
        <path d="M 309 125 Q 318 95, 325 125"/>
        <path d="M 325 125 Q 332 155, 340 125"/>
        <path d="M 340 125 Q 348 95, 355 125"/>
        <path d="M 355 125 Q 360 155, 365 125"/>
        <path d="M 365 125 Q 370 145, 375 130"/>
      </g>
      <text x="340" y="80" text-anchor="middle" font-family="Segoe UI,Arial" font-size="10" fill="#ea580c" font-weight="700">5–6 more half-hitches · BOTH lines</text>
    </svg>`,
    // Step 7: finish hitches on braid main only
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-prior" d="M 20 130 L 250 130"/>
      <path class="kn-line-main kn-prior" d="M 80 70 Q 120 100, 140 125 L 280 125"/>
      <g class="kn-line-tag kn-active">
        <path d="M 280 125 Q 290 110, 298 125"/>
        <path d="M 298 125 Q 304 140, 310 125"/>
        <path d="M 310 125 Q 316 110, 322 125"/>
        <path d="M 322 125 Q 328 140, 335 130"/>
      </g>
      <text x="305" y="80" text-anchor="middle" font-family="Segoe UI,Arial" font-size="10" fill="#ea580c" font-weight="700">3–4 hitches · braid only</text>
    </svg>`,
    // Step 8: trimmed and finished
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader" d="M 20 130 L 230 130"/>
      <path class="kn-line-main"   d="M 230 130 L 400 130"/>
      <rect class="kn-active" x="222" y="118" width="22" height="24" rx="4"
            fill="rgba(22,163,74,.12)" stroke="#16a34a" stroke-width="1.5"/>
      <text x="233" y="100" text-anchor="middle" font-family="Segoe UI,Arial" font-size="10" fill="#16a34a" font-weight="700">slim bullet</text>
      <text x="210" y="215" text-anchor="middle" font-family="Segoe UI,Arial" font-size="14" fill="#16a34a" font-weight="700">✓ Strongest line-to-leader knot</text>
    </svg>`],

  // ═══════ CRAZY ALBERTO ═══════════════════════════════════════════════════
  alberto: [
    // Step 1: form loop in leader
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-active" d="M 20 90 Q 200 90, 300 115 Q 340 130, 300 145 Q 200 170, 20 170"/>
      <text x="170" y="220" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#475569" font-weight="700">form a loop in the LEADER</text>
    </svg>`,
    // Step 2: braid main enters the loop
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-prior" d="M 20 90 Q 200 90, 300 115 Q 340 130, 300 145 Q 200 170, 20 170"/>
      <path class="kn-line-main kn-active" d="M 390 130 L 240 130"/>
      <g class="kn-pull-arrow left" font-family="Segoe UI,Arial" font-size="11" fill="#2563eb" font-weight="700">
        <text x="395" y="120" text-anchor="end">← braid main</text>
      </g>
    </svg>`,
    // Step 3: wrap braid 7 times around BOTH leader strands inside the loop
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-prior" d="M 20 90 Q 200 90, 300 115 Q 340 130, 300 145 Q 200 170, 20 170"/>
      <g class="kn-line-main kn-active">
        <path d="M 240 130 Q 248 100, 256 130 Q 262 160, 268 130"/>
        <path d="M 268 130 Q 274 100, 280 130 Q 286 160, 292 130"/>
        <path d="M 292 130 Q 296 110, 300 130"/>
      </g>
      <text x="270" y="70" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#16a34a" font-weight="700">7 wraps · braid around BOTH leader strands</text>
    </svg>`,
    // Step 4: reverse direction, wrap back over the wraps
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-prior" d="M 20 90 Q 200 90, 300 115 Q 340 130, 300 145 Q 200 170, 20 170"/>
      <g class="kn-line-main kn-prior">
        <path d="M 240 130 Q 248 100, 256 130 Q 262 160, 268 130"/>
        <path d="M 268 130 Q 274 100, 280 130 Q 286 160, 292 130"/>
        <path d="M 292 130 Q 296 110, 300 130"/>
      </g>
      <path class="kn-line-tag kn-active" d="M 300 130 Q 295 95, 270 95 Q 245 95, 240 130"/>
      <text x="270" y="70" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#ea580c" font-weight="700">reverse · wrap BACK over the wraps</text>
    </svg>`,
    // Step 5: thread braid tag back out through the loop
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-prior" d="M 20 90 Q 200 90, 300 115 Q 340 130, 300 145 Q 200 170, 20 170"/>
      <path class="kn-line-main kn-prior" d="M 390 130 L 300 130"/>
      <path class="kn-line-tag kn-active" d="M 240 130 L 320 130 L 380 130"/>
      <g class="kn-pull-arrow" font-family="Segoe UI,Arial" font-size="11" fill="#ea580c" font-weight="700">
        <text x="380" y="115" text-anchor="end">tag exits same side →</text>
      </g>
    </svg>`,
    // Step 6: moisten and pull all four ends to tighten
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader" d="M 20 125 L 200 125"/>
      <path class="kn-line-main"   d="M 220 125 L 400 125"/>
      <rect class="kn-active" x="195" y="115" width="30" height="22" rx="4"
            fill="rgba(22,163,74,.15)" stroke="#16a34a" stroke-width="2"/>
      <text x="210" y="100" text-anchor="middle" font-family="Segoe UI,Arial" font-size="10" fill="#16a34a" font-weight="700">tightened</text>
      <text x="210" y="215" text-anchor="middle" font-family="Segoe UI,Arial" font-size="13" fill="#16a34a" font-weight="700">💧 wet → pull all 4 ends together</text>
    </svg>`],

  // ═══════ DOUBLE UNI ═══════════════════════════════════════════════════════
  doubleuni: [
    // Step 1: overlap two lines
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-main kn-active" d="M 20 110 L 290 110"/>
      <path class="kn-line-leader kn-active" d="M 130 140 L 400 140"/>
      <text x="20" y="92" font-family="Segoe UI,Arial" font-size="11" fill="#2563eb" font-weight="700">main →</text>
      <text x="400" y="160" font-family="Segoe UI,Arial" font-size="11" fill="#475569" font-weight="700" text-anchor="end">← leader</text>
    </svg>`,
    // Step 2: form a uni loop on the left with main line tag
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-main kn-prior" d="M 20 110 L 290 110"/>
      <path class="kn-line-leader kn-prior" d="M 130 140 L 400 140"/>
      <path class="kn-line-main kn-active" d="M 200 110 Q 220 85, 250 95 Q 280 115, 200 125 Q 170 130, 165 110"/>
      <text x="200" y="60" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#2563eb" font-weight="700">uni loop on the LEFT (main tag)</text>
    </svg>`,
    // Step 3: 5-7 wraps with main tag around BOTH lines
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-main kn-prior" d="M 20 110 L 290 110"/>
      <path class="kn-line-leader kn-prior" d="M 130 140 L 400 140"/>
      <g class="kn-line-main kn-active">
        <path d="M 165 110 Q 170 90, 180 120 Q 185 145, 195 120"/>
        <path d="M 195 120 Q 200 90, 210 120 Q 215 145, 225 120"/>
        <path d="M 225 120 Q 230 90, 240 120 Q 245 145, 255 120"/>
      </g>
      <text x="210" y="65" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#16a34a" font-weight="700">5–7 wraps · around BOTH lines</text>
    </svg>`,
    // Step 4: form mirror uni loop on the right with leader tag
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-main kn-prior" d="M 20 110 L 290 110"/>
      <path class="kn-line-leader kn-prior" d="M 130 140 L 400 140"/>
      <g class="kn-line-main kn-prior" stroke-width="2.5">
        <path d="M 165 110 Q 170 90, 180 120 Q 185 145, 195 120"/>
        <path d="M 195 120 Q 200 90, 210 120 Q 215 145, 225 120"/>
        <path d="M 225 120 Q 230 90, 240 120 Q 245 145, 255 120"/>
      </g>
      <path class="kn-line-leader kn-active" d="M 290 140 Q 270 165, 240 155 Q 210 135, 290 125 Q 320 120, 325 140"/>
      <text x="290" y="200" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#475569" font-weight="700">mirror uni loop on the RIGHT (leader tag)</text>
    </svg>`,
    // Step 5: 5-7 wraps with leader tag around both
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-main kn-prior" d="M 20 125 L 290 125"/>
      <path class="kn-line-leader kn-prior" d="M 130 125 L 400 125"/>
      <g class="kn-line-main kn-prior" stroke-width="2.5">
        <path d="M 165 125 Q 170 105, 180 135 Q 185 160, 195 135"/>
        <path d="M 195 135 Q 200 105, 210 135 Q 215 160, 225 135"/>
        <path d="M 225 135 Q 230 105, 240 135 Q 245 160, 255 135"/>
      </g>
      <g class="kn-line-leader kn-active">
        <path d="M 325 125 Q 320 105, 310 135 Q 305 160, 295 135"/>
        <path d="M 295 135 Q 290 105, 280 135 Q 275 160, 265 135"/>
        <path d="M 265 135 Q 260 105, 255 135"/>
      </g>
      <text x="300" y="65" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#16a34a" font-weight="700">5–7 wraps on leader side</text>
    </svg>`,
    // Step 6: pull main + leader to slide the two knots together
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-main"   d="M 20 125 L 195 125"/>
      <path class="kn-line-leader" d="M 225 125 L 400 125"/>
      <rect class="kn-active" x="190" y="115" width="40" height="22" rx="4"
            fill="rgba(22,163,74,.12)" stroke="#16a34a" stroke-width="2"/>
      <g class="kn-pull-arrow left" font-family="Segoe UI,Arial" font-size="12" fill="#dc2626" font-weight="700">
        <text x="20" y="100">← pull MAIN</text>
        <text x="400" y="100" text-anchor="end">pull LEADER →</text>
      </g>
      <text x="210" y="170" text-anchor="middle" font-family="Segoe UI,Arial" font-size="13" fill="#16a34a" font-weight="700">two knots slide together → trim tags</text>
    </svg>`],

  // ═══════ ALBRIGHT ═════════════════════════════════════════════════════════
  albright: [
    // Step 1: form loop in heavier leader
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-active" d="M 20 105 Q 200 105, 320 125 Q 360 138, 320 152 Q 200 175, 20 175"/>
      <text x="170" y="220" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#475569" font-weight="700">form a loop in the LEADER</text>
    </svg>`,
    // Step 2: thread braid through the loop
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-prior" d="M 20 105 Q 200 105, 320 125 Q 360 138, 320 152 Q 200 175, 20 175"/>
      <path class="kn-line-main kn-active" d="M 380 140 L 260 140"/>
      <g class="kn-pull-arrow left" font-family="Segoe UI,Arial" font-size="11" fill="#2563eb" font-weight="700">
        <text x="385" y="130" text-anchor="end">← thread braid through loop</text>
      </g>
    </svg>`,
    // Step 3: 10-12 wraps with braid around both leader strands
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-prior" d="M 20 105 Q 200 105, 320 125 Q 360 138, 320 152 Q 200 175, 20 175"/>
      <g class="kn-line-main kn-active">
        <path d="M 260 140 Q 268 110, 276 140 Q 282 168, 288 140"/>
        <path d="M 288 140 Q 294 110, 300 140 Q 306 168, 312 140"/>
        <path d="M 312 140 Q 316 120, 320 140"/>
      </g>
      <text x="290" y="70" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#16a34a" font-weight="700">10–12 wraps · braid around BOTH strands</text>
    </svg>`,
    // Step 4: thread tag back out same way it came in
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader kn-prior" d="M 20 105 Q 200 105, 320 125 Q 360 138, 320 152 Q 200 175, 20 175"/>
      <g class="kn-line-main kn-prior">
        <path d="M 260 140 Q 268 110, 276 140 Q 282 168, 288 140"/>
        <path d="M 288 140 Q 294 110, 300 140 Q 306 168, 312 140"/>
        <path d="M 312 140 Q 316 120, 320 140"/>
      </g>
      <path class="kn-line-tag kn-active" d="M 320 140 Q 330 100, 270 100 Q 230 100, 240 140"/>
      <text x="280" y="75" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#ea580c" font-weight="700">tag exits SAME SIDE it entered</text>
    </svg>`,
    // Step 5: wet and pull tight
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-leader" d="M 20 130 L 200 130"/>
      <path class="kn-line-main"   d="M 220 130 L 400 130"/>
      <rect class="kn-active" x="195" y="120" width="30" height="22" rx="4"
            fill="rgba(22,163,74,.15)" stroke="#16a34a" stroke-width="2"/>
      <text x="210" y="215" text-anchor="middle" font-family="Segoe UI,Arial" font-size="13" fill="#16a34a" font-weight="700">💧 wet → pull all 4 ends together</text>
    </svg>`],

  // ═══════ BIMINI TWIST — strong loop in main line ════════════════════════
  bimini: [
    // Step 1: double the main line and place over your knee
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-main kn-active" d="M 30 100 Q 200 100, 350 130 Q 360 132, 350 134 Q 200 140, 30 140"/>
      <text x="200" y="50" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#2563eb" font-weight="700">double main line · ~20 inches</text>
      <text x="200" y="200" text-anchor="middle" font-family="Segoe UI,Arial" font-size="10" fill="#475569">slip the loop over a fixed point (knee, peg, post)</text>
    </svg>`,
    // Step 2: 20 twists
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-main kn-active" d="M 30 110 Q 80 100, 100 115 Q 120 130, 100 140 Q 80 130, 70 120 Q 90 110, 110 125 Q 130 140, 110 150 Q 90 140, 80 130 Q 100 120, 120 135 Q 140 150, 120 160"/>
      <path class="kn-line-main kn-active" d="M 120 160 Q 200 160, 280 145 L 360 138"/>
      <path class="kn-line-main kn-active" d="M 120 115 Q 200 115, 280 130 L 360 138"/>
      <text x="200" y="60" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#2563eb" font-weight="700">put 20 TWISTS in the doubled line</text>
    </svg>`,
    // Step 3: spread legs to open twists, then roll wraps back over twists
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-main kn-prior" d="M 30 100 Q 200 100, 350 130 Q 360 132, 350 134 Q 200 140, 30 140"/>
      <g class="kn-line-main kn-active">
        <path d="M 130 95 Q 140 75, 155 95 Q 165 115, 175 95"/>
        <path d="M 175 95 Q 185 75, 195 95 Q 205 115, 215 95"/>
        <path d="M 215 95 Q 225 75, 235 95 Q 245 115, 255 95"/>
        <path d="M 255 95 Q 265 75, 275 95"/>
      </g>
      <text x="200" y="50" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#16a34a" font-weight="700">spread legs to open twists · roll wraps BACK</text>
    </svg>`,
    // Step 4: half-hitch around one leg
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-main kn-prior" d="M 30 115 L 360 130"/>
      <path class="kn-line-main kn-prior" d="M 30 145 L 360 130"/>
      <path class="kn-line-tag kn-active" d="M 360 130 Q 380 110, 390 125 Q 395 135, 380 135"/>
      <text x="320" y="65" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#ea580c" font-weight="700">half-hitch · ONE leg only</text>
    </svg>`,
    // Step 5: 3 half-hitches around BOTH legs to lock
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-main kn-prior" d="M 30 115 L 320 130"/>
      <path class="kn-line-main kn-prior" d="M 30 145 L 320 130"/>
      <g class="kn-line-tag kn-active">
        <path d="M 320 130 Q 335 110, 350 130"/>
        <path d="M 350 130 Q 360 150, 370 130"/>
        <path d="M 370 130 Q 378 110, 385 130 Q 390 145, 380 145"/>
      </g>
      <text x="340" y="70" text-anchor="middle" font-family="Segoe UI,Arial" font-size="11" fill="#16a34a" font-weight="700">3 hitches · BOTH legs · LOCKED</text>
    </svg>`,
    // Step 6: finished doubled loop
    `<svg viewBox="0 0 420 250">
      <path class="kn-line-main" d="M 30 100 Q 200 100, 340 125"/>
      <path class="kn-line-main" d="M 30 150 Q 200 150, 340 125"/>
      <path class="kn-line-main" d="M 340 125 L 395 125"/>
      <rect class="kn-active" x="330" y="115" width="25" height="22" rx="4"
            fill="rgba(22,163,74,.12)" stroke="#16a34a" stroke-width="2"/>
      <text x="200" y="215" text-anchor="middle" font-family="Segoe UI,Arial" font-size="13" fill="#16a34a" font-weight="700">✓ 100% strength · double-line loop</text>
    </svg>`],
};

// ════════════════════════════════════════════════════════════════════════════
// STATE & LIFECYCLE
// ════════════════════════════════════════════════════════════════════════════
let KN_state = {
  tab: "picker",
  activeKnot: null,
  step: 0,
};

function openKnots(){
  document.getElementById("kn-overlay").style.display = "block";
  document.body.style.overflow = "hidden";
  knRender();
}
function closeKnots(){
  document.getElementById("kn-overlay").style.display = "none";
  document.body.style.overflow = "";
  KN_state.activeKnot = null;
  KN_state.step = 0;
}
function knSwitchTab(tab){
  KN_state.tab = tab;
  KN_state.activeKnot = null;
  KN_state.step = 0;
  document.querySelectorAll(".kn-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  knRender();
}
function knRender(){
  const root = document.getElementById("kn-content");
  if(KN_state.activeKnot){
    root.innerHTML = knRenderKnotDetail(KN_state.activeKnot);
    return;
  }
  if(KN_state.tab === "picker") root.innerHTML = knRenderPicker();
  else if(KN_state.tab === "knots") root.innerHTML = knRenderKnotList();
  else if(KN_state.tab === "crimps") root.innerHTML = knRenderCrimps();
  else if(KN_state.tab === "data") root.innerHTML = knRenderData();
}

// ── PICKER TAB ──────────────────────────────────────────────────────────
function knRenderPicker(){
  return `
    <div style="background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.25);border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:12px;color:#86efac;line-height:1.65">
      <b>🎯 Pick the right connection</b> — tap any scenario to see the recommended knot or crimp and detailed information about when to use it.
    </div>
    <div class="kn-decision-grid">
      ${KN_DECISIONS.map(d => `
        <div class="kn-decision-card" onclick="knJumpTo('${d.target}')">
          <div class="kn-decision-q">${d.q}</div>
          <div class="kn-decision-a">${d.a} →</div>
        </div>
      `).join("")}
    </div>
    <div class="kn-card" style="margin-top:18px">
      <h4>Quick Reference</h4>
      <div style="font-size:12px;color:#cfe5ff;line-height:1.8">
        <div><b style="color:#34d399">Any line → terminal:</b> Palomar (mono, fluoro, and braid all do best with it)</div>
        <div><b style="color:#34d399">Braid → leader:</b> FG (best) or Crazy Alberto (faster)</div>
        <div><b style="color:#34d399">Line → line:</b> Double Uni (general) · Albright (very different sizes)</div>
        <div><b style="color:#34d399">Heavy leader (80+ lb) → hook:</b> Crimp (Double Barrel)</div>
        <div><b style="color:#34d399">Offshore tuna/marlin rig:</b> Bimini Twist + Crimp</div>
      </div>
    </div>
  `;
}
function knJumpTo(target){
  if(target === "crimps"){ knSwitchTab("crimps"); return; }
  const k = KN_KNOTS.find(x => x.id === target);
  if(k){ KN_state.activeKnot = k.id; KN_state.tab = "knots"; KN_state.step = 0;
    document.querySelectorAll(".kn-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "knots"));
    knRender(); }
}

// ── KNOTS LIST TAB ──────────────────────────────────────────────────────
function knRenderKnotList(){
  return `
    <div class="kn-knot-grid">
      ${KN_KNOTS.map(k => `
        <div class="kn-knot-tile" style="--c:${k.color}" onclick="knOpen('${k.id}')">
          <div class="kn-knot-name">${k.name}</div>
          <div class="kn-knot-use">${k.bestFor}</div>
          <div class="kn-knot-meta">
            <span class="kn-pill diff-${k.diff}">${k.diff === "easy" ? "Easy" : k.diff === "med" ? "Moderate" : "Advanced"}</span>
            <span class="kn-pill strength">${k.strength} line strength</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}
function knOpen(id){
  KN_state.activeKnot = id;
  KN_state.step = 0;
  knRender();
}

// ── KNOT DETAIL (animated steps) ────────────────────────────────────────
function knRenderKnotDetail(id){
  const k = KN_KNOTS.find(x => x.id === id);
  if(!k) return "<p>Knot not found</p>";

  return `
    <button class="kn-btn" onclick="KN_state.activeKnot=null;knRender()" style="margin-bottom:14px">← All Knots</button>

    <div class="kn-viewer">
      <div class="kn-viewer-header">
        <div style="width:12px;height:12px;border-radius:50%;background:${k.color};box-shadow:0 0 0 3px ${k.color}33"></div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:700;color:#f0f6ff">${k.name}</div>
          <div style="font-size:11px;color:#9ec5e8;margin-top:2px">${k.bestFor}</div>
        </div>
        <span class="kn-pill diff-${k.diff}">${k.diff === "easy" ? "Easy" : k.diff === "med" ? "Moderate" : "Advanced"}</span>
        <span class="kn-pill strength">${k.strength}</span>
      </div>
    </div>

    <div class="kn-card" style="margin-top:16px">
      <h4>About this knot</h4>
      <p style="font-size:13px;color:#c8d8e8;line-height:1.7">${k.description}</p>

      <h4>Best uses</h4>
      <ul style="font-size:12px;color:#cfe5ff;line-height:1.8;padding-left:22px;margin-top:4px">
        ${k.uses.map(u => `<li>${u}</li>`).join("")}
      </ul>

      <h4>Avoid when</h4>
      <ul style="font-size:12px;color:#cfe5ff;line-height:1.8;padding-left:22px;margin-top:4px">
        ${k.avoidWhen.map(u => `<li>${u}</li>`).join("")}
      </ul>

      ${k.tip ? `
        <h4>Captain's tip</h4>
        <div style="background:rgba(245,158,11,.08);border-left:3px solid rgba(245,158,11,.5);padding:10px 14px;font-size:12px;color:#fde047;line-height:1.65;border-radius:4px">
          ${k.tip}
        </div>
      ` : ""}

      <h4 style="margin-top:18px">Learn to tie it</h4>
      <p style="font-size:12px;color:#9ec5e8;line-height:1.65">
        Video tutorials show this knot far better than diagrams. Search YouTube for "${k.name} fishing knot" — Salt Strong, Hey Skipper, and BeefHook all have excellent step-by-step videos.
      </p>
    </div>
  `;
}

// ── CRIMPING TAB ────────────────────────────────────────────────────────
function knRenderCrimps(){
  return `
    <div class="kn-card">
      <h3>🔧 When to Crimp vs. Knot</h3>
      <p style="font-size:13px;color:#c8d8e8;line-height:1.7">
        <b style="color:#fbbf24">The rule of thumb:</b> knots are great up to 60-80 lb leader. Above that, monofilament gets too stiff to form a tight, reliable knot — and crimp strength becomes superior. Always crimp for:
      </p>
      <ul style="font-size:13px;color:#cfe5ff;line-height:1.8;padding-left:22px;margin-top:6px">
        <li>Mono/fluoro leader 80 lb and heavier</li>
        <li>Wire leader (any size) — knots don't hold reliably on wire</li>
        <li>Offshore tuna/marlin rigs where you can't afford a failure</li>
        <li>Wind-on leader connections to your main line</li>
      </ul>
    </div>

    <div class="kn-card">
      <h3>Crimp Comparison</h3>
      <p style="font-size:12px;color:#9ec5e8;margin-bottom:12px">Strength % is approximate based on IGFA pull-test averages with properly sized crimps and chafe gear.</p>
      ${KN_CRIMPS.map(c => `
        <div class="kn-crimp-row">
          <div class="kn-crimp-icon">${c.icon}</div>
          <div class="kn-crimp-info">
            <div class="kn-crimp-name">${c.type}</div>
            <div class="kn-crimp-when"><b style="color:#7dd3fc">Best for:</b> ${c.bestFor}</div>
            <div class="kn-crimp-when" style="margin-top:6px">${c.description}</div>
            <div class="kn-crimp-when" style="margin-top:6px"><b style="color:#fbbf24">Proper use:</b> ${c.properUse}</div>
          </div>
          <div class="kn-crimp-score ${c.strength >= 95 ? "" : c.strength >= 90 ? "med" : "low"}">${c.strength}%</div>
        </div>
      `).join("")}
    </div>

    <div class="kn-card">
      <h3>How to Crimp Properly</h3>
      <ol style="font-size:13px;color:#cfe5ff;line-height:1.85;padding-left:22px">
        <li><b style="color:#fbbf24">Match crimp size to leader test</b> — every crimp is sized for a specific line diameter. Check the package. Too big = it slips. Too small = it weakens the line.</li>
        <li><b style="color:#fbbf24">Use a calibrated crimper</b> — pliers WILL fail at sea. Hand-held crimpers like Du-Bro, ARC, or HiSeas are the standard. Bench-mount crimpers for heavy work.</li>
        <li><b style="color:#fbbf24">Add chafe gear for big game</b> — a piece of plastic tubing over the loop point prevents the leader from sawing through itself under load.</li>
        <li><b style="color:#fbbf24">One crimp, centered</b> — multiple crimps on one sleeve actually weaken it. Place the crimper at the center of the sleeve and squeeze once, firmly.</li>
        <li><b style="color:#fbbf24">Keep the loop as small as possible</b> — the larger the loop, the weaker the crimp. A wide loop forces the two line legs apart at the crotch of the crimp (where they enter the sleeve), creating a wedge effect that weakens the connection under load. Pull the loop down tight to the crimp before squeezing — minimize that crotch angle.</li>
        <li><b style="color:#fbbf24">Test before you trust</b> — after crimping, give the rig a hard tug. If it slips or feels wrong, cut it off and redo. Better to find out on the dock than at the canyon.</li>
      </ol>
    </div>
  `;
}

// ── TEST DATA TAB ───────────────────────────────────────────────────────
function knRenderData(){
  const rows = [
    {name:"Palomar (any line → hook)",     type:"Knot",    strength:95, notes:"Best knot for line-to-terminal in mono, fluoro, and braid"},
    {name:"FG Knot (braid → fluoro)",       type:"Knot",    strength:98, notes:"Slimmest profile, passes through guides"},
    {name:"Crazy Alberto (braid → fluoro)", type:"Knot",    strength:92, notes:"Fast alternative to FG"},
    {name:"Double Uni (line → line)",       type:"Knot",    strength:88, notes:"Best easy line-to-line option"},
    {name:"Albright (light → heavy)",       type:"Knot",    strength:85, notes:"Use for very different diameters"},
    {name:"Bimini Twist (loop)",            type:"Knot",    strength:100,notes:"100% line strength; offshore standard"},
    {name:"Double Barrel Crimp",            type:"Crimp",   strength:98, notes:"Standard for offshore big game"},
    {name:"Single Aluminum Sleeve",         type:"Crimp",   strength:92, notes:"Most common saltwater crimp"},
    {name:"Single Copper Sleeve (wire)",    type:"Crimp",   strength:95, notes:"For single-strand wire leaders"},
    {name:"Improved Clinch (mono → hook)",  type:"Knot",    strength:70, notes:"Common but weaker; use Uni instead"},
    {name:"Blood Knot (mono → mono)",       type:"Knot",    strength:80, notes:"Classic; Double Uni is easier and slimmer"},
    {name:"Surgeon's Knot (line → line)",   type:"Knot",    strength:75, notes:"Quick but weaker than Double Uni"}].sort((a,b) => b.strength - a.strength);

  return `
    <div class="kn-card">
      <h3>📊 Pull-Test Data</h3>
      <p style="font-size:14px;color:#9ec5e8;line-height:1.65;margin-bottom:14px">
        Line strength percentages reflect what % of the rated breaking strain the connection holds. <b style="color:#fbbf24">Test data is approximate</b> — actual results vary by line brand, knot care, line condition, and tying skill. Always test your own connections before fishing critical setups.
      </p>
      <table class="kn-table">
        <thead>
          <tr><th>Connection</th><th>Type</th><th>Strength</th><th>Notes</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td style="font-weight:600;color:#f0f6ff">${r.name}</td>
              <td>${r.type}</td>
              <td>
                <span class="kn-strength-bar" style="width:${r.strength*0.8}px"></span>
                <span style="font-weight:700;color:${r.strength >= 95 ? "#34d399" : r.strength >= 85 ? "#7dd3fc" : r.strength >= 75 ? "#fbbf24" : "#f87171"}">${r.strength}%</span>
              </td>
              <td style="color:#9ec5e8;font-size:13px">${r.notes}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div class="kn-card">
      <h3>Key Takeaways</h3>
      <ul style="font-size:14px;color:#cfe5ff;line-height:1.85;padding-left:22px">
        <li>The Bimini is the only 100% strength knot — use it for line doubling on offshore rigs.</li>
        <li>For braid to fluoro, FG (98%) beats Alberto (92%) by 6 points — worth learning if you fish offshore.</li>
        <li>Improved Clinch is everywhere online but only delivers 70% — replace it with Uni or Palomar.</li>
        <li>Crimps in heavy mono (80+ lb) beat knots by 10-20 percentage points.</li>
        <li>Quality matters more than the knot — a clumsy FG can be weaker than a well-tied Palomar.</li>
        <li>Wet your knots BEFORE you tighten — dry friction damages mono and reduces strength by 10-15%.</li>
      </ul>
    </div>
  `;
}

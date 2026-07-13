/* Bluewater Intel — Fish encyclopedia UI logic
 * Extracted verbatim from an inline <script> block in index.html (Approach A).
 * Loaded as a plain classic <script src> at the SAME document position, so
 * execution order, global scope, and file:// offline all behave identically.
 * DO NOT reorder relative to the other bw-*.js tags. */

// ════════════════════════════════════════════════════════════════════════════
// ENCYCLOPEDIA DATA
// ════════════════════════════════════════════════════════════════════════════
// ENC_SPECIES moved to bw-data-encyclopedia.js (Approach A modularization)

// ════════════════════════════════════════════════════════════════════════════
// ENCYCLOPEDIA LOGIC
// ════════════════════════════════════════════════════════════════════════════
let encCat = 'all';
let encQuery = '';

function openEncyclopedia(){
  document.getElementById('enc-overlay').style.display = 'block';
  document.body.style.overflow = 'hidden';
  encRender();
}
function closeEncyclopedia(){
  document.getElementById('enc-overlay').style.display = 'none';
  document.body.style.overflow = '';
}
function encSetCat(cat){
  encCat = cat;
  document.querySelectorAll('.enc-pill').forEach(p=>{
    p.classList.toggle('active', p.dataset.cat === cat);
  });
  encRender();
}
function encFilter(){
  encQuery = document.getElementById('enc-search').value.toLowerCase().trim();
  encRender();
}
function encRender(){
  const grid = document.getElementById('enc-grid');
  let list = ENC_SPECIES;
  if(encCat !== 'all') list = list.filter(s => s.cat === encCat);
  if(encQuery) list = list.filter(s =>
    s.name.toLowerCase().includes(encQuery) ||
    s.snippet.toLowerCase().includes(encQuery) ||
    s.id.toLowerCase().includes(encQuery)
  );
  if(list.length === 0){
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#5d96c4;font-size:13px">No species match your search.</div>';
    return;
  }
  grid.innerHTML = list.map(s => `
    <div class="enc-card" style="--c:${s.color}" onclick="encOpen('${s.id}')">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:14px;height:14px;border-radius:50%;background:${s.color};box-shadow:0 0 0 2px rgba(255,255,255,.1);flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:700;color:#f0f6ff">${s.name}</div>
          <span class="enc-tag enc-tag-${s.cat}">${s.cat}</span>
        </div>
      </div>
      <div style="font-size:13px;color:#b0c4de;line-height:1.55">${s.snippet}</div>
      <div style="display:flex;gap:10px;margin-top:11px;padding-top:11px;border-top:1px solid rgba(255,255,255,.06)">
        <div style="flex:1">
          <div style="font-size:10px;color:#5d96c4;letter-spacing:.1em;font-weight:600">SIZE</div>
          <div style="font-size:13px;color:#e8f4ff;font-weight:700;margin-top:2px">${s.facts.size}</div>
        </div>
        <div style="flex:1">
          <div style="font-size:10px;color:#5d96c4;letter-spacing:.1em;font-weight:600">SEASON</div>
          <div style="font-size:13px;color:#e8f4ff;font-weight:700;margin-top:2px">${s.facts.season.split(' (')[0].split(';')[0]}</div>
        </div>
      </div>
    </div>
  `).join('');
}
function encOpen(id){
  const s = ENC_SPECIES.find(x => x.id === id);
  if(!s) return;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const seasonBar = months.map(m=>{
    const v = s.seasons[m];
    const cls = v===3?'peak':v===2?'good':v===1?'fair':'';
    return `<div class="enc-month ${cls}">${m}</div>`;
  }).join('');

  document.getElementById('enc-modal-title').innerHTML = `<span style="color:${s.color}">●</span> ${s.name}`;
  document.getElementById('enc-modal-body').innerHTML = `
    <div class="enc-sec"><p>${s.snippet}</p></div>
    ${s.ident ? `<div class="enc-sec">
      <h3>How to Identify</h3>
      <ul class="enc-list" style="list-style:none;padding-left:0">${s.ident.marks.map(m=>`<li style="position:relative;padding-left:18px;margin-bottom:5px"><span style="position:absolute;left:0;color:#5d96c4">✓</span>${m}</li>`).join('')}</ul>
      ${s.ident.confusedWith ? `<div style="margin-top:10px;padding:10px 12px;background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.22);border-radius:8px">
        <div style="font-size:10px;color:#fbbf24;letter-spacing:.08em;font-weight:700;text-transform:uppercase;margin-bottom:5px">⚖ Easily Confused With</div>
        ${s.ident.confusedWith.map(c=>`<div style="font-size:12px;color:#e8f4ff;line-height:1.55;margin-bottom:5px"><b style="color:#f0f6ff">${c.species}:</b> ${c.tell}</div>`).join('')}
      </div>` : ''}
    </div>` : ''}
    <div class="enc-sec">
      <h3>Quick Facts</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
        <div class="enc-fact-card"><div style="font-size:9px;color:#5d96c4;letter-spacing:.1em;font-weight:600;text-transform:uppercase;margin-bottom:3px">Typical Size</div><div style="font-size:13px;color:#f0f6ff;font-weight:700">${s.facts.size}</div></div>
        <div class="enc-fact-card"><div style="font-size:9px;color:#5d96c4;letter-spacing:.1em;font-weight:600;text-transform:uppercase;margin-bottom:3px">World Record</div><div style="font-size:13px;color:#f0f6ff;font-weight:700">${s.facts.record}</div></div>
        <div class="enc-fact-card"><div style="font-size:9px;color:#5d96c4;letter-spacing:.1em;font-weight:600;text-transform:uppercase;margin-bottom:3px">Legal Size</div><div style="font-size:13px;color:#f0f6ff;font-weight:700">${s.facts.legal}</div></div>
        <div class="enc-fact-card"><div style="font-size:9px;color:#5d96c4;letter-spacing:.1em;font-weight:600;text-transform:uppercase;margin-bottom:3px">Peak Season</div><div style="font-size:13px;color:#f0f6ff;font-weight:700">${s.facts.season}</div></div>
      </div>
    </div>
    <div class="enc-sec">
      <h3>Seasonal Activity</h3>
      <div style="display:flex;gap:2px;background:rgba(0,0,0,.3);padding:4px;border-radius:8px">${seasonBar}</div>
      <div style="display:flex;gap:14px;margin-top:8px;font-size:9px;color:#5d96c4">
        <span><span style="display:inline-block;width:10px;height:10px;background:#16a34a;border-radius:2px;vertical-align:middle"></span> Peak</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:rgba(34,197,94,.4);border-radius:2px;vertical-align:middle"></span> Good</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:rgba(234,179,8,.3);border-radius:2px;vertical-align:middle"></span> Fair</span>
      </div>
    </div>
    <div class="enc-sec"><h3>Where to Find Them</h3><p>${s.where}</p></div>
    <div class="enc-sec"><h3>Tackle Setup</h3><ul class="enc-list enc-tackle">${s.tackle.map(t=>`<li>${t}</li>`).join('')}</ul></div>
    <div class="enc-sec"><h3>Best Baits & Lures</h3><ul class="enc-list enc-bait">${s.bait.map(b=>`<li>${b}</li>`).join('')}</ul></div>
    <div class="enc-sec"><h3>Captain's Tips</h3><ul class="enc-list enc-tip">${s.tips.map(t=>`<li>${t}</li>`).join('')}</ul></div>
    <div style="margin-top:30px;padding:14px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:8px;font-size:11px;color:#fbbf24;line-height:1.6">
      <b>⚠ Always verify current regulations.</b> Bag limits, size limits, and seasons change frequently. Check NOAA Fisheries and your state's marine fisheries website before each trip.
    </div>
  `;
  document.getElementById('enc-modal').style.display = 'block';
  document.getElementById('enc-modal').scrollTo(0,0);
}
function encCloseModal(){
  document.getElementById('enc-modal').style.display = 'none';
}
document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){
    if(document.getElementById('enc-modal').style.display === 'block') encCloseModal();
    else if(document.getElementById('enc-overlay').style.display === 'block') closeEncyclopedia();
  }
});

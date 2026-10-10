/* ---------------- Config ---------------- */
// Point this at your deployed backend (see /backend in this project).
//const API_BASE = (window.SMARTSORT_API_BASE) || 'http://localhost:5000/api';
const API_BASE = (window.SMARTSORT_API_BASE) || '/api';

/* ---------------- State ---------------- */
let historyData = []; // guest fallback only: in-memory, session lifetime
let currentResult = null;
let currentInputs = null;
let authToken = localStorage.getItem('smartsort_token') || null;
let currentUser = null; // { id, name, email } once logged in
let isComparing = false; // Guard against concurrent/duplicate requests

function authHeaders(){
  return authToken ? { 'Authorization': 'Bearer ' + authToken } : {};
}

const POPULAR = [
  { a: 'iPhone 16 Pro', b: 'Samsung Galaxy S25 Ultra', category: 'Smartphones' },
  { a: 'PlayStation 5 Pro', b: 'Xbox Series X', category: 'Gaming' },
  { a: 'MacBook Air M3', b: 'Dell XPS 13', category: 'Laptops' },
  { a: 'Sony WH-1000XM5', b: 'Bose QuietComfort Ultra', category: 'Headphones & Audio' },
  { a: 'Nikon Z6 III', b: 'Canon EOS R6 II', category: 'Cameras' }
];

const PRODUCT_SUGGESTIONS = [
  'iPhone 16 Pro','iPhone 15','Samsung Galaxy S25 Ultra','Samsung Galaxy Z Fold 6','Google Pixel 9 Pro',
  'OnePlus 12','MacBook Air M3','MacBook Pro 14 M4','Dell XPS 13','Lenovo ThinkPad X1 Carbon','HP Spectre x360',
  'Sony WH-1000XM5','Bose QuietComfort Ultra','Apple AirPods Pro 2','PlayStation 5 Pro','Xbox Series X',
  'Nintendo Switch 2','Nikon Z6 III','Canon EOS R6 II','Fujifilm X-T5','Apple Watch Series 10','Samsung Galaxy Watch 7',
  'Tesla Model 3','Tesla Model Y','LG C4 OLED TV','Samsung QN90D','Dyson V15 Detect','iRobot Roomba Combo'
];

/* ---------------- Router ---------------- */
const PAGES = ['home','compare','results','history','about'];
function navigate(page){
  if(!PAGES.includes(page)) page = 'home';
  PAGES.forEach(p => {
    document.getElementById('page-' + p).classList.toggle('active', p === page);
  });
  document.querySelectorAll('[data-nav]').forEach(el => {
    if(el.tagName === 'A') el.classList.toggle('active', el.getAttribute('data-nav') === page);
  });
  document.getElementById('mobileNav').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if(page === 'history') renderHistory();
  location.hash = page;
}
window.addEventListener('hashchange', () => navigate(location.hash.replace('#','')));
document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.getAttribute('data-nav')); });
});
document.getElementById('menuBtn').addEventListener('click', () => {
  document.getElementById('mobileNav').classList.toggle('open');
});

/* ---------------- Theme ---------------- */
const themeIcon = document.getElementById('themeIcon');
document.getElementById('themeBtn').addEventListener('click', () => {
  const html = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  html.setAttribute('data-theme', isLight ? 'dark' : 'light');
  themeIcon.innerHTML = isLight
    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
    : '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>';
});

/* ---------------- Popular chips ---------------- */
function buildChips(containerId, onCompare){
  const el = document.getElementById(containerId);
  el.innerHTML = POPULAR.map((p,i) => `<button type="button" class="chip" data-i="${i}">${esc(p.a)} vs ${esc(p.b)}</button>`).join('');
  el.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isComparing) return;
      const p = POPULAR[+btn.getAttribute('data-i')];
      document.getElementById('productA').value = p.a;
      document.getElementById('productB').value = p.b;
      document.getElementById('category').value = p.category;
      navigate('compare');
      if(onCompare) runComparison();
    });
  });
}
buildChips('popularChipsHome', true);
buildChips('popularChipsCompare', false);

/* ---------------- Autocomplete ---------------- */
function setupAutocomplete(inputId, listId){
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  let hlIndex = -1;
  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    hlIndex = -1;
    if(!val){ list.classList.remove('open'); list.innerHTML=''; return; }
    const matches = PRODUCT_SUGGESTIONS.filter(s => s.toLowerCase().includes(val)).slice(0,6);
    if(!matches.length){ list.classList.remove('open'); list.innerHTML=''; return; }
    list.innerHTML = matches.map(m => `<div class="ac-item">${esc(m)}</div>`).join('');
    list.classList.add('open');
    list.querySelectorAll('.ac-item').forEach((item, idx) => {
      item.addEventListener('mousedown', () => {
        input.value = matches[idx];
        list.classList.remove('open');
      });
    });
  });
  input.addEventListener('keydown', (e) => {
    const items = list.querySelectorAll('.ac-item');
    if(!items.length) return;
    if(e.key === 'ArrowDown'){ e.preventDefault(); hlIndex = Math.min(hlIndex+1, items.length-1); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); hlIndex = Math.max(hlIndex-1, 0); }
    else if(e.key === 'Enter' && hlIndex >= 0){ e.preventDefault(); items[hlIndex].dispatchEvent(new Event('mousedown')); return; }
    else return;
    items.forEach((it,i) => it.classList.toggle('hl', i===hlIndex));
  });
  input.addEventListener('blur', () => setTimeout(() => list.classList.remove('open'), 120));
}
setupAutocomplete('productA','acA');
setupAutocomplete('productB','acB');

/* ---------------- Compare form ---------------- */
const form = document.getElementById('compareForm');
const compareBtn = document.getElementById('compareBtn');
const errorMsg = document.getElementById('errorMsg');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');

const loadingMessages = [
  "SORTING SIGNAL FROM SPEC SHEET…","WEIGHING PRICE VS VALUE…","STRESS-TESTING BUILD QUALITY…",
  "BENCHMARKING PERFORMANCE…","TALLYING THE VERDICT…"
];

form.addEventListener('submit', (e) => { e.preventDefault(); runComparison(); });

async function runComparison(forceRefresh = false){
  if (isComparing) return;

  errorMsg.style.display = 'none';
  const productA = document.getElementById('productA').value.trim();
  const productB = document.getElementById('productB').value.trim();
  const category = document.getElementById('category').value;
  const purpose = document.getElementById('purpose').value.trim();
  if(!productA || !productB) return;
  
  isComparing = true;
  loading.style.display = 'block';
  compareBtn.disabled = true;
  compareBtn.textContent = 'Comparing…';

  let msgIdx = 0;
  const msgInterval = setInterval(() => { 
    msgIdx = (msgIdx+1) % loadingMessages.length; 
    loadingText.textContent = loadingMessages[msgIdx]; 
  }, 1300);

  try {
    const data = await fetchComparison(productA, productB, category, purpose, forceRefresh);
    currentResult = data;
    currentInputs = { productA, productB, category, purpose };
    renderResults(data);
    navigate('results');
  } catch (err) {
    console.error(err);
    errorMsg.textContent = err.message || "Couldn't complete that comparison. Try again in a few seconds.";
    errorMsg.style.display = 'block';
  } finally {
    clearInterval(msgInterval);
    loading.style.display = 'none';
    compareBtn.disabled = false;
    compareBtn.textContent = 'Compare products';
    isComparing = false;
  }
}

async function fetchComparison(productA, productB, category, purpose, forceRefresh = false){
  const response = await fetch(`${API_BASE}/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ productA, productB, category, purpose, forceRefresh })
  });
  const data = await response.json();
  if(!response.ok){ 
    throw new Error(data.error || data.message || ("API error " + response.status)); 
  }
  return data;
}

/* ---------------- Helpers & Rendering ---------------- */
function esc(str){ 
  const d = document.createElement('div'); 
  d.textContent = str == null ? '' : String(str); 
  return d.innerHTML; 
}

function renderResults(data){
  const nameA = esc(currentInputs?.productA || 'Product A');
  const nameB = esc(currentInputs?.productB || 'Product B');

  const winnerName = esc(data.winnerBadge?.winnerName || 'Winner');
  const winnerReason = esc(data.winnerBadge?.reason || '');
  const choice = data.winnerBadge?.winnerChoice;
  const winnerClass = choice === 'Product A' ? 'a' : choice === 'Product B' ? 'b' : 'tie';

  const scoreA = data.overallRating?.scoreA ?? 0;
  const scoreB = data.overallRating?.scoreB ?? 0;

  // Render specifications comparison table
  const specRows = (data.comparisonTable || []).map(s => `
    <tr>
      <td class="lbl">${esc(s.feature)}</td>
      <td class="a">${esc(s.product1)}</td>
      <td class="b">${esc(s.product2)}</td>
    </tr>
  `).join('');

  // Render Pros and Cons lists
  const prosA = (data.prosCons?.productA?.pros || []).map(p => `<li>✔️ ${esc(p)}</li>`).join('');
  const consA = (data.prosCons?.productA?.cons || []).map(c => `<li>❌ ${esc(c)}</li>`).join('');
  const prosB = (data.prosCons?.productB?.pros || []).map(p => `<li>✔️ ${esc(p)}</li>`).join('');
  const consB = (data.prosCons?.productB?.cons || []).map(c => `<li>❌ ${esc(c)}</li>`).join('');

  // Render Best For tags/strings
  const bestForA = Array.isArray(data.bestFor?.productA) ? data.bestFor.productA.join(', ') : (data.bestFor?.productA || '');
  const bestForB = Array.isArray(data.bestFor?.productB) ? data.bestFor.productB.join(', ') : (data.bestFor?.productB || '');

  document.getElementById('resultsContent').innerHTML = `
    <!-- Verdict / Winner Banner -->
    <div class="verdict">
      <div class="verdict-eyebrow">🏆 SmartSort Verdict</div>
      <div class="verdict-name ${winnerClass}">${choice === 'Tie' ? 'A Close Tie' : `${winnerName} Wins`}</div>
      <p class="verdict-sub">${winnerReason}</p>
      <div class="overall-scores">
        <div class="oscore a"><div class="val">⭐ ${scoreA}</div><div class="lbl">${nameA}</div></div>
        <div class="oscore b"><div class="val">⭐ ${scoreB}</div><div class="lbl">${nameB}</div></div>
      </div>
    </div>

    <!-- AI Summary -->
    <div class="card">
      <div class="block-title">AI Summary</div>
      <div class="summary-grid">
        <div class="summary-cell" style="grid-column: span 2;">
          <p>${esc(data.aiSummary)}</p>
        </div>
      </div>
    </div>

    <!-- Comparison Table -->
    <div class="card">
      <div class="block-title">Feature & Specifications Comparison</div>
      <table class="spec-table">
        <thead>
          <tr>
            <th>Feature</th>
            <th style="color:var(--amber)">${nameA}</th>
            <th style="color:var(--teal)">${nameB}</th>
          </tr>
        </thead>
        <tbody>
          ${specRows}
        </tbody>
      </table>
    </div>

    <!-- Pros & Cons -->
    <div class="prosconswrap" style="margin-bottom:24px;">
      <div class="card pc-card a">
        <h3>${nameA}</h3>
        <ul class="pc-list">${prosA}</ul>
        <ul class="pc-list cons">${consA}</ul>
      </div>
      <div class="card pc-card b">
        <h3>${nameB}</h3>
        <ul class="pc-list">${prosB}</ul>
        <ul class="pc-list cons">${consB}</ul>
      </div>
    </div>

    <!-- Best For -->
    <div class="card">
      <div class="block-title">Best Suitable For</div>
      <div class="bestfor-grid">
        <div class="bf-cell a"><h4>${nameA}</h4><p>${esc(bestForA)}</p></div>
        <div class="bf-cell b"><h4>${nameB}</h4><p>${esc(bestForB)}</p></div>
      </div>
    </div>

    <!-- AI Recommendation -->
    <div class="card rec-card">
      <div class="block-title">💡 AI Recommendation</div>
      <p style="line-height:1.6;">${esc(data.aiRecommendation)}</p>
    </div>

    <!-- Compare Again / Refresh Buttons -->
    <div class="again-row">
     <button type="button" class="btn-primary" id="refreshBtn">🔄 Refresh this comparison</button>
      <button type="button" class="btn-primary" id="againBtn">Compare two more products</button>
    </div>
  `;

  const resultsContent = document.getElementById('resultsContent');
  resultsContent.onclick = (e) => {
    if (e.target.id === 'againBtn' || e.target.closest('#againBtn')) {
      document.getElementById('productA').value = '';
      document.getElementById('productB').value = '';
      document.getElementById('purpose').value = '';
      navigate('compare');
    }
    if (e.target.id === 'refreshBtn' || e.target.closest('#refreshBtn')) {
      document.getElementById('productA').value = '';
      document.getElementById('productB').value = '';
      document.getElementById('purpose').value = '';
      currentResult = null;
      currentInputs = null;
      navigate('compare');
    }
  };
}

/* ---------------- Auth ---------------- */
const authOverlay = document.getElementById('authOverlay');
const authBtn = document.getElementById('authBtn');

function isLoggedIn(){ return !!authToken; }

function updateAuthUI(){
  authBtn.textContent = currentUser ? `Log out (${currentUser.name.split(' ')[0]})` : 'Log in';
}

function openAuthModal(){ authOverlay.classList.add('open'); }
function closeAuthModal(){ authOverlay.classList.remove('open'); }

authBtn.addEventListener('click', () => {
  if(isLoggedIn()){
    authToken = null; currentUser = null;
    localStorage.removeItem('smartsort_token');
    updateAuthUI();
    if(location.hash.replace('#','') === 'history') renderHistory();
  } else {
    openAuthModal();
  }
});
document.getElementById('authClose').addEventListener('click', closeAuthModal);
authOverlay.addEventListener('click', (e) => { if(e.target === authOverlay) closeAuthModal(); });

const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active'); tabRegister.classList.remove('active');
  loginForm.style.display = 'block'; registerForm.style.display = 'none';
});
tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active'); tabLogin.classList.remove('active');
  registerForm.style.display = 'block'; loginForm.style.display = 'none';
});

function applyAuthSuccess(data){
  authToken = data.token;
  currentUser = data.user;
  localStorage.setItem('smartsort_token', authToken);
  updateAuthUI();
  closeAuthModal();
  if(location.hash.replace('#','') === 'history') renderHistory();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('loginError'); errEl.textContent = '';
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Could not log in');
    applyAuthSuccess(data);
  } catch(err){ errEl.textContent = err.message; }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('registerError'); errEl.textContent = '';
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Could not create account');
    applyAuthSuccess(data);
  } catch(err){ errEl.textContent = err.message; }
});

async function checkAuth(){
  if(!authToken) return;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
    if(!res.ok) throw new Error('expired');
    const data = await res.json();
    currentUser = data.user;
    updateAuthUI();
  } catch(err){
    authToken = null; currentUser = null;
    localStorage.removeItem('smartsort_token');
    updateAuthUI();
  }
}

/* ---------------- Toolbar actions ---------------- */
document.getElementById('saveHistoryBtn').addEventListener('click', async () => {
  if(!currentResult || !currentInputs) return;
  const btn = document.getElementById('saveHistoryBtn');
  const original = btn.innerHTML;

  if(isLoggedIn()){
    try {
      const res = await fetch(`${API_BASE}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          productAName: currentInputs.productA,
          productBName: currentInputs.productB,
          category: currentInputs.category,
          purpose: currentInputs.purpose,
          winner: currentResult.winnerBadge?.winnerName || 'Tie',
          result: currentResult
        })
      });
      if(!res.ok){ const d = await res.json(); throw new Error(d.error || 'Could not save'); }
      btn.innerHTML = 'Saved ✓';
    } catch(err){
      btn.innerHTML = 'Save failed';
    }
  } else {
    // Guest fallback: keep it in this tab only, for this session.
    historyData.unshift({
      id: Date.now(),
      nameA: currentInputs.productA,
      nameB: currentInputs.productB,
      category: currentInputs.category,
      winner: currentResult.winnerBadge?.winnerName || 'Tie',
      favorite: false,
      result: currentResult,
      inputs: currentInputs,
      ts: new Date()
    });
    btn.innerHTML = 'Saved (guest) ✓';
  }
  setTimeout(() => { btn.innerHTML = original; }, 1600);
});

document.getElementById('shareBtn').addEventListener('click', async () => {
  if(!currentResult || !currentInputs) return;
  const text = `SmartSort AI verdict: ${currentInputs.productA} vs ${currentInputs.productB} — ${currentResult.winnerBadge?.winnerName} wins. ${currentResult.winnerBadge?.reason}`;
  if(navigator.share){
    try { await navigator.share({ title: 'SmartSort AI Comparison', text }); } catch(e){}
  } else {
    try {
      await navigator.clipboard.writeText(text);
      const btn = document.getElementById('shareBtn');
      const original = btn.innerHTML;
      btn.innerHTML = 'Copied ✓';
      setTimeout(() => { btn.innerHTML = original; }, 1500);
    } catch(e){}
  }
});

document.getElementById('pdfBtn').addEventListener('click', () => { window.print(); });

/* ---------------- History ---------------- */
async function renderHistory(){
  const listEl = document.getElementById('historyList');
  const q = (document.getElementById('historySearch').value || '').trim();

  if(isLoggedIn()){
    listEl.innerHTML = `<div class="empty-state"><p>Loading…</p></div>`;
    let items = [];
    try {
      const res = await fetch(`${API_BASE}/history${q ? '?q=' + encodeURIComponent(q) : ''}`, { headers: authHeaders() });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || 'Could not load history');
      items = data.items || [];
    } catch(err){
      listEl.innerHTML = `<div class="empty-state"><h3>Couldn't load history</h3><p>${esc(err.message)}</p></div>`;
      return;
    }
    if(!items.length){
      listEl.innerHTML = q
        ? `<div class="empty-state"><h3>No matches</h3><p>Try a different search term.</p></div>`
        : `<div class="empty-state"><h3>No comparisons yet</h3><p>Run a comparison and hit "Save to History" to see it here.</p></div>`;
      return;
    }
    listEl.innerHTML = items.map(h => historyRowHTML(h._id, h.productAName, h.productBName, h.category, h.favorite, new Date(h.createdAt))).join('');
    wireHistoryRow(listEl, items, {
      getId: (h) => h._id,
      open: (h) => { 
        currentResult = h.result; 
        currentInputs = { productA: h.productAName, productB: h.productBName, category: h.category, purpose: h.purpose }; 
        renderResults(h.result); 
        navigate('results'); 
      },
      toggleFav: async (h) => {
        const res = await fetch(`${API_BASE}/history/${h._id}/favorite`, { method: 'PATCH', headers: authHeaders() });
        if(res.ok) renderHistory();
      },
      del: async (h) => {
        const res = await fetch(`${API_BASE}/history/${h._id}`, { method: 'DELETE', headers: authHeaders() });
        if(res.ok) renderHistory();
      }
    });
    return;
  }

  // Guest mode: session-only, in-memory list
  const ql = q.toLowerCase();
  const items = historyData.filter(h => !ql || h.nameA.toLowerCase().includes(ql) || h.nameB.toLowerCase().includes(ql));
  if(!historyData.length){
    listEl.innerHTML = `<div class="empty-state"><h3>No comparisons yet</h3><p>Run a comparison and hit "Save to History" to see it here. <a href="#" id="historyLoginHint" style="color:var(--teal); text-decoration:underline;">Log in</a> to keep history across visits.</p></div>`;
    document.getElementById('historyLoginHint')?.addEventListener('click', (e) => { e.preventDefault(); openAuthModal(); });
    return;
  }
  if(!items.length){
    listEl.innerHTML = `<div class="empty-state"><h3>No matches</h3><p>Try a different search term.</p></div>`;
    return;
  }
  listEl.innerHTML = items.map(h => historyRowHTML(h.id, h.nameA, h.nameB, h.category, h.favorite, h.ts)).join('');
  wireHistoryRow(listEl, items, {
    getId: (h) => h.id,
    open: (h) => { currentResult = h.result; currentInputs = h.inputs; renderResults(h.result); navigate('results'); },
    toggleFav: (h) => { h.favorite = !h.favorite; renderHistory(); },
    del: (h) => { historyData = historyData.filter(x => x.id !== h.id); renderHistory(); }
  });
}

function historyRowHTML(id, nameA, nameB, category, favorite, ts){
  return `
    <div class="history-item" data-id="${id}">
      <div class="hi-names">
        <div class="vs-line"><span class="a">${esc(nameA)}</span> vs <span class="b">${esc(nameB)}</span></div>
        <div class="hi-meta">${esc(category)} · ${ts.toLocaleDateString()} ${ts.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <div class="hi-actions">
        <button class="hi-btn fav ${favorite ? 'active' : ''}" data-action="fav" data-id="${id}" aria-label="Favorite" title="Favorite">
          <svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px;"><path d="M12 21s-7-4.4-9.5-9C.7 8.4 3 5 6.5 5c2 0 3.3 1.1 4 2 .7-.9 2-2 4-2 3.5 0 5.8 3.4 4 7-2.5 4.6-9.5 9-9.5 9z"/></svg>
        </button>
        <button class="hi-btn" data-action="delete" data-id="${id}" aria-label="Delete" title="Delete">
          <svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px;"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </button>
      </div>
    </div>`;
}

function wireHistoryRow(listEl, items, { getId, open, toggleFav, del }){
  const find = (id) => items.find(x => String(getId(x)) === String(id));
  listEl.querySelectorAll('.history-item').forEach(row => {
    row.addEventListener('click', (e) => {
      if(e.target.closest('.hi-btn')) return;
      const h = find(row.getAttribute('data-id'));
      if(h) open(h);
    });
  });
  listEl.querySelectorAll('[data-action="fav"]').forEach(btn => {
    btn.addEventListener('click', () => { const h = find(btn.getAttribute('data-id')); if(h) toggleFav(h); });
  });
  listEl.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => { const h = find(btn.getAttribute('data-id')); if(h) del(h); });
  });
}
document.getElementById('historySearch').addEventListener('input', renderHistory);

/* ---------------- Init ---------------- */
checkAuth();
navigate(location.hash ? location.hash.replace('#','') : 'home');
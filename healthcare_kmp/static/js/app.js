/* =========================================================================
   MedKnow — Healthcare Knowledge Management Portal
   Comprehensive Vanilla JS SPA with Medical Decision Support & KM Governance
   ========================================================================= */

const API = "/api";
let state = {
  token: localStorage.getItem("mk_token") || null,
  user: JSON.parse(localStorage.getItem("mk_user") || "null"),
  categories: [],
  view: "dashboard",
  activeCategory: null,
  currentArticle: null,
  selectedVersion: null,
};

/* ---------------------------------------------------------------------
   API Helper
--------------------------------------------------------------------- */
async function api(path, { method = "GET", body = null, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && state.token) headers["Authorization"] = "Bearer " + state.token;

  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  let data = null;
  try { data = await res.json(); } catch (e) { /* no json */ }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

/* ---------------------------------------------------------------------
   Bootstrap & Lifecycle
--------------------------------------------------------------------- */
window.addEventListener("DOMContentLoaded", init);

async function init() {
  loadAdvisory();
  if (state.token && state.user) {
    showApp();
    await loadCategories();
    navigate("dashboard");
  } else {
    await checkSystemSetup();
    showAuth();
  }
}

async function checkSystemSetup() {
  try {
    const status = await api("/system/status", { auth: false });
    const banner = document.getElementById("first-user-banner");
    const roleContainer = document.getElementById("reg-role-container");
    const regSubmit = document.getElementById("btn-reg-submit");
    if (!status.is_setup) {
      if (banner) banner.style.display = "block";
      if (roleContainer) roleContainer.style.display = "none";
      if (regSubmit) regSubmit.textContent = "Create Administrator Profile";
      switchAuthTab("register");
    } else {
      if (banner) banner.style.display = "none";
      if (roleContainer) roleContainer.style.display = "block";
      if (regSubmit) regSubmit.textContent = "Create My Profile";
    }
  } catch (err) {
    /* ignore background setup check error */
  }
}

function showAuth() {
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("app").style.display = "none";
}

function showApp() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app").style.display = "flex";
  document.getElementById("user-name").textContent = state.user.name;
  document.getElementById("user-role").textContent = `${state.user.role} · ${state.user.department || 'Hospital'}`;
  document.getElementById("user-avatar").textContent = state.user.name.charAt(0).toUpperCase();
  if (state.user.avatar_color) {
    document.getElementById("user-avatar").style.background = state.user.avatar_color;
  }

  // Show/Hide Role-specific navigation
  const isPrivileged = state.user.role === "admin" || state.user.role === "contributor";
  const isAdmin = state.user.role === "admin";
  const reviewNav = document.getElementById("nav-review-queue");
  const adminNav = document.getElementById("nav-admin");
  if (reviewNav) reviewNav.style.display = isPrivileged ? "flex" : "none";
  if (adminNav) adminNav.style.display = isAdmin ? "flex" : "none";
}

function toggleSidebar(open) {
  const sb = document.getElementById("sidebar");
  if (open) sb.classList.add("open");
  else sb.classList.remove("open");
}

/* ---------------------------------------------------------------------
   Clinical Advisories (Hospital Broadcast Banner)
--------------------------------------------------------------------- */
async function loadAdvisory() {
  try {
    const advisories = await api("/advisories", { auth: false });
    const banner = document.getElementById("advisory-banner");
    if (advisories && advisories.length > 0) {
      const adv = advisories[0];
      document.getElementById("advisory-title").textContent = adv.title + " — ";
      document.getElementById("advisory-msg").textContent = adv.message;
      if (adv.level === "critical") {
        banner.className = "advisory-banner advisory-critical";
        document.getElementById("advisory-tag").textContent = "CRITICAL ALERT";
      } else {
        banner.className = "advisory-banner";
        document.getElementById("advisory-tag").textContent = "HOSPITAL ADVISORY";
      }
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }
  } catch (err) {
    /* ignore background advisory failure */
  }
}

function dismissAdvisory() {
  document.getElementById("advisory-banner").style.display = "none";
}

/* ---------------------------------------------------------------------
   Authentication & Account Creation
--------------------------------------------------------------------- */
function switchAuthTab(tab) {
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-register").classList.toggle("active", tab === "register");
  document.getElementById("login-form").style.display = tab === "login" ? "block" : "none";
  document.getElementById("register-form").style.display = tab === "register" ? "block" : "none";
  document.getElementById("auth-error").style.display = "none";
}

function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.style.display = "block";
}

async function handleLogin(e) {
  e.preventDefault();
  try {
    const data = await api("/auth/login", {
      auth: false, method: "POST",
      body: {
        email: document.getElementById("login-email").value,
        password: document.getElementById("login-password").value,
      },
    });
    setSession(data);
    showToast(`Welcome back, ${data.user.name}!`);
  } catch (err) {
    showAuthError(err.message);
  }
  return false;
}

async function handleRegister(e) {
  e.preventDefault();
  try {
    const data = await api("/auth/register", {
      auth: false, method: "POST",
      body: {
        name: document.getElementById("reg-name").value,
        email: document.getElementById("reg-email").value,
        department: document.getElementById("reg-department").value,
        title: document.getElementById("reg-title").value,
        role: document.getElementById("reg-role") ? document.getElementById("reg-role").value : "contributor",
        password: document.getElementById("reg-password").value,
      },
    });
    setSession(data);
    showToast(data.is_first_user ? "Super Administrator profile created!" : "Profile registered successfully!");
  } catch (err) {
    showAuthError(err.message);
  }
  return false;
}

function setSession(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem("mk_token", data.token);
  localStorage.setItem("mk_user", JSON.stringify(data.user));
  showApp();
  loadCategories().then(() => navigate("dashboard"));
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("mk_token");
  localStorage.removeItem("mk_user");
  showAuth();
  showToast("Signed out successfully");
}

function openProfileModal() {
  if (!state.user) return;
  document.getElementById("prof-name").value = state.user.name || "";
  document.getElementById("prof-dept").value = state.user.department || "";
  document.getElementById("prof-title").value = state.user.title || "";
  document.getElementById("prof-color").value = state.user.avatar_color || "#1F6F78";
  document.getElementById("prof-pwd").value = "";
  document.getElementById("profile-modal").style.display = "flex";
}

function closeProfileModal() {
  document.getElementById("profile-modal").style.display = "none";
}

async function handleUpdateProfile(e) {
  e.preventDefault();
  try {
    const updated = await api("/auth/profile", {
      method: "PUT",
      body: {
        name: document.getElementById("prof-name").value,
        department: document.getElementById("prof-dept").value,
        title: document.getElementById("prof-title").value,
        avatar_color: document.getElementById("prof-color").value,
        password: document.getElementById("prof-pwd").value || undefined,
      }
    });
    state.user = updated;
    localStorage.setItem("mk_user", JSON.stringify(updated));
    showApp();
    closeProfileModal();
    showToast("Profile updated successfully");
  } catch (err) {
    alert(err.message);
  }
  return false;
}

/* ---------------------------------------------------------------------
   Navigation Router
--------------------------------------------------------------------- */
function navigate(view, opts = {}) {
  state.view = view;
  state.activeCategory = opts.category || null;
  toggleSidebar(false);

  document.querySelectorAll(".nav-item[data-view]").forEach(el => {
    el.classList.toggle("active", el.dataset.view === view);
  });
  document.querySelectorAll(".nav-item[data-cat]").forEach(el => el.classList.remove("active"));

  const titles = {
    dashboard: ["Clinical Dashboard", "Hospital knowledge metrics and evidence distribution"],
    browse: ["Clinical Knowledge Base", "Search and filter evidence-based protocols and clinical guidelines"],
    best: ["Validated Best Practices", "Admin-flagged gold standard clinical protocols"],
    bookmarks: ["Ward Bookmarks & Pinned Guidelines", "Your saved protocols for fast shift access"],
    calculators: ["Medical Calculators & Decision Support", "Interactive clinical risk scores and drug dosing tools"],
    requests: ["Knowledge Gap & Protocol Requests", "Staff-requested guidelines, reviews, and clinical SOPs"],
    qa: ["Clinical Consults & Q&A Board", "Inter-departmental case discussions and verified answers"],
    mine: ["My Authored Protocols", "Articles authored by you, including drafts and review items"],
    "review-queue": ["Clinical Peer Review Queue", "Submitted articles awaiting clinical governance approval"],
    admin: ["Hospital Administration Hub", "User management, category editor, broadcasts, and data export"],
    detail: ["Clinical Protocol", ""],
  };

  const [t, s] = titles[view] || ["MedKnow", ""];
  document.getElementById("page-title").textContent = t;
  document.getElementById("page-subtitle").textContent = s;

  const actions = document.getElementById("topbar-actions");
  actions.innerHTML = "";

  const canAuthor = state.user && (state.user.role === "admin" || state.user.role === "contributor");
  if (["browse", "best", "mine", "dashboard"].includes(view) && canAuthor) {
    actions.innerHTML = `<button class="btn btn-primary btn-sm" onclick="openEditor()">+ New Protocol</button>`;
  } else if (view === "requests") {
    actions.innerHTML = `<button class="btn btn-primary btn-sm" onclick="openRequestModal()">+ Request Guideline</button>`;
  } else if (view === "qa") {
    actions.innerHTML = `<button class="btn btn-primary btn-sm" onclick="openQaModal()">+ Ask Question</button>`;
  }

  if (view === "dashboard") renderDashboard();
  else if (view === "browse") renderBrowse();
  else if (view === "best") renderBrowse({ bestOnly: true });
  else if (view === "bookmarks") renderBookmarks();
  else if (view === "calculators") renderCalculators();
  else if (view === "requests") renderRequests();
  else if (view === "qa") renderQa();
  else if (view === "mine") renderMine();
  else if (view === "review-queue") renderReviewQueue();
  else if (view === "admin") renderAdminHub();
}

/* ---------------------------------------------------------------------
   Categories
--------------------------------------------------------------------- */
async function loadCategories() {
  state.categories = await api("/categories", { auth: false });
  const nav = document.getElementById("category-nav");
  nav.innerHTML = `<div class="nav-label">Clinical Categories</div>` + state.categories.map(c => `
    <button class="nav-item" data-cat="${c.slug}" onclick="navigate('browse', {category:'${c.slug}'}); highlightCategory('${c.slug}')">
      <span class="nav-dot" style="background:${c.color}"></span> ${c.name}
    </button>
  `).join("");

  const select = document.getElementById("edit-category");
  if (select) {
    select.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  }
  const qaCat = document.getElementById("qa-category");
  if (qaCat) {
    qaCat.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  }
}

function highlightCategory(slug) {
  document.querySelectorAll(".nav-item[data-view]").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-item[data-cat]").forEach(el => el.classList.toggle("active", el.dataset.cat === slug));
}

/* ---------------------------------------------------------------------
   View: Dashboard
--------------------------------------------------------------------- */
async function renderDashboard() {
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Loading clinical dashboard…</div>`;
  try {
    const stats = await api("/dashboard/stats");
    const maxCat = Math.max(1, ...stats.category_breakdown.map(c => c.count));

    root.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-value">${stats.total_articles}</div><div class="stat-label">Published Protocols</div></div>
        <div class="stat-card"><div class="stat-value">${stats.total_in_review}</div><div class="stat-label">In Peer Review</div></div>
        <div class="stat-card"><div class="stat-value">${stats.total_drafts}</div><div class="stat-label">Draft Assets</div></div>
        <div class="stat-card"><div class="stat-value">${stats.total_contributors}</div><div class="stat-label">Active Authors</div></div>
        <div class="stat-card"><div class="stat-value">${stats.total_views}</div><div class="stat-label">Total Ward Reads</div></div>
        <div class="stat-card"><div class="stat-value">${stats.best_practice_count}</div><div class="stat-label">Gold Standard Flags</div></div>
      </div>

      <div class="dash-grid">
        <div class="panel panel-pad">
          <h3>Knowledge Distribution by Specialty</h3>
          ${stats.category_breakdown.map(c => `
            <div class="bar-row" style="cursor:pointer;" onclick="navigate('browse', {category:'${c.slug}'})">
              <div class="bar-label">${c.name}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${(c.count/maxCat*100)}%; background:${c.color}"></div></div>
              <div class="bar-count">${c.count}</div>
            </div>`).join("") || `<div class="page-subtitle">No articles recorded yet.</div>`}

          <h3 style="margin-top:24px;">Evidence Level Breakdown</h3>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
            ${stats.evidence_breakdown.map(e => `
              <div style="flex:1; min-width:120px; background:var(--paper); padding:10px; border-radius:8px; border:1px solid var(--line);">
                <div style="font-family:var(--font-mono); font-size:11px; color:var(--slate);">${e.level}</div>
                <div style="font-size:18px; font-weight:700; color:var(--ink);">${e.count} <small style="font-size:11px; font-weight:400;">assets</small></div>
              </div>
            `).join("")}
          </div>

          <h3 style="margin-top:24px;">Top Clinical Contributors</h3>
          ${stats.top_contributors.map(c => `
            <div class="list-row">
              <div>
                <div class="list-row-title">${c.name}</div>
                <div style="font-size:11px; color:var(--slate);">${c.department || c.role}</div>
              </div>
              <div class="list-row-meta">${c.count} protocol${c.count===1?'':'s'}</div>
            </div>
          `).join("") || `<div class="page-subtitle">No contributors recorded yet.</div>`}
        </div>

        <div class="panel panel-pad">
          <h3>High-Yield Ward Protocols</h3>
          ${stats.most_viewed.map(a => `
            <div class="list-row" style="cursor:pointer" onclick="openArticle(${a.id})">
              <div>
                <div class="list-row-title">${escapeHtml(a.title)}</div>
                <div style="font-size:11px; color:var(--slate);">${a.category ? a.category.name : ''} · ${a.evidence_level}</div>
              </div>
              <div class="list-row-meta">${a.view_count} reads</div>
            </div>`).join("") || `<div class="page-subtitle">No protocol reads recorded yet.</div>`}

          <h3 style="margin-top:24px;">Recently Published / Updated</h3>
          ${stats.recent_articles.map(a => `
            <div class="list-row" style="cursor:pointer" onclick="openArticle(${a.id})">
              <div>
                <div class="list-row-title">${escapeHtml(a.title)}</div>
                <div style="font-size:11px; color:var(--slate);">${a.author ? a.author.name : ''} · ${formatDate(a.created_at)}</div>
              </div>
              <div class="list-row-meta">★ ${a.avg_rating || 0}</div>
            </div>`).join("") || `<div class="page-subtitle">Nothing added yet.</div>`}
        </div>
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><h3>Couldn't load dashboard</h3><p>${err.message}</p></div>`;
  }
}

/* ---------------------------------------------------------------------
   View: Browse Knowledge Base & Multi-Filter
--------------------------------------------------------------------- */
let browseState = { search: "", sort: "recent", evidence: "", urgency: "", audience: "", bestOnly: false };

async function renderBrowse(opts = {}) {
  browseState.bestOnly = !!opts.bestOnly;
  const root = document.getElementById("view-root");

  root.innerHTML = `
    <div class="filter-row">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="text" id="search-input" placeholder="Search clinical protocols, drug guides, tags..." value="${browseState.search}">
      </div>

      <select id="filter-evidence" class="filter-select" onchange="setFilter('evidence', this.value)">
        <option value="">All Evidence Levels</option>
        <option value="Level I" ${browseState.evidence==='Level I'?'selected':''}>Level I: Systematic Reviews</option>
        <option value="Level II" ${browseState.evidence==='Level II'?'selected':''}>Level II: RCTs</option>
        <option value="Level III" ${browseState.evidence==='Level III'?'selected':''}>Level III: Cohort Studies</option>
        <option value="Level IV" ${browseState.evidence==='Level IV'?'selected':''}>Level IV: Consensus Guidelines</option>
      </select>

      <select id="filter-urgency" class="filter-select" onchange="setFilter('urgency', this.value)">
        <option value="">All Urgency Levels</option>
        <option value="Critical / Emergency" ${browseState.urgency==='Critical / Emergency'?'selected':''}>Critical / Emergency</option>
        <option value="Important" ${browseState.urgency==='Important'?'selected':''}>Important</option>
        <option value="Routine" ${browseState.urgency==='Routine'?'selected':''}>Routine Reference</option>
      </select>

      <button class="chip ${browseState.sort==='recent'?'active':''}" onclick="setSort('recent')">Recent</button>
      <button class="chip ${browseState.sort==='popular'?'active':''}" onclick="setSort('popular')">Most Read</button>
      <button class="chip ${browseState.sort==='top_rated'?'active':''}" onclick="setSort('top_rated')">Top Rated</button>
    </div>
    <div id="article-grid" class="article-grid"><div class="empty-state">Loading knowledge base…</div></div>
  `;

  document.getElementById("search-input").addEventListener("input", debounce(e => {
    browseState.search = e.target.value;
    loadArticleGrid();
  }, 350));

  await loadArticleGrid();
}

function setFilter(key, val) {
  browseState[key] = val;
  loadArticleGrid();
}

function setSort(sort) {
  browseState.sort = sort;
  renderBrowse({ bestOnly: browseState.bestOnly });
}

async function loadArticleGrid() {
  const grid = document.getElementById("article-grid");
  const params = new URLSearchParams();
  if (browseState.search) params.set("search", browseState.search);
  if (state.activeCategory) params.set("category", state.activeCategory);
  if (browseState.evidence) params.set("evidence", browseState.evidence);
  if (browseState.urgency) params.set("urgency", browseState.urgency);
  if (browseState.bestOnly) params.set("best_practice", "true");
  params.set("sort", browseState.sort);

  try {
    const articles = await api(`/articles?${params.toString()}`);
    if (!articles.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>No clinical protocols found</h3><p>Try adjusting your search criteria or category filter.</p></div>`;
      return;
    }
    grid.innerHTML = articles.map(articleCardHtml).join("");
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>Couldn't load protocols</h3><p>${err.message}</p></div>`;
  }
}

function articleCardHtml(a) {
  const cat = a.category || { name: "Clinical", color: "#1F6F78" };
  const urgencyColor = a.urgency_level === "Critical / Emergency" ? "#C1503F" : (a.urgency_level === "Important" ? "#C97A2B" : "#5C6E73");
  
  return `
    <div class="article-card" onclick="openArticle(${a.id})">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <span class="cat-tag" style="color:${cat.color}"><span class="cat-dot" style="background:${cat.color}"></span>${cat.name}</span>
        <div style="display:flex; align-items:center; gap:6px;">
          ${a.is_best_practice ? `<span class="best-badge">★ Gold Standard</span>` : ""}
          <button class="bookmark-star ${a.is_bookmarked ? 'bookmarked' : ''}" title="Pin to Ward Bookmarks" onclick="event.stopPropagation(); toggleBookmarkCard(${a.id}, this)">★</button>
        </div>
      </div>
      <h3>${escapeHtml(a.title)}</h3>
      <div class="article-summary">${escapeHtml(a.summary || "")}</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
        <span class="evidence-badge">${a.evidence_level || 'Level II'}</span>
        <span class="evidence-badge" style="color:${urgencyColor}; font-weight:600;">${a.urgency_level || 'Routine'}</span>
        <span class="evidence-badge">⏱️ ${a.read_time_min || 2} min read</span>
      </div>
      <div class="tag-row">${(a.tags||[]).slice(0,3).map(t=>`<span class="tag-pill">#${escapeHtml(t)}</span>`).join("")}</div>
      <div class="card-footer">
        <span>${a.author ? escapeHtml(a.author.name) : "Staff"}</span>
        <span>★ ${a.avg_rating || 0} (${a.rating_count}) · ${a.view_count} reads</span>
      </div>
    </div>
  `;
}

async function toggleBookmarkCard(articleId, btn) {
  try {
    const res = await api(`/articles/${articleId}/bookmark`, { method: "POST" });
    btn.classList.toggle("bookmarked", res.is_bookmarked);
    showToast(res.is_bookmarked ? "Pinned to Ward Bookmarks" : "Removed from bookmarks");
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ---------------------------------------------------------------------
   View: Bookmarks (Ward Favorites)
--------------------------------------------------------------------- */
async function renderBookmarks() {
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Loading pinned bookmarks…</div>`;
  try {
    const articles = await api("/bookmarks");
    if (!articles.length) {
      root.innerHTML = `
        <div class="empty-state">
          <h3>No Pinned Ward Bookmarks Yet</h3>
          <p>Click the ★ star on any protocol card in "Browse Knowledge" to save it here for fast shift reference.</p>
          <button class="btn btn-primary" onclick="navigate('browse')">Browse Clinical Knowledge</button>
        </div>`;
      return;
    }
    root.innerHTML = `<div class="article-grid">` + articles.map(articleCardHtml).join("") + `</div>`;
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><h3>Couldn't load bookmarks</h3><p>${err.message}</p></div>`;
  }
}

/* ---------------------------------------------------------------------
   View: Clinical Calculators & Decision Support
--------------------------------------------------------------------- */
let activeCalc = "qsofa";

function renderCalculators(calcType = activeCalc) {
  activeCalc = calcType;
  const root = document.getElementById("view-root");

  root.innerHTML = `
    <div class="calc-nav">
      <button class="calc-tab ${activeCalc==='qsofa'?'active':''}" onclick="renderCalculators('qsofa')">⚡ qSOFA Sepsis Score</button>
      <button class="calc-tab ${activeCalc==='gfr'?'active':''}" onclick="renderCalculators('gfr')">🧪 Cockcroft-Gault CrCl / GFR</button>
      <button class="calc-tab ${activeCalc==='bmi'?'active':''}" onclick="renderCalculators('bmi')">⚖️ BMI & Ideal Body Weight</button>
      <button class="calc-tab ${activeCalc==='iv'?'active':''}" onclick="renderCalculators('iv')">💧 IV Infusion & Drip Rate</button>
      <button class="calc-tab ${activeCalc==='apgar'?'active':''}" onclick="renderCalculators('apgar')">👶 APGAR Newborn Score</button>
    </div>
    <div id="calc-body"></div>
  `;

  if (activeCalc === "qsofa") renderQsofaCalc();
  else if (activeCalc === "gfr") renderGfrCalc();
  else if (activeCalc === "bmi") renderBmiCalc();
  else if (activeCalc === "iv") renderIvCalc();
  else if (activeCalc === "apgar") renderApgarCalc();
}

function renderQsofaCalc() {
  document.getElementById("calc-body").innerHTML = `
    <div class="calc-card">
      <div class="calc-grid">
        <div>
          <h3>Quick Sequential Organ Failure Assessment (qSOFA)</h3>
          <p style="color:var(--slate); font-size:13px;">Identifies patients with suspected infection outside the ICU who are at elevated risk for in-hospital mortality.</p>
          
          <div class="checklist-item" style="margin-top:16px;">
            <input type="checkbox" id="qsofa-rr" onchange="calcQsofa()">
            <label for="qsofa-rr" style="cursor:pointer;"><strong>Respiratory Rate &gt;= 22 / min</strong> (Tachypnea)</label>
          </div>
          <div class="checklist-item">
            <input type="checkbox" id="qsofa-gcs" onchange="calcQsofa()">
            <label for="qsofa-gcs" style="cursor:pointer;"><strong>Altered Mentation</strong> (Glasgow Coma Scale &lt; 15 or acute confusion)</label>
          </div>
          <div class="checklist-item">
            <input type="checkbox" id="qsofa-sbp" onchange="calcQsofa()">
            <label for="qsofa-sbp" style="cursor:pointer;"><strong>Systolic Blood Pressure &lt;= 100 mmHg</strong> (Hypotension)</label>
          </div>
        </div>

        <div class="calc-result-box" id="qsofa-result">
          <div style="font-size:12px; color:var(--slate); text-transform:uppercase; font-family:var(--font-mono);">qSOFA Score</div>
          <div class="calc-score-val" id="qsofa-val">0 / 3</div>
          <div id="qsofa-badge" class="calc-badge calc-badge-safe">Low Risk (&lt; 2)</div>
          <p id="qsofa-text" style="font-size:13px; margin-top:12px; color:var(--ink);">Normal risk. Continue routine clinical monitoring.</p>
        </div>
      </div>
    </div>
  `;
}

function calcQsofa() {
  let score = 0;
  if (document.getElementById("qsofa-rr").checked) score++;
  if (document.getElementById("qsofa-gcs").checked) score++;
  if (document.getElementById("qsofa-sbp").checked) score++;

  document.getElementById("qsofa-val").textContent = `${score} / 3`;
  const badge = document.getElementById("qsofa-badge");
  const text = document.getElementById("qsofa-text");

  if (score >= 2) {
    badge.className = "calc-badge calc-badge-danger";
    badge.textContent = "High Risk (Score >= 2)";
    text.innerHTML = "<strong>CRITICAL ACTION:</strong> High risk of severe sepsis / in-hospital mortality. Draw blood cultures, measure serum lactate, and initiate 1-Hour Sepsis Bundle immediately.";
  } else if (score === 1) {
    badge.className = "calc-badge calc-badge-warn";
    badge.textContent = "Intermediate Risk";
    text.textContent = "Monitor vitals closely (q1h). Re-evaluate if clinical condition deteriorates.";
  } else {
    badge.className = "calc-badge calc-badge-safe";
    badge.textContent = "Low Risk (Score 0)";
    text.textContent = "Low risk. Continue routine ward monitoring.";
  }
}

function renderGfrCalc() {
  document.getElementById("calc-body").innerHTML = `
    <div class="calc-card">
      <div class="calc-grid">
        <div>
          <h3>Cockcroft-Gault Creatinine Clearance (CrCl)</h3>
          <p style="color:var(--slate); font-size:13px;">Estimates renal function for drug dose adjustments (e.g. Vancomycin, Enoxaparin, Novel Oral Anticoagulants).</p>
          
          <div class="field-grid">
            <div class="field">
              <label>Age (years)</label>
              <input type="number" id="gfr-age" value="65" oninput="calcGfr()">
            </div>
            <div class="field">
              <label>Sex</label>
              <select id="gfr-sex" onchange="calcGfr()">
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>
          <div class="field-grid">
            <div class="field">
              <label>Weight (kg)</label>
              <input type="number" id="gfr-weight" value="70" oninput="calcGfr()">
            </div>
            <div class="field">
              <label>Serum Creatinine (mg/dL)</label>
              <input type="number" step="0.1" id="gfr-scr" value="1.2" oninput="calcGfr()">
            </div>
          </div>
        </div>

        <div class="calc-result-box">
          <div style="font-size:12px; color:var(--slate); text-transform:uppercase; font-family:var(--font-mono);">Estimated CrCl</div>
          <div class="calc-score-val" id="gfr-val">60.8 mL/min</div>
          <div id="gfr-badge" class="calc-badge calc-badge-warn">Mild-to-Moderate Impairment</div>
          <p id="gfr-text" style="font-size:13px; margin-top:12px; color:var(--ink);">eGFR 60-89 mL/min (Stage 2 CKD equivalent). Adjust renally eliminated drugs according to monograph.</p>
        </div>
      </div>
    </div>
  `;
  calcGfr();
}

function calcGfr() {
  const age = parseFloat(document.getElementById("gfr-age").value) || 0;
  const weight = parseFloat(document.getElementById("gfr-weight").value) || 0;
  const scr = parseFloat(document.getElementById("gfr-scr").value) || 0.1;
  const sex = document.getElementById("gfr-sex").value;

  if (age <= 0 || weight <= 0 || scr <= 0) return;

  let crcl = ((140 - age) * weight) / (72 * scr);
  if (sex === "female") crcl *= 0.85;
  crcl = Math.round(crcl * 10) / 10;

  document.getElementById("gfr-val").textContent = `${crcl} mL/min`;
  const badge = document.getElementById("gfr-badge");
  const text = document.getElementById("gfr-text");

  if (crcl >= 90) {
    badge.className = "calc-badge calc-badge-safe";
    badge.textContent = "Normal Renal Function (>= 90)";
    text.textContent = "Normal renal clearance. Standard dosing applies.";
  } else if (crcl >= 60) {
    badge.className = "calc-badge calc-badge-safe";
    badge.textContent = "Mild Decrease (60-89)";
    text.textContent = "Mildly decreased renal function. Monitor renal panel.";
  } else if (crcl >= 30) {
    badge.className = "calc-badge calc-badge-warn";
    badge.textContent = "Moderate Impairment (30-59)";
    text.textContent = "Moderate impairment (Stage 3). Reduce dose or extend dosing interval for renal drugs.";
  } else if (crcl >= 15) {
    badge.className = "calc-badge calc-badge-danger";
    badge.textContent = "Severe Impairment (15-29)";
    text.textContent = "Severe renal failure (Stage 4). Major dose reduction and therapeutic drug monitoring required.";
  } else {
    badge.className = "calc-badge calc-badge-danger";
    badge.textContent = "End-Stage Renal Disease (< 15)";
    text.textContent = "Kidney failure. Nephrology consult recommended. Dialysis dose adjustments apply.";
  }
}

function renderBmiCalc() {
  document.getElementById("calc-body").innerHTML = `
    <div class="calc-card">
      <div class="calc-grid">
        <div>
          <h3>BMI & Ideal Body Weight (Devine Equation)</h3>
          <p style="color:var(--slate); font-size:13px;">Computes Body Mass Index and Ideal Body Weight for drug clearance and nutritional assessments.</p>
          
          <div class="field-grid">
            <div class="field">
              <label>Height (cm)</label>
              <input type="number" id="bmi-height" value="175" oninput="calcBmi()">
            </div>
            <div class="field">
              <label>Weight (kg)</label>
              <input type="number" id="bmi-weight" value="75" oninput="calcBmi()">
            </div>
          </div>
          <div class="field">
            <label>Sex</label>
            <select id="bmi-sex" onchange="calcBmi()">
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>

        <div class="calc-result-box">
          <div style="font-size:12px; color:var(--slate); text-transform:uppercase; font-family:var(--font-mono);">Body Mass Index</div>
          <div class="calc-score-val" id="bmi-val">24.5 kg/m²</div>
          <div id="bmi-badge" class="calc-badge calc-badge-safe">Normal Weight</div>
          <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--line);">
            <div style="font-size:11px; color:var(--slate); text-transform:uppercase; font-family:var(--font-mono);">Ideal Body Weight (IBW)</div>
            <strong id="bmi-ibw" style="font-size:18px; color:var(--ink);">70.5 kg</strong>
          </div>
        </div>
      </div>
    </div>
  `;
  calcBmi();
}

function calcBmi() {
  const h = parseFloat(document.getElementById("bmi-height").value) || 0;
  const w = parseFloat(document.getElementById("bmi-weight").value) || 0;
  const sex = document.getElementById("bmi-sex").value;

  if (h <= 0 || w <= 0) return;

  const hM = h / 100;
  const bmi = Math.round((w / (hM * hM)) * 10) / 10;
  document.getElementById("bmi-val").textContent = `${bmi} kg/m²`;

  const hIn = h / 2.54;
  let ibw = 50;
  if (hIn > 60) {
    ibw = sex === "male" ? 50 + 2.3 * (hIn - 60) : 45.5 + 2.3 * (hIn - 60);
  }
  document.getElementById("bmi-ibw").textContent = `${Math.round(ibw * 10) / 10} kg`;

  const badge = document.getElementById("bmi-badge");
  if (bmi < 18.5) {
    badge.className = "calc-badge calc-badge-warn";
    badge.textContent = "Underweight (< 18.5)";
  } else if (bmi < 25) {
    badge.className = "calc-badge calc-badge-safe";
    badge.textContent = "Normal Weight (18.5 - 24.9)";
  } else if (bmi < 30) {
    badge.className = "calc-badge calc-badge-warn";
    badge.textContent = "Overweight (25.0 - 29.9)";
  } else {
    badge.className = "calc-badge calc-badge-danger";
    badge.textContent = "Obese (>= 30.0)";
  }
}

function renderIvCalc() {
  document.getElementById("calc-body").innerHTML = `
    <div class="calc-card">
      <div class="calc-grid">
        <div>
          <h3>IV Infusion & Drip Rate Calculator</h3>
          <p style="color:var(--slate); font-size:13px;">Computes hourly flow rate and gravity drip rate for IV fluids and continuous infusions.</p>
          
          <div class="field-grid">
            <div class="field">
              <label>Total Volume (mL)</label>
              <input type="number" id="iv-vol" value="1000" oninput="calcIv()">
            </div>
            <div class="field">
              <label>Infusion Time (hours)</label>
              <input type="number" step="0.5" id="iv-time" value="8" oninput="calcIv()">
            </div>
          </div>
          <div class="field">
            <label>Drop Factor (gtt/mL)</label>
            <select id="iv-factor" onchange="calcIv()">
              <option value="20" selected>Standard Adult Set (20 gtt/mL)</option>
              <option value="15">Macrodrip Set (15 gtt/mL)</option>
              <option value="10">Blood / Rapid Set (10 gtt/mL)</option>
              <option value="60">Microdrip Pediatric Set (60 gtt/mL)</option>
            </select>
          </div>
        </div>

        <div class="calc-result-box">
          <div style="font-size:12px; color:var(--slate); text-transform:uppercase; font-family:var(--font-mono);">Electronic Pump Rate</div>
          <div class="calc-score-val" id="iv-pump">125 mL/hr</div>
          <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--line);">
            <div style="font-size:12px; color:var(--slate); text-transform:uppercase; font-family:var(--font-mono);">Gravity Drip Rate</div>
            <div class="calc-score-val" id="iv-drip" style="font-size:26px; color:var(--teal);">42 gtt/min</div>
          </div>
        </div>
      </div>
    </div>
  `;
  calcIv();
}

function calcIv() {
  const vol = parseFloat(document.getElementById("iv-vol").value) || 0;
  const time = parseFloat(document.getElementById("iv-time").value) || 1;
  const factor = parseFloat(document.getElementById("iv-factor").value) || 20;

  if (vol <= 0 || time <= 0) return;

  const mlHr = Math.round(vol / time);
  const totalMins = time * 60;
  const gttMin = Math.round((vol * factor) / totalMins);

  document.getElementById("iv-pump").textContent = `${mlHr} mL/hr`;
  document.getElementById("iv-drip").textContent = `${gttMin} gtt/min`;
}

function renderApgarCalc() {
  document.getElementById("calc-body").innerHTML = `
    <div class="calc-card">
      <div class="calc-grid">
        <div>
          <h3>APGAR Score for Newborn Assessment</h3>
          <p style="color:var(--slate); font-size:13px;">Assesses newborn physical health at 1 and 5 minutes post-delivery.</p>
          
          <div class="field">
            <label>Appearance (Skin Color)</label>
            <select id="apgar-a" onchange="calcApgar()">
              <option value="0">0 - Blue / Pale all over</option>
              <option value="1">1 - Body pink, extremities blue (Acrocyanosis)</option>
              <option value="2" selected>2 - Completely pink</option>
            </select>
          </div>
          <div class="field">
            <label>Pulse (Heart Rate)</label>
            <select id="apgar-p" onchange="calcApgar()">
              <option value="0">0 - Absent</option>
              <option value="1">1 - &lt; 100 beats/min</option>
              <option value="2" selected>2 - &gt;= 100 beats/min</option>
            </select>
          </div>
          <div class="field">
            <label>Grimace (Reflex Irritability)</label>
            <select id="apgar-g" onchange="calcApgar()">
              <option value="0">0 - No response</option>
              <option value="1">1 - Grimace / weak cry</option>
              <option value="2" selected>2 - Vigorous cry / cough / sneeze</option>
            </select>
          </div>
          <div class="field">
            <label>Activity (Muscle Tone)</label>
            <select id="apgar-act" onchange="calcApgar()">
              <option value="0">0 - Flaccid / Limp</option>
              <option value="1">1 - Some flexion of extremities</option>
              <option value="2" selected>2 - Active motion</option>
            </select>
          </div>
          <div class="field">
            <label>Respiration (Breathing Effort)</label>
            <select id="apgar-r" onchange="calcApgar()">
              <option value="0">0 - Absent</option>
              <option value="1">1 - Slow, irregular, shallow</option>
              <option value="2" selected>2 - Good strong cry</option>
            </select>
          </div>
        </div>

        <div class="calc-result-box">
          <div style="font-size:12px; color:var(--slate); text-transform:uppercase; font-family:var(--font-mono);">Total APGAR Score</div>
          <div class="calc-score-val" id="apgar-val">10 / 10</div>
          <div id="apgar-badge" class="calc-badge calc-badge-safe">Normal / Reassuring</div>
          <p id="apgar-text" style="font-size:13px; margin-top:12px; color:var(--ink);">Newborn is in good condition. Standard post-natal care.</p>
        </div>
      </div>
    </div>
  `;
  calcApgar();
}

function calcApgar() {
  const a = parseInt(document.getElementById("apgar-a").value);
  const p = parseInt(document.getElementById("apgar-p").value);
  const g = parseInt(document.getElementById("apgar-g").value);
  const act = parseInt(document.getElementById("apgar-act").value);
  const r = parseInt(document.getElementById("apgar-r").value);

  const total = a + p + g + act + r;
  document.getElementById("apgar-val").textContent = `${total} / 10`;

  const badge = document.getElementById("apgar-badge");
  const text = document.getElementById("apgar-text");

  if (total >= 7) {
    badge.className = "calc-badge calc-badge-safe";
    badge.textContent = "Normal / Reassuring (7-10)";
    text.textContent = "Newborn in good condition. Standard post-natal care.";
  } else if (total >= 4) {
    badge.className = "calc-badge calc-badge-warn";
    badge.textContent = "Moderately Abnormal (4-6)";
    text.textContent = "May require immediate suctioning, tactile stimulation, and supplemental oxygen.";
  } else {
    badge.className = "calc-badge calc-badge-danger";
    badge.textContent = "Severely Depressed (0-3)";
    text.textContent = "CRITICAL: Immediate neonatal resuscitation required (Positive Pressure Ventilation, Chest Compressions).";
  }
}

/* ---------------------------------------------------------------------
   View: Knowledge Gap & Protocol Requests
--------------------------------------------------------------------- */
async function renderRequests() {
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Loading knowledge requests…</div>`;
  try {
    const requests = await api("/requests");
    if (!requests.length) {
      root.innerHTML = `
        <div class="empty-state">
          <h3>No Open Protocol Requests</h3>
          <p>Notice a missing clinical guideline or ward procedure? Request it now for specialist review.</p>
          <button class="btn btn-primary" onclick="openRequestModal()">+ Request Clinical Protocol</button>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:13px; color:var(--slate);">Staff-requested protocols and clinical topics awaiting documentation:</div>
        <button class="btn btn-primary btn-sm" onclick="openRequestModal()">+ Request Guideline</button>
      </div>
      <div>
        ${requests.map(r => `
          <div class="request-card">
            <div class="upvote-box ${r.has_upvoted ? 'upvoted' : ''}" onclick="toggleUpvote(${r.id})">
              <span style="font-size:16px;">▲</span>
              <span class="upvote-count">${r.upvote_count}</span>
            </div>
            <div style="flex:1;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <h3 style="margin:0; font-size:16px;">${escapeHtml(r.title)}</h3>
                <span class="badge badge-${r.status}">${r.status.replace('_', ' ')}</span>
              </div>
              <div style="color:var(--slate); font-size:13px; margin:6px 0;">${escapeHtml(r.description)}</div>
              <div style="display:flex; gap:12px; align-items:center; font-size:11.5px; color:var(--slate); font-family:var(--font-mono); margin-top:8px;">
                <span>Requested by ${r.requester ? r.requester.name : 'Staff'}</span>
                <span>Dept: ${r.department || 'Hospital-wide'}</span>
                <span>Urgency: <strong>${r.urgency}</strong></span>
                ${r.assigned_to ? `<span style="color:var(--teal);">Assigned: ${r.assigned_to.name}</span>` : ''}
              </div>
              ${state.user.role === 'admin' || state.user.role === 'contributor' ? `
                <div style="margin-top:10px; display:flex; gap:8px;">
                  ${r.status === 'open' ? `<button class="btn btn-ghost btn-sm" onclick="claimRequest(${r.id})">Claim & Draft</button>` : ''}
                  ${r.status === 'in_progress' ? `<button class="btn btn-primary btn-sm" onclick="openEditor(null, '${escapeHtml(r.title)}')">Create Protocol Article</button>` : ''}
                </div>
              ` : ''}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><h3>Couldn't load requests</h3><p>${err.message}</p></div>`;
  }
}

async function toggleUpvote(id) {
  try {
    await api(`/requests/${id}/upvote`, { method: "POST" });
    renderRequests();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function claimRequest(id) {
  try {
    await api(`/requests/${id}/claim`, { method: "POST" });
    showToast("Assigned request to you");
    renderRequests();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openRequestModal() {
  document.getElementById("request-modal").style.display = "flex";
}
function closeRequestModal() {
  document.getElementById("request-modal").style.display = "none";
}

async function handleCreateRequest(e) {
  e.preventDefault();
  try {
    await api("/requests", {
      method: "POST",
      body: {
        title: document.getElementById("req-title").value,
        department: document.getElementById("req-dept").value,
        urgency: document.getElementById("req-urgency").value,
        description: document.getElementById("req-desc").value,
      }
    });
    closeRequestModal();
    showToast("Knowledge request submitted");
    navigate("requests");
  } catch (err) {
    alert(err.message);
  }
  return false;
}

/* ---------------------------------------------------------------------
   View: Clinical Consults & Q&A Board
--------------------------------------------------------------------- */
async function renderQa() {
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Loading clinical consults…</div>`;
  try {
    const questions = await api("/questions", { auth: false });
    if (!questions.length) {
      root.innerHTML = `
        <div class="empty-state">
          <h3>No Clinical Questions Posted Yet</h3>
          <p>Have a clinical scenario or dosing query? Post a consult question for peer response.</p>
          <button class="btn btn-primary" onclick="openQaModal()">+ Ask Clinical Question</button>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:13px; color:var(--slate);">Clinical consults, triage questions, and hospital consensus discussions:</div>
        <button class="btn btn-primary btn-sm" onclick="openQaModal()">+ Ask Question</button>
      </div>
      <div>
        ${questions.map(q => `
          <div class="qa-card" onclick="openQuestionDetail(${q.id})">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <h3 style="margin:0; font-size:16.5px;">${escapeHtml(q.title)}</h3>
              ${q.is_resolved ? `<span class="qa-resolved-badge">✓ Verified Consensus</span>` : `<span style="font-size:11.5px; color:var(--slate); font-family:var(--font-mono);">${q.answer_count} answer${q.answer_count===1?'':'s'}</span>`}
            </div>
            <p style="color:var(--slate); font-size:13px; margin:8px 0;">${escapeHtml(q.content)}</p>
            <div style="display:flex; gap:12px; font-size:11.5px; color:var(--slate); font-family:var(--font-mono);">
              <span>${q.author ? q.author.name : 'Staff'} (${q.author ? q.author.department : ''})</span>
              <span>Category: ${q.category ? q.category.name : 'General'}</span>
              <span>${formatDate(q.created_at)}</span>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><h3>Couldn't load consults</h3><p>${err.message}</p></div>`;
  }
}

async function openQuestionDetail(qId) {
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Loading discussion…</div>`;
  document.getElementById("topbar-actions").innerHTML = `<button class="btn btn-ghost btn-sm" onclick="navigate('qa')">← Back to Consults</button>`;

  try {
    const q = await api(`/questions/${qId}`, { auth: false });
    const isOwnerOrAdmin = state.user && (state.user.role === 'admin' || (q.author && q.author.id === state.user.id));

    root.innerHTML = `
      <div class="panel panel-pad">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <h2 style="margin:0;">${escapeHtml(q.title)}</h2>
          ${q.is_resolved ? `<span class="qa-resolved-badge">✓ Verified Consensus</span>` : ''}
        </div>
        <div style="font-size:12px; color:var(--slate); font-family:var(--font-mono); margin:8px 0 16px;">
          Asked by ${q.author ? q.author.name : 'Staff'} (${q.author ? q.author.department : ''}) · ${formatDate(q.created_at)}
        </div>
        <div style="font-size:14.5px; line-height:1.6; padding-bottom:16px; border-bottom:1px solid var(--line);">
          ${escapeHtml(q.content)}
        </div>

        <h3 style="margin-top:20px; font-size:16px;">Clinical Answers & Responses (${(q.answers||[]).length})</h3>
        
        <div style="margin:16px 0;">
          ${(q.answers||[]).map(a => `
            <div class="answer-card ${a.is_accepted ? 'answer-accepted' : ''}">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <strong style="font-size:13px; color:var(--ink);">${a.author ? a.author.name : 'Staff'} <small style="color:var(--slate);">(${a.author ? a.author.department : ''})</small></strong>
                <div>
                  ${a.is_accepted ? `<span class="qa-resolved-badge" style="margin-right:6px;">✓ Accepted Hospital Consensus</span>` : ''}
                  ${isOwnerOrAdmin && !a.is_accepted ? `<button class="btn btn-ghost btn-sm" onclick="acceptAnswer(${a.id}, ${q.id})">Mark as Consensus</button>` : ''}
                </div>
              </div>
              <div style="font-size:13.5px; line-height:1.55;">${markdownish(a.content)}</div>
            </div>
          `).join("") || `<div class="page-subtitle">No answers submitted yet. Be the first clinician to respond.</div>`}
        </div>

        <form onsubmit="return submitAnswer(event, ${q.id})" style="margin-top:20px; border-top:1px solid var(--line); padding-top:16px;">
          <label>Your Clinical Response / Recommendation</label>
          <textarea id="answer-input" rows="3" required placeholder="Provide clinical evidence, protocol references, or guidance..."></textarea>
          <div style="text-align:right; margin-top:8px;">
            <button type="submit" class="btn btn-primary btn-sm">Submit Answer</button>
          </div>
        </form>
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><h3>Couldn't load question</h3><p>${err.message}</p></div>`;
  }
}

async function submitAnswer(e, qId) {
  e.preventDefault();
  const input = document.getElementById("answer-input");
  try {
    await api(`/questions/${qId}/answers`, { method: "POST", body: { content: input.value } });
    showToast("Answer posted");
    openQuestionDetail(qId);
  } catch (err) {
    alert(err.message);
  }
  return false;
}

async function acceptAnswer(ansId, qId) {
  try {
    await api(`/answers/${ansId}/accept`, { method: "POST" });
    showToast("Marked as verified consensus");
    openQuestionDetail(qId);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openQaModal() {
  document.getElementById("qa-modal").style.display = "flex";
}
function closeQaModal() {
  document.getElementById("qa-modal").style.display = "none";
}

async function handleCreateQuestion(e) {
  e.preventDefault();
  try {
    await api("/questions", {
      method: "POST",
      body: {
        title: document.getElementById("qa-title").value,
        category_id: parseInt(document.getElementById("qa-category").value, 10),
        content: document.getElementById("qa-content").value,
      }
    });
    closeQaModal();
    showToast("Clinical question posted");
    navigate("qa");
  } catch (err) {
    alert(err.message);
  }
  return false;
}

/* ---------------------------------------------------------------------
   View: My Contributions & Authoring
--------------------------------------------------------------------- */
async function renderMine() {
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Loading your contributions…</div>`;
  try {
    const articles = await api("/articles/mine");
    if (!articles.length) {
      root.innerHTML = `
        <div class="empty-state">
          <h3>No Authored Articles Yet</h3>
          <p>Author and share your first evidence-based clinical protocol with the hospital.</p>
          <button class="btn btn-primary" onclick="openEditor()">+ Author New Protocol</button>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:13px; color:var(--slate);">All clinical protocols and guidelines authored by your account:</div>
        <button class="btn btn-primary btn-sm" onclick="openEditor()">+ New Protocol</button>
      </div>
      <div class="article-grid">
        ${articles.map(a => `
          <div class="article-card" onclick="openArticle(${a.id})">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <span class="badge badge-${a.status}">${a.status.replace('_', ' ')}</span>
              ${a.is_best_practice ? `<span class="best-badge">★ Gold Standard</span>` : ""}
            </div>
            <h3>${escapeHtml(a.title)}</h3>
            <div class="article-summary">${escapeHtml(a.summary || "")}</div>
            <div class="card-footer">
              <span>${a.version_count} snapshot${a.version_count===1?'':'s'}</span>
              <span>${a.view_count} reads · ${a.comment_count} comments</span>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><h3>Couldn't load articles</h3><p>${err.message}</p></div>`;
  }
}

/* ---------------------------------------------------------------------
   View: Peer Review Queue (KM Governance)
--------------------------------------------------------------------- */
async function renderReviewQueue() {
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Loading review queue…</div>`;
  try {
    const articles = await api("/articles/review-queue");
    if (!articles.length) {
      root.innerHTML = `
        <div class="empty-state">
          <h3>Clinical Review Queue Clear</h3>
          <p>All submitted clinical protocols have been reviewed and approved for publication.</p>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:13px; color:var(--slate);">Articles submitted by contributors awaiting clinical validation and approval:</div>
      </div>
      <div class="article-grid">
        ${articles.map(a => `
          <div class="article-card" onclick="openArticle(${a.id})">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <span class="badge badge-in_review">Awaiting Peer Review</span>
              <span class="evidence-badge">${a.evidence_level}</span>
            </div>
            <h3>${escapeHtml(a.title)}</h3>
            <div class="article-summary">${escapeHtml(a.summary || "")}</div>
            <div class="card-footer">
              <span>Authored by ${a.author ? a.author.name : 'Doctor'}</span>
              <span style="color:var(--teal); font-weight:600;">Click to Review →</span>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><h3>Couldn't load review queue</h3><p>${err.message}</p></div>`;
  }
}

/* ---------------------------------------------------------------------
   View: Hospital Administration Hub
--------------------------------------------------------------------- */
async function renderAdminHub() {
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Loading Admin Hub…</div>`;
  try {
    const [users, auditLogs] = await Promise.all([
      api("/admin/users"),
      api("/admin/audit-logs"),
    ]);

    root.innerHTML = `
      <div class="dash-grid">
        <div class="panel panel-pad">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="margin:0;">Hospital Staff Management</h3>
            <span style="font-size:12px; color:var(--slate); font-family:var(--font-mono);">${users.length} accounts</span>
          </div>

          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
              <thead>
                <tr style="border-bottom:2px solid var(--line); text-align:left; color:var(--slate); font-size:11px; text-transform:uppercase;">
                  <th style="padding:8px 4px;">Staff Name</th>
                  <th style="padding:8px 4px;">Department</th>
                  <th style="padding:8px 4px;">Role</th>
                  <th style="padding:8px 4px; text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${users.map(u => `
                  <tr style="border-bottom:1px solid var(--line);">
                    <td style="padding:10px 4px;">
                      <strong>${escapeHtml(u.name)}</strong>
                      <div style="font-size:11px; color:var(--slate);">${u.email}</div>
                    </td>
                    <td style="padding:10px 4px;">${escapeHtml(u.department || '—')}</td>
                    <td style="padding:10px 4px;">
                      <select onchange="updateUserRole(${u.id}, this.value)" style="padding:3px 6px; font-size:12px; width:auto;">
                        <option value="viewer" ${u.role==='viewer'?'selected':''}>Viewer</option>
                        <option value="contributor" ${u.role==='contributor'?'selected':''}>Contributor</option>
                        <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
                      </select>
                    </td>
                    <td style="padding:10px 4px; text-align:right;">
                      <button class="btn btn-ghost btn-sm" onclick="toggleUserStatus(${u.id})">
                        ${u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>

          <div style="margin-top:24px; padding-top:16px; border-top:1px solid var(--line); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong>Backup Knowledge Database</strong>
              <div style="font-size:11.5px; color:var(--slate);">Export all protocols, categories, audit logs, and users as JSON.</div>
            </div>
            <a href="/api/admin/export" target="_blank" class="btn btn-primary btn-sm">Download Backup</a>
          </div>
        </div>

        <div class="panel panel-pad">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="margin:0;">Clinical Governance Audit Log</h3>
            <span style="font-size:11px; color:var(--slate); font-family:var(--font-mono);">Live Events</span>
          </div>

          <div style="max-height:500px; overflow-y:auto;">
            ${auditLogs.map(l => `
              <div class="version-item">
                <div class="v-title" style="color:var(--teal);">${escapeHtml(l.action)}</div>
                <div style="font-size:12px; color:var(--ink);">${escapeHtml(l.details || '')}</div>
                <div class="v-meta">${escapeHtml(l.user_name)} · ${formatDate(l.created_at)}</div>
              </div>
            `).join("") || `<div class="page-subtitle">No audit logs recorded yet.</div>`}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><h3>Couldn't load admin panel</h3><p>${err.message}</p></div>`;
  }
}

async function updateUserRole(userId, newRole) {
  try {
    await api(`/admin/users/${userId}/role`, { method: "PUT", body: { role: newRole } });
    showToast("User role updated");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function toggleUserStatus(userId) {
  try {
    await api(`/admin/users/${userId}/status`, { method: "PUT" });
    showToast("User status updated");
    renderAdminHub();
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ---------------------------------------------------------------------
   View: Article Detail & Governance Actions
--------------------------------------------------------------------- */
async function openArticle(id) {
  state.view = "detail";
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  document.getElementById("page-title").textContent = "Clinical Protocol";
  document.getElementById("page-subtitle").textContent = "";
  document.getElementById("topbar-actions").innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="openPrintModal(${id})">🖨️ Print Sheet</button>
    <button class="btn btn-ghost btn-sm" onclick="navigate('browse')">← Back to Browse</button>
  `;

  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Loading protocol details…</div>`;

  try {
    const [article, comments, versions] = await Promise.all([
      api(`/articles/${id}`),
      api(`/articles/${id}/comments`, { auth: false }),
      api(`/articles/${id}/versions`, { auth: false }),
    ]);
    state.currentArticle = article;
    renderArticleDetail(article, comments, versions);
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><h3>Couldn't load article</h3><p>${err.message}</p></div>`;
  }
}

function renderArticleDetail(a, comments, versions) {
  const cat = a.category || { name: "Clinical", color: "#1F6F78" };
  const isOwnerOrAdmin = state.user && (state.user.role === "admin" || (a.author && a.author.id === state.user.id));
  const isPrivileged = state.user && (state.user.role === "admin" || state.user.role === "contributor");
  const isAdmin = state.user && state.user.role === "admin";

  const root = document.getElementById("view-root");
  root.innerHTML = `
    <div class="panel panel-pad">
      <div class="article-detail-header">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="cat-tag" style="color:${cat.color}"><span class="cat-dot" style="background:${cat.color}"></span>${cat.name}</span>
          <div style="display:flex; gap:8px; align-items:center;">
            ${a.is_best_practice ? `<span class="best-badge">★ Validated Gold Standard</span>` : ""}
            <span class="badge badge-${a.status}">${a.status.replace('_', ' ')}</span>
            <button class="bookmark-star ${a.is_bookmarked ? 'bookmarked' : ''}" title="Pin Protocol" onclick="toggleBookmarkDetail(${a.id}, this)">★</button>
          </div>
        </div>

        <h1 style="margin-top:10px; font-size:24px;">${escapeHtml(a.title)}</h1>
        
        <div class="detail-meta-row">
          <span>Author: <strong>${a.author ? escapeHtml(a.author.name) : "Hospital Staff"}</strong>${a.author && a.author.department ? ' (' + escapeHtml(a.author.department) + ')' : ''}</span>
          <span>Updated: ${formatDate(a.updated_at)}</span>
          <span>${a.view_count} reads</span>
          <span>⏱️ ${a.read_time_min} min read</span>
          <span class="evidence-badge">${a.evidence_level}</span>
          <span class="evidence-badge">Urgency: ${a.urgency_level}</span>
        </div>
      </div>

      ${a.target_audience ? `
        <div style="font-size:12px; color:var(--slate); margin-bottom:10px;">
          <strong>Target Audience:</strong> ${escapeHtml(a.target_audience)}
        </div>` : ''}

      <div class="tag-row" style="margin-bottom:14px;">${(a.tags||[]).map(t=>`<span class="tag-pill">#${escapeHtml(t)}</span>`).join("")}</div>

      <!-- CLINICAL PROTOCOL CONTENT -->
      <div class="detail-content">${markdownish(a.content)}</div>

      ${a.external_references ? `
        <div style="margin-top:20px; padding:12px 14px; background:var(--paper); border-radius:8px; font-size:12.5px; color:var(--slate);">
          <strong>Key Guidelines & Citations:</strong><br>${escapeHtml(a.external_references)}
        </div>` : ''}

      <!-- GOVERNANCE & PEER REVIEW ACTIONS -->
      ${a.status === 'in_review' && isPrivileged ? `
        <div style="margin-top:20px; padding:16px; background:#F0F9FF; border:1px solid #BAE6FD; border-radius:8px;">
          <h4 style="margin:0 0 8px; color:#0369A1;">Clinical Governance Review Action</h4>
          <p style="font-size:13px; color:#0C4A6E; margin:0 0 12px;">This article is pending peer approval. Review the clinical content carefully before publishing.</p>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-success btn-sm" onclick="handleReviewAction(${a.id}, 'approve')">✓ Approve & Publish</button>
            <button class="btn btn-ghost btn-sm" onclick="handleReviewAction(${a.id}, 'request_changes')">Revisions Needed</button>
            <button class="btn btn-danger btn-sm" onclick="handleReviewAction(${a.id}, 'archive')">Archive Protocol</button>
          </div>
        </div>
      ` : ''}

      <div style="display:flex; gap:10px; margin-top:20px; flex-wrap:wrap; align-items:center;">
        ${isOwnerOrAdmin ? `<button class="btn btn-ghost btn-sm" onclick="openEditor(${a.id})">✏️ Edit Protocol</button>` : ""}
        ${isOwnerOrAdmin ? `<button class="btn btn-danger btn-sm" onclick="deleteArticle(${a.id})">Delete</button>` : ""}
        ${isOwnerOrAdmin && a.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="submitArticleForReview(${a.id})">Submit for Peer Review</button>` : ""}
        ${isAdmin ? `<button class="btn btn-ghost btn-sm" onclick="toggleBestPractice(${a.id})">${a.is_best_practice ? "Remove" : "Flag as"} Gold Standard</button>` : ""}
      </div>

      <!-- RATINGS ROW -->
      <div style="display:flex; align-items:center; gap:12px; padding:14px 0; border-top:1px solid var(--line); margin-top:18px;">
        <span style="font-size:13px; color:var(--slate);">Peer Clinical Validation:</span>
        <div class="rating-row" id="rating-row">
          ${[1,2,3,4,5].map(n => `<span class="star ${(a.user_rating||0)>=n?'filled':''}" data-n="${n}" onclick="submitRating(${a.id}, ${n})">★</span>`).join("")}
        </div>
        <span style="font-size:12.5px; color:var(--slate);" id="rating-summary">${a.avg_rating || 0} avg · ${a.rating_count} peer rating${a.rating_count===1?'':'s'}</span>
      </div>
    </div>

    <div style="height:16px;"></div>
    <div class="dash-grid">
      <div class="panel panel-pad">
        <h3 style="font-size:15px;">Clinical Discussion & Comments (${comments.length})</h3>
        <form onsubmit="return submitComment(event, ${a.id})" style="margin-bottom:14px;">
          <textarea id="comment-input" rows="2" placeholder="Add clinical peer note, dosage observation, or ward feedback..." required></textarea>
          <div style="text-align:right; margin-top:6px;"><button class="btn btn-primary btn-sm" type="submit">Post Comment</button></div>
        </form>
        <div id="comment-list">
          ${comments.map(c => `
            <div class="comment">
              <div class="comment-head"><span>${escapeHtml(c.user ? c.user.name : "Staff")} (${escapeHtml(c.user ? c.user.department : '')})</span><span>${formatDate(c.created_at)}</span></div>
              <div class="comment-body">${escapeHtml(c.content)}</div>
            </div>`).join("") || `<div class="page-subtitle">No peer discussion yet. Be the first to leave a clinical observation.</div>`}
        </div>
      </div>

      <div class="panel panel-pad">
        <h3 style="font-size:15px;">Audit Trail & Version History</h3>
        <div style="font-size:12px; color:var(--slate); margin-bottom:12px;">Full KM lifecycle audit log with diff inspection:</div>
        ${versions.map(v => `
          <div class="version-item" style="cursor:pointer;" onclick="openDiffModal(${a.id}, ${v.id})">
            <div class="v-title" style="display:flex; justify-content:space-between;">
              <span>${escapeHtml(v.title)}</span>
              <span style="color:var(--teal); font-size:11px;">Inspect Diff →</span>
            </div>
            <div class="v-meta">${escapeHtml(v.edited_by)} · ${formatDate(v.edited_at)}${v.change_note ? " · " + escapeHtml(v.change_note) : ""}</div>
          </div>`).join("") || `<div class="page-subtitle">Initial version snapshot.</div>`}
      </div>
    </div>
  `;
}

async function toggleBookmarkDetail(articleId, btn) {
  try {
    const res = await api(`/articles/${articleId}/bookmark`, { method: "POST" });
    btn.classList.toggle("bookmarked", res.is_bookmarked);
    showToast(res.is_bookmarked ? "Pinned to Ward Bookmarks" : "Removed from bookmarks");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function submitArticleForReview(id) {
  try {
    await api(`/articles/${id}/submit-review`, { method: "POST" });
    showToast("Submitted for clinical peer review");
    openArticle(id);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleReviewAction(id, action) {
  const notes = prompt("Enter optional review notes / comments for the author:") || "";
  try {
    await api(`/articles/${id}/review-action`, { method: "POST", body: { action, notes } });
    showToast(`Protocol review action: ${action}`);
    openArticle(id);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function submitRating(articleId, value) {
  try {
    const result = await api(`/articles/${articleId}/rate`, { method: "POST", body: { value } });
    document.getElementById("rating-summary").textContent = `${result.avg_rating} avg · ${result.rating_count} peer rating${result.rating_count===1?'':'s'}`;
    document.querySelectorAll("#rating-row .star").forEach(star => {
      star.classList.toggle("filled", parseInt(star.dataset.n) <= value);
    });
    showToast(`Rated ${value} star${value>1?'s':''}`);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function submitComment(e, articleId) {
  e.preventDefault();
  const input = document.getElementById("comment-input");
  try {
    await api(`/articles/${articleId}/comments`, { method: "POST", body: { content: input.value } });
    openArticle(articleId);
    showToast("Comment posted");
  } catch (err) {
    showToast(err.message, "error");
  }
  return false;
}

async function deleteArticle(id) {
  if (!confirm("Permanently delete this clinical protocol?")) return;
  try {
    await api(`/articles/${id}`, { method: "DELETE" });
    showToast("Article deleted");
    navigate("browse");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function toggleBestPractice(id) {
  try {
    await api(`/articles/${id}/flag`, { method: "POST" });
    openArticle(id);
    showToast("Updated gold standard flag");
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ---------------------------------------------------------------------
   Version Diff Viewer & Snapshot Restore
--------------------------------------------------------------------- */
async function openDiffModal(articleId, versionId) {
  state.selectedVersion = { articleId, versionId };
  try {
    const v = await api(`/articles/${articleId}/versions/${versionId}`, { auth: false });
    const current = state.currentArticle;

    document.getElementById("diff-modal-title").textContent = `Snapshot Comparison (v#${v.id})`;
    document.getElementById("diff-modal-meta").textContent = `Edited by ${v.edited_by} on ${formatDate(v.edited_at)} — Note: ${v.change_note || 'None'}`;

    // Line diff computation
    const oldLines = (v.content || "").split("\n");
    const currentLines = (current && current.content ? current.content : "").split("\n");

    let diffHtml = "";
    const maxLen = Math.max(oldLines.length, currentLines.length);
    for (let i = 0; i < maxLen; i++) {
      const o = oldLines[i];
      const c = currentLines[i];
      if (o === c) {
        diffHtml += `<div class="diff-line">  ${escapeHtml(o || '')}</div>`;
      } else {
        if (o !== undefined) diffHtml += `<div class="diff-line diff-del">- ${escapeHtml(o)}</div>`;
        if (c !== undefined) diffHtml += `<div class="diff-line diff-add">+ ${escapeHtml(c)}</div>`;
      }
    }

    document.getElementById("diff-content").innerHTML = diffHtml || "No text changes detected.";
    document.getElementById("diff-modal").style.display = "flex";
  } catch (err) {
    showToast(err.message, "error");
  }
}

function closeDiffModal() {
  document.getElementById("diff-modal").style.display = "none";
}

async function restoreSelectedVersion() {
  if (!state.selectedVersion) return;
  const { articleId, versionId } = state.selectedVersion;
  if (!confirm(`Restore Version #${versionId} as the active clinical protocol?`)) return;

  try {
    await api(`/articles/${articleId}/versions/${versionId}/restore`, { method: "POST" });
    closeDiffModal();
    showToast("Version restored successfully");
    openArticle(articleId);
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ---------------------------------------------------------------------
   Printable Clinical Sheet
--------------------------------------------------------------------- */
function openPrintModal(articleId) {
  const a = state.currentArticle;
  if (!a) return;

  document.getElementById("print-sheet-content").innerHTML = `
    <div class="print-hospital-header">
      <div>
        <div style="font-family:var(--font-display); font-size:22px; font-weight:700; color:var(--ink);">Hospital Clinical Protocol Sheet</div>
        <div style="font-family:var(--font-mono); font-size:11px; color:var(--slate);">MedKnow Knowledge Management System · Clinical Operations</div>
      </div>
      <div style="text-align:right; font-family:var(--font-mono); font-size:11px; color:var(--slate);">
        Printed: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}<br>
        Protocol ID: #${a.id}
      </div>
    </div>

    <h2>${escapeHtml(a.title)}</h2>
    
    <div style="display:flex; gap:16px; margin-bottom:16px; font-family:var(--font-mono); font-size:12px; color:var(--slate); border-bottom:1px solid #ddd; padding-bottom:8px;">
      <span><strong>Category:</strong> ${a.category ? a.category.name : 'General'}</span>
      <span><strong>Evidence:</strong> ${a.evidence_level}</span>
      <span><strong>Urgency:</strong> ${a.urgency_level}</span>
      <span><strong>Author:</strong> ${a.author ? a.author.name : 'Staff'}</span>
    </div>

    ${a.summary ? `<p><em><strong>Clinical Summary:</strong> ${escapeHtml(a.summary)}</em></p>` : ''}

    <div style="margin-top:16px;">
      ${markdownish(a.content)}
    </div>

    ${a.external_references ? `
      <div style="margin-top:20px; font-size:11px; color:#666; border-top:1px dashed #ccc; padding-top:8px;">
        <strong>Guidelines & References:</strong> ${escapeHtml(a.external_references)}
      </div>
    ` : ''}
  `;

  document.getElementById("print-modal").style.display = "flex";
}

function closePrintModal() {
  document.getElementById("print-modal").style.display = "none";
}

/* ---------------------------------------------------------------------
   Article Editor Modal (Create / Edit + Live Markdown Preview)
--------------------------------------------------------------------- */
async function openEditor(articleId = null, prefillTitle = "") {
  document.getElementById("editor-error").style.display = "none";
  document.getElementById("editor-form").reset();
  document.getElementById("edit-article-id").value = articleId || "";
  document.getElementById("edit-change-note-field").style.display = articleId ? "block" : "none";
  document.getElementById("editor-title-text").textContent = articleId ? "Edit Clinical Protocol" : "New Clinical Protocol";

  switchEditorTab('write');

  if (prefillTitle) {
    document.getElementById("edit-title").value = prefillTitle;
  }

  if (articleId) {
    try {
      const a = await api(`/articles/${articleId}`);
      document.getElementById("edit-title").value = a.title;
      document.getElementById("edit-category").value = a.category ? a.category.id : "";
      document.getElementById("edit-evidence").value = a.evidence_level || "Level II";
      document.getElementById("edit-audience").value = a.target_audience || "";
      document.getElementById("edit-urgency").value = a.urgency_level || "Routine";
      document.getElementById("edit-summary").value = a.summary || "";
      document.getElementById("edit-content").value = a.content;
      document.getElementById("edit-tags").value = (a.tags || []).join(", ");
      document.getElementById("edit-refs").value = a.external_references || "";
      document.getElementById("edit-status").value = a.status;
    } catch (err) {
      showToast(err.message, "error");
      return;
    }
  }
  document.getElementById("editor-modal").style.display = "flex";
}

function closeEditor() {
  document.getElementById("editor-modal").style.display = "none";
}

function switchEditorTab(tab) {
  document.getElementById("tab-write").classList.toggle("active", tab === "write");
  document.getElementById("tab-preview").classList.toggle("active", tab === "preview");
  const writePane = document.getElementById("editor-write-pane");
  const previewPane = document.getElementById("editor-preview-pane");

  if (tab === "write") {
    writePane.style.display = "block";
    previewPane.style.display = "none";
  } else {
    writePane.style.display = "none";
    previewPane.style.display = "block";
    const text = document.getElementById("edit-content").value;
    previewPane.innerHTML = markdownish(text);
  }
}

function insertMd(snippet) {
  const el = document.getElementById("edit-content");
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const val = el.value;
  el.value = val.substring(0, start) + snippet + val.substring(end);
  el.focus();
  el.selectionStart = el.selectionEnd = start + snippet.length;
}

async function handleSaveArticle(e) {
  e.preventDefault();
  const id = document.getElementById("edit-article-id").value;
  const payload = {
    title: document.getElementById("edit-title").value,
    category_id: parseInt(document.getElementById("edit-category").value, 10),
    evidence_level: document.getElementById("edit-evidence").value,
    target_audience: document.getElementById("edit-audience").value,
    urgency_level: document.getElementById("edit-urgency").value,
    summary: document.getElementById("edit-summary").value,
    content: document.getElementById("edit-content").value,
    tags: document.getElementById("edit-tags").value,
    external_references: document.getElementById("edit-refs").value,
    status: document.getElementById("edit-status").value,
  };
  if (id) payload.change_note = document.getElementById("edit-change-note").value;

  try {
    let article;
    if (id) {
      article = await api(`/articles/${id}`, { method: "PUT", body: payload });
      showToast("Protocol updated and version snapshotted");
    } else {
      article = await api(`/articles`, { method: "POST", body: payload });
      showToast("Protocol registered successfully");
    }
    closeEditor();
    openArticle(article.id);
  } catch (err) {
    const el = document.getElementById("editor-error");
    el.textContent = err.message;
    el.style.display = "block";
  }
  return false;
}

/* ---------------------------------------------------------------------
   Toast Notifications
--------------------------------------------------------------------- */
function showToast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  if (type === "error") toast.style.background = "var(--coral)";
  toast.innerHTML = `<span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

/* ---------------------------------------------------------------------
   Markdown & Utilities
--------------------------------------------------------------------- */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

/**
 * Clinical Markdown Renderer:
 * - Headings (##, ###)
 * - Checklists (- [ ] item, - [x] item)
 * - Callouts (> [!CRITICAL], > [!WARNING], > [!NOTE])
 * - Bullets & Numbered items
 */
function markdownish(text) {
  if (!text) return "";
  const lines = text.split("\n");
  let html = "";
  let inList = false;
  let inCallout = false;
  let calloutType = "";

  for (let raw of lines) {
    const line = raw.trim();

    // Clinical Callouts
    if (line.startsWith("> [!CRITICAL]")) {
      if (inList) { html += "</ul>"; inList = false; }
      if (inCallout) html += "</div>";
      inCallout = true;
      calloutType = "critical";
      html += `<div class="callout-critical"><strong>⚠️ CRITICAL ACTION:</strong> ${escapeHtml(line.replace("> [!CRITICAL]", "").trim())}`;
      continue;
    } else if (line.startsWith("> [!WARNING]")) {
      if (inList) { html += "</ul>"; inList = false; }
      if (inCallout) html += "</div>";
      inCallout = true;
      calloutType = "warning";
      html += `<div class="callout-warning"><strong>⚠️ WARNING:</strong> ${escapeHtml(line.replace("> [!WARNING]", "").trim())}`;
      continue;
    } else if (line.startsWith("> [!NOTE]")) {
      if (inList) { html += "</ul>"; inList = false; }
      if (inCallout) html += "</div>";
      inCallout = true;
      calloutType = "note";
      html += `<div class="callout-note"><strong>📌 CLINICAL PEARL:</strong> ${escapeHtml(line.replace("> [!NOTE]", "").trim())}`;
      continue;
    }

    if (inCallout) {
      if (line.startsWith(">")) {
        html += `<br>${escapeHtml(line.replace(/^>\s?/, ''))}`;
        continue;
      } else {
        html += "</div>";
        inCallout = false;
      }
    }

    // Headings
    if (line.startsWith("### ")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h3>${escapeHtml(line.slice(4))}</h3>`;
    } else if (line.startsWith("## ")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h2>${escapeHtml(line.slice(3))}</h2>`;
    } 
    // Checklists
    else if (line.startsWith("- [ ] ") || line.startsWith("- [x] ")) {
      if (inList) { html += "</ul>"; inList = false; }
      const checked = line.startsWith("- [x] ");
      const itemText = line.substring(6);
      html += `<div class="checklist-item"><input type="checkbox" ${checked?'checked':''}> <span>${formatInline(itemText)}</span></div>`;
    }
    // Bullets / numbers
    else if (line.startsWith("- ") || /^\d+\.\s/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${formatInline(line.replace(/^-\s/, "").replace(/^\d+\.\s/, ""))}</li>`;
    } 
    // Blank Line
    else if (line === "") {
      if (inList) { html += "</ul>"; inList = false; }
    } 
    // Paragraph
    else {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p>${formatInline(line)}</p>`;
    }
  }

  if (inList) html += "</ul>";
  if (inCallout) html += "</div>";
  return html;
}

function formatInline(str) {
  let res = escapeHtml(str);
  // Bold **text**
  res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  res = res.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Code `text`
  res = res.replace(/`(.*?)`/g, '<code>$1</code>');
  return res;
}

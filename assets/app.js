// CSV parsing via PapaParse CDN (loaded in HTML)

// ---------- helpers ----------
const toNumOrNull = (v) => {
  const s = String(v ?? "").trim();
  if (!s || s.toLowerCase() === "nan" || s.toLowerCase() === "null") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const toNumOrZero = (v) => {
  const n = toNumOrNull(v);
  return n == null ? 0 : n;
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

// Safe compare helpers
const cmpDesc = (a, b) => (b ?? -Infinity) - (a ?? -Infinity);
const cmpAsc = (a, b) => (a ?? Infinity) - (b ?? Infinity);

async function loadCsv(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const text = await res.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return parsed.data || [];
}

function normalizeRecommendationRow(r) {
  return {
    name: (r.Name ?? r.name ?? "").trim(),
    category: (r.Category ?? r.category ?? "").trim(),
    calories: toNumOrNull(r.Calories ?? r.calories),
    protein: toNumOrNull(r.Protein ?? r.protein),
    carbs: toNumOrNull(r.Carbs ?? r.carbs),
    fat: toNumOrNull(r.Fat ?? r.fat),
    score: toNumOrNull(r.Score ?? r.final_score ?? r.score),
  };
}

function normalizePlanRow(r) {
  return {
    day: (r.Day ?? r.day ?? "").trim(),
    meal: (r.Meal ?? r.meal ?? "").trim(),
    name: (r.Name ?? r.name ?? "").trim(),
    category: (r.Category ?? r.category ?? "").trim(),
    calories: toNumOrNull(r.Calories ?? r.calories),
    protein: toNumOrNull(r.Protein ?? r.protein),
    carbs: toNumOrNull(r.Carbs ?? r.carbs),
    fat: toNumOrNull(r.Fat ?? r.fat),
    score: toNumOrNull(r.Score ?? r.final_score ?? r.score),
  };
}

function chip(label, val) {
  const show = val == null ? "—" : String(val);
  return `<span class="chip">${label}: <b>${esc(show)}</b></span>`;
}

function recipeCard(r) {
  const scoreChip =
    r.score == null ? "" : `<span class="chip score">Score: <b>${esc(r.score)}</b></span>`;

  return `
    <div class="recipe">
      <div class="name">${esc(r.name)}</div>
      <div class="cat">${esc(r.category || "")}</div>
      <div class="chips">
        ${chip("Cal", r.calories)}
        ${chip("P", r.protein)}
        ${chip("C", r.carbs)}
        ${chip("F", r.fat)}
        ${scoreChip}
      </div>
    </div>
  `;
}

// -----------------------------------------------------------
// ✅ Internal renderer used by both CSV + JSON modes
// -----------------------------------------------------------
function mountRecommendations(rows) {
  const holder = document.getElementById("cards");
  const info = document.getElementById("countInfo");

  let data = (rows || [])
    .map(normalizeRecommendationRow)
    .filter((x) => x.name);

  // Default state (same as your UI)
  const state = {
    q: "",
    calMax: 1200,
    pMin: 0,
    cMax: 200,
    fMax: 120,
    sort: "score",
  };

  const bind = (id, key, transform = (v) => v) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      state[key] = transform(el.value);
      render();
    });
  };

  bind("q", "q", (v) => String(v));
  bind("calMax", "calMax", (v) => Number(v));
  bind("pMin", "pMin", (v) => Number(v));
  bind("cMax", "cMax", (v) => Number(v));
  bind("fMax", "fMax", (v) => Number(v));

  const sortEl = document.getElementById("sort");
  if (sortEl) {
    sortEl.addEventListener("change", (e) => {
      state.sort = e.target.value;
      render();
    });
  }

  const setLabel = (id, value) => {
    const el = document.getElementById(id + "Val");
    if (el) el.textContent = value;
  };

  function passesFilters(r, q) {
    // Search
    const hay = (r.name + " " + (r.category || "")).toLowerCase();
    const okQ = q ? hay.includes(q) : true;

    // Calories filter (if calories missing, drop it from result)
    const okCal = r.calories != null && r.calories <= state.calMax;

    // Macro filters:
    // If macro value is missing, we treat it as "unknown" and do NOT block the recipe
    // (otherwise almost all rows would be filtered out when dataset lacks macros).
    const okP = r.protein == null ? true : r.protein >= state.pMin;
    const okC = r.carbs == null ? true : r.carbs <= state.cMax;
    const okF = r.fat == null ? true : r.fat <= state.fMax;

    return okQ && okCal && okP && okC && okF;
  }

  function stableSort(out) {
    // Decorate with original index to keep stable sorting
    const decorated = out.map((r, idx) => ({ r, idx }));

    if (state.sort === "score") {
      decorated.sort((a, b) => {
        const d = cmpDesc(a.r.score, b.r.score);
        if (d !== 0) return d;
        const cal = cmpAsc(a.r.calories, b.r.calories);
        if (cal !== 0) return cal;
        return a.idx - b.idx;
      });
    } else if (state.sort === "calories") {
      decorated.sort((a, b) => {
        const d = cmpAsc(a.r.calories, b.r.calories);
        if (d !== 0) return d;
        return a.idx - b.idx;
      });
    } else if (state.sort === "protein") {
      // Protein may be missing: push missing to bottom
      decorated.sort((a, b) => {
        const ap = a.r.protein, bp = b.r.protein;
        if (ap == null && bp == null) return a.idx - b.idx;
        if (ap == null) return 1;
        if (bp == null) return -1;
        const d = bp - ap;
        if (d !== 0) return d;
        return a.idx - b.idx;
      });
    }

    return decorated.map((d) => d.r);
  }

  function drawCharts(out) {
    // Only if Plotly + chart div exist
    const chartDiv = document.getElementById("recCharts");
    if (!chartDiv) return;
    if (typeof Plotly === "undefined") return;

    const cal = out.map(x => x.calories).filter(v => Number.isFinite(v));
    const score = out.map(x => x.score).filter(v => Number.isFinite(v));
    const protein = out.map(x => x.protein).filter(v => Number.isFinite(v));

    const traces = [
      { x: cal, type: "histogram", nbinsx: 30, name: "Calories" },
      { x: score, type: "histogram", nbinsx: 30, name: "Score" },
    ];

    if (protein.length > 10) {
      traces.push({ x: protein, type: "histogram", nbinsx: 30, name: "Protein" });
    }

    Plotly.newPlot(chartDiv, traces, {
      margin: { t: 10, l: 45, r: 20, b: 45 },
      barmode: "overlay",
      xaxis: { title: "Value" },
      yaxis: { title: "Count" },
      legend: { orientation: "h" }
    }, { responsive: true });
  }

  function render() {
    setLabel("calMax", state.calMax);
    setLabel("pMin", state.pMin);
    setLabel("cMax", state.cMax);
    setLabel("fMax", state.fMax);

    const q = state.q.trim().toLowerCase();

    let out = data.filter((r) => passesFilters(r, q));

    // Sort + slice
    out = stableSort(out).slice(0, 60);

    // Monotonic check for score sort (your earlier test issue)
    if (state.sort === "score") {
      for (let i = 1; i < out.length; i++) {
        const prev = out[i - 1].score ?? -Infinity;
        const cur = out[i].score ?? -Infinity;
        // if broken, we still render but you can debug
        if (cur > prev) {
          // no throw in UI
          break;
        }
      }
    }

    info.textContent = `${out.length} results (showing top 60)`;
    holder.innerHTML = out.map(recipeCard).join("");

    // Optional charts
    drawCharts(out);
  }

  render();
}

// -----------------------------------------------------------
// ✅ Recommendations (CSV)
// -----------------------------------------------------------
async function initRecommendations() {
  const url =
    window.RECOMMENDATIONS_CSV_URL ||
    "./data/top_recommendations_lunch.csv"; // fallback only if file exists locally

  const rows = await loadCsv(url);
  mountRecommendations(rows);
}

// -----------------------------------------------------------
// ✅ Recommendations (JSON/inline rows)
// Provide array of objects already loaded elsewhere
// -----------------------------------------------------------
async function initRecommendationsFromRows(rows) {
  mountRecommendations(rows);
}

// -----------------------------------------------------------
// ✅ Weekly Plan (CSV)
// -----------------------------------------------------------
async function initPlan() {
  const root = document.getElementById("planRoot");

  const url =
    window.WEEKLY_PLAN_CSV_URL ||
    "./data/weekly_plan.csv"; // fallback only if file exists locally

  const rows = await loadCsv(url);
  mountPlan(root, rows);
}

// -----------------------------------------------------------
// ✅ Weekly Plan (JSON/inline rows)
// -----------------------------------------------------------
async function initPlanFromRows(rows) {
  const root = document.getElementById("planRoot");
  mountPlan(root, rows);
}

function mountPlan(root, rows) {
  if (!root) return;

  const data = (rows || [])
    .map(normalizePlanRow)
    .filter((x) => x.day && x.meal && x.name);

  const grouped = {};
  for (const r of data) {
    grouped[r.day] ??= [];
    grouped[r.day].push(r);
  }

  const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  root.innerHTML = dayOrder
    .filter((d) => grouped[d]?.length)
    .map((day) => {
      const items = grouped[day];

      // Normalize meal labels to expected buckets
      const meals = { Breakfast: [], Lunch: [], Dinner: [] };
      for (const it of items) {
        const key = it.meal;
        if (meals[key]) meals[key].push(it);
        else {
          // unknown meal bucket: try best-fit
          const k = String(key).toLowerCase();
          if (k.includes("break")) meals.Breakfast.push(it);
          else if (k.includes("lunch")) meals.Lunch.push(it);
          else if (k.includes("dinner")) meals.Dinner.push(it);
          else meals.Lunch.push(it);
        }
      }

      const mealCol = (title) => `
        <div class="mealCol">
          <h4>${title}</h4>
          ${(meals[title] || []).map(recipeCard).join("") || `<div class="chip">No entry</div>`}
        </div>
      `;

      return `
        <div class="dayBlock">
          <div class="sectionTitle" style="margin:0">
            <h2>${day}</h2>
            <div class="hint">${items.length} meals</div>
          </div>
          <div class="meals3">
            ${mealCol("Breakfast")}
            ${mealCol("Lunch")}
            ${mealCol("Dinner")}
          </div>
        </div>
      `;
    })
    .join("");
}

// expose functions
window.initRecommendations = initRecommendations;
window.initRecommendationsFromRows = initRecommendationsFromRows;
window.initPlan = initPlan;
window.initPlanFromRows = initPlanFromRows;

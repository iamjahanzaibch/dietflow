// ---------- helpers ----------
const toNum = (v) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

async function loadCsv(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const text = await res.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return parsed.data || [];
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return row[k];
  }
  return "";
}

function chip(label, val) {
  if (val === null || val === undefined) return "";
  return `<span class="chip">${label}: <b>${val}</b></span>`;
}

function recipeCard(r) {
  return `
    <div class="recipe">
      <div class="name">${esc(r.name)}</div>
      <div class="cat">${esc(r.category || "")}</div>
      <div class="chips">
        ${chip("Cal", r.calories)}
        ${chip("P", r.protein)}
        ${chip("C", r.carbs)}
        ${chip("F", r.fat)}
        ${Number.isFinite(r.score) ? `<span class="chip score">Score: <b>${r.score.toFixed(4)}</b></span>` : ""}
      </div>
    </div>
  `;
}

function normalizeRecRows(rows) {
  return rows.map((r) => {
    const name = String(pick(r, ["Name","name"])).trim();
    const category = String(pick(r, ["Category","category"])).trim();
    const calories = toNum(pick(r, ["Calories","calories"]));
    const protein = toNum(pick(r, ["Protein","protein"]));
    const carbs   = toNum(pick(r, ["Carbs","carbs"]));
    const fat     = toNum(pick(r, ["Fat","fat"]));
    const scoreRaw = toNum(pick(r, ["Score","final_score","score"]));

    return {
      name,
      category,
      calories,
      protein,
      carbs,
      fat,
      score: Number.isFinite(scoreRaw) ? scoreRaw : -Infinity
    };
  }).filter(x => x.name && x.calories !== null);
}

function drawRecommendationCharts(rows, chartElId, chartHintId) {
  if (!chartElId) return;
  const hint = chartHintId ? document.getElementById(chartHintId) : null;
  if (typeof Plotly === "undefined") {
    if (hint) hint.textContent = "Plotly not available.";
    return;
  }

  try {
    const calories = rows.map(r => r.calories).filter(v => Number.isFinite(v));
    const scores = rows.map(r => r.score).filter(v => Number.isFinite(v) && v !== -Infinity);
    const protein = rows.map(r => r.protein).filter(v => Number.isFinite(v));

    const traces = [
      { x: calories, type: "histogram", nbinsx: 30, name: "Calories" },
      { x: scores, type: "histogram", nbinsx: 30, name: "Score" }
    ];
    if (protein.length > 10) traces.push({ x: protein, type: "histogram", nbinsx: 30, name: "Protein" });

    Plotly.newPlot(chartElId, traces, {
      margin: { t: 10, l: 45, r: 20, b: 45 },
      barmode: "overlay",
      xaxis: { title: "Value" },
      yaxis: { title: "Count" },
      legend: { orientation: "h" }
    }, { responsive: true });

    if (hint) hint.textContent = "Charts loaded successfully.";
  } catch (e) {
    if (hint) hint.textContent = "Charts could not be rendered.";
  }
}

// -----------------------------------------------------------
// ✅ Recommendations
// -----------------------------------------------------------
async function initRecommendations(opts = {}) {
  const holder = document.getElementById("cards");
  const info = document.getElementById("countInfo");

  const url = window.RECOMMENDATIONS_CSV_URL ||
    "https://raw.githubusercontent.com/iamjahanzaibch/dietflow/main/top_recommendations_lunch.csv";

  const raw = await loadCsv(url);
  const data = normalizeRecRows(raw);

  const state = { q:"", calMax:1200, pMin:0, cMax:200, fMax:120, sort:"score" };

  const bind = (id, key, transform = (v) => v) => {
    const el = document.getElementById(id);
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

  document.getElementById("sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });

  const setLabel = (id, value) => {
    const el = document.getElementById(id + "Val");
    if (el) el.textContent = value;
  };

  function render() {
    setLabel("calMax", state.calMax);
    setLabel("pMin", state.pMin);
    setLabel("cMax", state.cMax);
    setLabel("fMax", state.fMax);

    const q = state.q.trim().toLowerCase();
    let out = data.filter((r) => {
      const hay = (r.name + " " + r.category).toLowerCase();
      const okQ = q ? hay.includes(q) : true;

      const p = r.protein ?? 0;
      const c = r.carbs ?? 0;
      const f = r.fat ?? 0;

      return okQ && r.calories <= state.calMax && p >= state.pMin && c <= state.cMax && f <= state.fMax;
    });

    if (state.sort === "score") out.sort((a, b) =>
      (b.score - a.score) ||
      ((a.calories ?? 1e18) - (b.calories ?? 1e18)) ||
      a.name.localeCompare(b.name)
    );
    if (state.sort === "calories") out.sort((a, b) =>
      ((a.calories ?? 1e18) - (b.calories ?? 1e18)) ||
      (b.score - a.score) ||
      a.name.localeCompare(b.name)
    );
    if (state.sort === "protein") out.sort((a, b) =>
      ((b.protein ?? 0) - (a.protein ?? 0)) ||
      (b.score - a.score) ||
      a.name.localeCompare(b.name)
    );

    out = out.slice(0, 60);
    info.textContent = `${out.length} results (showing top 60)`;
    holder.innerHTML = out.map(recipeCard).join("");

    drawRecommendationCharts(out, opts.chartElId, opts.chartHintId);
  }

  render();
}

// -----------------------------------------------------------
// ✅ Weekly Plan
// -----------------------------------------------------------
async function initPlan() {
  const root = document.getElementById("planRoot");

  const url = window.WEEKLY_PLAN_CSV_URL ||
    "https://raw.githubusercontent.com/iamjahanzaibch/dietflow/main/weekly_plan.csv";

  const rows = await loadCsv(url);

  const data = rows.map((r) => ({
    day: String(pick(r, ["Day","day"])).trim(),
    meal: String(pick(r, ["Meal","meal"])).trim(),
    name: String(pick(r, ["Name","name"])).trim(),
    category: String(pick(r, ["Category","category"])).trim(),
    calories: toNum(pick(r, ["Calories","calories"])),
    protein: toNum(pick(r, ["Protein","protein"])),
    carbs: toNum(pick(r, ["Carbs","carbs"])),
    fat: toNum(pick(r, ["Fat","fat"])),
    score: toNum(pick(r, ["Score","final_score","score"]))
  })).filter(x => x.day && x.meal && x.name);

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
      const meals = { Breakfast: [], Lunch: [], Dinner: [] };
      for (const it of items) (meals[it.meal] ??= []).push(it);

      const mealCol = (title) => `
        <div class="mealCol">
          <h4>${title}</h4>
          ${(meals[title] || []).map(recipeCard).join("") || `<div class="chip">No entry in CSV</div>`}
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

window.initRecommendations = initRecommendations;
window.initPlan = initPlan;

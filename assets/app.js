// CSV parsing via PapaParse CDN (loaded in HTML)

// ---------- helpers ----------
const toNum = (v) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
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

function recipeCard(r) {
  return `
    <div class="recipe">
      <div class="name">${esc(r.name)}</div>
      <div class="cat">${esc(r.category || "")}</div>
      <div class="chips">
        <span class="chip">Cal: <b>${r.calories}</b></span>
        <span class="chip">P: <b>${r.protein}</b></span>
        <span class="chip">C: <b>${r.carbs}</b></span>
        <span class="chip">F: <b>${r.fat}</b></span>
        ${Number.isFinite(r.score) ? `<span class="chip score">Score: <b>${r.score}</b></span>` : ""}
      </div>
    </div>
  `;
}

// -----------------------------------------------------------
// ✅ Recommendations (uses window.RECOMMENDATIONS_CSV_URL)
// -----------------------------------------------------------
async function initRecommendations() {
  const holder = document.getElementById("cards");
  const info = document.getElementById("countInfo");

  const url =
    window.RECOMMENDATIONS_CSV_URL ||
    "./data/top_recommendations_lunch.csv"; // fallback only if file exists locally

  const rows = await loadCsv(url);

  let data = rows
    .map((r) => ({
      name: (r.Name ?? r.name ?? "").trim(),
      category: (r.Category ?? r.category ?? "").trim(),
      calories: toNum(r.Calories ?? r.calories),
      protein: toNum(r.Protein ?? r.protein),
      carbs: toNum(r.Carbs ?? r.carbs),
      fat: toNum(r.Fat ?? r.fat),
      score: toNum(r.Score ?? r.final_score ?? r.score),
    }))
    .filter((x) => x.name);

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
      return (
        okQ &&
        r.calories <= state.calMax &&
        r.protein >= state.pMin &&
        r.carbs <= state.cMax &&
        r.fat <= state.fMax
      );
    });

    if (state.sort === "score") out.sort((a, b) => (b.score || 0) - (a.score || 0));
    if (state.sort === "calories") out.sort((a, b) => a.calories - b.calories);
    if (state.sort === "protein") out.sort((a, b) => b.protein - a.protein);

    out = out.slice(0, 60);
    info.textContent = `${out.length} results (showing top 60)`;
    holder.innerHTML = out.map(recipeCard).join("");
  }

  render();
}

// -----------------------------------------------------------
// ✅ Weekly Plan (uses window.WEEKLY_PLAN_CSV_URL)
// -----------------------------------------------------------
async function initPlan() {
  const root = document.getElementById("planRoot");

  const url =
    window.WEEKLY_PLAN_CSV_URL ||
    "./data/weekly_plan.csv"; // fallback only if file exists locally

  const rows = await loadCsv(url);

  const data = rows
    .map((r) => ({
      day: (r.Day ?? r.day ?? "").trim(),
      meal: (r.Meal ?? r.meal ?? "").trim(),
      name: (r.Name ?? r.name ?? "").trim(),
      category: (r.Category ?? r.category ?? "").trim(),
      calories: toNum(r.Calories ?? r.calories),
      protein: toNum(r.Protein ?? r.protein),
      carbs: toNum(r.Carbs ?? r.carbs),
      fat: toNum(r.Fat ?? r.fat),
      score: toNum(r.Score ?? r.final_score ?? r.score),
    }))
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
      const meals = { Breakfast: [], Lunch: [], Dinner: [] };
      for (const it of items) {
        (meals[it.meal] ??= []).push(it);
      }

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

// expose functions
window.initRecommendations = initRecommendations;
window.initPlan = initPlan;

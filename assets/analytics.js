const toNum = (v) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
};

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

async function initAnalytics() {
  const hint = document.getElementById("aHint");

  const recUrl = window.ANALYTICS_REC_CSV || "./top_recommendations_lunch.csv";
  const weekUrl = window.ANALYTICS_WEEK_CSV || "./weekly_plan.csv";

  const recRows = await loadCsv(recUrl);
  const weekRows = await loadCsv(weekUrl);

  // ---- Recommendations numeric series ----
  const rec = recRows.map(r => ({
    calories: toNum(pick(r, ["Calories","calories"])),
    protein: toNum(pick(r, ["Protein","protein"])),
    carbs:   toNum(pick(r, ["Carbs","carbs"])),
    fat:     toNum(pick(r, ["Fat","fat"])),
    score:   toNum(pick(r, ["Score","final_score","score"]))
  })).filter(x => x.calories !== null);

  const calories = rec.map(x => x.calories);
  const scores = rec.map(x => x.score).filter(v => v !== null);

  Plotly.newPlot("calHist", [
    { x: calories, type: "histogram", nbinsx: 30, name: "Calories" }
  ], {
    margin: { t: 10, l: 50, r: 20, b: 45 },
    xaxis: { title: "Calories" },
    yaxis: { title: "Count" }
  }, { responsive: true });

  Plotly.newPlot("scoreScatter", [
    {
      x: rec.map(x=>x.calories),
      y: rec.map(x=>x.score ?? 0),
      mode: "markers",
      type: "scatter",
      name: "Meals"
    }
  ], {
    margin: { t: 10, l: 55, r: 20, b: 50 },
    xaxis: { title: "Calories" },
    yaxis: { title: "Score" }
  }, { responsive: true });

  // ---- Weekly totals (calories) ----
  const week = weekRows.map(r => ({
    day: String(pick(r, ["Day","day"])).trim(),
    calories: toNum(pick(r, ["Calories","calories"]))
  })).filter(x => x.day && x.calories !== null);

  const dayOrder = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const totals = {};
  for (const d of dayOrder) totals[d] = 0;
  for (const w of week) {
    if (!(w.day in totals)) totals[w.day] = 0;
    totals[w.day] += w.calories;
  }

  Plotly.newPlot("weekBars", [
    { x: dayOrder, y: dayOrder.map(d=>totals[d] || 0), type: "bar", name: "Weekly calories" }
  ], {
    margin: { t: 10, l: 55, r: 20, b: 45 },
    xaxis: { title: "Day" },
    yaxis: { title: "Total calories" }
  }, { responsive: true });

  hint.textContent = "Analytics loaded successfully.";
}

window.initAnalytics = initAnalytics;

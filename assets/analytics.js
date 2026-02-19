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

  const recUrl = window.ANALYTICS_REC_CSV;
  const weekUrl = window.ANALYTICS_WEEK_CSV;

  const recRows = await loadCsv(recUrl);
  const weekRows = await loadCsv(weekUrl);

  const rec = recRows.map(r => ({
    calories: toNum(pick(r, ["Calories","calories"])),
    score: toNum(pick(r, ["Score","final_score","score"]))
  })).filter(x => x.calories !== null);

  Plotly.newPlot("calHist", [
    { x: rec.map(x=>x.calories), type: "histogram", nbinsx: 30 }
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
      type: "scatter"
    }
  ], {
    margin: { t: 10, l: 55, r: 20, b: 50 },
    xaxis: { title: "Calories" },
    yaxis: { title: "Score" }
  }, { responsive: true });

  const dayOrder = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const totals = Object.fromEntries(dayOrder.map(d => [d, 0]));

  for (const r of weekRows) {
    const day = String(pick(r, ["Day","day"])).trim();
    const calories = toNum(pick(r, ["Calories","calories"]));
    if (day && calories !== null) totals[day] = (totals[day] || 0) + calories;
  }

  Plotly.newPlot("weekBars", [
    { x: dayOrder, y: dayOrder.map(d => totals[d] || 0), type: "bar" }
  ], {
    margin: { t: 10, l: 55, r: 20, b: 45 },
    xaxis: { title: "Day" },
    yaxis: { title: "Total calories" }
  }, { responsive: true });

  hint.textContent = "Analytics loaded successfully.";
}

window.initAnalytics = initAnalytics;

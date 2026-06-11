const BUILT_IN_SHEET_SOURCE = "https://docs.google.com/spreadsheets/d/1Z572y0V2LZT3eOevOTwNNGROP3sNaJ8m2-D3_DuioCc/edit";
const CONFIG_SOURCE = window.DASHBOARD_CONFIG?.sheetUrl?.trim() || BUILT_IN_SHEET_SOURCE;
const SAMPLE_SOURCE = "./sample-data.csv";
const DEFAULT_SOURCE = CONFIG_SOURCE || SAMPLE_SOURCE;
const REFRESH_MS = 5 * 60 * 1000;
const ALL = "全部";

const dimensions = [
  { key: "App叫車", label: "App 叫車體驗", weight: 0.1 },
  { key: "接單等候", label: "派遣與等候體驗", weight: 0.15 },
  { key: "服務態度", label: "駕駛／隊員服務態度", weight: 0.25 },
  { key: "車內環境", label: "車內環境與舒適度", weight: 0.15 },
  { key: "行車安全", label: "行車安全", weight: 0.2 },
  { key: "路線車資付款", label: "路線、車資與付款", weight: 0.1 },
  { key: "整體評價", label: "整體服務品質", weight: 0.05 },
];

const compareModes = {
  taxi: {
    title: "台灣大車隊 小黃 vs Uber 小黃",
    leftLabel: "台灣大車隊 小黃",
    rightLabel: "Uber 小黃",
    leftMatch: (row) => row.平台 === "台灣大車隊" && row.車種 === "小黃",
    rightMatch: (row) => row.平台 === "Uber" && row.車種 === "小黃",
  },
  multi: {
    title: "台灣大車隊 多元 vs Uber 多元",
    leftLabel: "台灣大車隊 多元",
    rightLabel: "Uber 多元",
    leftMatch: (row) => row.平台 === "台灣大車隊" && row.車種 === "多元",
    rightMatch: (row) => row.平台 === "Uber" && row.車種 === "多元",
  },
  overall: {
    title: "台灣大車隊 vs Uber 綜合評比",
    leftLabel: "台灣大車隊",
    rightLabel: "Uber",
    leftMatch: (row) => row.平台 === "台灣大車隊",
    rightMatch: (row) => row.平台 === "Uber",
  },
};

const state = {
  rows: [],
  source: CONFIG_SOURCE || localStorage.getItem("dashboardCsvSource") || DEFAULT_SOURCE,
  filters: { month: ALL, branch: ALL, period: ALL, compareMode: "taxi" },
};

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("zh-TW", { style: "percent", maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  const headers = rows.shift()?.map((h) => h.trim()) || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ""])));
}

function toNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const text = String(value).trim();
  const scoreMatch = text.match(/^([1-5])(?:\s|$)/);
  if (scoreMatch) return Number(scoreMatch[1]);
  const number = Number(text.replace(/[$,NTD\s]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function weightedScore(row) {
  const values = dimensions.map((dimension) => {
    const score = toNumber(row[dimension.key]);
    return score === null ? null : score * dimension.weight;
  });
  return values.some((value) => value === null) ? null : values.reduce((sum, value) => sum + value, 0);
}

function normalizeRide(row) {
  const rideText = row["本次搭乘類型"] || "";
  const platform = row["平台"] || row["本次搭乘平台"] || (rideText.includes("Uber") ? "Uber" : rideText ? "台灣大車隊" : "");
  const vehicleText = row["車種"] || row["選擇的車種（小黃或多元）"] || rideText;
  const vehicleType = vehicleText.includes("小黃") ? "小黃" : vehicleText.includes("多元") ? "多元" : "";
  return { platform, vehicleType };
}

function normalizeRows(rows) {
  return rows.map((row) => {
    const score = toNumber(row["加權總分"]) ?? weightedScore(row);
    const ride = normalizeRide(row);
    return {
      ...row,
      平台: ride.platform,
      月份: row["月份"] || String(row["搭乘日期"] || "").slice(0, 7),
      分公司: row["分公司"] || row["所屬分公司"],
      搭車時段: row["搭車時段"] || row["搭乘時段"] || "",
      車種: ride.vehicleType,
      是否有叫到車輛: row["是否有叫到車輛"],
      實際車資: toNumber(row["實際車資"]),
      加權總分: score,
      搭乘日期: row["搭乘日期"],
      最滿意: row["最滿意的地方"] || row["本次最滿意的地方"],
      最需改善: row["最需改善的地方"] || row["本次最需要改善的地方"],
    };
  }).filter((row) => row.平台 && row.月份 && row.分公司);
}

function normalizeSourceUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_SOURCE;
  if (trimmed.includes("docs.google.com/spreadsheets") && trimmed.includes("/pubhtml")) {
    return trimmed.replace("/pubhtml", "/pub").replace(/([?&])gid=/, "$1output=csv&gid=");
  }
  if (trimmed.includes("docs.google.com/spreadsheets") && trimmed.includes("/pub?")) {
    return trimmed.includes("output=csv") ? trimmed : trimmed.replace("/pub?", "/pub?output=csv&");
  }
  return trimmed;
}

function average(values) {
  const clean = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function selectedMode() {
  return compareModes[state.filters.compareMode] || compareModes.taxi;
}

function getFilteredRows() {
  return state.rows.filter((row) => {
    return (state.filters.month === ALL || row.月份 === state.filters.month)
      && (state.filters.branch === ALL || row.分公司 === state.filters.branch)
      && (state.filters.period === ALL || row.搭車時段 === state.filters.period);
  });
}

function rowsForSide(rows, side) {
  const mode = selectedMode();
  const match = side === "left" ? mode.leftMatch : mode.rightMatch;
  return rows.filter((row) => match(row));
}

function uniqueOptions(key) {
  return [ALL, ...Array.from(new Set(state.rows.map((row) => row[key]).filter(Boolean))).sort()];
}

function fillSelect(select, options, selected) {
  select.innerHTML = options.map((option) => `<option value="${option}">${option}</option>`).join("");
  select.value = options.includes(selected) ? selected : ALL;
}

function groupStats(rows, side) {
  const all = rowsForSide(rows, side);
  const scored = all.filter((row) => row.加權總分 !== null);
  const attempts = all.filter((row) => row.是否有叫到車輛);
  const successCount = attempts.filter((row) => row.是否有叫到車輛 === "是").length;
  const noCarCount = attempts.filter((row) => row.是否有叫到車輛 === "否").length;
  const avgScore = average(scored.map((row) => row.加權總分));
  return {
    label: side === "left" ? selectedMode().leftLabel : selectedMode().rightLabel,
    count: scored.length,
    attempts: attempts.length,
    successRate: attempts.length ? successCount / attempts.length : null,
    noCarCount,
    avgScore,
    goodRate: scored.length ? scored.filter((row) => row.加權總分 >= 4.5).length / scored.length : null,
    badRate: scored.length ? scored.filter((row) => row.加權總分 < 3.5).length / scored.length : null,
    avgFare: average(scored.map((row) => row.實際車資)),
  };
}

function dimensionAverage(rows, side, key) {
  return average(rowsForSide(rows, side).map((row) => toNumber(row[key])));
}

function renderKpis(rows) {
  const left = groupStats(rows, "left");
  const right = groupStats(rows, "right");
  const gap = left.avgScore !== null && right.avgScore !== null ? left.avgScore - right.avgScore : null;

  $("totalSamples").textContent = fmt.format(left.count + right.count);
  $("leftSuccessTitle").textContent = `${left.label}成功率`;
  $("rightSuccessTitle").textContent = `${right.label}成功率`;
  $("leftSuccessRate").textContent = left.successRate === null ? "-" : pct.format(left.successRate);
  $("rightSuccessRate").textContent = right.successRate === null ? "-" : pct.format(right.successRate);
  $("leftNoCar").textContent = `未叫到 ${left.noCarCount} 筆`;
  $("rightNoCar").textContent = `未叫到 ${right.noCarCount} 筆`;
  $("leftFareTitle").textContent = `${left.label}平均車資`;
  $("rightFareTitle").textContent = `${right.label}平均車資`;
  $("leftAvgFare").textContent = left.avgFare === null ? "-" : currency.format(left.avgFare);
  $("rightAvgFare").textContent = right.avgFare === null ? "-" : currency.format(right.avgFare);
  $("leftFareMeta").textContent = `${left.count} 筆`;
  $("rightFareMeta").textContent = `${right.count} 筆`;
  $("leader").textContent = gap === null ? "-" : gap > 0 ? left.label : gap < 0 ? right.label : "平手";
  $("leaderGap").textContent = gap === null ? "尚無差距" : `平均分差距 ${fmt.format(Math.abs(gap))}`;
}

function renderPlatformTable(rows) {
  const stats = [groupStats(rows, "left"), groupStats(rows, "right")];
  $("platformTable").innerHTML = stats.map((item) => `
    <tr>
      <td>${item.label}</td>
      <td>${item.successRate === null ? "-" : pct.format(item.successRate)}</td>
      <td>${item.noCarCount}</td>
      <td>${item.count}</td>
      <td>${item.avgScore === null ? "-" : fmt.format(item.avgScore)}</td>
      <td>${item.goodRate === null ? "-" : pct.format(item.goodRate)}</td>
      <td>${item.badRate === null ? "-" : pct.format(item.badRate)}</td>
      <td>${item.avgFare === null ? "-" : currency.format(item.avgFare)}</td>
    </tr>
  `).join("");
}

function renderDimensionBars(rows) {
  const html = dimensions.map((dimension) => {
    const left = dimensionAverage(rows, "left", dimension.key);
    const right = dimensionAverage(rows, "right", dimension.key);
    const gap = left !== null && right !== null ? left - right : null;
    const width = gap === null ? 0 : Math.min(100, Math.abs(gap) / 2 * 100);
    return `
      <div class="bar-row">
        <div class="bar-label">${dimension.label}</div>
        <div class="bar-track" aria-label="${dimension.label} 差距">
          <div class="bar-fill ${gap < 0 ? "negative" : ""}" style="width:${width}%"></div>
        </div>
        <span class="score-pill">${left === null ? "-" : fmt.format(left)}</span>
        <span class="score-pill">${right === null ? "-" : fmt.format(right)}</span>
        <span class="gap ${gap < 0 ? "negative" : ""}">${gap === null ? "-" : (gap > 0 ? "+" : "") + fmt.format(gap)}</span>
      </div>
    `;
  }).join("");
  $("dimensionBars").innerHTML = html || $("emptyTemplate").innerHTML;
}

function renderInsights(rows) {
  const comparisons = dimensions.map((dimension) => {
    const left = dimensionAverage(rows, "left", dimension.key);
    const right = dimensionAverage(rows, "right", dimension.key);
    return { label: dimension.label, gap: left !== null && right !== null ? left - right : null };
  }).filter((item) => item.gap !== null);
  const advantages = comparisons.filter((item) => item.gap > 0.2).sort((a, b) => b.gap - a.gap);
  const weaknesses = comparisons.filter((item) => item.gap < -0.2).sort((a, b) => a.gap - b.gap);
  const lowAbsolute = dimensions.map((dimension) => ({
    label: dimension.label,
    score: dimensionAverage(rows, "left", dimension.key),
  })).filter((item) => item.score !== null && item.score < 3.5).sort((a, b) => a.score - b.score);
  const mode = selectedMode();
  const cards = [
    [`${mode.leftLabel}優勢 Top 3`, advantages.length ? advantages.slice(0, 3).map((item) => `${item.label} +${fmt.format(item.gap)}`).join("、") : "目前沒有明顯優勢構面"],
    [`${mode.leftLabel}待改善 Top 3`, weaknesses.length ? weaknesses.slice(0, 3).map((item) => `${item.label} ${fmt.format(item.gap)}`).join("、") : "目前沒有明顯落後構面"],
    ["絕對低分提醒", lowAbsolute.length ? lowAbsolute.slice(0, 3).map((item) => `${item.label} ${fmt.format(item.score)}`).join("、") : "目前沒有低於 3.5 分的構面"],
  ];
  $("insightList").innerHTML = cards.map(([title, body]) => `<div class="insight"><b>${title}</b><span>${body}</span></div>`).join("");
}

function renderLowScores(rows) {
  const lows = dimensions.map((dimension) => ({
    label: dimension.label,
    score: dimensionAverage(rows, "left", dimension.key),
  })).filter((item) => item.score !== null).sort((a, b) => a.score - b.score).slice(0, 5);
  $("lowScoreList").innerHTML = lows.map((item, index) => `
    <div class="rank-item">
      <span class="rank-index">${index + 1}</span>
      <b>${item.label}</b>
      <strong>${fmt.format(item.score)}</strong>
    </div>
  `).join("") || $("emptyTemplate").innerHTML;
}

function renderManagementNotes(rows) {
  const left = groupStats(rows, "left");
  const right = groupStats(rows, "right");
  const sampleNote = left.count + right.count < 10 ? "目前樣本數偏少，建議累積更多趟次後再判讀趨勢。" : "樣本數已可初步觀察趨勢。";
  const gap = left.avgScore !== null && right.avgScore !== null ? left.avgScore - right.avgScore : null;
  const gapNote = gap === null ? "尚無足夠資料比較兩側平均分。" : gap >= 0 ? `${left.label} 目前高於 ${right.label} ${fmt.format(gap)} 分。` : `${left.label} 目前低於 ${right.label} ${fmt.format(Math.abs(gap))} 分。`;
  const noCarNote = `${left.label} 未叫到 ${left.noCarCount} 筆；${right.label} 未叫到 ${right.noCarCount} 筆。`;
  const cards = [["樣本提醒", sampleNote], ["差距提醒", gapNote], ["未叫到提醒", noCarNote]];
  $("managementNotes").innerHTML = cards.map(([title, body]) => `<div class="insight"><b>${title}</b><span>${body}</span></div>`).join("");
}

function renderBranchTable(rows) {
  const branches = Array.from(new Set(rows.map((row) => row.分公司).filter(Boolean))).sort();
  $("branchTable").innerHTML = branches.map((branch) => {
    const scoped = rows.filter((row) => row.分公司 === branch);
    const leftRows = rowsForSide(scoped, "left").filter((row) => row.加權總分 !== null);
    const rightRows = rowsForSide(scoped, "right").filter((row) => row.加權總分 !== null);
    const allRows = [...leftRows, ...rightRows];
    const left = average(leftRows.map((row) => row.加權總分));
    const right = average(rightRows.map((row) => row.加權總分));
    return `
      <tr>
        <td>${branch}</td>
        <td>${allRows.length}</td>
        <td>${allRows.length ? fmt.format(average(allRows.map((row) => row.加權總分))) : "-"}</td>
        <td>${left === null ? "-" : fmt.format(left)}</td>
        <td>${right === null ? "-" : fmt.format(right)}</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="5">${$("emptyTemplate").innerHTML}</td></tr>`;
}

function renderPeriodTable(rows) {
  const modeRows = [...rowsForSide(rows, "left"), ...rowsForSide(rows, "right")];
  const periods = ["早尖峰(7-9)", "晚尖峰(17-19)", "離峰", ...Array.from(new Set(modeRows.map((row) => row.搭車時段).filter(Boolean)))];
  const uniquePeriods = Array.from(new Set(periods)).filter((period) => modeRows.some((row) => row.搭車時段 === period));

  $("periodTable").innerHTML = uniquePeriods.map((period) => {
    const scoped = modeRows.filter((row) => row.搭車時段 === period);
    const scored = scoped.filter((row) => row.加權總分 !== null);
    const attempts = scoped.filter((row) => row.是否有叫到車輛);
    const successRate = attempts.length ? attempts.filter((row) => row.是否有叫到車輛 === "是").length / attempts.length : null;
    const avgScore = average(scored.map((row) => row.加權總分));
    const avgFare = average(scored.map((row) => row.實際車資));
    return `
      <tr>
        <td>${period}</td>
        <td>${scored.length}</td>
        <td>${successRate === null ? "-" : pct.format(successRate)}</td>
        <td>${avgScore === null ? "-" : fmt.format(avgScore)}</td>
        <td>${avgFare === null ? "-" : currency.format(avgFare)}</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="5">${$("emptyTemplate").innerHTML}</td></tr>`;
}

function classifyFeedback(text) {
  const value = String(text || "");
  if (/車資|付款|路線|收據|費用/.test(value)) return "路線車資付款";
  if (/安全|急煞|急加速|危險|滑手機|分心/.test(value)) return "行車安全";
  if (/乾淨|整潔|味|溫度|座椅|空間/.test(value)) return "車內環境";
  if (/態度|禮貌|問候|聊天|親切|溝通/.test(value)) return "服務態度";
  if (/App|定位|派遣|等候|接單|無車/.test(value)) return "App/派車";
  return "其他";
}

function renderFeedback(rows) {
  const modeRows = [...rowsForSide(rows, "left"), ...rowsForSide(rows, "right")];
  const recent = modeRows.filter((row) => row.最滿意 || row.最需改善).sort((a, b) => String(b.搭乘日期).localeCompare(String(a.搭乘日期))).slice(0, 8);
  $("feedbackList").innerHTML = recent.map((row) => {
    const text = row.最需改善 || row.最滿意;
    return `
      <div class="feedback">
        <small>${row.搭乘日期 || row.月份}｜${row.分公司}｜${row.平台}${row.車種 ? `｜${row.車種}` : ""}｜${classifyFeedback(text)}</small>
        <b>${row.最滿意 || "未填最滿意項目"}</b>
        <span>${row.最需改善 || "未填改善項目"}</span>
      </div>
    `;
  }).join("") || $("emptyTemplate").innerHTML;
}

function render() {
  const mode = selectedMode();
  $("platformTitle").textContent = mode.title;
  $("dimensionHint").textContent = `正值代表 ${mode.leftLabel} 高於 ${mode.rightLabel}`;
  $("leftBranchHeader").textContent = mode.leftLabel;
  $("rightBranchHeader").textContent = mode.rightLabel;
  fillSelect($("monthFilter"), uniqueOptions("月份"), state.filters.month);
  fillSelect($("branchFilter"), uniqueOptions("分公司"), state.filters.branch);
  fillSelect($("periodFilter"), uniqueOptions("搭車時段"), state.filters.period);
  $("compareMode").value = state.filters.compareMode;
  const rows = getFilteredRows();
  renderKpis(rows);
  renderPlatformTable(rows);
  renderDimensionBars(rows);
  renderInsights(rows);
  renderLowScores(rows);
  renderManagementNotes(rows);
  renderBranchTable(rows);
  renderPeriodTable(rows);
  renderFeedback(rows);
}

async function loadData() {
  const isSample = state.source === SAMPLE_SOURCE;
  $("sourceLabel").textContent = isSample ? "資料來源：範例資料" : "資料來源：Google Sheets";
  let text = "";
  try {
    const response = await fetch(`${state.source}${state.source.includes("?") ? "&" : "?"}_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`資料讀取失敗：${response.status}`);
    text = await response.text();
  } catch (error) {
    if (state.source.includes("docs.google.com/spreadsheets")) text = await loadGoogleSheetViaJsonp(state.source);
    else throw error;
  }
  if (text.trim().startsWith("<")) {
    if (state.source.includes("docs.google.com/spreadsheets")) text = await loadGoogleSheetViaJsonp(state.source);
    else throw new Error("目前貼到的是網頁連結，不是資料連結。請改貼 Google Sheets 編輯網址，或發布 Dashboard資料 分頁為 CSV。");
  }
  state.rows = normalizeRows(parseCsv(text));
  if (!state.rows.length) throw new Error("已讀到資料，但找不到必要欄位。請確認來源是 Dashboard資料 分頁。");
  $("refreshLabel").textContent = `更新時間：${new Date().toLocaleString("zh-TW")}`;
  render();
}

function extractSpreadsheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([^/]+)/);
  return match ? match[1] : "";
}

function loadGoogleSheetViaJsonp(url) {
  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId || spreadsheetId === "e") throw new Error("請改貼試算表編輯網址，也就是 /spreadsheets/d/試算表ID/edit 那個連結。");
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const sheetName = encodeURIComponent("Dashboard資料");
    window.google = window.google || {};
    window.google.visualization = window.google.visualization || {};
    window.google.visualization.Query = window.google.visualization.Query || {};
    window.google.visualization.Query.setResponse = (payload) => {
      script.remove();
      if (payload.status === "error") reject(new Error(payload.errors?.[0]?.detailed_message || "Google Sheets 讀取失敗"));
      else resolve(gvizToCsv(payload.table));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Google Sheets 讀取失敗。請確認試算表已共用為知道連結者可檢視。"));
    };
    script.src = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=${sheetName}&tqx=out:json&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function gvizToCsv(table) {
  const headers = table.cols.map((col) => csvEscape(col.label || col.id || ""));
  const rows = table.rows.map((row) => row.c.map((cell) => csvEscape(cell?.f ?? cell?.v ?? "")).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function bindEvents() {
  $("compareMode").addEventListener("change", (event) => {
    state.filters.compareMode = event.target.value;
    render();
  });
  $("monthFilter").addEventListener("change", (event) => {
    state.filters.month = event.target.value;
    render();
  });
  $("branchFilter").addEventListener("change", (event) => {
    state.filters.branch = event.target.value;
    render();
  });
  $("periodFilter").addEventListener("change", (event) => {
    state.filters.period = event.target.value;
    render();
  });
  $("refreshButton").addEventListener("click", () => loadData().catch(showError));
}

function showError(error) {
  $("refreshLabel").textContent = error.message;
  console.error(error);
}

bindEvents();
loadData().catch(showError);
setInterval(() => loadData().catch(showError), REFRESH_MS);

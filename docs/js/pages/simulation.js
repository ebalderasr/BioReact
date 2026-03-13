let chartZoomScale = 1;
let lastChartPayload = null;

function updateSimulationSummary(state, engineText = "UI conectada") {
  const modelNode = document.querySelector('[data-summary="model"]');
  const controlNode = document.querySelector('[data-summary="control"]');
  const modeNode = document.querySelector('[data-summary="mode"]');
  const engineNode = document.querySelector('[data-summary="engine"]');

  if (modelNode) modelNode.textContent = state.kinetics || "—";
  if (controlNode) controlNode.textContent = state.controlStrategy || "—";
  if (modeNode) modeNode.textContent = state.preset || "Exploración";
  if (engineNode) engineNode.textContent = engineText;
}

function syncAndPersistSimulationForm(form) {
  const state = collectFormState(form);
  saveBioreactState(state);
  updateSimulationSummary(state, "UI conectada");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return "—";
  return Number(value).toFixed(digits);
}

function updateZoomLabel() {
  const label = document.getElementById("chart-zoom-label");
  if (label) {
    label.textContent = `${Math.round(chartZoomScale * 100)}%`;
  }
}

function setChartZoom(scale) {
  chartZoomScale = clamp(scale, 1, 2.5);
  updateZoomLabel();

  if (lastChartPayload) {
    renderSeriesChart(lastChartPayload);
  }
}

function resetTemporalTablePlaceholder() {
  const tbody = document.getElementById("sim-timepoints-table-body");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="4">La tabla temporal aparecerá cuando Monod RK4 esté activo.</td>
    </tr>
  `;
}

function resetPhasePlaceholder(message = "Ejecuta una simulación Monod para generar trayectoria y nullclines.") {
  const plotNode = document.getElementById("sim-phase-plot");
  const summaryBody = document.getElementById("sim-phase-summary-body");
  const noteNode = document.getElementById("sim-phase-note");

  if (plotNode) {
    plotNode.innerHTML = `<span>${message}</span>`;
  }

  if (summaryBody) {
    summaryBody.innerHTML = `
      <tr>
        <td>Estado</td>
        <td>—</td>
        <td>La información aparecerá cuando Monod RK4 esté activo.</td>
      </tr>
    `;
  }

  if (noteNode) {
    noteNode.textContent = "Por ahora el plano de fase real está habilitado solo para Monod.";
  }
}

function computeInitialMu(state) {
  const muMax = Number(state.muMax) || 0;
  const ks = Number(state.ks) || 0;
  const s0 = Math.max(Number(state.s0) || 0, 0);
  const inhibition = Math.max(Number(state.inhibitionParam) || 0, 0);

  if (state.kinetics === "Haldane") {
    const denom = ks + s0 + (inhibition > 0 ? (s0 * s0) / inhibition : 0);
    return denom > 0 ? (muMax * s0) / denom : 0;
  }

  if (state.kinetics === "Inhibición por producto") {
    const p0 = Math.max(Number(state.p0) || 0, 0);
    const pMax = inhibition > 0 ? inhibition : 1;
    const monod = (ks + s0) > 0 ? (muMax * s0) / (ks + s0) : 0;
    const inhibitionFactor = clamp(1 - (p0 / pMax), 0, 1);
    return monod * inhibitionFactor;
  }

  return (ks + s0) > 0 ? (muMax * s0) / (ks + s0) : 0;
}

function inferRegime(state, muInitial) {
  const dilution = Number(state.dilution) || 0;
  const net = muInitial - dilution;
  const s0 = Number(state.s0) || 0;
  const sr = Number(state.sr) || 0;

  let diagnosis = "Indeterminado";
  let washoutRisk = "Medio";
  let interpretation = "La tendencia inicial no es clara.";

  if (net < -0.02) {
    diagnosis = "Tendencia inicial a lavado";
    washoutRisk = "Alto";
    interpretation = "Al inicio, la dilución supera al crecimiento específico.";
  } else if (net > 0.02) {
    diagnosis = "Tendencia inicial a crecimiento";
    washoutRisk = "Bajo";
    interpretation = "Al inicio, el crecimiento específico supera a la dilución.";
  } else {
    diagnosis = "Cerca del umbral";
    washoutRisk = "Medio";
    interpretation = "El sistema arranca cerca de la frontera entre crecimiento y lavado.";
  }

  if (state.kinetics === "Haldane" && s0 > sr * 0.7) {
    interpretation = "El sustrato inicial es alto; podrían aparecer efectos de inhibición por sustrato.";
  }

  if (state.kinetics === "Inhibición por producto" && (Number(state.p0) || 0) > 0) {
    interpretation = "La presencia inicial de producto ya reduce la velocidad específica de crecimiento.";
  }

  return {
    net,
    diagnosis,
    washoutRisk,
    interpretation
  };
}

function generatePreviewSeries(state, muInitial, regime) {
  const tFinal = Math.max(Number(state.tFinal) || 80, 1);
  const x0 = Math.max(Number(state.x0) || 0, 0);
  const s0 = Math.max(Number(state.s0) || 0, 0);
  const p0 = Math.max(Number(state.p0) || 0, 0);
  const sr = Math.max(Number(state.sr) || 0, 0);

  const points = [];
  const count = 12;
  const growthBias = clamp(regime.net * 6, -1, 1);

  for (let i = 0; i < count; i += 1) {
    const t = (tFinal * i) / (count - 1);
    const frac = i / (count - 1);

    let x = x0;
    let s = s0;
    let p = p0;

    if (growthBias >= 0) {
      x = x0 * (1 + 1.8 * growthBias * frac);
      s = s0 + (sr - s0) * frac * 0.45 - 0.35 * sr * growthBias * frac;
      p = p0 + 0.25 * x0 * frac;
    } else {
      x = x0 * (1 + 1.2 * growthBias * frac);
      s = s0 + (sr - s0) * frac * 0.75;
      p = Math.max(0, p0 + 0.08 * x0 * frac);
    }

    x = Math.max(x, 0);
    s = Math.max(s, 0);
    p = Math.max(p, 0);

    points.push({ t, x, s, p });
  }

  return points;
}

function buildPath(points, key, width, height, padding, maxValue, tMax) {
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  return points.map((point, index) => {
    const x = padding.left + (point.t / Math.max(tMax, 1e-9)) * innerWidth;
    const y = padding.top + innerHeight - ((point[key] || 0) / Math.max(maxValue, 1e-9)) * innerHeight;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function renderSeriesChart(payload) {
  lastChartPayload = payload;

  const container = document.getElementById("sim-preview-plot");
  if (!container) return;

  const baseWidth = 920;
  const baseHeight = 420;
  const width = baseWidth;
  const height = baseHeight;
  const renderWidth = Math.round(baseWidth * chartZoomScale);
  const renderHeight = Math.round(baseHeight * chartZoomScale);

  const padding = {
    top: 24,
    right: 24,
    bottom: 64,
    left: 78
  };

  const { points, series, metaLeft, metaRight, xLabel, yLabel } = payload;
  const tMax = Math.max(points[points.length - 1]?.t || 1, 1);
  const maxValue = Math.max(
    1,
    ...series.flatMap((item) => points.map((p) => Number(p[item.key]) || 0))
  );

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const yTicks = [0, maxValue / 2, maxValue];
  const xTicks = [0, tMax / 2, tMax];

  const gridLinesY = yTicks.map((tick) => {
    const y = padding.top + innerHeight - (tick / Math.max(maxValue, 1e-9)) * innerHeight;
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" fill="rgba(255,255,255,0.7)" font-size="12">${formatNumber(tick, 2)}</text>
    `;
  }).join("");

  const gridLinesX = xTicks.map((tick) => {
    const x = padding.left + (tick / Math.max(tMax, 1e-9)) * innerWidth;
    return `
      <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
      <text x="${x}" y="${height - padding.bottom + 20}" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="12">${formatNumber(tick, 1)}</text>
    `;
  }).join("");

  const paths = series.map((item) => {
    const path = buildPath(points, item.key, width, height, padding, maxValue, tMax);
    return `<path d="${path}" fill="none" stroke="${item.color}" stroke-width="3" stroke-linecap="round" />`;
  }).join("");

  const legend = series.map((item) => `
    <span class="preview-legend-item" style="color:${item.color};">
      <span class="preview-line-chip"></span>${item.label}
    </span>
  `).join("");

  container.innerHTML = `
    <div class="preview-chart-wrap">
      <div class="preview-chart-meta">
        <span>${metaLeft}</span>
        <span>${metaRight}</span>
      </div>

      <div class="preview-svg-stage">
        <svg
          class="preview-svg"
          viewBox="0 0 ${width} ${height}"
          width="${renderWidth}"
          height="${renderHeight}"
          role="img"
          aria-label="Curvas temporales"
        >
          <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>

          ${gridLinesY}
          ${gridLinesX}

          <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.16)" stroke-width="1.4" />
          <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.16)" stroke-width="1.4" />

          ${paths}

          <text
            x="${padding.left + innerWidth / 2}"
            y="${height - 18}"
            text-anchor="middle"
            fill="rgba(255,255,255,0.85)"
            font-size="14"
          >
            ${xLabel}
          </text>

          <text
            x="20"
            y="${padding.top + innerHeight / 2}"
            text-anchor="middle"
            transform="rotate(-90 20 ${padding.top + innerHeight / 2})"
            fill="rgba(255,255,255,0.85)"
            font-size="14"
          >
            ${yLabel}
          </text>
        </svg>
      </div>

      <div class="preview-legend">
        ${legend}
      </div>
    </div>
  `;
}

function renderPreviewChart(points, state, regime) {
  renderSeriesChart({
    points,
    series: [
      { key: "x", label: "X", color: "#a6ce63" },
      { key: "s", label: "S", color: "#7cc7ff" },
      { key: "p", label: "P", color: "#ffb86b" }
    ],
    metaLeft: "Vista previa cualitativa basada en μ(S₀), D y tendencia inicial",
    metaRight: `${state.kinetics} · ${regime.diagnosis}`,
    xLabel: "Tiempo (h)",
    yLabel: "Magnitud relativa"
  });
}

function renderMonodChart(points, state, steps, dt) {
  renderSeriesChart({
    points,
    series: [
      { key: "x", label: "X", color: "#a6ce63" },
      { key: "s", label: "S", color: "#7cc7ff" }
    ],
    metaLeft: "Integración real RK4 del sistema Monod",
    metaRight: `${steps} pasos · dt = ${formatNumber(dt, 4)} h`,
    xLabel: "Tiempo (h)",
    yLabel: "Concentración (g/L)"
  });
}

function renderPreviewTable(state, muInitial, regime, points) {
  const tbody = document.getElementById("sim-preview-table-body");
  if (!tbody) return;

  const finalPoint = points[points.length - 1];

  const rows = [
    {
      label: "μ inicial",
      value: formatNumber(muInitial, 4),
      note: "Velocidad específica calculada con la cinética seleccionada en S₀."
    },
    {
      label: "μ − D inicial",
      value: formatNumber(regime.net, 4),
      note: regime.net >= 0
        ? "Balance inicial favorable al crecimiento."
        : "Balance inicial desfavorable; domina la dilución."
    },
    {
      label: "X preview final",
      value: formatNumber(finalPoint.x, 4),
      note: "Valor cualitativo de referencia, no una integración RK4."
    },
    {
      label: "S preview final",
      value: formatNumber(finalPoint.s, 4),
      note: "Tendencia cualitativa del sustrato bajo el régimen inicial."
    },
    {
      label: "Diagnóstico",
      value: regime.diagnosis,
      note: regime.interpretation
    }
  ];

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.label}</td>
      <td>${row.value}</td>
      <td>${row.note}</td>
    </tr>
  `).join("");

  resetTemporalTablePlaceholder();
}

function inferMonodOutcome(state, points) {
  const params = state;
  const finalPoint = points[points.length - 1];
  const initialX = Math.max(Number(state.x0) || 0, 0);
  const dilution = Number(state.dilution) || 0;

  const muFinal = window.BioreactKinetics.monodMu(params, { s: finalPoint.s });
  const netFinal = muFinal - dilution;
  const xMax = Math.max(...points.map((p) => p.x));
  const sMin = Math.min(...points.map((p) => p.s));

  let diagnosis = "Transitorio";
  let interpretation = "La trayectoria muestra una evolución dinámica real bajo Monod.";

  if (finalPoint.x <= Math.max(1e-4, initialX * 0.05)) {
    diagnosis = "Washout marcado";
    interpretation = "La biomasa cae a valores muy bajos frente a la dilución impuesta.";
  } else if (netFinal < 0 && finalPoint.x < initialX) {
    diagnosis = "Declive neto";
    interpretation = "Al final de la simulación, el crecimiento específico es menor que la dilución.";
  } else if (Math.abs(netFinal) <= 0.01) {
    diagnosis = "Cercano a equilibrio";
    interpretation = "Al final, μ y D son parecidos, consistente con aproximación a estado estacionario.";
  } else if (finalPoint.x > initialX) {
    diagnosis = "Crecimiento sostenido";
    interpretation = "La biomasa aumenta y el sistema no muestra tendencia inmediata a lavado.";
  }

  return {
    muFinal,
    netFinal,
    xMax,
    sMin,
    diagnosis,
    interpretation
  };
}

function renderMonodTable(state, points, steps, dt) {
  const tbody = document.getElementById("sim-preview-table-body");
  if (!tbody) return;

  const finalPoint = points[points.length - 1];
  const outcome = inferMonodOutcome(state, points);

  const rows = [
    {
      label: "Método",
      value: "RK4",
      note: "Integración numérica real del sistema Monod en dos estados: X y S."
    },
    {
      label: "Pasos / dt",
      value: `${steps} / ${formatNumber(dt, 4)} h`,
      note: "Resolución temporal usada para esta corrida."
    },
    {
      label: "X final",
      value: formatNumber(finalPoint.x, 4),
      note: `Máximo observado: ${formatNumber(outcome.xMax, 4)}`
    },
    {
      label: "S final",
      value: formatNumber(finalPoint.s, 4),
      note: `Mínimo observado: ${formatNumber(outcome.sMin, 4)}`
    },
    {
      label: "μ final",
      value: formatNumber(outcome.muFinal, 4),
      note: `μ − D final = ${formatNumber(outcome.netFinal, 4)}`
    },
    {
      label: "Diagnóstico",
      value: outcome.diagnosis,
      note: outcome.interpretation
    }
  ];

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.label}</td>
      <td>${row.value}</td>
      <td>${row.note}</td>
    </tr>
  `).join("");
}

function sampleTimePoints(points, count = 10) {
  if (!Array.isArray(points) || points.length === 0) return [];

  if (points.length <= count) return points;

  const indices = new Set();
  for (let i = 0; i < count; i += 1) {
    const idx = Math.round((i / (count - 1)) * (points.length - 1));
    indices.add(idx);
  }

  return [...indices].sort((a, b) => a - b).map((idx) => points[idx]);
}

function renderMonodTimepointsTable(points, state) {
  const tbody = document.getElementById("sim-timepoints-table-body");
  if (!tbody) return;

  const sampled = sampleTimePoints(points, 10);

  tbody.innerHTML = sampled.map((point) => {
    const mu = window.BioreactKinetics.monodMu(state, { s: point.s });

    return `
      <tr>
        <td>${formatNumber(point.t, 2)}</td>
        <td>${formatNumber(point.x, 4)}</td>
        <td>${formatNumber(point.s, 4)}</td>
        <td>${formatNumber(mu, 4)}</td>
      </tr>
    `;
  }).join("");
}

function computeMonodEquilibria(state) {
  const muMax = Math.max(Number(state.muMax) || 0, 0);
  const ks = Math.max(Number(state.ks) || 0, 0);
  const dilution = Math.max(Number(state.dilution) || 0, 0);
  const sr = Math.max(Number(state.sr) || 0, 0);
  const yxs = Math.max(Number(state.yxs) || 0, 0);

  const washout = { s: sr, x: 0 };

  let nonWashout = null;

  if (muMax > dilution && (muMax - dilution) > 1e-12) {
    const sStar = (dilution * ks) / (muMax - dilution);
    const xStar = yxs * (sr - sStar);

    if (sStar >= 0 && xStar >= 0 && sStar <= sr) {
      nonWashout = { s: sStar, x: xStar };
    }
  }

  return { washout, nonWashout };
}

function generateMonodSubstrateNullcline(state, sMax) {
  const sr = Math.max(Number(state.sr) || 0, 0);
  const dilution = Math.max(Number(state.dilution) || 0, 0);
  const yxs = Math.max(Number(state.yxs) || 0, 0);
  const points = [];

  const upper = Math.max(1e-6, Math.min(sMax, sr));
  const n = 140;

  for (let i = 1; i <= n; i += 1) {
    const s = (upper * i) / n;
    const mu = window.BioreactKinetics.monodMu(state, { s });

    if (mu <= 1e-12) continue;

    const x = (yxs * dilution * (sr - s)) / mu;

    if (x >= 0) {
      points.push({ s, x });
    }
  }

  return points;
}

function renderPhasePlot(points, state) {
  const container = document.getElementById("sim-phase-plot");
  const summaryBody = document.getElementById("sim-phase-summary-body");
  const noteNode = document.getElementById("sim-phase-note");

  if (!container) return;

  const equilibria = computeMonodEquilibria(state);
  const startPoint = points[0];
  const finalPoint = points[points.length - 1];

  const sMax = Math.max(
    Number(state.sr) || 0,
    ...points.map((p) => p.s),
    equilibria.nonWashout?.s || 0,
    equilibria.washout.s || 0,
    Number(state.s0) || 0,
    1
  ) * 1.08;

  const xMax = Math.max(
    ...points.map((p) => p.x),
    equilibria.nonWashout?.x || 0,
    Number(state.x0) || 0,
    1
  ) * 1.12;

  const width = 920;
  const height = 460;
  const padding = { top: 26, right: 24, bottom: 64, left: 78 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const mapX = (s) => padding.left + (s / Math.max(sMax, 1e-9)) * innerWidth;
  const mapY = (x) => padding.top + innerHeight - (x / Math.max(xMax, 1e-9)) * innerHeight;

  const trajectoryPath = points.map((p, index) => {
    return `${index === 0 ? "M" : "L"} ${mapX(p.s).toFixed(2)} ${mapY(p.x).toFixed(2)}`;
  }).join(" ");

  const substrateNullcline = generateMonodSubstrateNullcline(state, sMax);
  const substratePath = substrateNullcline.map((p, index) => {
    return `${index === 0 ? "M" : "L"} ${mapX(p.s).toFixed(2)} ${mapY(p.x).toFixed(2)}`;
  }).join(" ");

  let biomassNullclineLine = "";
  if (equilibria.nonWashout) {
    const sx = mapX(equilibria.nonWashout.s);
    biomassNullclineLine = `
      <line
        x1="${sx}"
        y1="${padding.top}"
        x2="${sx}"
        y2="${height - padding.bottom}"
        stroke="#ffb86b"
        stroke-width="2.5"
        stroke-dasharray="8 6"
      />
    `;
  }

  const xTicks = [0, sMax / 2, sMax];
  const yTicks = [0, xMax / 2, xMax];

  const xGrid = xTicks.map((tick) => {
    const x = mapX(tick);
    return `
      <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
      <text x="${x}" y="${height - padding.bottom + 20}" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="12">${formatNumber(tick, 2)}</text>
    `;
  }).join("");

  const yGrid = yTicks.map((tick) => {
    const y = mapY(tick);
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" fill="rgba(255,255,255,0.7)" font-size="12">${formatNumber(tick, 2)}</text>
    `;
  }).join("");

  const equilibriumCircle = equilibria.nonWashout ? `
    <circle cx="${mapX(equilibria.nonWashout.s)}" cy="${mapY(equilibria.nonWashout.x)}" r="6" fill="#d29bff" />
  ` : "";

  const washoutCircle = `
    <circle cx="${mapX(equilibria.washout.s)}" cy="${mapY(equilibria.washout.x)}" r="6" fill="#aab5c8" />
  `;

  const startCircle = `
    <circle cx="${mapX(startPoint.s)}" cy="${mapY(startPoint.x)}" r="6" fill="#ffffff" />
  `;

  const finalCircle = `
    <circle cx="${mapX(finalPoint.s)}" cy="${mapY(finalPoint.x)}" r="6" fill="#a6ce63" />
  `;

  container.innerHTML = `
    <div class="preview-chart-wrap">
      <div class="preview-chart-meta">
        <span>Trayectoria RK4 en el plano X vs S con nullclines de Monod</span>
        <span>Solo disponible para Monod</span>
      </div>

      <div class="preview-svg-stage">
        <svg class="preview-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Plano de fase Monod">
          <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>

          ${xGrid}
          ${yGrid}

          <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.16)" stroke-width="1.4" />
          <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.16)" stroke-width="1.4" />

          ${substratePath ? `<path d="${substratePath}" fill="none" stroke="#7cc7ff" stroke-width="2.5" stroke-dasharray="10 6" />` : ""}
          ${biomassNullclineLine}
          <path d="${trajectoryPath}" fill="none" stroke="#a6ce63" stroke-width="3.2" stroke-linecap="round" />

          ${startCircle}
          ${finalCircle}
          ${washoutCircle}
          ${equilibriumCircle}

          <text x="${padding.left + innerWidth / 2}" y="${height - 18}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="14">
            S (g/L)
          </text>

          <text
            x="20"
            y="${padding.top + innerHeight / 2}"
            text-anchor="middle"
            transform="rotate(-90 20 ${padding.top + innerHeight / 2})"
            fill="rgba(255,255,255,0.85)"
            font-size="14"
          >
            X (g/L)
          </text>
        </svg>
      </div>

      <div class="preview-legend">
        <span class="preview-legend-item" style="color:#a6ce63;"><span class="preview-line-chip"></span>Trayectoria RK4</span>
        <span class="preview-legend-item" style="color:#7cc7ff;"><span class="preview-line-chip"></span>dS/dt = 0</span>
        <span class="preview-legend-item" style="color:#ffb86b;"><span class="preview-line-chip"></span>dX/dt = 0</span>
        <span class="preview-legend-item" style="color:#ffffff;"><span class="preview-point-chip"></span>Inicio</span>
        <span class="preview-legend-item" style="color:#a6ce63;"><span class="preview-point-chip"></span>Final</span>
        <span class="preview-legend-item" style="color:#aab5c8;"><span class="preview-point-chip"></span>Washout</span>
        ${equilibria.nonWashout ? `<span class="preview-legend-item" style="color:#d29bff;"><span class="preview-point-chip"></span>Equilibrio no-washout</span>` : ""}
      </div>
    </div>
  `;

  if (summaryBody) {
    const rows = [
      {
        label: "Inicio",
        coords: `(${formatNumber(startPoint.s, 4)}, ${formatNumber(startPoint.x, 4)})`,
        note: "Condición inicial en el plano S–X."
      },
      {
        label: "Final",
        coords: `(${formatNumber(finalPoint.s, 4)}, ${formatNumber(finalPoint.x, 4)})`,
        note: "Último punto de la trayectoria RK4."
      },
      {
        label: "Washout",
        coords: `(${formatNumber(equilibria.washout.s, 4)}, ${formatNumber(equilibria.washout.x, 4)})`,
        note: "Equilibrio con biomasa nula."
      }
    ];

    if (equilibria.nonWashout) {
      rows.push({
        label: "Equilibrio no-washout",
        coords: `(${formatNumber(equilibria.nonWashout.s, 4)}, ${formatNumber(equilibria.nonWashout.x, 4)})`,
        note: "Intersección esperada de nullclines bajo Monod."
      });
    } else {
      rows.push({
        label: "Equilibrio no-washout",
        coords: "No disponible",
        note: "Con los parámetros actuales, no aparece un equilibrio positivo factible."
      });
    }

    summaryBody.innerHTML = rows.map((row) => `
      <tr>
        <td>${row.label}</td>
        <td>${row.coords}</td>
        <td>${row.note}</td>
      </tr>
    `).join("");
  }

  if (noteNode) {
    noteNode.textContent = equilibria.nonWashout
      ? "La línea vertical dX/dt = 0 aparece cuando μ(S) = D. La curva dS/dt = 0 muestra combinaciones S–X con balance neto de sustrato nulo."
      : "Con los parámetros actuales no aparece un equilibrio positivo factible; por eso solo se marca el punto de washout.";
  }
}

function renderMiniMetrics(muInitial, regime, diagnosisText = null) {
  const muNode = document.getElementById("metric-mu-initial");
  const netNode = document.getElementById("metric-net-initial");
  const washoutNode = document.getElementById("metric-washout-risk");
  const diagnosisNode = document.getElementById("metric-diagnosis");

  if (muNode) muNode.textContent = formatNumber(muInitial, 4);
  if (netNode) netNode.textContent = formatNumber(regime.net, 4);
  if (washoutNode) washoutNode.textContent = regime.washoutRisk;
  if (diagnosisNode) diagnosisNode.textContent = diagnosisText || regime.diagnosis;
}

function runPreviewSimulation(state, engineText = "Vista previa activa") {
  const muInitial = computeInitialMu(state);
  const regime = inferRegime(state, muInitial);
  const points = generatePreviewSeries(state, muInitial, regime);

  renderPreviewChart(points, state, regime);
  renderPreviewTable(state, muInitial, regime, points);
  renderMiniMetrics(muInitial, regime);
  resetPhasePlaceholder("El plano de fase real está disponible por ahora solo para Monod RK4.");
  updateSimulationSummary(state, engineText);
}

function runMonodSimulation(state) {
  const core = window.BioreactCore || {};
  const kinetics = window.BioreactKinetics || {};

  if (
    typeof core.monodRhs !== "function" ||
    typeof core.integrateRK4 !== "function" ||
    typeof core.clampBioreactorState !== "function" ||
    typeof kinetics.monodMu !== "function"
  ) {
    runPreviewSimulation(state, "Fallback preview");
    return;
  }

  const muInitial = kinetics.monodMu(state, { s: Number(state.s0) || 0 });
  const regime = inferRegime(state, muInitial);

  const tFinal = Math.max(Number(state.tFinal) || 80, 1);
  const steps = Math.max(160, Math.min(1200, Math.round(tFinal * 8)));
  const dt = tFinal / steps;

  const points = core.integrateRK4({
    initialState: {
      x: Math.max(Number(state.x0) || 0, 0),
      s: Math.max(Number(state.s0) || 0, 0)
    },
    params: state,
    derivativeFn: core.monodRhs,
    clampFn: core.clampBioreactorState,
    stateKeys: ["x", "s"],
    t0: 0,
    tFinal,
    dt
  });

  renderMonodChart(points, state, steps, dt);
  renderMonodTable(state, points, steps, dt);
  renderMonodTimepointsTable(points, state);
  renderPhasePlot(points, state);

  const outcome = inferMonodOutcome(state, points);
  renderMiniMetrics(muInitial, regime, outcome.diagnosis);
  updateSimulationSummary(state, "Monod RK4 activo");
}

function resetSimulationOutputs(state) {
  const plotNode = document.getElementById("sim-preview-plot");
  const tableNode = document.getElementById("sim-preview-table-body");
  const diagnosisNode = document.getElementById("metric-diagnosis");
  const muNode = document.getElementById("metric-mu-initial");
  const netNode = document.getElementById("metric-net-initial");
  const washoutNode = document.getElementById("metric-washout-risk");

  if (plotNode) {
    plotNode.innerHTML = `<span>Zona principal de gráfica temporal</span>`;
  }

  if (tableNode) {
    tableNode.innerHTML = `
      <tr>
        <td>Estado</td>
        <td>—</td>
        <td>Presiona Simular para generar una vista previa</td>
      </tr>
    `;
  }

  resetTemporalTablePlaceholder();
  resetPhasePlaceholder();

  if (diagnosisNode) diagnosisNode.textContent = "Sin simulación";
  if (muNode) muNode.textContent = "—";
  if (netNode) netNode.textContent = "—";
  if (washoutNode) washoutNode.textContent = "—";

  lastChartPayload = null;
  setChartZoom(1);
  updateSimulationSummary(state, "UI conectada");
}

document.addEventListener("DOMContentLoaded", () => {
  if (typeof initTabs === "function") {
    initTabs(document);
  }

  const form = document.getElementById("sim-config-form");
  const resetButton = document.getElementById("sim-reset-button");
  const simulateButton = document.getElementById("sim-run-button");
  const zoomInButton = document.getElementById("chart-zoom-in");
  const zoomOutButton = document.getElementById("chart-zoom-out");
  const zoomResetButton = document.getElementById("chart-zoom-reset");

  updateZoomLabel();
  resetTemporalTablePlaceholder();
  resetPhasePlaceholder();

  if (!form) return;

  const initialState = loadBioreactState();
  applyStateToForm(form, initialState);
  updateSimulationSummary(initialState, "UI conectada");

  form.addEventListener("input", () => {
    syncAndPersistSimulationForm(form);
  });

  form.addEventListener("change", () => {
    syncAndPersistSimulationForm(form);
  });

  if (zoomInButton) {
    zoomInButton.addEventListener("click", () => {
      setChartZoom(chartZoomScale + 0.25);
    });
  }

  if (zoomOutButton) {
    zoomOutButton.addEventListener("click", () => {
      setChartZoom(chartZoomScale - 0.25);
    });
  }

  if (zoomResetButton) {
    zoomResetButton.addEventListener("click", () => {
      setChartZoom(1);
    });
  }

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      const resetState = resetBioreactState();
      applyStateToForm(form, resetState);
      resetSimulationOutputs(resetState);
    });
  }

  if (simulateButton) {
    simulateButton.addEventListener("click", () => {
      const state = collectFormState(form);
      saveBioreactState(state);

      if (state.kinetics === "Monod") {
        runMonodSimulation(state);
      } else {
        runPreviewSimulation(state, "Vista previa activa");
      }
    });
  }
});

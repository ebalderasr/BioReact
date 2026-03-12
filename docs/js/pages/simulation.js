function updateSimulationSummary(state) {
  const modelNode = document.querySelector('[data-summary="model"]');
  const controlNode = document.querySelector('[data-summary="control"]');
  const modeNode = document.querySelector('[data-summary="mode"]');
  const engineNode = document.querySelector('[data-summary="engine"]');

  if (modelNode) modelNode.textContent = state.kinetics || "—";
  if (controlNode) controlNode.textContent = state.controlStrategy || "—";
  if (modeNode) modeNode.textContent = state.preset || "Exploración";
  if (engineNode) engineNode.textContent = "Vista previa activa";
}

function syncAndPersistSimulationForm(form) {
  const state = collectFormState(form);
  saveBioreactState(state);
  updateSimulationSummary(state);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return "—";
  return Number(value).toFixed(digits);
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

function buildPath(points, key, width, height, padding, maxValue) {
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return points.map((point, index) => {
    const x = padding + (index / (points.length - 1)) * innerWidth;
    const y = padding + innerHeight - ((point[key] || 0) / maxValue) * innerHeight;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function renderPreviewChart(points, state, regime) {
  const container = document.getElementById("sim-preview-plot");
  if (!container) return;

  const width = 700;
  const height = 280;
  const padding = 28;

  const maxValue = Math.max(
    1,
    ...points.map((p) => p.x),
    ...points.map((p) => p.s),
    ...points.map((p) => p.p)
  );

  const pathX = buildPath(points, "x", width, height, padding, maxValue);
  const pathS = buildPath(points, "s", width, height, padding, maxValue);
  const pathP = buildPath(points, "p", width, height, padding, maxValue);

  const gridLines = [0.25, 0.5, 0.75].map((fraction) => {
    const y = padding + (height - padding * 2) * fraction;
    return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;
  }).join("");

  container.innerHTML = `
    <div class="preview-chart-wrap">
      <div class="preview-chart-meta">
        <span>Vista previa cualitativa basada en μ(S₀), D y tendencia inicial</span>
        <span>${state.kinetics} · ${regime.diagnosis}</span>
      </div>

      <svg class="preview-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Vista previa de curvas cualitativas">
        <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
        ${gridLines}
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="rgba(255,255,255,0.16)" stroke-width="1.2" />
        <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="rgba(255,255,255,0.16)" stroke-width="1.2" />

        <path d="${pathX}" fill="none" stroke="#a6ce63" stroke-width="3" stroke-linecap="round" />
        <path d="${pathS}" fill="none" stroke="#7cc7ff" stroke-width="3" stroke-linecap="round" />
        <path d="${pathP}" fill="none" stroke="#ffb86b" stroke-width="3" stroke-linecap="round" />
      </svg>

      <div class="preview-legend">
        <span class="preview-legend-item" style="color:#a6ce63;"><span class="preview-line-chip"></span>X</span>
        <span class="preview-legend-item" style="color:#7cc7ff;"><span class="preview-line-chip"></span>S</span>
        <span class="preview-legend-item" style="color:#ffb86b;"><span class="preview-line-chip"></span>P</span>
      </div>
    </div>
  `;
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
}

function renderMiniMetrics(muInitial, regime) {
  const muNode = document.getElementById("metric-mu-initial");
  const netNode = document.getElementById("metric-net-initial");
  const washoutNode = document.getElementById("metric-washout-risk");
  const diagnosisNode = document.getElementById("metric-diagnosis");

  if (muNode) muNode.textContent = formatNumber(muInitial, 4);
  if (netNode) netNode.textContent = formatNumber(regime.net, 4);
  if (washoutNode) washoutNode.textContent = regime.washoutRisk;
  if (diagnosisNode) diagnosisNode.textContent = regime.diagnosis;
}

function runPreviewSimulation(state) {
  const muInitial = computeInitialMu(state);
  const regime = inferRegime(state, muInitial);
  const points = generatePreviewSeries(state, muInitial, regime);

  renderPreviewChart(points, state, regime);
  renderPreviewTable(state, muInitial, regime, points);
  renderMiniMetrics(muInitial, regime);
  updateSimulationSummary(state);
}

document.addEventListener("DOMContentLoaded", () => {
  if (typeof initTabs === "function") {
    initTabs(document);
  }

  const form = document.getElementById("sim-config-form");
  const resetButton = document.getElementById("sim-reset-button");
  const simulateButton = document.getElementById("sim-run-button");

  if (!form) return;

  const initialState = loadBioreactState();
  applyStateToForm(form, initialState);
  updateSimulationSummary(initialState);

  form.addEventListener("input", () => {
    syncAndPersistSimulationForm(form);
  });

  form.addEventListener("change", () => {
    syncAndPersistSimulationForm(form);
  });

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      const resetState = resetBioreactState();
      applyStateToForm(form, resetState);
      updateSimulationSummary(resetState);

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

      if (diagnosisNode) diagnosisNode.textContent = "Sin simulación";
      if (muNode) muNode.textContent = "—";
      if (netNode) netNode.textContent = "—";
      if (washoutNode) washoutNode.textContent = "—";
    });
  }

  if (simulateButton) {
    simulateButton.addEventListener("click", () => {
      const state = collectFormState(form);
      saveBioreactState(state);
      runPreviewSimulation(state);
      console.log("Preview simulation state:", state);
    });
  }
});

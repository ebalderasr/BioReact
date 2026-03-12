function updateSimulationSummary(state) {
  const modelNode = document.querySelector('[data-summary="model"]');
  const controlNode = document.querySelector('[data-summary="control"]');
  const modeNode = document.querySelector('[data-summary="mode"]');
  const engineNode = document.querySelector('[data-summary="engine"]');

  if (modelNode) modelNode.textContent = state.kinetics || "—";
  if (controlNode) controlNode.textContent = state.controlStrategy || "—";
  if (modeNode) modeNode.textContent = state.preset || "Exploración";
  if (engineNode) engineNode.textContent = "UI conectada";
}

function syncAndPersistSimulationForm(form) {
  const state = collectFormState(form);
  saveBioreactState(state);
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
    });
  }

  if (simulateButton) {
    simulateButton.addEventListener("click", () => {
      const state = collectFormState(form);
      saveBioreactState(state);
      updateSimulationSummary(state);
      console.log("Simulation state ready:", state);
    });
  }
});

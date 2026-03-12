const BIOREACT_STORAGE_KEY = "bioreact.simulation.state.v1";

function getBioreactDefaults() {
  return structuredClone(window.BIOREACT_DEFAULTS || {});
}

function loadBioreactState() {
  const defaults = getBioreactDefaults();

  try {
    const raw = localStorage.getItem(BIOREACT_STORAGE_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch (error) {
    console.error("Could not load saved BioReact state", error);
    return defaults;
  }
}

function saveBioreactState(state) {
  try {
    localStorage.setItem(BIOREACT_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Could not save BioReact state", error);
  }
}

function resetBioreactState() {
  const defaults = getBioreactDefaults();
  saveBioreactState(defaults);
  return defaults;
}

function parseFieldValue(element) {
  if (!element) return null;

  if (element.type === "number") {
    const value = Number(element.value);
    return Number.isFinite(value) ? value : 0;
  }

  return element.value;
}

function collectFormState(form) {
  const data = {};

  if (!form) return data;

  const fields = form.querySelectorAll("input[name], select[name], textarea[name]");

  fields.forEach((field) => {
    data[field.name] = parseFieldValue(field);
  });

  return data;
}

function applyStateToForm(form, state) {
  if (!form || !state) return;

  const fields = form.querySelectorAll("input[name], select[name], textarea[name]");

  fields.forEach((field) => {
    const value = state[field.name];

    if (value === undefined || value === null) return;

    field.value = String(value);
  });
}

async function loadPartials() {
  const includeNodes = document.querySelectorAll("[data-include]");

  for (const node of includeNodes) {
    const file = node.getAttribute("data-include");

    try {
      const response = await fetch(file);

      if (!response.ok) {
        throw new Error(`Could not load ${file}`);
      }

      node.innerHTML = await response.text();
    } catch (error) {
      node.innerHTML = `<p style="padding:1rem;">Error loading partial: ${file}</p>`;
      console.error(error);
    }
  }

  const basePath = document.body.dataset.basePath || "./";

  document.querySelectorAll("[data-route]").forEach((link) => {
    const route = link.getAttribute("data-route");
    link.setAttribute("href", `${basePath}${route}`);
  });
}

document.addEventListener("DOMContentLoaded", loadPartials);

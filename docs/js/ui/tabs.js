function initTabs(scope = document) {
  const tablists = scope.querySelectorAll(".tablist");

  tablists.forEach((tablist) => {
    const tabs = tablist.querySelectorAll(".tab");
    const panelsContainer = tablist.nextElementSibling;

    if (!panelsContainer) return;

    const panels = panelsContainer.querySelectorAll(".tab-panel");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const targetId = tab.dataset.tabTarget;

        tabs.forEach((item) => {
          item.classList.remove("is-active");
          item.setAttribute("aria-selected", "false");
        });

        panels.forEach((panel) => {
          panel.classList.remove("is-active");
          panel.hidden = true;
        });

        tab.classList.add("is-active");
        tab.setAttribute("aria-selected", "true");

        const targetPanel = panelsContainer.querySelector(`#${targetId}`);
        if (targetPanel) {
          targetPanel.classList.add("is-active");
          targetPanel.hidden = false;
        }
      });
    });
  });
}

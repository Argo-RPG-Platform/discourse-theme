import { apiInitializer } from "discourse/lib/api";

export default apiInitializer("1.0", (api) => {
  // ── Active nav link state ─────────────────────────────────────────────────
  // The Forum link is always "active" when on Discourse.
  // Home / Guilds / Campaigns / Marketplace link to app.argo.games and are
  // never active here. We enforce this on every route transition so that any
  // Discourse internal navigation (e.g. clicking Latest → Categories) doesn't
  // accidentally set a wrong active state.
  function syncNavActiveState() {
    const nav = document.getElementById("argo-nav");
    if (!nav) return;

    nav.querySelectorAll(".argo-nav__link").forEach((link) => {
      const key = link.getAttribute("data-argo-nav");
      const isActive = key === "forum";

      link.classList.toggle("argo-nav__link--active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  // ── Category image fallback ───────────────────────────────────────────────
  // When a category has no logo uploaded in Discourse admin, the .category-logo
  // <td> is empty (no <img>). We detect this and add data-no-image to the card
  // so the SCSS ::before gold stripe fallback renders correctly.
  function applyCategoryImageFallbacks() {
    document.querySelectorAll(".category-list-item, tr.category").forEach((card) => {
      const logoEl = card.querySelector(".category-logo");

      if (!logoEl) {
        // No logo cell at all — mark for fallback
        card.setAttribute("data-no-image", "true");
        return;
      }

      const img = logoEl.querySelector("img");
      if (!img) {
        card.setAttribute("data-no-image", "true");
        return;
      }

      // Image exists but may not have loaded yet — use naturalWidth after load
      if (img.complete) {
        if (!img.naturalWidth) card.setAttribute("data-no-image", "true");
      } else {
        img.addEventListener("load", () => {
          if (!img.naturalWidth) card.setAttribute("data-no-image", "true");
        });
        img.addEventListener("error", () => {
          card.setAttribute("data-no-image", "true");
        });
      }
    });
  }

  // ── Table-to-grid DOM fallback (Safari < 15 / old browsers) ─────────────
  // `display: contents` on <tbody> is required for the CSS grid trick.
  // If the browser doesn't support it the categories still render as a table.
  // This function optionally rewrites the category table as <div>s so the
  // CSS grid layout works universally.
  // Only runs when the browser signals it doesn't support display:contents.
  function rewriteCategoryTableIfNeeded() {
    const table = document.querySelector("table.category-list");
    if (!table) return;

    // Quick feature-detect: create a test el and check computed display
    const test = document.createElement("div");
    test.style.display = "contents";
    document.body.appendChild(test);
    const supported =
      window.getComputedStyle(test).display === "contents";
    document.body.removeChild(test);

    if (supported) return; // No rewrite needed

    // Rewrite: table → div.category-list, tr → div.category-list-item,
    // td → div with matching class names
    const grid = document.createElement("div");
    grid.className = "category-list";

    table.querySelectorAll("tr.category-list-item, tr.category").forEach((row) => {
      const card = document.createElement("div");
      card.className = row.className;

      // Copy data attributes
      Array.from(row.attributes).forEach((attr) => {
        if (attr.name !== "class") card.setAttribute(attr.name, attr.value);
      });

      row.querySelectorAll("td").forEach((td) => {
        const div = document.createElement("div");
        div.className = td.className;
        div.innerHTML = td.innerHTML;
        card.appendChild(div);
      });

      grid.appendChild(card);
    });

    table.parentNode.replaceChild(grid, table);
  }

  // ── Move native header buttons into our nav bar ───────────────────────────
  // Moves the sidebar-toggle burger, chat icon, and user menu into #argo-nav
  // on the right side (burger → chat → profile), all after the spacer.
  function integrateNativeHeaderButtons() {
    const inner = document.querySelector(".argo-nav__inner");
    if (!inner) return;

    // Already done
    if (inner.querySelector(".argo-native-buttons")) return;

    const findOutsideNav = (selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && !el.closest("#argo-nav")) return el;
      }
      return null;
    };

    // Sidebar toggle burger — confirmed selector from DOM inspection
    const burgerEl = findOutsideNav([
      ".d-header .header-sidebar-toggle",
      ".d-header .btn-sidebar-toggle",
      ".d-header .hamburger-dropdown",
      ".d-header .header-buttons.start",
    ]);

    // Chat + notifications + user menu
    const rightEl = findOutsideNav([
      ".d-header .header-buttons.end",
      ".d-header .d-header-icons",
      ".d-header .panel",
    ]);

    if (!burgerEl && !rightEl) return;

    // One container for all three, appended after the spacer
    const container = document.createElement("div");
    container.className = "argo-native-buttons argo-native-buttons--right";

    if (burgerEl) container.appendChild(burgerEl); // burger goes first (leftmost)
    if (rightEl)  container.appendChild(rightEl);  // chat + profile after

    inner.appendChild(container);

    // Hide any now-empty leftovers in .contents
    document.querySelectorAll(".d-header .contents > *").forEach((el) => {
      if (el === burgerEl || el === rightEl) return;
      if (!el.textContent.trim() && el.children.length === 0) {
        el.style.display = "none";
      }
    });
  }

  // ── Page change handler ───────────────────────────────────────────────────
  // Discourse is an SPA — we must re-run our DOM work after every route change.
  api.onPageChange(() => {
    syncNavActiveState();

    // Small delay lets Discourse finish rendering the new route's DOM
    setTimeout(() => {
      applyCategoryImageFallbacks();
      rewriteCategoryTableIfNeeded();
      integrateNativeHeaderButtons();
    }, 80);
  });

  // Initial run on first boot
  syncNavActiveState();
  setTimeout(() => {
    applyCategoryImageFallbacks();
    rewriteCategoryTableIfNeeded();
    integrateNativeHeaderButtons();
  }, 80);
});

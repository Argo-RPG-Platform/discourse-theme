import { apiInitializer } from "discourse/lib/api";

export default apiInitializer("1.0", (api) => {
  let cachedSiteCategories;

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
  function syncCategoriesPageState() {
    const isCategoriesPage = window.location.pathname.startsWith("/categories");
    document.body.classList.toggle("argo-categories-page", isCategoriesPage);
  }

  function getSiteCategories() {
    if (cachedSiteCategories) return cachedSiteCategories;

    const preloadedEl = document.getElementById("data-preloaded");
    const encoded = preloadedEl?.dataset?.preloaded;

    if (!encoded) {
      cachedSiteCategories = [];
      return cachedSiteCategories;
    }

    try {
      const decoded = JSON.parse(encoded);
      const sitePayload =
        typeof decoded.site === "string" ? JSON.parse(decoded.site) : decoded.site;

      cachedSiteCategories = sitePayload?.categories || [];
      return cachedSiteCategories;
    } catch (_error) {
      cachedSiteCategories = [];
      return cachedSiteCategories;
    }
  }

  function normalizeImageUrl(value) {
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("//")) return `${window.location.protocol}${trimmed}`;
    if (trimmed.startsWith("/")) return `${window.location.origin}${trimmed}`;

    return trimmed;
  }

  function resolveCategoryImageUrl(category) {
    if (!category) return null;

    const customFields = category.custom_fields || {};
    const candidates = [
      // Newer Discourse format: { id, url, width, height } objects
      category.uploaded_background?.url,
      category.uploaded_background_dark?.url,
      category.uploaded_logo?.url,
      category.uploaded_logo_dark?.url,
      // Older flat string format
      category.uploaded_background_url,
      category.background_url,
      customFields.uploaded_background_url,
      customFields.background_url,
      category.uploaded_background_dark_url,
      customFields.uploaded_background_dark_url,
      category.uploaded_logo_url,
      category.logo_url,
      customFields.uploaded_logo_url,
      customFields.logo_url,
      category.uploaded_logo_dark_url,
      customFields.uploaded_logo_dark_url,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeImageUrl(candidate);
      if (normalized) return normalized;
    }

    return null;
  }

  function getCategoryIdFromCard(card) {
    const directId = card.getAttribute("data-category-id") || card.dataset.categoryId;
    if (directId) return String(directId);

    const link = card.querySelector("a.category-name, td.category a, .badge-category");
    const href = link?.getAttribute("href") || "";
    const match = href.match(/\/c\/[^/]+\/(\d+)(?:$|[/?#])/);

    return match?.[1] || null;
  }

  function ensureCategoryLogoSlot(card) {
    let logoEl = card.querySelector(".category-logo");
    if (logoEl) return logoEl;

    logoEl = document.createElement(card.tagName === "TR" ? "td" : "div");
    logoEl.className = "category-logo";
    card.insertBefore(logoEl, card.firstChild);
    return logoEl;
  }

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
  function enhanceCategoriesPageCards() {
    if (!document.body.classList.contains("argo-categories-page")) return;

    const categoriesById = new Map(
      getSiteCategories().map((category) => [String(category.id), category])
    );

    document.querySelectorAll(".category-list-item, tr.category").forEach((card) => {
      const categoryId = getCategoryIdFromCard(card);
      const category = categoryId ? categoriesById.get(categoryId) : null;
      const preferredImage = resolveCategoryImageUrl(category);
      const logoEl = ensureCategoryLogoSlot(card);
      const img = logoEl.querySelector("img");

      card.removeAttribute("data-no-image");
      delete card.dataset.imageKind;
      card.style.removeProperty("--argo-category-card-image");

      if (preferredImage) {
        card.dataset.imageKind = "background";
        card.style.setProperty("--argo-category-card-image", `url("${preferredImage}")`);
        return;
      }

      if (!img) {
        card.setAttribute("data-no-image", "true");
        return;
      }

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

  // ── Move #argo-nav into .d-header .wrap ─────────────────────────────────
  // Discourse renders header.html via the above-header outlet, so #argo-nav
  // lands as a sibling ABOVE .d-header-wrap instead of inside it. We move it
  // into .d-header .wrap so it becomes a proper flex child and the .d-header
  // glass panel wraps it correctly. Must run before integrateNativeHeaderButtons.
  function ensureNavInsideHeader() {
    const nav = document.getElementById("argo-nav");
    if (!nav) return;
    if (nav.closest(".d-header")) return; // already in the right place

    const wrap = document.querySelector(".d-header .wrap");
    if (!wrap) return;

    wrap.insertBefore(nav, wrap.firstChild);
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

  // ── Sidebar collapse direction hook ──────────────────────────────────────
  // Discourse toggles aria-expanded on the burger button but does not add a
  // reliable body class for collapsed state. We mirror aria-expanded into
  // data-sidebar-open on <body> so our CSS can drive the slide-left animation.
  function watchSidebarToggle() {
    const burger = document.querySelector(".btn-sidebar-toggle");
    if (!burger || burger.__argoObserved) return;
    burger.__argoObserved = true;

    const sync = () =>
      document.body.setAttribute(
        "data-sidebar-open",
        burger.getAttribute("aria-expanded") === "true" ? "true" : "false"
      );

    sync(); // set initial state
    new MutationObserver(sync).observe(burger, {
      attributes: true,
      attributeFilter: ["aria-expanded"],
    });
  }

  function relocatePoweredByDiscourse() {
    const poweredBy = document.querySelector(".powered-by-discourse");
    if (!poweredBy) return;

    const wrapper = document.querySelector("#main-outlet-wrapper");
    const host = wrapper?.parentElement || document.querySelector("#main-outlet")?.parentElement;

    if (!host) return;

    let slot = host.querySelector(":scope > .argo-powered-by-slot");
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "argo-powered-by-slot";
      if (wrapper && wrapper.parentElement === host) {
        wrapper.insertAdjacentElement("afterend", slot);
      } else {
        host.appendChild(slot);
      }
    }

    if (poweredBy.parentElement !== slot) {
      slot.appendChild(poweredBy);
    }
  }

  // ── Game system category tagging ─────────────────────────────────────────
  const GAME_SYSTEM_ACCENTS = {
    "dnd":             "#7B3FBE",
    "forbidden-lands": "#8E3342",
    "cosmere":         "#F0A030",
    "pathfinder":      "#C54820",
    "call-of-cthulhu": "#2E5E4E",
  };

  function tagGameSystemCards() {
    document.querySelectorAll(".category-list-item, tr.category").forEach((card) => {
      const link = card.querySelector("a.category-name, td.category a, a.category-title-link");
      if (!link) return;

      const href = link.getAttribute("href") || "";
      // Check ALL non-numeric slug segments so subcategory URLs (/c/parent/sub/id) match too
      const pathSegments = (href.match(/\/c\/(.+)/)?.[1] || "")
        .split("/")
        .filter((s) => !/^\d+$/.test(s));

      const matchedSlug = Object.keys(GAME_SYSTEM_ACCENTS).find(
        (s) => pathSegments.some((seg) => seg === s || seg.startsWith(s + "-"))
      );

      if (matchedSlug) {
        card.setAttribute("data-category-type", "game-system");
        card.style.setProperty("--card-accent", GAME_SYSTEM_ACCENTS[matchedSlug]);
      } else {
        card.removeAttribute("data-category-type");
        card.style.removeProperty("--card-accent");
      }
    });
  }

  // ── Subcategory section layout ────────────────────────────────────────────
  // On /categories, transforms the flat category table into:
  //   [Section header: Argo Official]
  //   [Card grid: Announcements | Roadmap | Devlogs | …]
  //   [Section header: Argo Apps]
  //   [Card grid: Getting Started | Web App | …]
  // buildSubcategoryLayout may be called with a retry count when rows haven't
  // rendered yet (e.g. on a full page reload where Ember renders async).
  function buildSubcategoryLayout(retryCount = 0) {
    if (!document.body.classList.contains("argo-categories-page")) return;

    // Remove any previous injection so we always start clean
    document.querySelector(".argo-category-sections")?.remove();

    // Un-hide any table we may have hidden in a previous run
    document.querySelectorAll("table.category-list.argo-hidden, .category-list.argo-hidden").forEach((t) => {
      t.classList.remove("argo-hidden");
    });

    const categoryList = document.querySelector(
      "table.category-list:not(.argo-hidden), .category-list:not(.argo-subcategory-grid):not(.argo-hidden)"
    );
    if (!categoryList) return;

    const allCategories = getSiteCategories();
    const categoriesById = new Map(allCategories.map((c) => [String(c.id), c]));

    const rows = Array.from(
      categoryList.querySelectorAll("tr[data-category-id], .category-list-item[data-category-id]")
    );

    // Ember sometimes fires page:changed before rows are rendered. Retry up to
    // 5 times (every 120 ms) before giving up.
    if (!rows.length) {
      if (retryCount < 5) {
        setTimeout(() => buildSubcategoryLayout(retryCount + 1), 120);
      }
      return;
    }

    const container = document.createElement("div");
    container.className = "argo-category-sections";

    let hasContent = false;

    rows.forEach((row) => {
      const categoryId = row.getAttribute("data-category-id");
      const subcategoryBadges = Array.from(
        row.querySelectorAll(".subcategories .badge-category__wrapper")
      );

      // Skip leaf categories (Staff, General, Site Feedback — no subcategories)
      if (!subcategoryBadges.length) return;

      hasContent = true;

      // ── Section header ───────────────────────────────────────────
      const titleLink = row.querySelector(".category-title-link");
      const sectionName = row.querySelector(".badge-category__name")?.textContent?.trim() || "";
      const sectionHref = titleLink?.getAttribute("href") || "#";
      const parentCat = categoriesById.get(categoryId);

      const badgeStyle = titleLink?.closest("span")?.querySelector(".badge-category__wrapper")?.getAttribute("style")
        || row.querySelector(".category > h3 .badge-category__wrapper")?.getAttribute("style")
        || "";
      const colorMatch = badgeStyle.match(/--category-badge-color:\s*([^;]+)/);
      const accentColor = colorMatch?.[1]?.trim() || null;

      const header = document.createElement("div");
      header.className = "argo-section-header";
      header.dataset.categoryId = categoryId;
      if (accentColor) header.style.setProperty("--section-accent", accentColor);

      const titleEl = document.createElement("a");
      titleEl.className = "argo-section-header__title";
      titleEl.href = sectionHref;
      titleEl.textContent = sectionName;
      header.appendChild(titleEl);

      if (parentCat?.description_excerpt) {
        const desc = document.createElement("p");
        desc.className = "argo-section-header__desc";
        desc.textContent = parentCat.description_excerpt;
        header.appendChild(desc);
      }

      container.appendChild(header);

      // ── Subcategory card grid ────────────────────────────────────
      const grid = document.createElement("div");
      grid.className = "category-list argo-subcategory-grid";

      subcategoryBadges.forEach((badge) => {
        const badgeSpan = badge.querySelector(".badge-category");
        const subId = badgeSpan?.getAttribute("data-category-id") || "";
        const subName = badge.querySelector(".badge-category__name")?.textContent?.trim() || "";
        const subHref = badge.getAttribute("href") || "#";
        const subCat = subId ? categoriesById.get(subId) : null;
        const imageUrl = subCat ? resolveCategoryImageUrl(subCat) : null;

        const subBadgeStyle = badge.getAttribute("style") || "";
        const subColorMatch = subBadgeStyle.match(/--category-badge-color:\s*([^;]+)/);
        const subAccent = subColorMatch?.[1]?.trim() || null;

        const card = document.createElement("div");
        card.className = "category-list-item";
        if (subId) card.setAttribute("data-category-id", subId);
        if (subAccent) card.style.setProperty("--subcategory-color", subAccent);
        card.addEventListener("click", (e) => {
          if (e.target.closest("a")) return;
          window.location.href = subHref;
        });

        // Logo / banner area
        const logoDiv = document.createElement("div");
        logoDiv.className = "category-logo";
        if (imageUrl) {
          card.dataset.imageKind = "background";
          card.style.setProperty("--argo-category-card-image", `url("${imageUrl}")`);
        } else {
          card.setAttribute("data-no-image", "true");
        }
        card.appendChild(logoDiv);

        // Card body
        const bodyDiv = document.createElement("div");
        bodyDiv.className = "category";

        const nameEl = document.createElement("h3");
        nameEl.className = "category-name";
        const nameLink = document.createElement("a");
        nameLink.className = "category-name";
        nameLink.href = subHref;
        nameLink.textContent = subName;
        nameEl.appendChild(nameLink);
        bodyDiv.appendChild(nameEl);

        if (subCat?.description_excerpt) {
          const descDiv = document.createElement("div");
          descDiv.className = "category-description";
          const p = document.createElement("p");
          p.textContent = subCat.description_excerpt;
          descDiv.appendChild(p);
          bodyDiv.appendChild(descDiv);
        }

        card.appendChild(bodyDiv);

        // Topic count chip
        if (subCat?.topic_count != null) {
          const topicDiv = document.createElement("div");
          topicDiv.className = "topics";
          const numSpan = document.createElement("span");
          numSpan.className = "num topics";
          const topicLink = document.createElement("a");
          topicLink.href = subHref;
          topicLink.className = "value";
          topicLink.textContent = subCat.topic_count;
          numSpan.appendChild(topicLink);
          topicDiv.appendChild(numSpan);
          card.appendChild(topicDiv);
        }

        grid.appendChild(card);
      });

      container.appendChild(grid);
    });

    if (!hasContent) return;

    categoryList.parentNode.insertBefore(container, categoryList);
    categoryList.classList.add("argo-hidden");
  }

  // ── Page change handler ───────────────────────────────────────────────────
  // Discourse is an SPA — we must re-run our DOM work after every route change.
  api.onPageChange(() => {
    syncNavActiveState();
    syncCategoriesPageState();

    // Small delay lets Discourse finish rendering the new route's DOM
    setTimeout(() => {
      ensureNavInsideHeader();        // must be first — moves #argo-nav into .d-header
      buildSubcategoryLayout();       // sections + subcategory cards before tagging/fallbacks
      tagGameSystemCards();
      applyCategoryImageFallbacks();
      enhanceCategoriesPageCards();
      rewriteCategoryTableIfNeeded();
      integrateNativeHeaderButtons();
      watchSidebarToggle();
      relocatePoweredByDiscourse();
    }, 80);
  });

  // Initial run on first boot.
  // buildSubcategoryLayout() is intentionally omitted here — running it at
  // 80 ms conflicts with Ember's own first render (~200-500 ms later), which
  // strips our injected DOM and hides the table. We rely on api.onPageChange()
  // (which fires after Ember finishes rendering) to call it instead.
  syncNavActiveState();
  syncCategoriesPageState();
  setTimeout(() => {
    ensureNavInsideHeader();
    tagGameSystemCards();
    applyCategoryImageFallbacks();
    enhanceCategoriesPageCards();
    rewriteCategoryTableIfNeeded();
    integrateNativeHeaderButtons();
    watchSidebarToggle();
    relocatePoweredByDiscourse();
  }, 80);
});

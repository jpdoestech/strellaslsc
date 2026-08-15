/* ============================================================================
   sheet-data.js
   ----------------------------------------------------------------------------
   Pulls the image "database" from a Google Sheet and drops the images into
   the page. No API key, no Google Cloud project, no backend server -- this
   works because we publish the sheet as a CSV and fetch that CSV like any
   other file.

   ---------------------------------------------------------------------------
   HOW TO SET UP YOUR GOOGLE SHEET (do this once)
   ---------------------------------------------------------------------------
   1. Create a Google Sheet with these EXACT column headers in row 1:

        category | title | image_url | caption | order

      - category   : which part of the site the image belongs to. Use one of:
                      "hero", "family", "gallery", "branch"
                      (You can add more categories -- see CATEGORY MAP below.)
      - title      : short internal name, not shown on the page (optional)
      - image_url  : a DIRECT link to the image file (must end up rendering
                      an actual image when opened in a new tab). The easiest
                      source is to upload the image to Google Drive, right
                      click > Share > "Anyone with the link", then use this
                      URL pattern:
                        https://lh3.googleusercontent.com/d/FILE_ID
                      (FILE_ID is the long string in the Drive share link.)
                      A plain https image URL (e.g. from your own hosting)
                      also works fine.
      - caption    : text shown at the bottom of the image on the site
                      (optional -- leave blank for no caption)
      - order      : a number controlling display order AND grouping multiple
                      photos into one card. Rows sharing the same WHOLE
                      number all become a single card that visitors can
                      flip through:
                        1, 1.1, 1.2   -> one card, 3 photos
                        2             -> a separate card, 1 photo
                        3, 3.1        -> a separate card, 2 photos
                      A card with more than one photo shows a small "1/3"
                      badge, automatically cycles through its photos every
                      1.2 seconds while a visitor hovers over it, and opens
                      as a swipeable carousel (with the same counter) when
                      clicked. A single-photo card just behaves like a
                      normal photo, same as before.
                      (optional column -- blank rows sort last, and each
                      sort into its own separate single-photo card)

   2. In Google Sheets: File > Share > Publish to web.
      - Under "Link", choose the specific sheet/tab (not "Entire Document").
      - Under the format dropdown choose "Comma-separated values (.csv)".
      - Click Publish, then copy the URL it gives you.

   3. Paste that URL into SHEET_CSV_URL below.

   That's it -- add/remove/reorder rows in the Sheet at any time and the
   live site updates automatically (the sheet is re-fetched on every page
   load, no rebuild or redeploy needed).
   ============================================================================ */

const SHEET_CONFIG = {
  // ---- EDIT HERE ---------------------------------------------------------
  // Paste your "Publish to web" CSV URL between the quotes below.
  // Leave it as an empty string "" to run the site with placeholder /
  // no images while you're still setting the sheet up.
  SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRl7fxMLEsaRC9ezFMQZLtUawwAvqeavR4XZcglZQUzCR0fP_qd4QX-25sCjVgbTkeqkGjwmwLIn0zO/pub?gid=1983865315&single=true&output=csv",

  // How long (in minutes) to cache the fetched sheet in the visitor's
  // browser (localStorage) before re-fetching. Set to 0 to always fetch
  // fresh. Caching keeps the site fast on repeat visits.
  CACHE_MINUTES: 10,
  // -------------------------------------------------------------------------
};

/* ============================================================================
   BRANCH MAP (separate Google Sheet tab from the image database above)
   ----------------------------------------------------------------------------
   Powers the real, clickable Google Map + branch list in the "Where we
   operate" section. Same no-API-key approach as the image sheet -- publish
   a tab as CSV, paste the link below.

   HOW TO SET UP THE "branches" SHEET TAB
   ---------------------------------------------------------------------------
   1. In the SAME Google Sheet (or a different one, doesn't matter), add a
      new tab with these EXACT column headers in row 1:

        name | kind | address | coordinates | order

      - name        : shown as the heading for that branch, e.g. "Davao"
      - kind        : small label above the name, e.g. "Head Office"
                      (optional -- leave blank for regular branches)
      - address     : full postal address, shown under the name -- also used
                      as the map location if "coordinates" is left blank
                      (see below), so it's worth keeping accurate either way.
      - coordinates : OPTIONAL. Leave this blank and the "address" text
                      above is used to locate the map instead -- Google Maps
                      can usually place a plain address well enough on its
                      own. Fill it in for pinpoint accuracy (useful when an
                      address is vague, e.g. "Purok 1, Biao Joaquin"). Any
                      of these formats work:
                        - decimal "lat,lng"                 7.067960, 125.616310
                        - a DMS string from Google Maps      17°06'44.8"N 121°40'12.2"E
                        - a FULL (non-shortened) Google Maps URL that
                          contains the coordinates in it, e.g. one copied
                          from the address bar after opening a place:
                          https://www.google.com/maps/place/.../@7.0680,125.6163,17z/...
                        - anything else typed in here (a place name, a
                          cross-street, etc.) is used as-is, as a text
                          search on the map -- same as leaving it blank
                          and relying on "address"
                      A SHORTENED maps.app.goo.gl link still will NOT work
                      in this column -- open it once yourself first and
                      copy the full resulting URL or coordinates instead.
      - order       : a number controlling display order (1, 2, 3 ...).
                      The row with order = 1 (or the first row, if "order"
                      is left blank) is the branch shown on page load.

   2. File > Share > Publish to web, choose that specific tab, format
      "Comma-separated values (.csv)", Publish, copy the URL.

   3. Paste it into BRANCH_CONFIG.BRANCHES_CSV_URL below.

   Until this is set, the static fallback branch list already in
   index.html stays visible, and the map area shows a short placeholder
   message instead of guessing at coordinates.
   ============================================================================ */
const BRANCH_CONFIG = {
  // ---- EDIT HERE ---------------------------------------------------------
  BRANCHES_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRl7fxMLEsaRC9ezFMQZLtUawwAvqeavR4XZcglZQUzCR0fP_qd4QX-25sCjVgbTkeqkGjwmwLIn0zO/pub?gid=897586402&single=true&output=csv",
  CACHE_MINUTES: 10,
  // -------------------------------------------------------------------------
};

/* Maps a "category" value from the sheet to the DOM container(s) it should
   render into. Add a new line here any time you add a new category to your
   sheet and a matching container `id` in index.html. */
const CATEGORY_MAP = {
  hero: { containerId: "hero-photo-target", mode: "background" },
  family: { containerId: "family-gallery", mode: "grid" },
  gallery: { containerId: "main-gallery", mode: "grid" },
  branch: { containerId: "branch-photo-grid", mode: "grid" },
};

/**
 * Very small CSV parser that handles quoted fields containing commas.
 * Good enough for the flat, simple sheet structure described above --
 * you do not need a library for this.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Turns parsed CSV rows into an array of objects keyed by the header row. */
function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] || "").trim();
    });
    return obj;
  });
}

/** Fetches and caches the sheet CSV, returning an array of row objects. */
async function loadSheetRows() {
  const { SHEET_CSV_URL, CACHE_MINUTES } = SHEET_CONFIG;
  if (!SHEET_CSV_URL) return [];

  const cacheKey = "slsc_sheet_cache_v1";
  if (CACHE_MINUTES > 0) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (cached && Date.now() - cached.fetchedAt < CACHE_MINUTES * 60 * 1000) {
        return cached.rows;
      }
    } catch (e) {
      /* corrupt cache entry -- ignore and re-fetch */
    }
  }

  const response = await fetch(SHEET_CSV_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not fetch the Google Sheet CSV (status ${response.status})`);
  }
  const text = await response.text();
  const rows = rowsToObjects(parseCsv(text));

  if (CACHE_MINUTES > 0) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), rows }));
    } catch (e) {
      /* storage full or unavailable -- non-fatal, just skip caching */
    }
  }
  return rows;
}

/** Sorts rows for one category by their "order" column (numeric, blanks last). */
function sortByOrder(rows) {
  return rows.slice().sort((a, b) => {
    const orderA = a.order === "" ? Infinity : Number(a.order);
    const orderB = b.order === "" ? Infinity : Number(b.order);
    return orderA - orderB;
  });
}

/**
 * Groups rows into photo sets by the WHOLE-NUMBER part of "order" -- so
 * rows with order 1, 1.1, and 1.2 all become one card with 3 photos
 * (shown as one tile, cycling on hover, opening as a swipeable carousel
 * when clicked), while order 2 becomes its own separate single-photo card.
 * A blank/non-numeric "order" always gets its own group (never merged
 * with anything else). Groups are then ordered by their lowest order
 * value, and photos within a group are ordered by their full order value
 * (so 1, then 1.1, then 1.2, etc.).
 */
function groupRowsByOrder(rows) {
  const groups = [];
  const indexByKey = new Map();

  rows.forEach((row) => {
    const orderNum = row.order === "" ? NaN : Number(row.order);
    const isNumeric = Number.isFinite(orderNum);
    const key = isNumeric ? `n${Math.floor(orderNum)}` : `u${groups.length}`;

    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length);
      groups.push({ minOrder: isNumeric ? orderNum : Infinity, items: [] });
    }
    const group = groups[indexByKey.get(key)];
    group.items.push(row);
    if (isNumeric) group.minOrder = Math.min(group.minOrder, orderNum);
  });

  groups.forEach((group) => {
    group.items = sortByOrder(group.items);
  });
  groups.sort((a, b) => a.minOrder - b.minOrder);

  return groups;
}

/** Renders a grid of <figure><img></figure> cards into a container -- one
 *  card per photo GROUP (see groupRowsByOrder), not necessarily one card
 *  per row. Cards with more than one photo get a "1/N" badge, cycle
 *  through their photos automatically on hover, and open as a swipeable
 *  carousel in the lightbox (see js/main.js) when clicked. */
function renderGrid(container, rows) {
  if (!rows.length) {
    container.innerHTML = '<p class="gallery-empty">Loading images....</p>';
    /**container.innerHTML = '<p class="gallery-empty">No images yet -- add rows to the Google Sheet with this category to fill this section.</p>'; */
    return;
  }

  const groups = groupRowsByOrder(rows);

  container.innerHTML = groups
    .map((group) => {
      const images = group.items.map((row) => ({
        src: row.image_url,
        caption: row.caption || row.title || "",
      }));
      const first = images[0];
      const badge = images.length > 1 ? `<span class="photo-count">1/${images.length}</span>` : "";
      // The full photo list travels with the card as a URL-encoded JSON
      // blob in data-images -- encodeURIComponent handles quotes/special
      // characters safely inside the HTML attribute with no extra
      // escaping needed. js/main.js reads this back out on click.
      const dataImages = encodeURIComponent(JSON.stringify(images));
      return `<figure data-images="${dataImages}" data-index="0">
        <img src="${escapeHtml(first.src)}" alt="${escapeHtml(first.caption || "SLSC")}" loading="lazy">
        ${badge}
        <figcaption>${escapeHtml(first.caption)}</figcaption>
      </figure>`;
    })
    .join("");

  // Hover-to-preview: for any card with more than one photo, cycle through
  // them automatically every 1.2s while the pointer stays over the card,
  // and reset back to the first photo on mouse-out.
  container.querySelectorAll("figure[data-images]").forEach((figure) => {
    let images;
    try {
      images = JSON.parse(decodeURIComponent(figure.dataset.images));
    } catch (e) {
      images = [];
    }
    if (images.length < 2) return; // nothing to cycle

    const imgEl = figure.querySelector("img");
    const captionEl = figure.querySelector("figcaption");
    const badgeEl = figure.querySelector(".photo-count");
    let hoverTimer = null;

    const showAt = (i) => {
      figure.dataset.index = String(i);
      imgEl.src = images[i].src;
      if (captionEl) captionEl.textContent = images[i].caption;
      if (badgeEl) badgeEl.textContent = `${i + 1}/${images.length}`;
    };

    figure.addEventListener("mouseenter", () => {
      let i = Number(figure.dataset.index || 0);
      hoverTimer = setInterval(() => {
        i = (i + 1) % images.length;
        showAt(i);
      }, 1200);
    });

    figure.addEventListener("mouseleave", () => {
      clearInterval(hoverTimer);
      showAt(0);
    });
  });

  setupViewMore(container);
}

/** How many full rows of cards show before a "View more" button appears.
 *  2 rows regardless of device -- the actual number of cards that means
 *  (8 on a 4-column desktop grid, 6 on a 3-column tablet grid, 4 on a
 *  2-column phone grid) is worked out live from the grid's own CSS in
 *  setupViewMore below, rather than hardcoded per breakpoint here. */
const ROWS_TO_SHOW_INITIALLY = 2;

/**
 * Collapses a photo grid down to ROWS_TO_SHOW_INITIALLY rows and adds a
 * "View more" button beneath it to reveal the rest -- keeps a long photo
 * set from being one huge scroll. Works out how many cards fit per row by
 * reading the grid's own computed `grid-template-columns` (so it stays
 * correct across desktop/tablet/phone without duplicating breakpoint
 * numbers here), and re-checks that on window resize/orientation change
 * as long as the visitor hasn't already clicked to expand it.
 */
function setupViewMore(container) {
  // Remove any leftover button from a previous render of this same
  // container (e.g. if the sheet is re-fetched later) before adding a
  // fresh one, so they don't stack up.
  const existingWrap = container.nextElementSibling;
  if (existingWrap && existingWrap.classList.contains("view-more-wrap")) {
    existingWrap.remove();
  }

  const figures = Array.from(container.querySelectorAll(":scope > figure"));
  if (figures.length < 2) return; // nothing worth collapsing

  let expanded = false;

  const getColumnCount = () => {
    const template = getComputedStyle(container).gridTemplateColumns;
    const tokens = template ? template.split(" ").filter(Boolean) : [];
    // Real browsers resolve grid-template-columns into one CSS length per
    // track (e.g. "300px 300px 300px 300px") -- check the tokens actually
    // look like that, not just that there happen to be 2+ of them, since
    // an unresolved value like "repeat(4, 1fr)" also splits into 2 tokens
    // by whitespace but isn't a real per-column list.
    const looksResolved = tokens.length >= 2 && tokens.every((t) => /^[\d.]+(px|fr|%|em|rem)?$/.test(t));
    if (looksResolved) return tokens.length;
    // Fallback (only reached if the browser didn't resolve the value as
    // expected): mirror the same breakpoints used in css/style.css.
    const width = window.innerWidth;
    if (width <= 640) return 2;
    if (width <= 960) return 3;
    return 4;
  };

  const wrap = document.createElement("div");
  wrap.className = "view-more-wrap";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "view-more-btn";
  wrap.appendChild(button);
  container.insertAdjacentElement("afterend", wrap);

  const applyCollapse = () => {
    if (expanded) return;
    const visibleCount = getColumnCount() * ROWS_TO_SHOW_INITIALLY;
    figures.forEach((fig, i) => {
      fig.hidden = i >= visibleCount;
    });
    const hiddenCount = Math.max(figures.length - visibleCount, 0);
    wrap.hidden = hiddenCount === 0;
    button.textContent = `View more photos (${hiddenCount} more)`;
  };

  button.addEventListener("click", () => {
    expanded = !expanded;
    if (expanded) {
      figures.forEach((fig) => {
        fig.hidden = false;
      });
      button.textContent = "View less";
    } else {
      applyCollapse();
      // Scroll the (now-collapsed) grid back into view rather than
      // leaving the visitor stranded below the fold where the button was.
      container.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  applyCollapse();

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (expanded) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyCollapse, 150);
  });
}

/** Sets the first matching row's image as a CSS background (used for the hero). */
function renderBackground(container, rows) {
  if (!rows.length) return; // keep the CSS gradient fallback already in place
  container.style.backgroundImage = `url("${rows[0].image_url}")`;
  container.style.opacity = "0.45";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

/** Fetches and caches a published sheet CSV at any URL, returning row objects.
 *  Generic version of the image-sheet fetcher above, reused for the branch
 *  sheet too (different URL, different cache key) so both can be published
 *  as separate tabs with separate "Publish to web" links. */
async function loadCsvRows(csvUrl, cacheKey, cacheMinutes) {
  if (!csvUrl) return [];

  if (cacheMinutes > 0) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (cached && Date.now() - cached.fetchedAt < cacheMinutes * 60 * 1000) {
        return cached.rows;
      }
    } catch (e) {
      /* corrupt cache entry -- ignore and re-fetch */
    }
  }

  const response = await fetch(csvUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not fetch the Google Sheet CSV (status ${response.status})`);
  }
  const text = await response.text();
  const rows = rowsToObjects(parseCsv(text));

  if (cacheMinutes > 0) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), rows }));
    } catch (e) {
      /* storage full or unavailable -- non-fatal, just skip caching */
    }
  }
  return rows;
}

/**
 * Turns a "coordinates" cell (and, as fallbacks, "address" then "name")
 * into a single string usable directly as a Google Maps search query --
 * either "lat,lng" or free text (an address/place name). Google's map
 * embed/search URLs accept either form equally well, no geocoding step
 * needed on our end.
 *
 * Tries, in order:
 *   1. decimal "lat,lng"                      "7.067960, 125.616310"
 *   2. a DMS string copied from Google Maps    17°06'44.8"N 121°40'12.2"E
 *   3. a FULL (non-shortened) Google Maps URL containing coordinates,
 *      e.g. .../@7.0680,125.6163,17z/...  or  ?q=7.068,125.616
 *   4. any other non-URL text, used as-is (a plain address or place name)
 *   5. if "coordinates" is blank or unusable (e.g. a shortened link),
 *      falls back to the "address" cell as a text search
 *   6. if THAT is also blank, falls back to the branch's "name" itself --
 *      almost always searchable on Maps even without a formal address
 * Only returns null if the branch has no name at all, which shouldn't
 * happen -- the point is a named branch should never silently disappear
 * from the list just because its location data is incomplete.
 */
function resolveMapQuery(coordinatesRaw, addressFallback, nameFallback) {
  const raw = (coordinatesRaw || "").trim();

  if (raw) {
    const decimalMatch = raw.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (decimalMatch) return `${decimalMatch[1]},${decimalMatch[2]}`;

    const dmsMatch = raw.match(
      /(\d+)[°ºd]\s*(\d+)['′m]\s*([\d.]+)["″s]?\s*([NSns])[,\s]+(\d+)[°ºd]\s*(\d+)['′m]\s*([\d.]+)["″s]?\s*([EWew])/
    );
    if (dmsMatch) {
      const toDecimal = (deg, min, sec, dir) => {
        const magnitude = Number(deg) + Number(min) / 60 + Number(sec) / 3600;
        return /[SWsw]/.test(dir) ? -magnitude : magnitude;
      };
      const lat = toDecimal(dmsMatch[1], dmsMatch[2], dmsMatch[3], dmsMatch[4]);
      const lng = toDecimal(dmsMatch[5], dmsMatch[6], dmsMatch[7], dmsMatch[8]);
      return `${lat},${lng}`;
    }

    // A full Google Maps URL often has the coordinates in an "@lat,lng,zoom"
    // segment, or in a q=/query= parameter -- pull them out if present.
    const atMatch = raw.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) return `${atMatch[1]},${atMatch[2]}`;

    const paramMatch = raw.match(/[?&](?:q|query)=(-?\d+\.\d+)[,%](?:2C)?(-?\d+\.\d+)/i);
    if (paramMatch) return `${paramMatch[1]},${paramMatch[2]}`;

    // Not a recognizable coordinate/URL format -- if it's not a URL at all,
    // treat it as free-text (an address or place name) and use it directly.
    if (!/^https?:\/\//i.test(raw)) return raw;

    // Otherwise it's some URL we can't extract coordinates from (most
    // commonly a shortened maps.app.goo.gl link) -- fall through to the
    // address/name fallbacks below rather than giving up entirely.
  }

  const address = (addressFallback || "").trim();
  if (address) return address;

  const name = (nameFallback || "").trim();
  return name || null;
}

/** Builds a free, no-API-key Google Maps embed URL for a location query
 *  (either "lat,lng" or free-text address/place name). */
function buildMapEmbedUrl(query) {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`;
}

/** Builds a normal (non-embed) Google Maps URL -- opens the full site/app,
 *  with directions available, in a new tab. */
function buildMapLinkUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Renders the branch list + wires up clicks to swap the embedded map. */
function renderBranches(rows) {
  const listEl = document.getElementById("branch-list");
  const frameEl = document.getElementById("branch-map-frame");
  const emptyEl = document.getElementById("branch-map-empty");
  const linkEl = document.getElementById("branch-map-link");
  if (!listEl || !frameEl || !emptyEl) return;

  const branches = sortByOrder(rows)
    .map((row) => ({
      ...row,
      mapQuery: resolveMapQuery(row.coordinates, row.address, row.name),
    }))
    .filter((row) => row.name); // only requirement now -- a named branch
    // always shows in the list even if its location data is incomplete;
    // see resolveMapQuery's fallback chain above (coordinates -> address
    // -> name) for how it's still usually possible to show *some* map.

  if (!branches.length) return; // leave the static fallback list in index.html untouched

  listEl.innerHTML = branches
    .map((row, i) => {
      const kind = row.kind ? `<span class="kind">${escapeHtml(row.kind)}</span>` : "";
      const active = i === 0 ? " is-active" : "";
      return `<button type="button" class="branch-entry${active}" data-query="${escapeHtml(row.mapQuery)}">
        ${kind}
        <h4>${escapeHtml(row.name)}</h4>
        <p>${escapeHtml(row.address || "")}</p>
      </button>`;
    })
    .join("");

  const showBranch = (btn) => {
    const query = btn.getAttribute("data-query");
    frameEl.src = buildMapEmbedUrl(query);
    frameEl.hidden = false;
    emptyEl.hidden = true;
    if (linkEl) {
      linkEl.href = buildMapLinkUrl(query);
      linkEl.hidden = false;
    }
    listEl.querySelectorAll(".branch-entry").forEach((el) => el.classList.remove("is-active"));
    btn.classList.add("is-active");
  };

  listEl.querySelectorAll(".branch-entry").forEach((btn) => {
    btn.addEventListener("click", () => showBranch(btn));
  });

  showBranch(listEl.querySelector(".branch-entry"));
}

/** Fetches the branches sheet (if configured) and renders it. */
async function initBranchMap() {
  const { BRANCHES_CSV_URL, CACHE_MINUTES } = BRANCH_CONFIG;
  if (!BRANCHES_CSV_URL) return; // static fallback list + placeholder message stay as-is

  try {
    const rows = await loadCsvRows(BRANCHES_CSV_URL, "slsc_branches_cache_v1", CACHE_MINUTES);
    renderBranches(rows);
  } catch (err) {
    console.error("[slsc] Failed to load branches from Google Sheets:", err);
    // Fail quietly on the page -- static fallback list stays visible.
  }
}

/** Main entry point: fetch the sheet once, then render every configured category. */
async function initSheetImages() {
  const targets = Object.values(CATEGORY_MAP)
    .map((c) => document.getElementById(c.containerId))
    .filter(Boolean);

  // If SHEET_CSV_URL isn't set yet, quietly leave the placeholder states in
  // the HTML/CSS alone (empty-state messages, gradient hero, etc).
  if (!SHEET_CONFIG.SHEET_CSV_URL) {
    targets.forEach((el) => {
      if (el.dataset.emptyOk !== "false") {
        renderGrid(el, []);
      }
    });
    return;
  }

  try {
    const rows = await loadSheetRows();

    Object.entries(CATEGORY_MAP).forEach(([category, config]) => {
      const container = document.getElementById(config.containerId);
      if (!container) return; // this category isn't used on this page -- fine

      const rowsForCategory = sortByOrder(
        rows.filter((r) => r.category.toLowerCase() === category)
      );

      if (config.mode === "grid") {
        renderGrid(container, rowsForCategory);
      } else if (config.mode === "background") {
        renderBackground(container, rowsForCategory);
      }
    });
  } catch (err) {
    console.error("[slsc] Failed to load images from Google Sheets:", err);
    // Fail quietly on the page itself -- a broken sheet link should never
    // take down the rest of the site. Empty-state messages stay visible.
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initSheetImages();
  initBranchMap();
});

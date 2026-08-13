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
      - order      : a number (1, 2, 3 ...) controlling display order within
                      its category (optional -- blank rows sort last)

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
      - address     : full postal address, shown under the name
      - coordinates : the branch's location. Paste EITHER:
                        - decimal "lat,lng", e.g.  7.067960, 125.616310
                        - or a DMS string copied from Google Maps, e.g.
                          17°06'44.8"N 121°40'12.2"E
                      Both formats are parsed automatically. A shortened
                      maps.app.goo.gl link will NOT work here -- open it
                      once yourself and copy the coordinates from the
                      resulting full URL/address bar instead.
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
  BRANCHES_CSV_URL: "",
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

  const cacheKey = "weasi_sheet_cache_v1";
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

/** Renders a grid of <figure><img></figure> cards into a container. */
function renderGrid(container, rows) {
  if (!rows.length) {
    container.innerHTML = '<p class="gallery-empty">No images yet -- add rows to the Google Sheet with this category to fill this section.</p>';
    return;
  }
  container.innerHTML = rows
    .map((row) => {
      const caption = row.caption
        ? `<figcaption>${escapeHtml(row.caption)}</figcaption>`
        : "";
      return `<figure><img src="${escapeHtml(row.image_url)}" alt="${escapeHtml(row.caption || row.title || "WEASI")}" loading="lazy">${caption}</figure>`;
    })
    .join("");
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
 * Parses a "coordinates" cell into { lat, lng } decimal numbers, or null if
 * it can't be understood. Accepts:
 *   - decimal "lat,lng"                       e.g. "7.067960, 125.616310"
 *   - a DMS string copied from Google Maps     e.g. 17°06'44.8"N 121°40'12.2"E
 * Shortened maps.app.goo.gl links are NOT supported here -- see the setup
 * comment above BRANCH_CONFIG for why, and what to paste instead.
 */
function parseCoordinates(raw) {
  if (!raw) return null;
  const str = raw.trim();

  const decimalMatch = str.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (decimalMatch) {
    return { lat: parseFloat(decimalMatch[1]), lng: parseFloat(decimalMatch[2]) };
  }

  const dmsMatch = str.match(
    /(\d+)[°ºd]\s*(\d+)['′m]\s*([\d.]+)["″s]?\s*([NSns])[,\s]+(\d+)[°ºd]\s*(\d+)['′m]\s*([\d.]+)["″s]?\s*([EWew])/
  );
  if (dmsMatch) {
    const toDecimal = (deg, min, sec, dir) => {
      const magnitude = Number(deg) + Number(min) / 60 + Number(sec) / 3600;
      return /[SWsw]/.test(dir) ? -magnitude : magnitude;
    };
    return {
      lat: toDecimal(dmsMatch[1], dmsMatch[2], dmsMatch[3], dmsMatch[4]),
      lng: toDecimal(dmsMatch[5], dmsMatch[6], dmsMatch[7], dmsMatch[8]),
    };
  }

  return null;
}

/** Builds a free, no-API-key Google Maps embed URL for one coordinate pair. */
function buildMapEmbedUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
}

/** Renders the branch list + wires up clicks to swap the embedded map. */
function renderBranches(rows) {
  const listEl = document.getElementById("branch-list");
  const frameEl = document.getElementById("branch-map-frame");
  const emptyEl = document.getElementById("branch-map-empty");
  if (!listEl || !frameEl || !emptyEl) return;

  const branches = sortByOrder(rows)
    .map((row) => ({ ...row, coords: parseCoordinates(row.coordinates) }))
    .filter((row) => row.name && row.coords);

  if (!branches.length) return; // leave the static fallback list in index.html untouched

  listEl.innerHTML = branches
    .map((row, i) => {
      const kind = row.kind ? `<span class="kind">${escapeHtml(row.kind)}</span>` : "";
      const active = i === 0 ? " is-active" : "";
      return `<button type="button" class="branch-entry${active}" data-lat="${row.coords.lat}" data-lng="${row.coords.lng}">
        ${kind}
        <h4>${escapeHtml(row.name)}</h4>
        <p>${escapeHtml(row.address || "")}</p>
      </button>`;
    })
    .join("");

  const showBranch = (btn) => {
    const lat = btn.getAttribute("data-lat");
    const lng = btn.getAttribute("data-lng");
    frameEl.src = buildMapEmbedUrl(lat, lng);
    frameEl.hidden = false;
    emptyEl.hidden = true;
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
    console.error("[weasi] Failed to load images from Google Sheets:", err);
    // Fail quietly on the page itself -- a broken sheet link should never
    // take down the rest of the site. Empty-state messages stay visible.
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initSheetImages();
  initBranchMap();
});

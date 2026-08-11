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
  SHEET_CSV_URL: "",

  // How long (in minutes) to cache the fetched sheet in the visitor's
  // browser (localStorage) before re-fetching. Set to 0 to always fetch
  // fresh. Caching keeps the site fast on repeat visits.
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

document.addEventListener("DOMContentLoaded", initSheetImages);

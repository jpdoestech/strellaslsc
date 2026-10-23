# Client logo preparation

Prepare each approved client logo as follows:

- Canvas: **600 x 300 px** (2:1), transparent background.
- Format: **PNG**, sRGB. Aim for under **100 KB** per file.
- Center the logo and preserve its original proportions. Leave at least 40 px of clear space on every side; do not stretch or crop it to fill the canvas.
- Use the official full-color artwork. For a white-only logo, request a version suitable for a white background.
- Suggested filename: `client-company-name.png`.

The site displays logos with `object-fit: contain` in responsive tiles, so they will not be cropped. The 600 x 300 px source stays crisp at typical desktop and mobile tile sizes.

## Add logos to the existing image Google Sheet

Use the same published image sheet configured in `SHEET_CONFIG.SHEET_CSV_URL` in `js/sheet-data.js`. Add one row per approved client:

| category | title | image_url | caption | order |
| --- | --- | --- | --- | --- |
| client | Official company name | Direct HTTPS URL of the transparent PNG | Leave blank | 1 |

For Google Drive images, use the existing `https://lh3.googleusercontent.com/d/FILE_ID` pattern and ensure the image is publicly viewable. Avoid links to the Drive preview page.

`title` becomes the accessible name of the logo. `order` controls its position. Use a distinct whole number for each client. Only add companies whose relationship and logo use have been approved.

The client section and its navigation link stay hidden until a client row has both a title and an HTTP(S) image URL. No placeholder companies are displayed. Visitors may see cached sheet content for up to 10 minutes. No rebuild is needed after updating the sheet.

## Other content

The hero uses the existing Davao team photo. Replace its image URL and alt text together in `index.html` if you choose another team photo.

Activities now appear newest first, with the existing `order` column still grouping photos and breaking date ties. Prefer ISO dates (`2026-09-22`) or English month dates (`September 22, 2026`); English day ranges such as `September 22-24, 2026` sort by the first day. Unrecognized or blank dates appear last.

## Local checks

Run `npm test` for content, client-logo, date-order, and branch-phone checks. For a local visual preview, run `python -m http.server 4173 --bind 127.0.0.1` and open `http://127.0.0.1:4173`. This static preview does not run the Vercel contact API.

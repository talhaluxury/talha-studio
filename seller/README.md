# Talha Studio seller website

Static site (ES modules, no build step) for brand owners. See `../docs/SELLERS.md` for the full flow and setup.

- `js/config.js`: API address and Google client ID (edit before deploying).
- `index.html` + `js/app.js`: login (Google, with email/phone fallback), application, status screens, dashboard shell.
- `js/views/`: overview, brand page builder (live 3D preview), products, orders.
- `js/preview.js` + `css/brandpreview.css`: brand page renderer. Keep identical to `../admin/js/brandPreview.js` and `../admin/css/brandpreview.css`.

Local test: `python3 -m http.server 8081` in this folder, with the API running and `API_BASE` pointing at it.

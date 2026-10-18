# Talha Studio — 3D Boutique Starter

A from-scratch responsive storefront prototype with a Three.js interactive showroom, sample product catalog, category filtering, color swatches, cart dialog and demo checkout notice.

## Run it

This uses ES modules, so open it through a local web server rather than directly as `file://`.

### Option A — Python
From this folder:
```bash
python -m http.server 8080
```
Then open `http://localhost:8080`.

### Option B — VS Code
Use the Live Server extension and open `index.html`.

### Android phone
Upload this folder to a static host such as Netlify, or use a local development server app that serves the folder. Internet is needed for the Three.js CDN, Google Fonts and the hero photo.

## Optional GLB model

1. Create `public/models/`.
2. Put your model there as `suit.glb`.
3. `app.js` already points to `./public/models/suit.glb`.
4. The model loads as an additional showcase object if the file is present. Adjust `loadedModel.scale` and `loadedModel.position` to fit it.

The project still shows procedural rack and mannequin garments when the GLB is missing. Note: GLB models vary in scale and origin, so one downloaded model may need positioning adjustments.

## What's included
- `index.html` — storefront markup and dialogs
- `style.css` — responsive boutique styling
- `app.js` — Three.js scene and demo interactions

## Important
- Product information and prices are sample data.
- Cart state is in-memory and resets on refresh.
- Checkout does not take payment or submit orders.
- Firebase, authentication, real stock, admin dashboard, order management and payment gateway are not connected in this starter.
- This is a functional starting point, not a finished production store.

import { h } from "./ui.js";

const DEFAULT_ASPECTS = [["Portrait 3:4", 3 / 4], ["Portrait 4:5", 4 / 5], ["Square 1:1", 1], ["Wide 16:9", 16 / 9]];

/**
 * Opens a crop screen: drag the photo to move it, use the slider to zoom, pick a shape.
 * Resolves with the cropped JPEG File, the original File ("Use original"), or null when the admin cancels.
 */
export function cropImage(file, { aspect = 3 / 4, aspects = DEFAULT_ASPECTS, maxSide = 1800, title = "Crop photo" } = {}) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };       // cannot be decoded here (for example HEIC): send it as it is, the server answers
    img.onload = () => start();
    img.src = url;

    function start() {
      const iw = img.naturalWidth, ih = img.naturalHeight;
      let ratio = aspect, zoom = 1, ox = 0, oy = 0, cw = 0, ch = 0, base = 1, drag = null;
      const canvas = h("canvas", { style: "touch-action:none;border-radius:12px;background:#111;max-width:100%;cursor:grab" });
      const ctx = canvas.getContext("2d");
      const slider = h("input", { type: "range", min: "1", max: "4", step: "0.01", value: "1", "aria-label": "Zoom", style: "width:100%" });
      const chips = h("div", { style: "display:flex;gap:6px;flex-wrap:wrap;justify-content:center" });

      const clampOffsets = () => { const s = base * zoom; ox = Math.min(0, Math.max(cw - iw * s, ox)); oy = Math.min(0, Math.max(ch - ih * s, oy)); };
      const draw = () => { clampOffsets(); const s = base * zoom; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(img, ox, oy, iw * s, ih * s); };
      const paintChips = () => {
        chips.replaceChildren(...aspects.map(([label, r]) => h("button", { type: "button", class: "btn ghost sm", style: Math.abs(r - ratio) < 0.001 ? "border-color:#c8a35a;color:#c8a35a" : "", onclick: () => { ratio = r; layout(); paintChips(); } }, label)));
      };
      function layout() {
        const maxW = Math.min(window.innerWidth - 48, 420), maxH = Math.max(160, window.innerHeight * 0.5);
        cw = maxW; ch = cw / ratio; if (ch > maxH) { ch = maxH; cw = ch * ratio; }
        canvas.width = Math.max(1, Math.round(cw)); canvas.height = Math.max(1, Math.round(ch)); cw = canvas.width; ch = canvas.height;
        base = Math.max(cw / iw, ch / ih); zoom = 1; slider.value = "1";
        ox = (cw - iw * base) / 2; oy = (ch - ih * base) / 2; draw();
      }

      slider.oninput = () => {
        const old = base * zoom, cx = (cw / 2 - ox) / old, cy = (ch / 2 - oy) / old;     // keep the middle of the picture where it is
        zoom = Number(slider.value); const s = base * zoom; ox = cw / 2 - cx * s; oy = ch / 2 - cy * s; draw();
      };
      canvas.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; };
      canvas.onpointermove = (e) => {
        if (!drag) return; const k = canvas.width / canvas.getBoundingClientRect().width;
        ox = drag.ox + (e.clientX - drag.x) * k; oy = drag.oy + (e.clientY - drag.y) * k; draw();
      };
      canvas.onpointerup = canvas.onpointercancel = () => { drag = null; canvas.style.cursor = "grab"; };

      const close = (value) => { overlay.remove(); URL.revokeObjectURL(url); resolve(value); };
      const finish = () => {
        const s = base * zoom, sx = -ox / s, sy = -oy / s, sw = cw / s, sh = ch / s;       // the crop box, in pixels of the original photo
        const k = Math.min(1, maxSide / Math.max(sw, sh)), ow = Math.max(1, Math.round(sw * k)), oh = Math.max(1, Math.round(sh * k));
        const out = document.createElement("canvas"); out.width = ow; out.height = oh;
        const c = out.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, ow, oh); c.drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);
        out.toBlob((blob) => close(blob ? new File([blob], (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file), "image/jpeg", 0.9);
      };

      const overlay = h("div", { role: "dialog", "aria-modal": "true", "aria-label": title, style: "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto" },
        h("div", { style: "background:#1b1b1b;color:#fff;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px;align-items:center;max-width:100%" },
          h("b", {}, title), h("span", { style: "font-size:12px;opacity:.7" }, "Drag the photo to move it. Use the slider to zoom."),
          chips, canvas, slider,
          h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;justify-content:center" },
            h("button", { type: "button", class: "btn ghost sm", onclick: () => close(null) }, "Cancel"),
            h("button", { type: "button", class: "btn ghost sm", onclick: () => close(file) }, "Use original"),
            h("button", { type: "button", class: "btn gold", onclick: finish }, "Crop and use"))));
      document.body.append(overlay); paintChips(); layout();
    }
  });
}

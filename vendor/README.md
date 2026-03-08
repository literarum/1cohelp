# Vendor libraries (self-hosted)

Third-party libraries are stored here so the site can work without depending on CDN availability. The central config is in `site/js/vendor-config.js`; loading is done via `site/js/vendor-loader.js`.

## Contents and versions

| Library       | Version  | Path                                      | Source |
|---------------|----------|-------------------------------------------|--------|
| Sortable.js   | 1.14.0   | `sortablejs/1.14.0/Sortable.min.js`       | jsDelivr npm |
| pdf-lib       | 1.17.1   | `pdf-lib/1.17.1/pdf-lib.min.js`           | jsDelivr npm |
| @pdf-lib/fontkit | 1.1.1  | `fontkit/1.1.1/fontkit.umd.min.js`        | jsDelivr npm |
| SheetJS (xlsx)| 0.20.3   | `xlsx/0.20.3/xlsx.full.min.js`            | cdn.sheetjs.com |
| Font Awesome  | 6.4.0    | `fontawesome/6.4.0/css/all.min.css` + `webfonts/` | cdnjs |
| Tailwind (fallback) | Play CDN snapshot | `tailwind-fallback/tailwind.min.js` | cdn.tailwindcss.com |

## Switching CDN vs local

In `site/js/vendor-config.js` set:

- `USE_LOCAL_VENDORS = true` — load from this `vendor/` directory (default).
- `USE_LOCAL_VENDORS = false` — load from CDN URLs in the same config.

No other code changes are required.

## How to update a library

1. Download the new build from the same CDN or official source (see table above).
2. Put files under the same path pattern, e.g. `vendor/sortablejs/<new-version>/Sortable.min.js`.
3. Update `site/js/vendor-config.js`: change `localPath` (and optionally `cdnUrl`) for that vendor.
4. Test the relevant page (main app, client-notes-standalone, downloads).

### One-off download commands (from project root)

```bash
# Sortable.js
curl -sL -o site/vendor/sortablejs/1.14.0/Sortable.min.js \
  "https://cdn.jsdelivr.net/npm/sortablejs@1.14.0/Sortable.min.js"

# pdf-lib
curl -sL -o site/vendor/pdf-lib/1.17.1/pdf-lib.min.js \
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"

# fontkit
curl -sL -o site/vendor/fontkit/1.1.1/fontkit.umd.min.js \
  "https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js"

# SheetJS (xlsx)
curl -sL -o site/vendor/xlsx/0.20.3/xlsx.full.min.js \
  "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"

# Font Awesome: download css + webfonts from cdnjs (paths in css use ../webfonts/)
# Tailwind fallback
curl -sL -o site/vendor/tailwind-fallback/tailwind.min.js "https://cdn.tailwindcss.com"
```

After updating a version, create the new versioned directory and update `vendor-config.js` paths accordingly.

# Cloudflare Pages handoff

Diceify is prepared for a root deployment at `https://diceify.pages.dev/` while the existing GitHub Pages site remains available at `/diceify/`.

## Build settings

- Production branch: `main`
- Build command: `npm install --no-package-lock && npm run build`
- Build output directory: `dist`
- Root directory: repository root
- Node.js version: `22.22.0`
- Environment variable: `VITE_BASE_PATH=/`

`public/_redirects` supplies the SPA fallback. The Vite default is now `/`; the existing GitHub Pages workflow continues to pass `/diceify/` explicitly, so the old URL is not removed before the new deployment is verified.

## Domain cutover

After the Pages project is connected and the generated domain is verified, add the preferred `.com` or `.xyz` domain in Cloudflare Pages, point its DNS record through the guided setup, and then update the README public URL. Domain purchase and registrar ownership are intentionally outside the repository configuration.

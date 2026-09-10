# Diceify custom domain handoff

Checked on 2026-09-09:

- `diceify.com` has an active registration record.
- `diceify.xyz` returned an RDAP not-found response, which is a strong availability signal but is not a purchase reservation.

The production build accepts a `VITE_BASE_PATH` variable and now defaults to `/` for Cloudflare Pages or a custom domain. The GitHub Pages workflow still supplies `/diceify/` explicitly. The manifest and service worker derive their scope from the selected build path.

After the chosen domain is registered:

1. Connect the `woo642778-art/diceify` repository to a Cloudflare Pages project named `diceify`.
2. Use `npm install --no-package-lock && npm run build`, output directory `dist`, Node.js `22.22.0`, and `VITE_BASE_PATH=/`.
3. Verify `https://diceify.pages.dev/`, including nested SPA fallback, static assets, and service-worker scope.
4. Add the exact owned domain in Cloudflare Pages, Custom domains.
5. Follow Cloudflare's guided DNS record setup and verify HTTPS before changing the README public URL.

Do not add a DNS record or claim a final `.com` or `.xyz` address before the domain is owned and the final hostname is confirmed. An invented or unowned hostname would make the cutover unverifiable.

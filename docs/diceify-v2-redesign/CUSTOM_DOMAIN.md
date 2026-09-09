# Diceify custom domain handoff

Checked on 2026-09-09:

- `diceify.com` has an active registration record.
- `diceify.xyz` returned an RDAP not-found response, which is a strong availability signal but is not a purchase reservation.

The production build accepts a `VITE_BASE_PATH` repository variable. It defaults to `/diceify/` for the current project Pages URL. Its manifest and service worker derive their scope from that build path.

After the chosen domain is registered:

1. Add the exact domain in GitHub repository Settings, Pages, Custom domain.
2. Add the DNS records required by GitHub Pages at the domain registrar or DNS provider.
3. Set the repository Actions variable `VITE_BASE_PATH` to `/`.
4. Add `public/CNAME` containing only the final domain.
5. Deploy, verify DNS, then enable Enforce HTTPS.

Do not add `public/CNAME` before the domain is owned and the final hostname is confirmed. An invented or unowned CNAME would break the live deployment again.

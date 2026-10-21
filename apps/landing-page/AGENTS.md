# Working in apps/landing-page

thejfloor.com: a static Solid site, prerendered at build time and served by
Cloudflare Pages (project `jfloor-landing`). No backend, no auth. It does not
use Framer any more; the port finished on 2026-09-30.

## Build and deploy

- `bun run build` is client build, SSR build, then `scripts/prerender.mjs`,
  which writes one HTML file per route into `dist/`. The client hydrates that
  markup. A new route needs an entry in the prerender's `ROUTES` list.
  Without one, Pages has no file for it and answers with `404.html`.
- `/contact` is written as `contact.html`, not `contact/index.html`, because
  Pages would redirect it to a trailing slash. Unknown paths get `404.html`
  with a real 404 status; there is no catch-all redirect.
- `.github/workflows/deploy-landing.yml` deploys on every push to `main` that
  touches this app, the design system or the lockfile. A design-system change
  redeploys the site, so check it here too.

## Headers

- `public/_headers` sets the CSP and the other security headers. `script-src`
  allows exactly one inline script, Solid's hydration script, by its hash.
  `src/csp.test.ts` recomputes that hash, so a Solid upgrade that changes the
  script fails the test instead of breaking hydration in production. Update
  the hash in `_headers` when it does.
- Any new external origin (a font, an image host, an analytics script) needs a
  CSP change. Prefer self-hosting: images live in `public/assets/` as WebP
  (`bun run optimize:assets <files>`).

## Testing the live site

- The zone has Bot Fight Mode on, so curl and headless browsers get a
  challenge page from `thejfloor.com`. Check a deploy on its Cloudflare Pages
  preview URL, or in a real browser.

/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import devtools from 'solid-devtools/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_NAME } from './src/lib/constants.ts'

export default defineConfig(({ mode }) => ({
  // Under Vitest, disable solid-refresh (HMR) injection: it breaks in the jsdom
  // test environment ("file:///@solid-refresh" is not a valid path). Tests don't
  // need HMR. In dev/build (`vite`/`vite build`) refresh stays enabled.
  // solid-devtools transforms are dev-only; skip under test to avoid touching
  // the edge-runtime/jsdom test build.
  plugins: [
    ...(mode === 'test' ? [] : [devtools({ autoname: true })]),
    solid({ hot: mode !== 'test' }),
    // PWA: only in real builds/dev, never under Vitest (edge-runtime has no
    // service-worker/DOM globals the plugin's virtual modules assume).
    ...(mode === 'test'
      ? []
      : [
          VitePWA({
            // Silently swap in the new service worker and reload open tabs on
            // the next full page load. No update-prompt UI — the design system
            // has no Toast primitive yet, and the app is Convex-live so a
            // background reload loses no unsaved server state.
            registerType: 'autoUpdate',
            // Register from app code (src/index.tsx, via `virtual:pwa-register`)
            // instead of an injected script: the plugin's default registration
            // only checks `sw.js` for an update on navigation or ~every 24h,
            // which leaves an installed phone PWA that stays open for days
            // running a stale build long after a deploy. Registering ourselves
            // lets src/lib/pwaUpdates.ts call `registration.update()` on focus
            // and hourly instead. The virtual module doesn't resolve under
            // Vitest (this whole plugin is skipped there, `mode === 'test'`),
            // but that's moot: the import lives only in src/index.tsx, which no
            // test renders.
            injectRegister: false,
            includeAssets: ['favicon.svg'],
            manifest: {
              name: APP_NAME,
              short_name: APP_NAME,
              id: '/',
              start_url: '/',
              scope: '/',
              display: 'standalone',
              theme_color: '#ffffff',
              background_color: '#ffffff',
              icons: [
                { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
                { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                {
                  src: 'maskable-icon-512x512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
            workbox: {
              // A new service worker takes over as soon as it installs, and
              // claims the open tabs; `registerSW` then reloads them onto the
              // new build. The plugin only sets these itself when it injects
              // the registration (`injectRegister: 'auto'`) — with
              // `injectRegister: false` above they must be explicit, or every
              // new worker sits in "waiting" forever and a normal reload keeps
              // serving the old precache (only a hard reload bypasses it).
              skipWaiting: true,
              clientsClaim: true,
              // Push + notification-click handlers (public/push-sw.js) and the
              // reload of open tabs onto a new build (public/reload-sw.js).
              // Kept as plain imported scripts so the generateSW strategy
              // (precache, skipWaiting, clientsClaim, navigation fallback)
              // stays as is.
              importScripts: ['push-sw.js', 'reload-sw.js'],
              // Precache the app shell; deep links resolve to index.html (SPA).
              // ttf + pdf: the inventory list's brand fonts and letterhead,
              // fetched on Print, so printing works offline and across deploys.
              globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf,pdf}'],
              // Static assets served straight from dist — never route their
              // requests through the SW app-shell fallback or precache them.
              globIgnores: ['agreements/**', 'email/**'],
              navigateFallback: 'index.html',
              navigateFallbackDenylist: [/^\/agreements\//, /^\/email\//],
            },
          }),
        ]),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'edge-runtime',
    // Vitest defaults to availableParallelism - 1 workers, i.e. a single worker
    // on a 2-vCPU CI runner. Use every CPU: ~45% faster there.
    maxWorkers: '100%',
    // Deterministic public env for tests. `VITE_RECAPTCHA_SITE_KEY` normally
    // comes from a local `.env.local` (gitignored), which CI does not have — so
    // a test that drives the reCAPTCHA-gated submit path (e.g. VisitorRegister)
    // passes locally but fails on CI where `SITE_KEY` is empty and onSubmit
    // short-circuits. Give every test a fixed key (grecaptcha itself is mocked).
    // `EMAIL_DEV_LOG` makes sendEmail log each email's devLog line (there is no
    // RESEND_API_KEY in tests); the Convex tests read those lines.
    env: {
      VITE_RECAPTCHA_SITE_KEY: 'test-recaptcha-site-key',
      EMAIL_DEV_LOG: '1',
    },
    // The full suite runs 50+ files in parallel; on a loaded machine the
    // transform/import phase alone takes ~60s, so heavy interaction and
    // convex-action tests intermittently blow the 5s default. Give every test
    // headroom — this accommodates load without masking real hangs (a genuinely
    // stuck test still fails, just later).
    testTimeout: 15000,
    hookTimeout: 15000,
    // First entry: under Node 25+ (editor test runners) Node shadows the DOM environment's
    // localStorage/sessionStorage; shared with the design system's suites.
    setupFiles: [
      fileURLToPath(
        new URL(
          '../../packages/design-system/test-dom-storage.ts',
          import.meta.url,
        ),
      ),
      fileURLToPath(new URL('./test-stubs/setup.ts', import.meta.url)),
    ],
    server: { deps: { inline: ['convex-test'] } },
    // Alias canvas-confetti to a no-op stub for every test (app + the design
    // system's transitive import) — jsdom/edge-runtime has no 2D canvas context,
    // so the real animation loop throws. An alias is bulletproof where a
    // setupFile `vi.mock` did not intercept the design-system's import.
    alias: {
      'canvas-confetti': fileURLToPath(
        new URL('./test-stubs/canvas-confetti.ts', import.meta.url),
      ),
    },
  },
}))

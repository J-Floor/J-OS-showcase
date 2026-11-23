# apps/tv instructions

The Samsung Tizen TV app: pure DOM, no framework. It pairs by QR code, then plays the slides from the Convex HTTP API using `@j-os/tv-player`.

- **No secrets.** The device token is stored in `localStorage` through `src/storage.ts` and sent only as a `Bearer` header. Never render, log or put it in a URL. The QR carries only the one-time code.
- **The API allows 600 requests an hour per device.** `src/sync.ts` polls the manifest once a minute and refetches only slides whose `rev` changed. Keep it that way; a test guards it.
- **Failures keep the last slides playing.** 429 and network errors are retried on the next tick; 401 drops the token and re-enters pairing.
- **Slides are untrusted.** HTML goes to the player as a string; the player owns the sandboxed iframe. Never use `innerHTML` for slide content.
- **No inline styles from JS.** Styling lives in `src/app.css` (and the player's own CSS).
- **Build-time env:** `VITE_TV_API_URL` and `VITE_TV_APP_URL` are required; the build fails without them. Use placeholders (`example.com`) in tests and docs: this repo is mirrored publicly.
- The build emits a classic `<script>` (not a module) because the TV loads `index.html` from a file origin.
- It cannot be tested in CI on a real TV: see `README.md` for the manual steps.

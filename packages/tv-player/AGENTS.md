# tv-player instructions

Pure DOM: no Solid, no framework. No network access (no fetch, no XHR). Slides render only from the strings and URLs the caller passes in.
Styling is classes in `src/player.css` only; never set inline styles from JS. HTML slides use `<iframe sandbox="">` with nothing added.
The TV runs Chrome 76: no `replaceChildren`, `replaceAll`, `.at()`, `Object.hasOwn`, `structuredClone`, `AbortSignal.timeout`, CSS `inset` (the build lowers syntax, not APIs). ESLint bans the known names and `src/chrome76.setup.ts` removes the DOM ones in tests.

# tv-player instructions

Pure DOM: no Solid, no framework. No network access (no fetch, no XHR). Slides render only from the strings and URLs the caller passes in.
Styling is classes in `src/player.css` only; never set inline styles from JS. HTML slides use `<iframe sandbox="">` with nothing added.

# Working in packages/design-system

How to build and extend components (the component bundle, tokens, theming,
the harness to run) is in the `design-system` skill. These are the traps it
doesn't prevent:

- **There are no `--jf-font-size-*` tokens.** Typography goes through the SCSS
  mixins in `styles/typography.scss`. A raw `font-size` is rejected too.
- Verify every `--jf-*` token and `jf-typo-*` mixin exists before using it —
  the real names are often not the obvious ones: `--jf-radius-full` (not
  `-pill`), `--jf-border-width-decorative` (not `-thin`),
  `--jf-opacity-disabled` (not `-muted`), `jf-typo-body-regular` (not
  `jf-typo-body`). An unknown mixin fails only the build; lint and tests pass.
- **There are no global `.jf-typo-*` classes.** A `class="jf-typo-h3"` in JSX
  matches nothing and nothing flags it; the text just keeps its inherited type.
  Type goes through the mixins only.
- **Check a token pair actually differs before relying on the contrast.**
  `--jf-surface-bg-overlay` and `--jf-surface-bg-sunken` are both
  `--core-grey-100` in the light theme, so Segment's selected-option highlight
  was invisible there for as long as the component existed — dark mode hid it.
- **jsdom performs no layout**, so anything that measures (a virtualiser, an
  Ark machine) sees zeros and no `ResizeObserver`. Components that window or
  position based on measurement need those stubbed in the test, and should fall
  back to rendering everything when they cannot measure — slow beats blank.

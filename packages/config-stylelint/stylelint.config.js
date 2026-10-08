// @ts-check

/**
 * Shared Stylelint configuration for J-OS.
 * SCSS modules (design-system) + plain CSS modules (web app), all class-based.
 *
 * Ported from @embotech/stylelint-config (embo-ui-2). New strict rules run at
 * `severity: warning` so they surface violations without hard-failing the build
 * while the codebase migrates to tokens.
 * @type {import('stylelint').Config}
 */
export default {
  extends: ["stylelint-config-standard-scss", "stylelint-config-recess-order"],
  ignoreFiles: [
    "**/*.d.ts",
    "apps/**/dist/**",
    "**/coverage/**",
    "**/node_modules/**",
  ],
  plugins: [
    "stylelint-scss",
    "stylelint-plugin-defensive-css",
    "stylelint-plugin-logical-css",
    "stylelint-use-nesting",
    "stylelint-high-performance-animation",
    "stylelint-declaration-block-no-ignored-properties",
    "stylelint-declaration-strict-value",
  ],
  rules: {
    // Force design tokens (--jf-* / functions) instead of raw values for the
    // listed properties. Keeps colour, spacing, type and shadows on the scale.
    "scale-unlimited/declaration-strict-value": [
      [
        "/gap$/",
        "/color$/",
        "/padding$/",
        "/margin$/",
        "/border-radius$/",
        "/border-width$/",
        "/opacity$/",
        "/font-family$/",
        "/font-size$/",
        "/font-weight$/",
        "/line-height$/",
        "/letter-spacing$/",
        "/box-shadow$/",
      ],
      {
        ignoreVariables: true,
        ignoreFunctions: false,
        ignoreValues: [
          "inherit",
          "transparent",
          "currentColor",
          "currentcolor",
          "none",
          "0",
          "100%",
          "auto",
          "nowrap",
          "normal",
          "1",
          "fit-content",
          "max-content",
          "min-content",
          "50%",
          "1em",
          "1rem",
        ],
        severity: "warning",
        disableFix: true,
      },
    ],
    "scss/at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: ["apply", "variants", "responsive", "screen"],
      },
    ],
    "order/properties-order": null,
    "selector-class-pattern": null,
    "no-descending-specificity": null,
    // defensive-css v2: granular rules. Enables exactly embo's v1 toggle set
    // (accidental-hover, background-repeat, flex-wrapping, scroll-chaining,
    // scrollbar-gutter, vendor-prefix-grouping). custom-property-fallbacks was
    // OFF in embo, so require-custom-property-fallback stays disabled.
    "defensive-css/no-accidental-hover": [true, { severity: "warning" }],
    "defensive-css/require-background-repeat": [true, { severity: "warning" }],
    "defensive-css/require-flex-wrap": [true, { severity: "warning" }],
    "defensive-css/require-overscroll-behavior": [
      true,
      { severity: "warning" },
    ],
    "defensive-css/require-scrollbar-gutter": [true, { severity: "warning" }],
    "defensive-css/no-mixed-vendor-prefixes": [true, { severity: "warning" }],
    "custom-property-pattern": [
      /^([a-z][a-z0-9]*)(-{1,2}[a-z0-9]+)*$/,
      { severity: "warning" },
    ],
    // logical-css v2: v1's use-logical-properties-and-values split into
    // require-logical-properties (properties) + require-logical-keywords
    // (directional values). Both = v1 behaviour. use-logical-units renamed.
    "logical-css/require-logical-properties": [true, { severity: "warning" }],
    "logical-css/require-logical-keywords": [true, { severity: "warning" }],
    "logical-css/require-logical-units": [true, { severity: "warning" }],
    "csstools/use-nesting": ["always", { syntax: "scss", severity: "warning" }],
    "plugin/no-low-performance-animation-properties": [
      true,
      { severity: "warning" },
    ],
    "plugin/declaration-block-no-ignored-properties": [
      true,
      { severity: "warning" },
    ],
    "declaration-no-important": [true, { severity: "warning" }],
    // `/^--/` -> no raw HEX in custom-property definitions.
    // `/.*/`  -> ban fallbacks on `--jf-*` design tokens (`var(--jf-x, fallback)`):
    //            a fallback silently masks an undefined token instead of failing
    //            loudly. Always write bare `var(--jf-x)`. Scoped to --jf- only —
    //            fallbacks on third-party/runtime vars (ark's --available-height,
    //            the runtime --layer-index) are legitimate. (J-OS addition — embo
    //            only declines to *require* fallbacks. See jos-web-tokens-and-lint.)
    "declaration-property-value-disallowed-list": [
      {
        "/^--/": ["/^#[0-9a-fA-F]{3,8}$/i"],
        "/.*/": ["/var\\(--jf-[^,)]+,/"],
      },
      { severity: "warning" },
    ],
  },
};

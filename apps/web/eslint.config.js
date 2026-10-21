import baseConfig from "@j-os/config-eslint";
import solid from "eslint-plugin-solid";

import { HANDLE_RESULT, mustUseResult } from "./eslint/mustUseResult.js";

const neverthrowRules = { rules: { "must-use-result": mustUseResult } };

const UNSAFE_UNWRAP_MESSAGE = `Handle the Result instead. ${HANDLE_RESULT}`;

// A rule's options replace the base config's, so keep its selectors.
const baseRestrictedSyntax = baseConfig
  .map((entry) => entry.rules?.["no-restricted-syntax"])
  .find(Boolean)
  .slice(1);

export default [
  { ignores: ["dist/**", "convex/_generated/**"] },
  ...baseConfig,
  {
    // CLI build scripts: printing progress is their job.
    files: ["emails/**", "agreements/**"],
    rules: { "no-console": "off" },
  },
  {
    // Cohesive modules kept whole on purpose: splitting them would only move
    // code, not clarify it.
    files: [
      "convex/people.ts",
      "convex/schema.ts",
      "convex/applications.ts",
      "convex/seed.ts",
      "convex/lib/nukiClient.ts",
    ],
    rules: { "max-lines": "off" },
  },
  {
    // jsx-email templates are React, not Solid.
    files: ["emails/**"],
    rules: Object.fromEntries(
      Object.keys(solid.configs.typescript.rules).map((rule) => [rule, "off"]),
    ),
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint/*.js"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Plain JavaScript over untyped ESTree nodes: type-aware "unsafe any"
    // rules would flag every node access, and the rule's own tests cover it.
    files: ["eslint/**/*.js"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/shared/data/useQuery.ts", "src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "convex-solidjs",
              importNames: ["useQuery"],
              message:
                "Use useQuery from src/shared/data/useQuery.ts: it keeps the query warm after unmount.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/**/*.{ts,tsx}",
      "convex/**/*.ts",
      "emails/**/*.{ts,tsx}",
      "agreements/**/*.ts",
    ],
    plugins: { neverthrow: neverthrowRules },
    rules: {
      "neverthrow/must-use-result": "error",
      "no-restricted-syntax": [
        "error",
        ...baseRestrictedSyntax,
        {
          selector: "ThrowStatement",
          message:
            "Don't throw. Return err(...) for a failure a user can cause, or invariant(...) for a bug (convex/lib/result.ts).",
        },
      ],
      "no-restricted-properties": [
        "error",
        { property: "_unsafeUnwrap", message: UNSAFE_UNWRAP_MESSAGE },
        {
          property: "_unsafeUnwrapErr",
          message: UNSAFE_UNWRAP_MESSAGE,
        },
      ],
    },
  },
  {
    files: ["convex/lib/result.ts", "**/*.test.{ts,tsx}", "test-stubs/**"],
    // Tests build Results for mocks and await code under test for its side
    // effects; asserting on the outcome is their handling.
    rules: {
      "neverthrow/must-use-result": "off",
      "no-restricted-syntax": ["error", ...baseRestrictedSyntax],
      "no-restricted-properties": "off",
    },
  },
];

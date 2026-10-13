import baseConfig from "@j-os/config-eslint";
import solid from "eslint-plugin-solid";

export default [
  { ignores: ["dist/**", "convex/_generated/**"] },
  ...baseConfig,
  {
    // CLI build scripts: printing progress is their job.
    files: ["emails/**", "agreements/**"],
    rules: { "no-console": "off" },
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
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
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
];

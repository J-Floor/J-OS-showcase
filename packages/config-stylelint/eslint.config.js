// @ts-check

import baseEslintConfig from "@j-os/config-eslint";
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...baseEslintConfig,
  {
    ignores: ["*.js", "*.mjs"],
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js", "*.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);

// @ts-check

import baseEslintConfig from "@j-os/config-eslint";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["index.js"],
  },
  ...baseEslintConfig,
);

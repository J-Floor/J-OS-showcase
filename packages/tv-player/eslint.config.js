import baseConfig from "@j-os/config-eslint";
import { CHROME_76, chrome76Properties } from "@j-os/config-eslint/chrome76.js";
import tseslint from "typescript-eslint";

/**
 * The TV runs Chrome 76: the build lowers syntax but not DOM or runtime APIs
 * (the list is shared in @j-os/config-eslint/chrome76.js). Tests are exempt from
 * lint; src/chrome76.setup.ts removes the DOM ones from the test runtime.
 * eslint-plugin-compat was not used: it needs a new dependency and a
 * browserslist data download, and the list covers the APIs we have hit.
 */

export default tseslint.config(
	{ ignores: ["vitest.config.ts"] },
	...baseConfig,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ["src/**/*.ts"],
		ignores: ["src/**/*.test.ts"],
		rules: {
			"no-restricted-properties": ["error", ...chrome76Properties],
			"no-restricted-globals": [
				"error",
				{ name: "structuredClone", message: CHROME_76 },
			],
			// These two would push code toward the APIs banned above.
			"unicorn/prefer-at": "off",
			"unicorn/prefer-string-replace-all": "off",
			"unicorn/prefer-dom-node-append": "off",
		},
	}
);

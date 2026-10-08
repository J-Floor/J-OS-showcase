import baseConfig from "@j-os/config-eslint";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{ ignores: ["vitest.config.ts", "**/*.demo.tsx"] },
	...baseConfig,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
);

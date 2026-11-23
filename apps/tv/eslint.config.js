import baseConfig from "@j-os/config-eslint";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{ ignores: ["dist/**", "vite.config.ts"] },
	...baseConfig,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	}
);

import baseConfig from "@j-os/config-eslint";

export default [
	{ ignores: ["dist/**"] },
	...baseConfig,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
];

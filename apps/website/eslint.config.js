import base from "@j-os/config-eslint";
export default [
	...base,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: [
			"src/content.ts",
			"src/motion.ts",
			"src/introTimeline.ts",
			"src/introPlayback.ts",
			"src/introMotion.ts",
		],
		rules: { "@typescript-eslint/no-magic-numbers": "off" },
	},
];

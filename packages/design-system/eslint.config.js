import baseConfig from "@j-os/config-eslint";
import tseslint from "typescript-eslint";

// A rule's options replace the base config's, so keep its selectors.
const baseRestrictedSyntax = baseConfig
	.map((entry) => entry.rules?.["no-restricted-syntax"])
	.find(Boolean)
	.slice(1);

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
	{
		files: ["src/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-syntax": [
				"error",
				...baseRestrictedSyntax,
				{
					selector: "MemberExpression[property.name='_id']",
					message:
						"The design system knows no backend: take an `id` (or a key accessor) from the caller instead of reading `._id`.",
				},
			],
		},
	}
);

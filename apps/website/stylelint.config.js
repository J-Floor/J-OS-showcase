/** @type {import('stylelint').Config} */
export default {
	extends: ["@j-os/config-stylelint"],
	rules: {
		// The website is standalone: it does not depend on the design system, so
		// it has no breakpoint or hover mixins to use and keeps its own queries.
		"media-feature-name-disallowed-list": null,
		"selector-pseudo-class-disallowed-list": null,
		"scale-unlimited/declaration-strict-value": null,
		"selector-pseudo-class-no-unknown": [
			true,
			{ ignorePseudoClasses: ["global"] },
		],
	},
	overrides: [
		{
			files: ["**/tokens.scss"],
			rules: {
				"declaration-property-value-disallowed-list": null,
				"scale-unlimited/declaration-strict-value": null,
			},
		},
	],
};

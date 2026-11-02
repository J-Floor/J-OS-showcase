// types/ambient-in-dts: `declare global` and `declare module "x"` change types
// in files that never import them. Keeping them in *.d.ts files lets the
// convex lint task (apps/web/turbo.json) hash src's .d.ts files and skip the
// rest of src. Tested by ambientInDts.test.js.

export const ambientInDts = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require global augmentations and ambient modules to live in .d.ts files",
		},
		messages: {
			moveToDts:
				"Move this ambient declaration to a .d.ts file: the convex lint task in turbo.json hashes src/**/*.d.ts and no other src file.",
		},
		schema: [],
	},
	create(context) {
		if (context.filename.endsWith(".d.ts")) return {};
		return {
			TSModuleDeclaration(node) {
				if (node.kind === "global" || node.id.type === "Literal") {
					context.report({ node, messageId: "moveToDts" });
				}
			},
		};
	},
};

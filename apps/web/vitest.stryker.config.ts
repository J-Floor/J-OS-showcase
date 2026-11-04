import { defineConfig } from "vitest/config";

import base from "./vite.config.ts";

// Stryker's runner reruns test files in one worker, and module-level test seams
// can then bind to stale module instances, which fails parts of the whole suite.
// Mutation runs use only the tests aimed at the mutated modules.
export default defineConfig((env) => {
	const config = base(env);
	return {
		...config,
		test: {
			...config.test,
			include: [
				"convex/**/*{door,Door,auth,Auth,role,Role,presence,Presence}*.test.ts",
				"src/lib/ability.test.tsx",
			],
		},
	};
});

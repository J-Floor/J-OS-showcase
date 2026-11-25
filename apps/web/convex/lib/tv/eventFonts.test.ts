// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { EVENT_FONTS } from "./eventFonts.ts";

const require = createRequire(import.meta.url);

describe("EVENT_FONTS", () => {
	it.each(Object.values(EVENT_FONTS))(
		"is $source as installed (run bun run tv:fonts after a font bump)",
		(font) => {
			expect(font.hex).toBe(
				readFileSync(require.resolve(font.source)).toString("hex")
			);
		}
	);
});

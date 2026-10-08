import { getPartStyles } from "./partStyling.ts";

test("merges module class with part override", () => {
	const styles = { content: "c_hash" } as Record<string, string>;
	const props = { classOverride: { contentClass: "custom" } };
	expect(getPartStyles(styles, props, "content")).toContain("c_hash");
	expect(getPartStyles(styles, props, "content")).toContain("custom");
});

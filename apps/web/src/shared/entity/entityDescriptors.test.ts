// @vitest-environment happy-dom
import { expect, test } from "vitest";

import { descriptorForLink } from "./entityDescriptor.ts";
import { entityDescriptors } from "./entityDescriptors.ts";

test("a perk link (a request email, the bell) resolves to the perks descriptor", () => {
	const link = descriptorForLink("/perks?perk=perk1", entityDescriptors);
	expect(link?.desc.key).toBe("perk");
	expect(link?.slug).toBe("perk1");
});

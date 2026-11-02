// @vitest-environment happy-dom
import { expect, test } from "vitest";

import { descriptorForLink } from "./entityDescriptor.ts";
import { entityDescriptors } from "./entityDescriptors.ts";

test("a perk link (a request email, the bell) resolves to the perks descriptor", () => {
	const link = descriptorForLink("/perks?perk=perk1", entityDescriptors);
	expect(link?.desc.key).toBe("perk");
	expect(link?.slug).toBe("perk1");
});

test("a perk request link (the request email, the bell) resolves to the request descriptor", () => {
	const link = descriptorForLink(
		"/perks?tab=requests&request=request1",
		entityDescriptors
	);
	expect(link?.desc.key).toBe("request");
	expect(link?.slug).toBe("request1");
});

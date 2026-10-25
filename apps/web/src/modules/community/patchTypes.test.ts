import type { FunctionArgs } from "convex/server";
import { expectTypeOf, it } from "vitest";

import type { api } from "../../../convex/_generated/api";

import type { ProfilePatch } from "./MyProfile.tsx";
import type { PersonPatch } from "./sheets/PersonEditor.tsx";

/** Stand-ins for the editors' savers: all that matters is the parameter type. */
function savePerson(fields: PersonPatch): PersonPatch {
	return fields;
}
function saveProfile(fields: ProfilePatch): ProfilePatch {
	return fields;
}

it("the board sheet's patch is people.update's arguments bar the id", () => {
	expectTypeOf<PersonPatch>().toEqualTypeOf<
		Omit<FunctionArgs<typeof api.people.update>, "id">
	>();
	savePerson({ firstName: "Ada", ventureName: "Engine Co" });
	// @ts-expect-error -- a misspelt field is not a field of people.update
	savePerson({ firstNme: "Ada" });
});

it("the member's own patch is updateOwnProfile's arguments", () => {
	expectTypeOf<ProfilePatch>().toEqualTypeOf<
		FunctionArgs<typeof api.people.updateOwnProfile>
	>();
	saveProfile({ phone: "+41 79 000 00 00" });
	// @ts-expect-error -- a misspelt field is not a field of updateOwnProfile
	saveProfile({ phon: "+41 79 000 00 00" });
});

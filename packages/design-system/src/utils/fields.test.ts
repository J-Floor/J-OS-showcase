import { expect, expectTypeOf, test } from "vitest";

import { type FieldDefinition, defineFields, morphPart } from "./fields.ts";
import { MORPH_KEY } from "./morphNames.ts";

const fields = defineFields({
	status: { label: "Status", icon: "flag" },
	dueDate: { label: "Due date" },
});

test("each field's key is its own name", () => {
	expect(fields.status).toEqual({
		key: "status",
		label: "Status",
		icon: "flag",
	});
	expect(fields.dueDate.key).toBe("dueDate");
	expectTypeOf(fields.status.key).toEqualTypeOf<"status">();
	expectTypeOf(fields.status).toExtend<FieldDefinition>();
});

test("morphPart marks the element with the field's key", () => {
	expect(morphPart(fields.dueDate)).toEqual({ [MORPH_KEY]: "dueDate" });
});

test("morphPart without a field marks nothing", () => {
	expect(morphPart()).toEqual({});
});

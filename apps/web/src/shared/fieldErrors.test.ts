import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";

import { createFieldErrors } from "./fieldErrors.ts";

describe("createFieldErrors", () => {
	it("hides errors until a submit attempt", () => {
		const [show, setShow] = createSignal(false);
		const { errProps } = createFieldErrors(show);
		expect(errProps("Required.")).toEqual({
			invalid: false,
			errorText: undefined,
		});
		setShow(true);
		expect(errProps("Required.")).toEqual({
			invalid: true,
			errorText: "Required.",
		});
		expect(errProps(null)).toEqual({
			invalid: false,
			errorText: undefined,
		});
	});
});

import { expect, it } from "vitest";

import { createBackoff } from "./backoff.ts";

const MIN = 60_000;
let clock = 1_000_000;

function make() {
	clock = 1_000_000;
	return createBackoff({ now: () => clock });
}

it("holds a failed version back for 5 minutes, then releases it", () => {
	const backoff = make();
	expect(backoff.isBackedOff(1)).toBe(false);
	backoff.recordFailure(1);
	expect(backoff.isBackedOff(1)).toBe(true);
	expect(backoff.isBackedOff(2)).toBe(false);
	clock += 5 * MIN;
	expect(backoff.isBackedOff(1)).toBe(false);
});

it("doubles per failure of the same version up to 60 minutes", () => {
	const backoff = make();
	for (const minutes of [5, 10, 20, 40, 60, 60]) {
		backoff.recordFailure(1);
		clock += minutes * MIN - 1;
		expect(backoff.isBackedOff(1)).toBe(true);
		clock += 1;
		expect(backoff.isBackedOff(1)).toBe(false);
	}
});

it("restarts at 5 minutes for a different version", () => {
	const backoff = make();
	backoff.recordFailure(1);
	backoff.recordFailure(1);
	backoff.recordFailure(2);
	clock += 5 * MIN;
	expect(backoff.isBackedOff(2)).toBe(false);
});

it("does not hold back when the clock went back past the maximum", () => {
	const backoff = make();
	backoff.recordFailure(1);
	clock -= 2 * 60 * MIN;
	expect(backoff.isBackedOff(1)).toBe(false);
});

it("clear forgets the failure", () => {
	const backoff = make();
	backoff.recordFailure(1);
	backoff.clear();
	expect(backoff.isBackedOff(1)).toBe(false);
});

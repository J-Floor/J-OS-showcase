import { describe, expect, it } from "vitest";

import { introPhrases, introState } from "./introTimeline.ts";

describe("intro scroll narrative", () => {
	it.each([
		[0, "a community of founders"],
		[0.28, "the community of founders in Zurich"],
		[0.55, "the space for founders in Zurich"],
		[0.76, "the space for innovation in Zurich"],
	] as const)("holds the intended sentence at %s", (progress, sentence) => {
		const state = introState(progress);
		expect(introPhrases[state.from].join(" ")).toBe(sentence);
		expect(state.sentenceOpacity).toBe(1);
		expect(state.logoProgress).toBe(0);
	});
	it.each([0.1, 0.15, 0.2, 0.38, 0.45, 0.66])(
		"changes one word at a time at %s",
		(progress) => {
			const state = introState(progress);
			const from = introPhrases[state.from];
			const to = introPhrases[state.to];
			expect(
				from.filter((word) => !to.includes(word)).length
			).toBeLessThanOrEqual(1);
			expect(to.filter((word) => !from.includes(word))).toHaveLength(1);
			expect(state.mix).toBeGreaterThan(0);
			expect(state.mix).toBeLessThan(1);
		}
	);
	it("removes the sentence before assembling the logo", () => {
		expect(introState(0.85).sentenceOpacity).toBeGreaterThan(0);
		expect(introState(0.85).logoProgress).toBe(0);
		expect(introState(0.9).sentenceOpacity).toBe(0);
		expect(introState(0.9).logoProgress).toBeGreaterThan(0);
		expect(introState(0.97).logoProgress).toBe(1);
	});
	it("reverses deterministically and handles large scroll jumps", () => {
		const forward = introState(0.45);
		introState(1);
		expect(introState(0.45)).toEqual(forward);
		expect(introState(-1)).toEqual(introState(0));
		expect(introState(2)).toEqual(introState(1));
		expect(introState(0).from).toBe(0);
	});
});

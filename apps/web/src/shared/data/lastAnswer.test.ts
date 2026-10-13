import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAnswers, lastAnswer, rememberAnswer } from "./lastAnswer.ts";
import { setKeeperActive } from "./queryKeeper.ts";

describe("lastAnswer", () => {
	beforeEach(() => {
		setKeeperActive(true);
	});
	afterEach(() => {
		clearAnswers();
		setKeeperActive(false);
		vi.useRealTimers();
	});

	it("remembers and clears", () => {
		rememberAnswer("a", 1);
		rememberAnswer("b", 2);
		expect(lastAnswer<number>("a", 1_000)).toBe(1);
		clearAnswers();
		expect(lastAnswer("a", 1_000)).toBeUndefined();
		expect(lastAnswer("b", 1_000)).toBeUndefined();
	});

	it("an answer older than maxAgeMs is not returned", () => {
		vi.useFakeTimers();
		rememberAnswer("a", 1);
		vi.advanceTimersByTime(1_001);
		expect(lastAnswer("a", 1_000)).toBeUndefined();
	});

	it("remembers nothing while the keeper is off", () => {
		setKeeperActive(false);
		rememberAnswer("a", 1);
		expect(lastAnswer("a", 1_000)).toBeUndefined();
	});
});

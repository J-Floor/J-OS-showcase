// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

import type { Doc } from "../../../../../convex/_generated/dataModel";
import { RULES_SEARCH_LABEL } from "../../../../shared/rules/rulesContent.ts";

import { RulesStep } from "./RulesStep.tsx";

const person = {
	tier: "member",
	stage: "onboarding",
	stageSince: Date.now(),
} as Doc<"people">;

test("search filters the rule cards and agreeing completes the step", () => {
	const onComplete = vi.fn(() => Promise.resolve());
	render(() => <RulesStep person={person} onComplete={onComplete} />);
	const all = screen.getAllByRole("listitem").length;
	fireEvent.input(
		screen.getByRole("searchbox", { name: RULES_SEARCH_LABEL }),
		{
			target: { value: "dishwasher" },
		}
	);
	expect(screen.getAllByRole("listitem").length).toBeLessThan(all);
	fireEvent.click(screen.getByRole("button", { name: /agree/i }));
	expect(onComplete).toHaveBeenCalledTimes(1);
});

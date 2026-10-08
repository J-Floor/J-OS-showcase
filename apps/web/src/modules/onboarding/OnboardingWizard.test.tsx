// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

afterEach(cleanup);

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

import type { Doc } from "../../../convex/_generated/dataModel";

import { OnboardingWizardView } from "./OnboardingWizard.tsx";

function personWith(steps: Record<string, { completedAt: number }>) {
	return {
		type: "member",
		tier: "member",
		stage: "onboarding",
		onboarding: { steps },
	} as unknown as Doc<"people">;
}

test("renders the first incomplete step and its progress", () => {
	render(() => (
		<OnboardingWizardView
			person={personWith({
				welcome: { completedAt: 1 },
				document: { completedAt: 1 },
			})}
			onComplete={() => Promise.resolve()}
			onResume={() => Promise.resolve({ activated: false })}
		/>
	));
	// welcome + document done → current step is "rules" (step 3 of 4).
	expect(screen.getByText("House rules")).toBeInTheDocument();
	expect(screen.getByText(/3 of 4/i)).toBeInTheDocument();
});

const ALL_DONE = {
	welcome: { completedAt: 1 },
	document: { completedAt: 1 },
	rules: { completedAt: 1 },
	visit: { completedAt: 1 },
};

test("with no step left, resumes once and never says All done", async () => {
	let calls = 0;
	render(() => (
		<OnboardingWizardView
			person={personWith(ALL_DONE)}
			onComplete={() => Promise.resolve()}
			onResume={() => {
				calls += 1;
				return Promise.resolve({ activated: false });
			}}
		/>
	));
	expect(await screen.findByText("Almost there")).toBeInTheDocument();
	expect(calls).toBe(1);
	expect(screen.queryByText(/All done/)).toBeNull();
});

test("a failed resume shows the same message", async () => {
	render(() => (
		<OnboardingWizardView
			person={personWith(ALL_DONE)}
			onComplete={() => Promise.resolve()}
			onResume={() => Promise.reject(new Error("boom"))}
		/>
	));
	expect(await screen.findByText("Almost there")).toBeInTheDocument();
});

test("an activated resume keeps the loading screen for the redirect, never Almost there", async () => {
	let calls = 0;
	render(() => (
		<OnboardingWizardView
			person={personWith(ALL_DONE)}
			onComplete={() => Promise.resolve()}
			onResume={() => {
				calls += 1;
				return Promise.resolve({ activated: true });
			}}
		/>
	));
	expect(calls).toBe(1);
	// Let the resolved resume settle before asserting what is on screen.
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
	expect(screen.queryByText("Almost there")).toBeNull();
	expect(screen.queryByText(/All done/)).toBeNull();
});

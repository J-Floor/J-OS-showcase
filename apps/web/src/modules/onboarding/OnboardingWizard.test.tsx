// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { err, ok } from "neverthrow";
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
			onComplete={() => Promise.resolve(ok(undefined))}
			onResume={() => Promise.resolve(ok({ activated: false }))}
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
			onComplete={() => Promise.resolve(ok(undefined))}
			onResume={() => {
				calls += 1;
				return Promise.resolve(ok({ activated: false }));
			}}
		/>
	));
	expect(await screen.findByText("Almost there")).toBeInTheDocument();
	expect(calls).toBe(1);
	expect(screen.queryByText(/All done/)).toBeNull();
});

test("a failed resume shows the same message and the server's reason", async () => {
	render(() => (
		<OnboardingWizardView
			person={personWith(ALL_DONE)}
			onComplete={() => Promise.resolve(ok(undefined))}
			onResume={() =>
				Promise.resolve(
					err({ code: "NotOnboarding", message: "Not onboarding." })
				)
			}
		/>
	));
	expect(await screen.findByText("Almost there")).toBeInTheDocument();
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Not onboarding."
	);
});

test("a refused step completion shows its reason under the step", async () => {
	render(() => (
		<OnboardingWizardView
			person={personWith({})}
			onComplete={() =>
				Promise.resolve(
					err({ code: "Forbidden", message: "You can't do that." })
				)
			}
			onResume={() => Promise.resolve(ok({ activated: false }))}
		/>
	));
	fireEvent.click(screen.getByRole("button", { name: /let's go/i }));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"You can't do that."
	);
	// The step is still on screen so the person can try again.
	expect(screen.getByRole("button", { name: /let's go/i })).toBeVisible();
});

test("an activated resume keeps the loading screen for the redirect, never Almost there", async () => {
	let calls = 0;
	render(() => (
		<OnboardingWizardView
			person={personWith(ALL_DONE)}
			onComplete={() => Promise.resolve(ok(undefined))}
			onResume={() => {
				calls += 1;
				return Promise.resolve(ok({ activated: true }));
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

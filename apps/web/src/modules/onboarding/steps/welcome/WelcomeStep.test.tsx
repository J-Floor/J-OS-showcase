// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

import type { Doc } from "../../../../../convex/_generated/dataModel";

import { WelcomeStep } from "./WelcomeStep.tsx";

const person = {
	tier: "member",
	stage: "onboarding",
	stageSince: Date.now(),
} as Doc<"people">;

test("welcomes the member and continues", () => {
	const onComplete = vi.fn(() => Promise.resolve());
	render(() => <WelcomeStep person={person} onComplete={onComplete} />);
	expect(screen.getByText(/set up/i)).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: /let's go/i }));
	expect(onComplete).toHaveBeenCalledTimes(1);
});

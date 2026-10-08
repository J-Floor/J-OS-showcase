// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

import type { Doc } from "../../../../../convex/_generated/dataModel";

import { WifiStep } from "./WifiStep.tsx";

const person = {
	tier: "member",
	stage: "onboarding",
	stageSince: Date.now(),
} as Doc<"people">;

test("points to the Space page and continues", () => {
	const onComplete = vi.fn(() => Promise.resolve());
	render(() => <WifiStep person={person} onComplete={onComplete} />);
	// Tells the member where the WiFi credentials live (no QR in onboarding —
	// it's often done remotely, where a WiFi QR can't connect or save).
	expect(screen.getByText(/space page/i)).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: /continue/i }));
	expect(onComplete).toHaveBeenCalledTimes(1);
});

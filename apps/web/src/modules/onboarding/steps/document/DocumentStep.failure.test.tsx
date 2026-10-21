// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { ConvexError } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

vi.mock("convex-solidjs", () => ({
	useAction: () => ({
		mutateAsync: vi.fn(() =>
			Promise.reject(
				new ConvexError({
					code: "NotOnboarding",
					message: "You are not in an onboarding state.",
				})
			)
		),
	}),
}));

import type { Doc } from "../../../../../convex/_generated/dataModel";

import { DocumentStep } from "./DocumentStep.tsx";

const person = {
	tier: "member",
	stage: "onboarding",
	stageSince: Date.now(),
	firstName: "Ada",
	lastName: "Lovelace",
	venture: { name: "Engine Co" },
	email: "ada@example.com",
} as Doc<"people">;

test("a refused preview says why and falls back to the blank agreement", async () => {
	render(() => (
		<DocumentStep person={person} onComplete={() => Promise.resolve()} />
	));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"You are not in an onboarding state."
	);
	fireEvent.click(screen.getByRole("button", { name: /read inline/i }));
	expect(document.querySelector("object")?.getAttribute("data")).toBe(
		"/agreements/member.pdf"
	);
});

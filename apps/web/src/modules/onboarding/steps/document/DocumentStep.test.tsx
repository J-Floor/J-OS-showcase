// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

vi.mock("convex-solidjs", () => ({
	useAction: () => ({ mutateAsync: vi.fn(() => Promise.resolve(null)) }),
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

const guest = {
	tier: "guest",
	stage: "onboarding",
	stageSince: Date.now(),
	firstName: "Gia",
	lastName: "Guest",
	venture: { name: "Guest Co" },
	email: "gia@example.com",
} as Doc<"people">;

test("disables Sign until a signature is drawn", () => {
	render(() => (
		<DocumentStep person={person} onComplete={() => Promise.resolve()} />
	));
	// No checkbox gate anymore — the drawn signature is the binding act, so the
	// button is disabled until one exists.
	const sign = screen.getByRole("button", { name: /sign & continue/i });
	expect(sign).toBeDisabled();
	expect(screen.queryByRole("checkbox")).toBeNull();
});

test("hides the inline PDF by default and toggles it with View inline", () => {
	render(() => (
		<DocumentStep person={person} onComplete={() => Promise.resolve()} />
	));
	expect(document.querySelector("object")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: /read inline/i }));
	expect(document.querySelector("object")).not.toBeNull();
	fireEvent.click(screen.getByRole("button", { name: /hide inline/i }));
	expect(document.querySelector("object")).toBeNull();
});

test("offers a Download PDF button", () => {
	render(() => (
		<DocumentStep person={person} onComplete={() => Promise.resolve()} />
	));
	expect(
		screen.getByRole("button", { name: /download pdf/i })
	).toBeInTheDocument();
});

test("shows the person's company from venture.name", () => {
	render(() => (
		<DocumentStep person={person} onComplete={() => Promise.resolve()} />
	));
	expect(screen.getByText("Engine Co")).toBeInTheDocument();
});

test("uses the guest template for a guest's preview, not the member one", () => {
	render(() => (
		<DocumentStep person={guest} onComplete={() => Promise.resolve()} />
	));
	fireEvent.click(screen.getByRole("button", { name: /read inline/i }));
	const doc = document.querySelector("object");
	expect(doc?.getAttribute("data")).toBe("/agreements/guest.pdf");
});

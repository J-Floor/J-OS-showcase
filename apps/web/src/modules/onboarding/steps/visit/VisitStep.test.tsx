// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

// Mock convex-solidjs so useQuery in VisitStep doesn't require a ConvexProvider.
// Default: no host and no invite link configured.
const { hostMock, inviteMock } = vi.hoisted(() => ({
	hostMock: vi.fn(() => ({
		data: () => null as { name: string; phone?: string } | null,
	})),
	inviteMock: vi.fn(() => ({ data: () => null as string | null })),
}));

vi.mock("convex-solidjs", async () => {
	const { getFunctionName } = await import("convex/server");
	return {
		useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
			getFunctionName(ref) === "onboarding:whatsappInvite"
				? inviteMock()
				: hostMock(),
	};
});

import type { Doc } from "../../../../../convex/_generated/dataModel";

import { VisitStep } from "./VisitStep.tsx";

const person = {
	tier: "member",
	stage: "onboarding",
	stageSince: Date.now(),
} as Doc<"people">;

test("shows the address and finishes", () => {
	const onComplete = vi.fn(() => Promise.resolve());
	render(() => <VisitStep person={person} onComplete={onComplete} />);
	expect(screen.getByText(/Josefstrasse 206/)).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: /finish/i }));
	expect(onComplete).toHaveBeenCalledTimes(1);
});

test("opens a WhatsApp chat with the host (no tel: call link) when a host phone resolves", () => {
	hostMock.mockReturnValueOnce({
		data: () => ({ name: "Ada Host", phone: "+1 555 0103" }),
	});
	const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
	render(() => (
		<VisitStep person={person} onComplete={() => Promise.resolve()} />
	));
	// No tel: call link — hosts don't want cold calls.
	expect(screen.queryByRole("link", { name: /ada host/i })).toBeNull();
	fireEvent.click(
		screen.getByRole("button", {
			name: /message ada host on whatsapp/i,
		})
	);
	// Strips "+" and spaces to the bare international number for wa.me.
	expect(openSpy).toHaveBeenCalledWith(
		"https://wa.me/15550103",
		"_blank",
		"noopener,noreferrer"
	);
	openSpy.mockRestore();
});

test("opens the configured invite link when there is no host", () => {
	inviteMock.mockReturnValueOnce({
		data: () => "https://chat.whatsapp.com/EXAMPLEINVITE",
	});
	const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
	render(() => (
		<VisitStep person={person} onComplete={() => Promise.resolve()} />
	));
	fireEvent.click(
		screen.getByRole("button", { name: /message us on whatsapp/i })
	);
	expect(openSpy).toHaveBeenCalledWith(
		"https://chat.whatsapp.com/EXAMPLEINVITE",
		"_blank",
		"noopener,noreferrer"
	);
	openSpy.mockRestore();
});

test("offers no WhatsApp action when no invite link is configured", () => {
	render(() => (
		<VisitStep person={person} onComplete={() => Promise.resolve()} />
	));
	expect(screen.queryByRole("button", { name: /whatsapp/i })).toBeNull();
});

test("opens a maps search for the street address shown on the step", () => {
	const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
	render(() => (
		<VisitStep person={person} onComplete={() => Promise.resolve()} />
	));
	fireEvent.click(screen.getByRole("button", { name: /view on maps/i }));
	expect(openSpy).toHaveBeenCalledWith(
		"https://www.google.com/maps/search/?api=1&query=Josefstrasse%20206%2C%208005%20Z%C3%BCrich",
		"_blank",
		"noopener,noreferrer"
	);
	openSpy.mockRestore();
});

// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";

const { approveAsGuest } = vi.hoisted(() => ({
	approveAsGuest: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("./triage.ts", () => ({ useTriage: () => ({ approveAsGuest }) }));
// Stubbed down to the one thing this dialog cares about — that a host was
// chosen. Driving the real Ark listbox here would be testing zag's machine,
// which zag already tests, and the dialog's own rule (host required, date not)
// would be buried under the mechanics of opening a portalled listbox.
vi.mock("../columns/HostSelect.tsx", () => ({
	HostSelect: (props: { onCommit: (id: unknown) => void }) => (
		<button
			type="button"
			onClick={() => {
				props.onCommit("board1");
			}}
		>
			pick host
		</button>
	),
}));

import { GuestExpiryProvider, useGuestExpiry } from "./guestExpiry.tsx";

// jsdom gaps ark-ui touches at mount: it measures (no layout engine, no
// ResizeObserver) and drives pointer capture on the Select trigger.
if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}
if (!(Element.prototype as { hasPointerCapture?: unknown }).hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
}
if (
	!(Element.prototype as { releasePointerCapture?: unknown })
		.releasePointerCapture
) {
	Element.prototype.releasePointerCapture = () => {};
}
if (!("ResizeObserver" in globalThis)) {
	(globalThis as Record<string, unknown>).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

/** Stands in for the "Make guest" button on a row or in the drawer. */
function Harness() {
	const request = useGuestExpiry();
	return (
		<button
			type="button"
			onClick={() => {
				request(["applicant1" as Id<"people">]);
			}}
		>
			make guest
		</button>
	);
}

/** Renders the provider, opens the dialog the way the console does, and waits
 *  for it. The dialog stays MOUNTED while closed (that is what lets it animate
 *  in and out), so waiting on the `dialog` role — which ignores a hidden
 *  subtree — is what actually proves it opened. */
async function open(): Promise<HTMLElement> {
	render(() => (
		<GuestExpiryProvider>
			<Harness />
		</GuestExpiryProvider>
	));
	fireEvent.click(screen.getByRole("button", { name: /make guest/i }));
	await waitFor(() => screen.getByRole("dialog"));
	return screen.getByRole("button", { name: /grant guest access/i });
}

function chooseHost(): void {
	fireEvent.click(screen.getByRole("button", { name: /pick host/i }));
}

afterEach(cleanup);
beforeEach(() => {
	approveAsGuest.mockClear();
});

describe("the make-guest dialog", () => {
	it("grants open-ended access when no expiry date is chosen", async () => {
		// The expiry USED to be optional and has to stay that way: the board
		// grants residents with no end date in sight. The lifecycle cutover made
		// `until` mandatory, which took the capability away without anyone
		// deciding to.
		await open();
		chooseHost();
		// Re-queried, not reused: the disabled Button carries a reason tooltip
		// and swaps its own node when the reason goes away, so the handle from
		// before the host was picked points at a node no longer on screen.
		const grant = await waitFor(() => {
			const button = screen.getByRole("button", {
				name: /grant guest access/i,
			});
			expect(button).not.toBeDisabled();
			return button;
		});
		fireEvent.click(grant);
		await Promise.resolve();
		expect(approveAsGuest).toHaveBeenCalledWith(
			"applicant1",
			// No date chosen → no window to send.
			undefined,
			"board1",
			false
		);
	});

	it("still refuses to approve without a host", async () => {
		// The one field that is genuinely required: a guest with no host has
		// nobody to ask when something goes wrong.
		expect(await open()).toBeDisabled();
	});
});

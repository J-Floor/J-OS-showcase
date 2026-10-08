// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import type { Doc } from "../../../../convex/_generated/dataModel";
import type { PersonStatus } from "../../../../convex/lib/derive.ts";

afterEach(cleanup);

// The date picker and the segment both measure; jsdom does neither.
if (!("ResizeObserver" in globalThis)) {
	(globalThis as Record<string, unknown>).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}
if (!(Element.prototype as { hasPointerCapture?: unknown }).hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
}
if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}

const extendWindow = vi.fn().mockResolvedValue(undefined);
vi.mock("../actions/triage.ts", () => ({
	useTriage: () => ({ extendWindow }),
}));
vi.mock("../../../shared/confirm.tsx", () => ({
	useConfirm: () => () => Promise.resolve(true),
}));
const agreementQuery = vi.fn().mockResolvedValue("https://files.example/a.pdf");
vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutateAsync: () => Promise.resolve() }),
	useConvexClient: () => ({ query: agreementQuery }),
}));

import { StatusSection } from "./StatusSection.tsx";

const UNTIL = new Date(2027, 0, 15, 0, 0, 1).getTime();

function guest(over: Partial<Doc<"people">> = {}): Doc<"people"> {
	return {
		_id: "p1",
		_creationTime: 0,
		email: "grace@example.com",
		firstName: "Grace",
		lastName: "Hopper",
		tier: "guest",
		stage: "active",
		stageSince: 0,
		accessUntil: UNTIL,
		...over,
	} as unknown as Doc<"people">;
}

function status(): PersonStatus {
	return {
		tier: "guest",
		stage: "active",
		tone: "success",
		flags: [],
		facts: [{ id: "access_until", at: UNTIL }],
		boardTasks: [],
		sinceDays: 0,
	};
}

/** The date field's segmented input, if one is on screen. */
function dateField(): HTMLElement | null {
	return document.querySelector('[data-scope="date-input"]');
}

test("reads as text until the drawer is unlocked", () => {
	render(() => <StatusSection status={status()} person={guest()} />);
	expect(screen.getByText("Access until")).toBeInTheDocument();
	expect(dateField()).toBeNull();
});

test("becomes a date field in edit mode", () => {
	// It is a board DECISION, not a consequence of one — the same reason the
	// door override is editable and the role is not.
	render(() => <StatusSection status={status()} person={guest()} editing />);
	expect(dateField()).not.toBeNull();
});

test("still offers the control for an access date of the epoch", () => {
	// `<Match>` tests its `when` for truthiness, so a bare `0` timestamp read as
	// "no match" and withheld the control with nothing to explain why. Zero is
	// not hypothetical here — the Notion import has already produced dates
	// nobody entered.
	const epochStatus: PersonStatus = {
		...status(),
		facts: [{ id: "access_until", at: 0 }],
	};
	render(() => (
		<StatusSection
			status={epochStatus}
			person={guest({ accessUntil: 0 })}
			editing
		/>
	));
	expect(dateField()).not.toBeNull();
});

test("stays text for someone the machine will not extend", () => {
	// `EXTEND_WINDOW` is legal from the guest states only. A member has no
	// window at all, and offering a field that cannot be saved is worse than
	// offering none.
	render(() => (
		<StatusSection
			status={status()}
			person={guest({ tier: "member", stage: "active" })}
			editing
		/>
	));
	expect(dateField()).toBeNull();
});

function signedStatus(state: "signed" | "missing"): PersonStatus {
	return { ...status(), facts: [{ id: "agreement", state }] };
}

test("the signed agreement opens from the drawer", async () => {
	// The roster row has had a "View agreement" button all along; the drawer
	// had none, so reading a member's agreement meant closing the drawer and
	// finding their row again.
	const tab = {
		opener: {} as unknown,
		location: { href: "" },
		close: vi.fn(),
	};
	const open = vi
		.spyOn(window, "open")
		.mockReturnValue(tab as unknown as Window);
	try {
		render(() => (
			<StatusSection status={signedStatus("signed")} person={guest()} />
		));
		screen.getByRole("button", { name: "Signed" }).click();
		// Opened synchronously, BEFORE the URL is known: a `window.open` after
		// an `await` is a popup as far as the browser is concerned.
		expect(open).toHaveBeenCalledWith("", "_blank");
		expect(agreementQuery).toHaveBeenCalled();
		await vi.waitFor(() => {
			expect(tab.location.href).toBe("https://files.example/a.pdf");
		});
	} finally {
		open.mockRestore();
	}
});

test("an unsigned agreement is not offered as a link", () => {
	// There is no document behind "Not signed", so a control there would open a
	// blank tab and immediately close it again.
	render(() => (
		<StatusSection status={signedStatus("missing")} person={guest()} />
	));
	expect(screen.getByText("Not signed")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Not signed" })).toBeNull();
});

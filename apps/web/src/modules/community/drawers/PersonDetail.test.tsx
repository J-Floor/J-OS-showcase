// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import type { Doc } from "../../../../convex/_generated/dataModel";
import type { PersonStatus } from "../../../../convex/lib/derive.ts";
import { EMAIL_IN_USE } from "../../../../convex/lib/emailAddress.ts";
import { factLine, headline } from "../status/copy.ts";

afterEach(cleanup);

// Edit mode mounts Selects, whose ark machines observe their trigger. jsdom has
// no ResizeObserver.
if (!("ResizeObserver" in globalThis)) {
	(globalThis as Record<string, unknown>).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

// `PersonDetail` calls `useMutation(api.people.completeBoardStep)` directly
// (for the Status section's board-task "Done" button) and opens two more
// `useQuery` subscriptions: `PersonTimeline`'s
// `api.personEvents.listForPerson` and, in the Info section's read-only view,
// `api.people.attendedEvents`. Stub all three so the drawer renders without a
// `ConvexProvider` — and, unlike `MembersTab.test.tsx`'s blanket
// `data: () => undefined` stub (which only ever exercises `PersonTimeline`'s
// loading fallback), hand back real rows so each query's actual wiring gets
// checked, not just its `Show` guard.
//
// Convex's `api` is a proxy whose refs aren't `===`-stable (see
// `InventoryPage.test.tsx`), so the mock routes by the query's stable string
// name via `getFunctionName` rather than by reference.
//
// `timelineQueryCalls` counts ONLY the timeline subscription, so the History
// section's lazy mount is still provable: the Info section's
// `attendedEvents` query is open by default regardless of History, and
// counting it too would make that assertion fail for the wrong reason.
const {
	completeBoardStepMock,
	timelineRows,
	attendedEventsRows,
	timelineQueryCalls,
	cancelEmailChangeMock,
	pendingEmailChange,
} = vi.hoisted(() => ({
	completeBoardStepMock: vi.fn(() => Promise.resolve()),
	cancelEmailChangeMock: vi.fn(() => Promise.resolve()),
	pendingEmailChange: {
		current: null as { newEmail: string } | null,
	},
	timelineRows: {
		current: [] as Record<string, unknown>[],
	},
	attendedEventsRows: {
		current: [] as Record<string, unknown>[],
	},
	timelineQueryCalls: { count: 0 },
}));

vi.mock("convex-solidjs", () => ({
	useMutation: (fn: unknown) => ({
		mutateAsync:
			getFunctionName(fn as Parameters<typeof getFunctionName>[0]) ===
			"people:cancelEmailChange"
				? cancelEmailChangeMock
				: completeBoardStepMock,
		mutate: vi.fn(),
		data: () => undefined,
		error: () => undefined,
		isLoading: () => false,
		reset: vi.fn(),
	}),
	useQuery: (fn: unknown) => {
		const name = getFunctionName(
			fn as Parameters<typeof getFunctionName>[0]
		);
		if (name === "people:pendingEmailChange") {
			return {
				data: () => pendingEmailChange.current,
				isLoading: () => false,
				error: () => undefined,
			};
		}
		if (name === "people:attendedEvents") {
			return {
				data: () => attendedEventsRows.current,
				isLoading: () => false,
				error: () => undefined,
			};
		}
		timelineQueryCalls.count += 1;
		return {
			data: () => timelineRows.current,
			isLoading: () => false,
			error: () => undefined,
		};
	},
	// The Status section's "Signed" line opens the agreement on click, which
	// resolves its URL through the raw client rather than a subscription.
	useConvexClient: () => ({ query: () => Promise.resolve(null) }),
}));

// `BoardNotes` (and `HostName`) read the board-level roster through `useBoardLevel`, which
// opens its OWN `useQuery` subscription. Left real, that subscription would be
// counted by `timelineQueryCalls` and break the "no timeline subscription while
// History is closed" assertion — a board-level query is not a timeline query. Stub it
// to a static roster so only `PersonTimeline`'s subscription reaches the
// counter.
vi.mock("../../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({
		data: () => [],
		isLoading: () => false,
		error: () => undefined,
	}),
}));

import { PersonDetail } from "./PersonDetail.tsx";

const ACTIVE_MEMBER: PersonStatus = {
	tier: "member",
	stage: "active",
	tone: "success",
	flags: [],
	facts: [
		{ id: "role", tier: "member" },
		{ id: "state", stage: "active", tone: "success" },
		{ id: "since", days: 10 },
		{ id: "agreement", state: "signed", variant: "member" },
		{ id: "door", state: "open" },
	],
	boardTasks: [],
	sinceDays: 10,
};

function person(
	over: Record<string, unknown> & { status: PersonStatus }
): Doc<"people"> & { status: PersonStatus } {
	return {
		_id: "p1",
		_creationTime: 0,
		email: "ada@example.com",
		firstName: "Ada",
		lastName: "Lovelace",
		tier: "member",
		stage: "active",
		...over,
	} as unknown as Doc<"people"> & { status: PersonStatus };
}

afterEach(() => {
	completeBoardStepMock.mockClear();
	timelineRows.current = [];
	attendedEventsRows.current = [];
	timelineQueryCalls.count = 0;
	cancelEmailChangeMock.mockClear();
	pendingEmailChange.current = null;
});

test("renders every status fact as its own labelled line", () => {
	render(() => <PersonDetail person={person({ status: ACTIVE_MEMBER })} />);
	// The label AND the value, next to each other — the point of the rewrite is
	// that no line needs decoding from its position. Worded by the UI's copy
	// module, so this also pins that the drawer routes through it.
	for (const fact of ACTIVE_MEMBER.facts) {
		const line = factLine(fact);
		expect(screen.getByText(line.label)).toBeInTheDocument();
		expect(screen.getByText(line.value)).toBeInTheDocument();
	}
	// And specifically: the value never repeats its own label.
	expect(screen.getByText("Agreement")).toBeInTheDocument();
	expect(screen.getByText("Signed")).toBeInTheDocument();
	expect(screen.queryByText("Member agreement signed")).toBeNull();
});

test("opens Status, Info and Notes by default, and leaves History closed", () => {
	render(() => <PersonDetail person={person({ status: ACTIVE_MEMBER })} />);
	expect(screen.getByRole("button", { name: /Status/ })).toHaveAttribute(
		"aria-expanded",
		"true"
	);
	expect(screen.getByRole("button", { name: /Info/ })).toHaveAttribute(
		"aria-expanded",
		"true"
	);
	expect(screen.getByRole("button", { name: /Notes/ })).toHaveAttribute(
		"aria-expanded",
		"true"
	);
	expect(screen.getByRole("button", { name: /History/ })).toHaveAttribute(
		"aria-expanded",
		"false"
	);
});

test("does not subscribe to the timeline while History is closed", () => {
	timelineRows.current = [
		{
			_id: "e1",
			at: 1_800_000_000_000,
			kind: "door",
			after: "force_off",
			actorName: "Sara",
		},
	];
	render(() => <PersonDetail person={person({ status: ACTIVE_MEMBER })} />);
	// `lazyMount` on the accordion: no query is opened at all, and no timeline
	// row is rendered, until the board asks for the history. The drawer is
	// re-mounted for every row they step through, so this is one Convex
	// subscription per row avoided.
	//
	// Only the closed direction is asserted here. Ark's accordion trigger does
	// not respond to a synthetic click under jsdom (verified: neither
	// `fireEvent.click`, a native `.click()`, nor Enter toggles `aria-expanded`,
	// on our wrapper OR on a bare `Ark.Accordion`), so the open direction is
	// Ark's contract rather than something this suite can drive.
	// `PersonTimeline.test.tsx` covers what renders once it is mounted.
	expect(timelineQueryCalls.count).toBe(0);
	expect(screen.queryByText("Door force_off")).toBeNull();
	expect(screen.getByRole("button", { name: /History/ })).toHaveAttribute(
		"aria-expanded",
		"false"
	);
});

test('shows "Came from" listing the attended event(s) when the person came through one', () => {
	attendedEventsRows.current = [
		{ eventId: "event1", name: "Hackathon Demo Night", confirmedAt: 0 },
		{ eventId: "event2", name: "Open House", confirmedAt: 0 },
	];
	render(() => <PersonDetail person={person({ status: ACTIVE_MEMBER })} />);
	expect(screen.getByText("Came from")).toBeInTheDocument();
	expect(
		screen.getByText("Hackathon Demo Night, Open House")
	).toBeInTheDocument();
});

test('renders no "Came from" row for a person who never attended an event', () => {
	render(() => <PersonDetail person={person({ status: ACTIVE_MEMBER })} />);
	expect(screen.queryByText("Came from")).toBeNull();
});

test("summarises the section with the headline, so a collapsed Status still says something", () => {
	render(() => <PersonDetail person={person({ status: ACTIVE_MEMBER })} />);
	expect(screen.getByText(headline(ACTIVE_MEMBER))).toBeInTheDocument();
});

test("shows what they told us when they applied, not just their contact details", () => {
	// These fields used to live only in the Applications drawer, so approving
	// someone hid the reason they were approved.
	render(() => (
		<PersonDetail
			person={person({
				status: ACTIVE_MEMBER,
				venture: {
					name: "Wardenclyffe",
					pastBuilt: "A coil, mostly",
					whyJoin: "Power for everyone",
					teamSize: 3,
				},
			})}
		/>
	));
	expect(screen.getByText("Past built")).toBeInTheDocument();
	expect(screen.getByText("A coil, mostly")).toBeInTheDocument();
	expect(screen.getByText("Why join")).toBeInTheDocument();
	// Absent fields leave no empty label behind — a board member has none of
	// this and should not read nine blank rows.
	expect(screen.queryByText("Description")).toBeNull();
	expect(screen.queryByText("Referral")).toBeNull();
});

test('clicking "Done" on a board task dispatches the step id to completeBoardStep, not the label', () => {
	render(() => (
		<PersonDetail
			person={person({
				tier: "member",
				stage: "onboarding",
				status: {
					...ACTIVE_MEMBER,
					stage: "onboarding",
					tone: "warning",
					boardTasks: [
						{ id: "whatsapp", label: "Add to WhatsApp group" },
					],
				},
			})}
		/>
	));
	expect(screen.getByText("Add to WhatsApp group")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: /Done/ }));
	expect(completeBoardStepMock).toHaveBeenCalledWith({
		personId: "p1",
		stepId: "whatsapp",
	});
});

test("edit mode offers every field the read-only view shows", () => {
	// The Applications drawer used to be a separate component. Folding it into
	// this one meant porting BOTH halves, and the first pass only did the
	// read-only side — so turning on edit mode silently hid the applicant's own
	// answers. Whatever a person's profile displays, they must be able to edit.
	const venture = {
		name: "Wardenclyffe",
		description: "Wireless power",
		pastBuilt: "A coil, mostly",
		whyJoin: "Power for everyone",
		referral: "A friend",
	};
	const labels = ["Description", "Past built", "Why join", "Referral"];

	render(() => (
		<PersonDetail person={person({ status: ACTIVE_MEMBER, venture })} />
	));
	for (const label of labels)
		expect(screen.getByText(label)).toBeInTheDocument();
	cleanup();

	render(() => (
		<PersonDetail
			person={person({ status: ACTIVE_MEMBER, venture })}
			editing
		/>
	));
	for (const label of labels)
		expect(screen.getByText(label)).toBeInTheDocument();
});

// Production redacts a plain Error's message; only a ConvexError's data
// reaches the client, so that is what the drawer must show.
function rejectNextUpdateWithClash(): void {
	completeBoardStepMock.mockImplementationOnce(() =>
		Promise.reject(new ConvexError(EMAIL_IN_USE))
	);
}

function commitEmail(from: string, to: string): void {
	const field = screen.getByDisplayValue(from);
	fireEvent.input(field, { target: { value: to } });
	fireEvent.blur(field);
}

test("a refused email shows the server's reason and puts the stored email back", async () => {
	rejectNextUpdateWithClash();
	render(() => (
		<PersonDetail
			person={person({ status: ACTIVE_MEMBER, email: "old@example.com" })}
			editing
		/>
	));
	commitEmail("old@example.com", "taken@example.com");
	expect(await screen.findByRole("alert")).toHaveTextContent(EMAIL_IN_USE);
	expect(completeBoardStepMock).toHaveBeenCalledWith(
		expect.objectContaining({ email: "taken@example.com" })
	);
	expect(screen.getByDisplayValue("old@example.com")).toBeInTheDocument();
	expect(screen.queryByDisplayValue("taken@example.com")).toBeNull();
});

test("a redacted server error shows a generic message, not the raw text", async () => {
	completeBoardStepMock.mockImplementationOnce(() =>
		Promise.reject(
			new Error("[CONVEX M(people:update)] [Request ID: 1] Server Error")
		)
	);
	render(() => (
		<PersonDetail
			person={person({ status: ACTIVE_MEMBER, email: "old@example.com" })}
			editing
		/>
	));
	commitEmail("old@example.com", "taken@example.com");
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Could not change the email."
	);
});

test("switching the drawer to another person clears the email error", async () => {
	rejectNextUpdateWithClash();
	const [current, setCurrent] = createSignal(
		person({ status: ACTIVE_MEMBER, _id: "p1", email: "old@example.com" })
	);
	render(() => <PersonDetail person={current()} editing />);
	commitEmail("old@example.com", "taken@example.com");
	await screen.findByRole("alert");
	setCurrent(
		person({ status: ACTIVE_MEMBER, _id: "p2", email: "other@example.com" })
	);
	expect(screen.queryByRole("alert")).toBeNull();
});

test("a refusal that lands after switching person is not shown on the new one", async () => {
	const pending: { refuse?: (err: unknown) => void } = {};
	completeBoardStepMock.mockImplementationOnce(
		() =>
			new Promise<void>((_, reject) => {
				pending.refuse = reject;
			})
	);
	const [current, setCurrent] = createSignal(
		person({ status: ACTIVE_MEMBER, _id: "p1", email: "old@example.com" })
	);
	render(() => <PersonDetail person={current()} editing />);
	commitEmail("old@example.com", "taken@example.com");
	setCurrent(
		person({ status: ACTIVE_MEMBER, _id: "p2", email: "other@example.com" })
	);
	pending.refuse?.(new ConvexError(EMAIL_IN_USE));
	// Let the rejected commit settle before asserting nothing appeared.
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(screen.queryByRole("alert")).toBeNull();
});

test("a flagged venture link is shown as text, not a clickable anchor", () => {
	render(() => (
		<PersonDetail
			person={person({
				status: ACTIVE_MEMBER,
				venture: {
					links: [
						{
							label: "",
							url: "https://evil.example/",
							threat: "MALWARE",
						},
						{ label: "", url: "https://good.example/" },
					],
				},
			})}
		/>
	));
	expect(screen.getByText(/https:\/\/evil\.example\//)).toBeInTheDocument();
	expect(screen.queryByRole("link", { name: /evil\.example/ })).toBeNull();
	expect(
		screen.getByRole("link", { name: /good\.example/ })
	).toBeInTheDocument();
});

test("a pending email change shows the address it waits on and keeps the stored email", () => {
	pendingEmailChange.current = { newEmail: "new@example.org" };
	render(() => (
		<PersonDetail
			person={person({ status: ACTIVE_MEMBER, email: "old@example.com" })}
			editing
		/>
	));
	expect(screen.getByRole("status")).toHaveTextContent(
		"Waiting for new@example.org to confirm"
	);
	expect(screen.getByDisplayValue("old@example.com")).toBeInTheDocument();
});

test("no pending email change, no notice", () => {
	render(() => (
		<PersonDetail
			person={person({ status: ACTIVE_MEMBER, email: "old@example.com" })}
			editing
		/>
	));
	expect(screen.queryByRole("status")).toBeNull();
});

test("Cancel withdraws the pending email change for this person", () => {
	pendingEmailChange.current = { newEmail: "new@example.org" };
	render(() => (
		<PersonDetail
			person={person({ status: ACTIVE_MEMBER, _id: "p1" })}
			editing
		/>
	));
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(cancelEmailChangeMock).toHaveBeenCalledWith({ personId: "p1" });
});

test("a later successful email commit clears the error", async () => {
	rejectNextUpdateWithClash();
	render(() => (
		<PersonDetail
			person={person({ status: ACTIVE_MEMBER, email: "old@example.com" })}
			editing
		/>
	));
	commitEmail("old@example.com", "taken@example.com");
	await screen.findByRole("alert");
	commitEmail("old@example.com", "free@example.com");
	await vi.waitFor(() => {
		expect(screen.queryByRole("alert")).toBeNull();
	});
	expect(completeBoardStepMock).toHaveBeenLastCalledWith(
		expect.objectContaining({ email: "free@example.com" })
	);
});

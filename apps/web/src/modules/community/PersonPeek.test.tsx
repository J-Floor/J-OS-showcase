// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@solidjs/testing-library";
import { okAsync } from "neverthrow";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { PersonRow } from "../../../convex/people.ts";
import { keyedIn } from "../../../test-stubs/morphKeys.tsx";
import { OPEN_DIALOG_CONTENT } from "../../shared/dialogSelectors.ts";
import { PeekContext } from "../../shared/entity/PeekContext.tsx";

import { PersonPeek } from "./PersonPeek.tsx";
import { renderWithSelection } from "./tabs/testSelection.tsx";

// Document-level key bindings outlive a test unless it is cleaned up.
afterEach(cleanup);

const mutateAsync = vi.fn(() => Promise.resolve());

vi.mock("convex-solidjs", () => ({
	useQuery: () => ({ data: () => {} }),
	useMutation: () => ({
		mutateAsync,
		mutate: vi.fn(),
		data: () => {},
		error: () => {},
		isLoading: () => false,
		reset: vi.fn(),
	}),
	useConvexClient: () => ({ query: vi.fn(() => Promise.resolve(null)) }),
}));

function person(
	id: string,
	tier: "prospect" | "member" | "guest",
	stage: string
): PersonRow {
	return {
		_id: id,
		_creationTime: 0,
		firstName: id,
		lastName: "Tester",
		email: `${id}@example.com`,
		tier,
		stage,
		hasAgreement: false,
		status: {
			tier,
			stage,
			tone: "info",
			flags: [],
			facts: [
				{ id: "role", tier },
				{ id: "since", days: 0 },
				{ id: "agreement", state: "not_required" },
				{ id: "door", state: "closed" },
			],
			boardTasks: [],
			sinceDays: 0,
		},
	} as unknown as PersonRow;
}

const applicant = person("applicant", "prospect", "verified");
const member = person("member", "member", "active");
const guest = person("guest", "guest", "active");

// The three rosters the mocked data hooks answer from; `undefined` is "not
// answered yet", as for a live subscription that is still loading.
const [applicationRows, setApplicationRows] = createSignal<
	PersonRow[] | undefined
>();
const [memberRows, setMemberRows] = createSignal<PersonRow[] | undefined>();
const [guestRows, setGuestRows] = createSignal<PersonRow[] | undefined>();

function setRosters(rosters: {
	applications?: PersonRow[];
	members?: PersonRow[];
	guests?: PersonRow[];
}): void {
	setApplicationRows(rosters.applications);
	setMemberRows(rosters.members);
	setGuestRows(rosters.guests);
}

beforeEach(() => {
	setRosters({
		applications: [applicant],
		members: [member],
		guests: [guest],
	});
	mutateAsync.mockClear();
	kickOut.mockClear();
});

function roster(rows: () => PersonRow[] | undefined) {
	return () => ({
		data: rows,
		error: () => {},
		isLoading: () => false,
		isStale: () => false,
		refetch: () => {},
	});
}

vi.mock("./data/communityData.tsx", async (importOriginal) => {
	return {
		...(await importOriginal<typeof import("./data/communityData.tsx")>()),
		// eslint-disable-next-line solid/reactivity -- read per call, once the signals exist
		useApplications: roster(() => applicationRows()),
		// eslint-disable-next-line solid/reactivity -- read per call, once the signals exist
		useMembers: roster(() => memberRows()),
		// eslint-disable-next-line solid/reactivity -- read per call, once the signals exist
		useGuests: roster(() => guestRows()),
	};
});

const makeMember = vi.fn(() => okAsync(undefined));
const kickOut = vi.fn(() => okAsync(undefined));
vi.mock("./actions/triage.ts", () => ({
	useTriage: () => ({
		deny: vi.fn(() => okAsync(undefined)),
		makeMember,
		approveAsGuest: vi.fn(() => okAsync(undefined)),
		undeny: vi.fn(() => okAsync(undefined)),
		kickOut,
		upgradeToMember: vi.fn(() => okAsync(undefined)),
	}),
}));

const VIEW_IN_PEOPLE = { label: "View in People", href: "/community" };

/** The peek the way the host mounts it: inside the peek context, over a page. */
function renderPeek(row: PersonRow) {
	const [isOpen, setOpen] = createSignal(true);
	renderWithSelection(() => (
		<PeekContext.Provider value={{ viewIn: VIEW_IN_PEOPLE }}>
			<PersonPeek
				row={row}
				loading={false}
				open={isOpen()}
				prebuild={false}
				onOpenChange={(isOpen) => {
					setOpen(isOpen);
				}}
			/>
		</PeekContext.Provider>
	));
	return { setOpen };
}

async function openSheet(): Promise<HTMLElement> {
	await waitFor(() => {
		expect(document.querySelector(OPEN_DIALOG_CONTENT)).not.toBeNull();
	});
	return document.querySelector<HTMLElement>(OPEN_DIALOG_CONTENT)!;
}

function buttonNames(panel: HTMLElement): string[] {
	return [...panel.querySelectorAll("button")].map(
		(button) => button.textContent
	);
}

test("an applicant's peek shows the applications footer: score field and decision buttons", async () => {
	renderPeek(applicant);
	const panel = await openSheet();
	expect(keyedIn(panel, "score")).toHaveLength(1);
	expect(screen.getByRole("button", { name: /Make member/ })).toBeVisible();
	expect(screen.getByRole("button", { name: /Turn down/ })).toBeVisible();
	expect(screen.queryByRole("button", { name: /Kick out/ })).toBeNull();
});

test("a member's peek shows the member actions and no score field", async () => {
	renderPeek(member);
	const panel = await openSheet();
	expect(screen.getByRole("button", { name: /Change role/ })).toBeVisible();
	expect(screen.getByRole("button", { name: /Kick out/ })).toBeVisible();
	expect(keyedIn(panel, "score")).toHaveLength(0);
});

test("a guest's peek shows the guest actions", async () => {
	renderPeek(guest);
	await openSheet();
	expect(screen.getByRole("button", { name: /Kick out/ })).toBeVisible();
	expect(screen.queryByRole("button", { name: /Change role/ })).toBeNull();
});

test("a peek offers View in People and no prev/next arrows", async () => {
	renderPeek(applicant);
	const panel = await openSheet();
	expect(buttonNames(panel).join("|")).toContain("View in People");
	expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
	expect(screen.queryByRole("button", { name: /prev/i })).toBeNull();
});

test("an action key acts on the person the open peek shows, and only while it is open", async () => {
	const { setOpen } = renderPeek(applicant);
	await openSheet();
	fireEvent.keyDown(document, { key: "M" });
	await waitFor(() => {
		expect(makeMember).toHaveBeenCalledWith("applicant");
	});

	makeMember.mockClear();
	setOpen(false);
	fireEvent.keyDown(document, { key: "M" });
	expect(makeMember).not.toHaveBeenCalled();
});

test("a member's action key acts on the open peek only", async () => {
	const { setOpen } = renderPeek(member);
	await openSheet();
	fireEvent.keyDown(document, { key: "K" });
	await waitFor(() => {
		expect(kickOut).toHaveBeenCalledWith("member");
	});

	kickOut.mockClear();
	setOpen(false);
	fireEvent.keyDown(document, { key: "K" });
	expect(kickOut).not.toHaveBeenCalled();
});

test("a guest's action key acts on the open peek only", async () => {
	const { setOpen } = renderPeek(guest);
	await openSheet();
	fireEvent.keyDown(document, { key: "K" });
	await waitFor(() => {
		expect(kickOut).toHaveBeenCalledWith("guest");
	});

	kickOut.mockClear();
	setOpen(false);
	fireEvent.keyDown(document, { key: "K" });
	expect(kickOut).not.toHaveBeenCalled();
});

test("an applicant's score key scores the open peek's person, and only while it is open", async () => {
	const { setOpen } = renderPeek(applicant);
	await openSheet();
	fireEvent.keyDown(document, { key: "5" });
	await waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledWith({
			personId: "applicant",
			value: 5,
		});
	});

	mutateAsync.mockClear();
	setOpen(false);
	fireEvent.keyDown(document, { key: "5" });
	expect(mutateAsync).not.toHaveBeenCalled();
});

test("while the rosters are still answering, the footer has no actions and no key does anything", async () => {
	setRosters({ applications: [applicant] });
	renderPeek(applicant);
	await openSheet();
	expect(screen.queryByRole("button", { name: /Kick out/ })).toBeNull();
	expect(screen.queryByRole("button", { name: /Upgrade/ })).toBeNull();
	expect(screen.queryByRole("button", { name: /Make member/ })).toBeNull();
	fireEvent.keyDown(document, { key: "K" });
	fireEvent.keyDown(document, { key: "M" });
	fireEvent.keyDown(document, { key: "5" });
	expect(kickOut).not.toHaveBeenCalled();
	expect(makeMember).not.toHaveBeenCalled();
	expect(mutateAsync).not.toHaveBeenCalled();
});

test("a person in no roster gets the sheet without footer actions", async () => {
	setRosters({ applications: [], members: [], guests: [] });
	renderPeek(applicant);
	await openSheet();
	expect(screen.queryByRole("button", { name: /Kick out/ })).toBeNull();
	expect(screen.queryByRole("button", { name: /Make member/ })).toBeNull();
	fireEvent.keyDown(document, { key: "K" });
	expect(kickOut).not.toHaveBeenCalled();
});

test("the rosters answering after the row loads brings in the roster's footer", async () => {
	setRosters({ applications: [applicant] });
	renderPeek(applicant);
	await openSheet();
	setMemberRows([member]);
	setGuestRows([guest]);
	expect(
		await screen.findByRole("button", { name: /Make member/ })
	).toBeVisible();
});

test("a person changing roster while the peek is open keeps the same open sheet and shows the new footer", async () => {
	renderPeek(applicant);
	const panel = await openSheet();
	expect(screen.getByRole("button", { name: /Make member/ })).toBeVisible();

	// What Make member does: the applicant leaves Applications for Members.
	setApplicationRows([]);
	setMemberRows([member, applicant]);

	expect(
		await screen.findByRole("button", { name: /Change role/ })
	).toBeVisible();
	expect(screen.queryByRole("button", { name: /Make member/ })).toBeNull();
	expect(document.querySelector(OPEN_DIALOG_CONTENT)).toBe(panel);
	expect(keyedIn(panel, "score")).toHaveLength(0);
});

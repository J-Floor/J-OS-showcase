// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

afterEach(cleanup);

// The board's sheet calls four mutations and opens several queries. Each
// mutation gets its own spy, so a test pins which one ran and with exactly
// what. Each query reads `backend.queries` by name (a missing one is still
// loading; a function is a signal, for a live update) and is logged in
// `backend.queried`. Convex's `api` refs are
// proxies that aren't `===`-stable, so both route by `getFunctionName`.
// The spies are typed through generics so `mock.calls[0][0]` indexes a
// one-argument tuple (see EventSheet.test.tsx).
const backend = vi.hoisted(() => ({
	createPerk: vi.fn<(args: unknown) => Promise<string>>(() =>
		Promise.resolve("perk2")
	),
	updatePerk: vi.fn<(args: unknown) => Promise<null>>(() =>
		Promise.resolve(null)
	),
	deletePerk: vi.fn<(args: unknown) => Promise<null>>(() =>
		Promise.resolve(null)
	),
	setPerkRequestStatus: vi.fn<(args: unknown) => Promise<null>>(() =>
		Promise.resolve(null)
	),
	// Whatever else the sheet calls (the member flow's requestPerk).
	otherMutation: vi.fn<(args: unknown) => Promise<null>>(() =>
		Promise.resolve(null)
	),
	queries: new Map<string, unknown>(),
	queried: [] as string[],
}));

vi.mock("convex-solidjs", () => ({
	useMutation: (reference: unknown) => {
		const name = getFunctionName(
			reference as Parameters<typeof getFunctionName>[0]
		);
		const spies = new Map<string, (args: unknown) => Promise<unknown>>([
			["perks:createPerk", backend.createPerk],
			["perks:updatePerk", backend.updatePerk],
			["perks:deletePerk", backend.deletePerk],
			["perkRequests:setPerkRequestStatus", backend.setPerkRequestStatus],
		]);
		return { mutateAsync: spies.get(name) ?? backend.otherMutation };
	},
	useQuery: (reference: unknown) => {
		const name = getFunctionName(
			reference as Parameters<typeof getFunctionName>[0]
		);
		backend.queried.push(name);
		return {
			data: () => {
				const value = backend.queries.get(name);
				return typeof value === "function"
					? (value as () => unknown)()
					: value;
			},
			error: () => {},
			isLoading: () => false,
		};
	},
}));

import { SITE_TIMEZONE } from "../../../convex/lib/time.ts";
import { AbilityProvider, type Role } from "../../lib/ability.tsx";
import { ConfirmProvider } from "../../shared/confirm.tsx";
import { formatDateIn } from "../../shared/time.ts";

import { PerkSheet } from "./PerkSheet.tsx";

const BOARD = [
	{ _id: "person1", firstName: "Grace", lastName: "Hopper", tier: "board" },
	{ _id: "person3", firstName: "Alan", lastName: "Turing", tier: "admin" },
];

const REQUEST = {
	_id: "request1",
	perkId: "perk1",
	personId: "person2",
	requesterName: "Ada Lovelace",
	requesterEmail: "ada@example.com",
	ventureName: "Analytical Engines",
	perkTitle: "Cloud credits",
	partner: "Acme Cloud",
	contactName: "Grace Hopper",
	requestedAt: Date.parse("2026-10-20T09:00:00Z"),
	note: "We run our build farm on it.",
	status: "requested",
	statusAt: Date.parse("2026-10-20T09:00:00Z"),
};

/** A perk as `listPerks` returns it, with `overrides` on top. Its end date
 *  is far off, so it is active whatever today is. */
function perkRow(overrides: Record<string, unknown> = {}): never {
	return {
		_id: "perk1",
		_creationTime: 0,
		partner: "Acme Cloud",
		title: "Cloud credits",
		terms: "Credits for the first year.",
		category: "cloud",
		link: "https://example.com/credits",
		validUntil: "2099-12-31",
		contactId: "person1",
		contactName: "Grace Hopper",
		contactFirstName: "Grace",
		createdBy: "person1",
		createdAt: Date.parse("2026-10-01T09:00:00Z"),
		...overrides,
	} as never;
}

const REFUSED = new ConvexError({
	code: "Forbidden",
	message: "You can't do that.",
});

/** A second request on the perk, from someone else. */
const OTHER_REQUEST = {
	...REQUEST,
	_id: "request2",
	personId: "person4",
	requesterName: "Bea Example",
	requesterEmail: "bea@example.com",
	note: undefined,
	requestedAt: Date.parse("2026-10-21T09:00:00Z"),
};

/** A mutation call that settles when the test says so. */
function deferred() {
	const settle: { reject?: (error: unknown) => void } = {};
	const promise = new Promise<never>((_resolve, fail) => {
		settle.reject = fail;
	});
	return {
		promise,
		reject: (error: unknown) => {
			settle.reject?.(error);
		},
	};
}

/** A request's item in the board's Requests section, by who asked. */
function requestItem(requesterName: string): HTMLElement {
	const item = within(requestsSection())
		.getByText(requesterName)
		.closest("li");
	if (!item) throw new Error(`no request item for ${requesterName}`);
	return item;
}

beforeEach(() => {
	backend.queries.set("people:listBoardLevel", BOARD);
	backend.queries.set("perkRequests:myOpenPerkRequests", []);
	backend.queries.set("perkRequests:listRequestsForPerk", [REQUEST]);
});

afterEach(() => {
	backend.queries.clear();
	backend.queried.length = 0;
	vi.clearAllMocks();
});

function renderSheet(role: Role, props: Record<string, unknown> = {}) {
	return render(() => (
		<ConfirmProvider>
			<AbilityProvider role={role}>
				<PerkSheet open onOpenChange={() => {}} {...props} />
			</AbilityProvider>
		</ConfirmProvider>
	));
}

function fill(label: string, value: string): void {
	fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

/** Opens the picker named `label` and chooses `option` in its list. */
async function pick(label: string, option: string): Promise<void> {
	fireEvent.click(screen.getByRole("combobox", { name: label }));
	fireEvent.click(await screen.findByRole("option", { name: option }));
}

/** Unlocks the sheet's fields, as the board's padlock does. */
async function unlock(): Promise<void> {
	fireEvent.click(screen.getByRole("button", { name: /Unlock to edit/ }));
	await screen.findByRole("textbox", { name: "Partner" });
}

/** Types into a text editor and leaves it, which commits it. */
function commitText(label: string, value: string): void {
	const field = screen.getByRole("textbox", { name: label });
	fireEvent.input(field, { target: { value } });
	fireEvent.blur(field);
}

/** Pastes an ISO date into a DatePicker's segments (see EventSheet.test.tsx:
 *  zag's paste handler replaces the whole date at once), then waits for the
 *  machine to land it. */
async function pasteDate(labelText: string, iso: string): Promise<void> {
	const label = screen.getByText(labelText, {
		ignore: "script, style, [data-hidden]",
	});
	const root = label.parentElement;
	if (!root) throw new Error(`no field root for "${labelText}"`);
	await pasteDateIn(root, iso);
}

/** {@link pasteDate} into the date field `root`. */
async function pasteDateIn(root: HTMLElement, iso: string): Promise<void> {
	const segment = root.querySelector<HTMLElement>(
		'[data-part="segment"][data-editable]'
	);
	if (!segment) throw new Error("no editable segment found in date field");
	segment.focus();
	fireEvent.paste(segment, {
		clipboardData: { getData: () => iso } as unknown as DataTransfer,
	});
	await waitFor(() => {
		const hidden = root.querySelector<HTMLInputElement>(
			'[data-part="hidden-input"]'
		);
		expect(hidden?.value).toBeTruthy();
	});
}

/** The board's Requests accordion item. */
function requestsSection(): HTMLElement {
	const item = screen
		.getByText("Requests")
		.closest<HTMLElement>('[data-scope="accordion"][data-part="item"]');
	if (!item) throw new Error("no Requests section");
	return item;
}

/** The create footer's button. Queried afresh each time: it is a new
 *  element once enabled (the disabled one sits in its reason's tooltip). */
function createButton(): HTMLElement {
	return screen.getByRole("button", { name: /^Create/ });
}

function discardPrompt(): HTMLElement | null {
	return screen.queryByRole("dialog", { name: "Discard new perk?" });
}

// --- create --------------------------------------------------------------

test("create (board): the header says 'New perk' and the footer offers Create", () => {
	renderSheet("board");
	expect(
		screen.getByRole("heading", { name: "New perk" })
	).toBeInTheDocument();
	expect(createButton()).toBeInTheDocument();
});

test("create: Create stays disabled, saying what is missing, until every required field is filled", async () => {
	renderSheet("board");
	expect(createButton()).toBeDisabled();
	expect(createButton()).toHaveAttribute(
		"aria-description",
		"Add the partner, perk, category, contact and terms first"
	);
	fill("Partner", "Acme Cloud");
	fill("Perk", "Cloud credits");
	fill("Terms", "Credits for the first year.");
	await pick("Category", "Cloud");
	// Everything but the contact.
	expect(createButton()).toBeDisabled();
	await pick("Contact", "Grace Hopper");
	// The link and the end date stay optional.
	await waitFor(() => {
		expect(createButton()).not.toBeDisabled();
	});
	// Blank text counts as missing.
	fill("Partner", "   ");
	await waitFor(() => {
		expect(createButton()).toBeDisabled();
	});
	expect(backend.createPerk).not.toHaveBeenCalled();
});

test("create: a filled form sends createPerk with every field, then closes", async () => {
	const onOpenChange = vi.fn();
	renderSheet("board", { onOpenChange });
	fill("Partner", "  Acme Cloud ");
	fill("Perk", "Cloud credits");
	fill("Terms", "Credits for the first year.");
	await pick("Category", "Cloud");
	await pick("Contact", "Grace Hopper");
	fill("Link", "example.com/credits");
	await pasteDate("Valid until", "2099-12-31");
	await waitFor(() => {
		expect(createButton()).not.toBeDisabled();
	});
	fireEvent.click(createButton());
	await waitFor(() => {
		expect(backend.createPerk).toHaveBeenCalledTimes(1);
	});
	// Trimmed text; the server normalises the link.
	expect(backend.createPerk.mock.calls[0][0]).toStrictEqual({
		partner: "Acme Cloud",
		title: "Cloud credits",
		terms: "Credits for the first year.",
		category: "cloud",
		contactId: "person1",
		link: "example.com/credits",
		validUntil: "2099-12-31",
	});
	await waitFor(() => {
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

test("create: a typed partner asks before Escape throws it away; Discard closes", async () => {
	const onOpenChange = vi.fn();
	renderSheet("board", { onOpenChange });
	fill("Partner", "Acme Cloud");
	const sheet = screen.getByRole("dialog", { name: "New perk" });
	// Ark hears Escape a moment after the open: press until it asks.
	await waitFor(() => {
		if (!discardPrompt()) fireEvent.keyDown(sheet, { key: "Escape" });
		expect(discardPrompt()).toBeInTheDocument();
	});
	expect(onOpenChange).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Discard" }));
	await waitFor(() => {
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

test("create: an untouched form closes on Escape without asking", async () => {
	const onOpenChange = vi.fn();
	renderSheet("board", { onOpenChange });
	const sheet = screen.getByRole("dialog", { name: "New perk" });
	await waitFor(() => {
		fireEvent.keyDown(sheet, { key: "Escape" });
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
	expect(discardPrompt()).toBeNull();
});

// --- edit ----------------------------------------------------------------

test("edit: only the board gets the padlock", () => {
	renderSheet("member", { perk: perkRow() });
	expect(screen.queryByRole("button", { name: /Unlock to edit/ })).toBeNull();
	cleanup();
	renderSheet("board", { perk: perkRow() });
	expect(
		screen.getByRole("button", { name: /Unlock to edit/ })
	).toBeInTheDocument();
});

test("edit: committing the partner sends updatePerk with that field alone", async () => {
	renderSheet("board", { perk: perkRow() });
	await unlock();
	commitText("Partner", "Acme Labs");
	await waitFor(() => {
		expect(backend.updatePerk).toHaveBeenCalledTimes(1);
	});
	expect(backend.updatePerk.mock.calls[0][0]).toStrictEqual({
		perkId: "perk1",
		partner: "Acme Labs",
	});
});

test("edit: the refetch after an autosave leaves the fields unlocked", async () => {
	const [shown, setShown] = createSignal(perkRow());
	render(() => (
		<ConfirmProvider>
			<AbilityProvider role="board">
				<PerkSheet open onOpenChange={() => {}} perk={shown()} />
			</AbilityProvider>
		</ConfirmProvider>
	));
	await unlock();
	commitText("Partner", "Acme Labs");
	await waitFor(() => {
		expect(backend.updatePerk).toHaveBeenCalledTimes(1);
	});
	// The live list hands the sheet the saved perk as a new row object.
	setShown(perkRow({ partner: "Acme Labs" }));
	expect(screen.getByRole("textbox", { name: "Partner" })).toHaveValue(
		"Acme Labs"
	);
	expect(
		screen.getByRole("button", { name: /Lock these fields/ })
	).toBeInTheDocument();
});

test("edit: another category saves at once", async () => {
	renderSheet("board", { perk: perkRow() });
	await unlock();
	await pick("Category", "Software");
	await waitFor(() => {
		expect(backend.updatePerk).toHaveBeenCalledTimes(1);
	});
	expect(backend.updatePerk.mock.calls[0][0]).toStrictEqual({
		perkId: "perk1",
		category: "software",
	});
});

test("edit: picking another contact saves their id", async () => {
	renderSheet("board", { perk: perkRow() });
	await unlock();
	await pick("Contact", "Alan Turing");
	await waitFor(() => {
		expect(backend.updatePerk).toHaveBeenCalledTimes(1);
	});
	expect(backend.updatePerk.mock.calls[0][0]).toStrictEqual({
		perkId: "perk1",
		contactId: "person3",
	});
});

test("edit: clearing the end date sends validUntil: null", async () => {
	renderSheet("board", { perk: perkRow() });
	await unlock();
	fireEvent.click(screen.getByRole("button", { name: "Clear the end date" }));
	await waitFor(() => {
		expect(backend.updatePerk).toHaveBeenCalledTimes(1);
	});
	expect(backend.updatePerk.mock.calls[0][0]).toStrictEqual({
		perkId: "perk1",
		validUntil: null,
	});
});

test("edit: a perk with no end date offers nothing to clear", async () => {
	renderSheet("board", { perk: perkRow({ validUntil: undefined }) });
	await unlock();
	expect(
		screen.queryByRole("button", { name: "Clear the end date" })
	).toBeNull();
});

test("edit: emptying the link sends link: null", async () => {
	renderSheet("board", { perk: perkRow() });
	await unlock();
	commitText("Link", "  ");
	await waitFor(() => {
		expect(backend.updatePerk).toHaveBeenCalledTimes(1);
	});
	expect(backend.updatePerk.mock.calls[0][0]).toStrictEqual({
		perkId: "perk1",
		link: null,
	});
});

test("edit: a refused change shows the reason under the details", async () => {
	backend.updatePerk.mockRejectedValueOnce(REFUSED);
	renderSheet("board", { perk: perkRow() });
	await unlock();
	commitText("Partner", "Acme Labs");
	expect(await screen.findByText("You can't do that.")).toBeInTheDocument();
});

test("edit: a refusal that lands after the board locked the sheet still shows, through a refetch", async () => {
	const save = deferred();
	backend.updatePerk.mockImplementationOnce(() => save.promise);
	const [shown, setShown] = createSignal(perkRow());
	render(() => (
		<ConfirmProvider>
			<AbilityProvider role="board">
				<PerkSheet open onOpenChange={() => {}} perk={shown()} />
			</AbilityProvider>
		</ConfirmProvider>
	));
	await unlock();
	commitText("Partner", "Acme Labs");
	await waitFor(() => {
		expect(backend.updatePerk).toHaveBeenCalledTimes(1);
	});
	// Locked while the save is still in flight: the editors are gone.
	fireEvent.click(screen.getByRole("button", { name: /Lock these fields/ }));
	await waitFor(() => {
		expect(screen.queryByRole("textbox", { name: "Partner" })).toBeNull();
	});
	save.reject(REFUSED);
	expect(await screen.findByText("You can't do that.")).toBeInTheDocument();
	// The same perk, refetched as a new row object, keeps the refusal.
	setShown(perkRow({ terms: "Credits for the first two years." }));
	expect(
		screen.getByText("Credits for the first two years.")
	).toBeInTheDocument();
	expect(screen.getByText("You can't do that.")).toBeInTheDocument();
});

test("edit: picking a new end date sends it as validUntil", async () => {
	renderSheet("board", { perk: perkRow() });
	await unlock();
	// The row names the field, so the picker's own label is hidden: find
	// the field by that label element.
	const label = Array.from(document.querySelectorAll("label")).find(
		(element) => element.textContent === "Valid until"
	);
	if (!label?.parentElement) throw new Error("no Valid until field");
	await pasteDateIn(label.parentElement, "2027-06-30");
	await waitFor(() => {
		expect(backend.updatePerk).toHaveBeenCalledTimes(1);
	});
	expect(backend.updatePerk.mock.calls[0][0]).toStrictEqual({
		perkId: "perk1",
		validUntil: "2027-06-30",
	});
});

test("edit: the contact can be changed but not cleared", async () => {
	renderSheet("board", { perk: perkRow() });
	await unlock();
	const control = screen
		.getByRole("combobox", { name: "Contact" })
		.closest<HTMLElement>('[data-part="control"]');
	if (!control) throw new Error("no control around the Contact picker");
	expect(within(control).getByText("Grace Hopper")).toBeInTheDocument();
	expect(
		within(control).queryByRole("button", { name: "Clear value" })
	).toBeNull();
});

test("no contact: the board is told to pick one; a member is not", () => {
	const noContact = perkRow({
		contactId: undefined,
		contactName: undefined,
		contactFirstName: undefined,
	});
	renderSheet("board", { perk: noContact });
	expect(screen.getByText("No contact. Pick one.")).toBeInTheDocument();
	cleanup();
	renderSheet("member", { perk: noContact });
	expect(screen.queryByText("No contact. Pick one.")).toBeNull();
});

// --- delete --------------------------------------------------------------

test("detail (board): the footer keeps Request perk and adds Delete perk", () => {
	renderSheet("board", { perk: perkRow() });
	expect(
		screen.getByRole("button", { name: /Request perk/ })
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Delete perk/ })
	).toBeInTheDocument();
});

test("Delete waits for confirmation, then calls deletePerk and closes", async () => {
	const onOpenChange = vi.fn();
	renderSheet("board", { perk: perkRow(), onOpenChange });
	fireEvent.click(screen.getByRole("button", { name: /Delete perk/ }));
	await screen.findByText("Delete perk?");
	expect(
		screen.getByText("This removes the perk and its request history.")
	).toBeInTheDocument();
	expect(backend.deletePerk).not.toHaveBeenCalled();
	const footer = screen.getByRole("button", {
		name: /Cancel/,
		hidden: true,
	}).parentElement!;
	fireEvent.click(
		within(footer).getByRole("button", { name: /Delete/, hidden: true })
	);
	await waitFor(() => {
		expect(backend.deletePerk).toHaveBeenCalledWith({ perkId: "perk1" });
	});
	await waitFor(() => {
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

test("a refused delete shows the reason in the footer and keeps the sheet open", async () => {
	backend.deletePerk.mockRejectedValueOnce(REFUSED);
	const onOpenChange = vi.fn();
	renderSheet("board", { perk: perkRow(), onOpenChange });
	fireEvent.click(screen.getByRole("button", { name: /Delete perk/ }));
	await screen.findByText("Delete perk?");
	const footer = screen.getByRole("button", {
		name: /Cancel/,
		hidden: true,
	}).parentElement!;
	fireEvent.click(
		within(footer).getByRole("button", { name: /Delete/, hidden: true })
	);
	expect(await screen.findByText("You can't do that.")).toBeInTheDocument();
	expect(onOpenChange).not.toHaveBeenCalled();
});

test("a delete refusal stays with its perk: a refetch keeps it, stepping to another perk clears it", async () => {
	backend.deletePerk.mockRejectedValueOnce(REFUSED);
	const [shown, setShown] = createSignal(perkRow());
	render(() => (
		<ConfirmProvider>
			<AbilityProvider role="board">
				<PerkSheet open onOpenChange={() => {}} perk={shown()} />
			</AbilityProvider>
		</ConfirmProvider>
	));
	fireEvent.click(screen.getByRole("button", { name: /Delete perk/ }));
	await screen.findByText("Delete perk?");
	const footer = screen.getByRole("button", {
		name: /Cancel/,
		hidden: true,
	}).parentElement!;
	fireEvent.click(
		within(footer).getByRole("button", { name: /Delete/, hidden: true })
	);
	expect(await screen.findByText("You can't do that.")).toBeInTheDocument();
	// The same perk, refetched as a new row object: still its refusal.
	setShown(perkRow({ terms: "Credits for the first two years." }));
	expect(screen.getByText("You can't do that.")).toBeInTheDocument();
	// Another perk: the refusal was not about it.
	setShown(perkRow({ _id: "perk2", title: "Design seats" }));
	await waitFor(() => {
		expect(
			screen.getByRole("heading", { name: "Design seats" })
		).toBeInTheDocument();
	});
	expect(screen.queryByText("You can't do that.")).toBeNull();
});

// --- requests ------------------------------------------------------------

test("requests (member): no section, no Delete perk, and the list is never fetched", () => {
	renderSheet("member", { perk: perkRow() });
	expect(screen.getAllByText("Cloud credits").length).toBeGreaterThan(0);
	expect(screen.queryByText("Requests")).toBeNull();
	expect(screen.queryByText("Ada Lovelace")).toBeNull();
	expect(screen.queryByRole("button", { name: /Delete perk/ })).toBeNull();
	expect(backend.queried).not.toContain("perkRequests:listRequestsForPerk");
});

test("requests (board): counts and lists each request with its avatar and note", () => {
	renderSheet("board", { perk: perkRow() });
	// The member test above asserts this query's absence; here it ran.
	expect(backend.queried).toContain("perkRequests:listRequestsForPerk");
	const section = requestsSection();
	expect(within(section).getByText("1")).toBeInTheDocument();
	// The design system's Avatar: with no picture, the requester's initials
	// in Ark's avatar fallback.
	expect(within(section).getByText("AL")).toHaveAttribute(
		"data-scope",
		"avatar"
	);
	expect(within(section).getByText("Ada Lovelace")).toBeInTheDocument();
	expect(within(section).getByText("ada@example.com")).toBeInTheDocument();
	expect(
		within(section).getByText(
			`Requested ${formatDateIn(REQUEST.requestedAt, SITE_TIMEZONE)}`
		)
	).toBeInTheDocument();
	expect(
		within(section).getByText("We run our build farm on it.")
	).toBeInTheDocument();
});

test("requests (board): none yet shows the empty copy", () => {
	backend.queries.set("perkRequests:listRequestsForPerk", []);
	renderSheet("board", { perk: perkRow() });
	expect(
		within(requestsSection()).getByText("No requests yet")
	).toBeInTheDocument();
});

test("requests (board): picking a status calls setPerkRequestStatus", async () => {
	renderSheet("board", { perk: perkRow() });
	await pick("Status", "Contacted");
	await waitFor(() => {
		expect(backend.setPerkRequestStatus).toHaveBeenCalledTimes(1);
	});
	expect(backend.setPerkRequestStatus.mock.calls[0][0]).toStrictEqual({
		requestId: "request1",
		status: "contacted",
	});
});

test("requests (board): a refused status change shows the reason", async () => {
	backend.setPerkRequestStatus.mockRejectedValueOnce(REFUSED);
	renderSheet("board", { perk: perkRow() });
	await pick("Status", "Granted");
	expect(await screen.findByText("You can't do that.")).toBeInTheDocument();
	// The picker shows the server's status, which the refusal left as it was.
	expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent(
		"Requested"
	);
});

// The board's request list as a live query: `setLiveRequests` is the
// server pushing an update.
const [liveRequests, setLiveRequests] = createSignal<unknown[]>([]);

// eslint-disable-next-line solid/reactivity -- the signal stands in for a live query; the mocked useQuery reads it inside the sheet's tracked scopes
test("requests (board): a live update to another request keeps this one's refusal", async () => {
	setLiveRequests([REQUEST, OTHER_REQUEST]);
	backend.queries.set("perkRequests:listRequestsForPerk", liveRequests);
	backend.setPerkRequestStatus.mockRejectedValueOnce(REFUSED);
	renderSheet("board", { perk: perkRow() });
	const ada = requestItem("Ada Lovelace");
	fireEvent.click(within(ada).getByRole("combobox", { name: "Status" }));
	fireEvent.click(await screen.findByRole("option", { name: "Granted" }));
	expect(
		await within(ada).findByText("You can't do that.")
	).toBeInTheDocument();
	// The server's answer to a change on Bea's request: every row a new
	// object.
	setLiveRequests([
		{ ...REQUEST },
		{ ...OTHER_REQUEST, status: "contacted" },
	]);
	await waitFor(() => {
		expect(
			within(requestItem("Bea Example")).getByRole("combobox", {
				name: "Status",
			})
		).toHaveTextContent("Contacted");
	});
	// Ada's item updated in place: the same element, refusal and all.
	expect(requestItem("Ada Lovelace")).toBe(ada);
	expect(within(ada).getByText("You can't do that.")).toBeInTheDocument();
});

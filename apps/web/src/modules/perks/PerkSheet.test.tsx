// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

const { toasterCreate } = vi.hoisted(() => ({ toasterCreate: vi.fn() }));
vi.mock("../../shared/toaster.ts", () => ({
	toaster: { create: toasterCreate },
}));

// Typed with one arg so `mock.calls[0][0]` indexes a non-empty tuple.
const mutateAsync = vi.fn<(args: unknown) => Promise<string>>(() =>
	Promise.resolve("request1")
);

// What `myOpenPerkRequests` answers; every other query (the board's request
// list) answers with none. Routed by the query's name: Convex's `api` refs
// are proxies, not `===`-stable.
let myOpenRequests: unknown[] = [];
vi.mock("convex-solidjs", () => ({
	useQuery: (query: FunctionReference<"query">) => ({
		data: () =>
			getFunctionName(query) === "perkRequests:myOpenPerkRequests"
				? myOpenRequests
				: [],
		error: () => {},
		isLoading: () => false,
	}),
	useMutation: () => ({ mutateAsync }),
}));

import { SITE_TIMEZONE } from "../../../convex/lib/time.ts";
import type { PerkRow } from "../../../convex/perks.ts";
import {
	sheetKeys,
	sheetSkeleton,
	tableRowKeys,
} from "../../../test-stubs/morphKeys.tsx";
import { AbilityProvider, type Role } from "../../lib/ability.tsx";
import { ConfirmProvider } from "../../shared/confirm.tsx";
import { formatDateIn } from "../../shared/time.ts";

import { perkColumns } from "./perkColumns.tsx";
import { formatValidUntil } from "./perkDate.ts";
import { PerkSheet } from "./PerkSheet.tsx";

const NOTE_LABEL = "Note for Mary Ann";

const perk = {
	_id: "perk1",
	_creationTime: 0,
	partner: "Northwind Cloud",
	title: "Hosting credits",
	terms: "Up to 5,000 credits in the first year.\nNew accounts only.",
	category: "cloud",
	link: "https://partners.example.com/northwind",
	validUntil: "2099-12-31",
	contactId: "person1",
	createdBy: "person2",
	createdAt: Date.parse("2026-09-01T00:00:00Z"),
	// A two-word first name: the toast takes the record's first name whole,
	// never the display name's first word.
	contactName: "Mary Ann Fairweather",
	contactFirstName: "Mary Ann",
} as unknown as PerkRow;

const noContact = {
	...perk,
	contactId: undefined,
	contactName: undefined,
	contactFirstName: undefined,
};
const expired = { ...perk, validUntil: "2020-01-31" };
const requestedAt = Date.parse("2026-10-20T09:00:00Z");

afterEach(() => {
	myOpenRequests = [];
	mutateAsync.mockClear();
	toasterCreate.mockClear();
});

function renderSheet(role: Role, props: Record<string, unknown>) {
	return render(() => (
		<ConfirmProvider>
			<AbilityProvider role={role}>
				<PerkSheet open onOpenChange={() => {}} {...props} />
			</AbilityProvider>
		</ConfirmProvider>
	));
}

/** The note field, opened from "Add a note" when it is still closed. */
function noteField(): HTMLElement {
	const add = screen.queryByRole("button", { name: "Add a note" });
	if (add) fireEvent.click(add);
	return screen.getByLabelText(NOTE_LABEL);
}

function requestButton(): HTMLElement {
	return screen.getByRole("button", { name: "Request perk" });
}

function discardPrompt(): HTMLElement | null {
	return screen.queryByRole("dialog", { name: "Discard your note?" });
}

// --- details ---------------------------------------------------------------

test("details: partner, perk, category, end date, contact and terms", () => {
	renderSheet("member", { perk });
	expect(
		screen.getByRole("heading", { name: "Hosting credits" })
	).toBeInTheDocument();
	// The title shows once, in the header: no Title property row.
	expect(screen.getAllByText("Hosting credits")).toHaveLength(1);
	expect(screen.queryByText("Title")).toBeNull();
	expect(screen.getByText("Northwind Cloud")).toBeInTheDocument();
	expect(screen.getByText("Cloud")).toBeInTheDocument();
	expect(
		screen.getByText(formatValidUntil("2099-12-31"))
	).toBeInTheDocument();
	expect(screen.getByText("Mary Ann Fairweather")).toBeInTheDocument();
	// The terms keep their line break; the stylesheet shows it.
	expect(screen.getByText(/^Up to 5,000 credits/).textContent).toBe(
		"Up to 5,000 credits in the first year.\nNew accounts only."
	);
});

test("a perk with no end date says so", () => {
	renderSheet("member", { perk: { ...perk, validUntil: undefined } });
	expect(screen.getByText("No end date")).toBeInTheDocument();
});

test("the link opens in a new tab and gives the partner's page no handle on the app", () => {
	renderSheet("member", { perk });
	const link = screen.getByRole("link", {
		name: "https://partners.example.com/northwind",
	});
	expect(link).toHaveAttribute(
		"href",
		"https://partners.example.com/northwind"
	);
	expect(link).toHaveAttribute("target", "_blank");
	expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("a perk without a link shows no link", () => {
	renderSheet("member", { perk: { ...perk, link: undefined } });
	expect(screen.queryByRole("link")).toBeNull();
});

test("a perk whose contact is gone says No contact", () => {
	renderSheet("member", { perk: noContact });
	expect(screen.getByText("No contact")).toBeInTheDocument();
});

// --- the request -------------------------------------------------------------

test("Request perk sends the typed note, trimmed, and empties the field", async () => {
	renderSheet("member", { perk });
	fireEvent.input(noteField(), {
		target: { value: "  For our launch in March.  " },
	});
	fireEvent.click(requestButton());
	await waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledWith({
			perkId: "perk1",
			note: "For our launch in March.",
		});
	});
	await waitFor(() => {
		expect(screen.queryByLabelText(NOTE_LABEL)).toBeNull();
	});
});

test("Request with no note is one click: the field stays closed and no note is sent", async () => {
	renderSheet("member", { perk });
	expect(screen.queryByLabelText(NOTE_LABEL)).toBeNull();
	fireEvent.click(requestButton());
	await waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledWith({ perkId: "perk1" });
	});
});

test("Add a note opens the field above the Request button, focused", async () => {
	renderSheet("member", { perk });
	fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
	const field = screen.getByLabelText(NOTE_LABEL);
	await waitFor(() => {
		expect(field).toHaveFocus();
	});
	expect(screen.queryByRole("button", { name: "Add a note" })).toBeNull();
	// In the footer, before the button.
	expect(field.closest("footer")).toContainElement(requestButton());
	expect(
		field.compareDocumentPosition(requestButton()) &
			Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
});

test("with no contact the note is for the J floor team", () => {
	renderSheet("member", { perk: noContact });
	fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
	expect(
		screen.getByLabelText("Note for the J floor team")
	).toBeInTheDocument();
});

test("the sheet has no Request accordion section", () => {
	renderSheet("member", { perk });
	expect(screen.queryByText("Your request")).toBeNull();
});

test("a blank note sends no note at all", async () => {
	renderSheet("member", { perk });
	fireEvent.input(noteField(), { target: { value: "   " } });
	fireEvent.click(requestButton());
	await waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledTimes(1);
	});
	expect(mutateAsync.mock.calls[0][0]).toEqual({ perkId: "perk1" });
	// `toEqual` ignores an undefined key: pin that the call carries none.
	expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty("note");
});

test("a sent request toasts the contact's first name, whole", async () => {
	renderSheet("member", { perk });
	fireEvent.click(requestButton());
	await waitFor(() => {
		expect(toasterCreate).toHaveBeenCalledWith({
			type: "success",
			title: "Request sent. Mary Ann will be in touch.",
		});
	});
});

test("with no contact the toast only says the request is sent", async () => {
	renderSheet("member", { perk: noContact });
	fireEvent.click(requestButton());
	await waitFor(() => {
		expect(toasterCreate).toHaveBeenCalledWith({
			type: "success",
			title: "Request sent.",
		});
	});
});

test("the board asks for a perk from the same button", async () => {
	renderSheet("board", { perk });
	fireEvent.click(requestButton());
	await waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledWith({ perkId: "perk1" });
	});
});

test("an open request: the button says when it went, and the sent note shows read-only above it", () => {
	myOpenRequests = [
		{ perkId: "perk1", requestedAt, note: "For our launch in March." },
	];
	renderSheet("member", { perk });
	const button = screen.getByRole("button", {
		name: `Requested on ${formatDateIn(requestedAt, SITE_TIMEZONE)}`,
	});
	expect(button).toBeDisabled();
	// The date says it all: no reason, so no tooltip.
	expect(button).not.toHaveAttribute("aria-description");
	expect(screen.queryByLabelText(NOTE_LABEL)).toBeNull();
	expect(screen.queryByRole("button", { name: "Add a note" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Request perk" })).toBeNull();
	// The note as it was sent, read-only, above the button.
	expect(screen.getByText("Your note")).toBeInTheDocument();
	const sent = screen.getByText("For our launch in March.");
	expect(sent.closest("footer")).toContainElement(button);
	expect(
		sent.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
});

test("an open request without a note shows no sent note", () => {
	myOpenRequests = [{ perkId: "perk1", requestedAt }];
	renderSheet("member", { perk });
	expect(screen.queryByText("Your note")).toBeNull();
});

test("two open requests on the perk: the sheet shows the newer one", () => {
	const later = Date.parse("2026-10-27T09:00:00Z");
	// The older one first, as the list sends them.
	myOpenRequests = [
		{ perkId: "perk1", requestedAt, note: "For our launch in March." },
		{ perkId: "perk1", requestedAt: later, note: "For our second team." },
	];
	renderSheet("member", { perk });
	expect(
		screen.getByRole("button", {
			name: `Requested on ${formatDateIn(later, SITE_TIMEZONE)}`,
		})
	).toBeDisabled();
	expect(screen.getByText("For our second team.")).toBeInTheDocument();
	expect(screen.queryByText("For our launch in March.")).toBeNull();
});

test("a request open on another perk leaves this one requestable", () => {
	myOpenRequests = [{ perkId: "perk2", requestedAt }];
	renderSheet("member", { perk });
	expect(requestButton()).not.toBeDisabled();
	expect(noteField()).toBeInTheDocument();
});

test("an expired perk can't be requested, and the button says why", () => {
	renderSheet("member", { perk: expired });
	expect(requestButton()).toBeDisabled();
	expect(requestButton()).toHaveAttribute(
		"aria-description",
		"This perk has expired"
	);
	// Nothing to write a note for.
	expect(screen.queryByRole("button", { name: "Add a note" })).toBeNull();
	expect(screen.queryByLabelText(NOTE_LABEL)).toBeNull();
});

test("an expired perk still shows the viewer's open request", () => {
	// A member reaches this sheet: the list keeps an expired perk in view
	// while their request on it is open.
	myOpenRequests = [
		{ perkId: "perk1", requestedAt, note: "For our launch in March." },
	];
	renderSheet("member", { perk: expired });
	expect(
		screen.getByRole("button", {
			name: `Requested on ${formatDateIn(requestedAt, SITE_TIMEZONE)}`,
		})
	).toBeDisabled();
});

test("a refused request shows the server's reason in the footer and toasts nothing", async () => {
	mutateAsync.mockRejectedValueOnce(
		new ConvexError({
			code: "PerkNotFound",
			message: "This perk is no longer available.",
		})
	);
	renderSheet("member", { perk });
	fireEvent.click(requestButton());
	expect(
		await screen.findByText("This perk is no longer available.")
	).toBeInTheDocument();
	expect(toasterCreate).not.toHaveBeenCalled();
});

test("a perk that ends while its sheet is open: the server's PerkExpired refusal shows in the footer", async () => {
	// The sheet still takes the perk for active (its end date had not passed
	// when the list loaded); `requestPerk` checks the date again and refuses.
	mutateAsync.mockRejectedValueOnce(
		new ConvexError({
			code: "PerkExpired",
			message: "This perk has expired.",
		})
	);
	renderSheet("member", { perk });
	fireEvent.click(requestButton());
	const refusal = await screen.findByRole("alert");
	expect(refusal).toHaveTextContent("This perk has expired.");
	// The footer's InlineError, beside the Request button.
	await waitFor(() => {
		expect(refusal.closest("footer")).toContainElement(requestButton());
	});
	expect(toasterCreate).not.toHaveBeenCalled();
});

// --- the note is a draft ------------------------------------------------------

test("a typed, unsent note asks before Escape throws it away; Discard closes", async () => {
	const onOpenChange = vi.fn();
	renderSheet("member", { perk, onOpenChange });
	fireEvent.input(noteField(), {
		target: { value: "For our launch in March." },
	});
	const sheet = screen.getByRole("dialog", { name: "Hosting credits" });
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

test("a live refetch of the open perk keeps the typed note, and closing still asks", async () => {
	const [shown, setShown] = createSignal(perk);
	const onOpenChange = vi.fn();
	render(() => (
		<ConfirmProvider>
			<AbilityProvider role="member">
				<PerkSheet open onOpenChange={onOpenChange} perk={shown()} />
			</AbilityProvider>
		</ConfirmProvider>
	));
	fireEvent.input(noteField(), {
		target: { value: "For our launch in March." },
	});
	// The same perk as a new row: what the live list hands over whenever
	// any perk changes.
	setShown({ ...perk });
	expect(noteField()).toHaveValue("For our launch in March.");
	const sheet = screen.getByRole("dialog", { name: "Hosting credits" });
	await waitFor(() => {
		if (!discardPrompt()) fireEvent.keyDown(sheet, { key: "Escape" });
		expect(discardPrompt()).toBeInTheDocument();
	});
	expect(onOpenChange).not.toHaveBeenCalled();
});

test("moving to another perk closes the note field and empties it", () => {
	const [shown, setShown] = createSignal(perk);
	render(() => (
		<ConfirmProvider>
			<AbilityProvider role="member">
				<PerkSheet open onOpenChange={() => {}} perk={shown()} />
			</AbilityProvider>
		</ConfirmProvider>
	));
	fireEvent.input(noteField(), {
		target: { value: "For our launch in March." },
	});
	setShown({ ...perk, _id: "perk2" } as PerkRow);
	expect(screen.queryByLabelText(NOTE_LABEL)).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
	expect(screen.getByLabelText(NOTE_LABEL)).toHaveValue("");
});

test("an empty note closes on Escape without asking", async () => {
	const onOpenChange = vi.fn();
	renderSheet("member", { perk, onOpenChange });
	const sheet = screen.getByRole("dialog", { name: "Hosting credits" });
	await waitFor(() => {
		fireEvent.keyDown(sheet, { key: "Escape" });
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
	expect(discardPrompt()).toBeNull();
});

// --- loading and morph ----------------------------------------------------------

test("loading: shows the skeleton, not the perk or its Request button", () => {
	renderSheet("member", { perk, loading: true });
	expect(sheetSkeleton()).toBeInTheDocument();
	expect(
		screen.queryByRole("heading", { name: "Hosting credits" })
	).toBeNull();
	expect(screen.queryByRole("button", { name: "Request perk" })).toBeNull();
});

test("morph: the perk's table cells pair with the sheet's rows", () => {
	// The availability column is hidden (the table groups by it).
	const row = tableRowKeys(
		perkColumns().filter((column) => column.id !== "availability"),
		perk
	);
	// The perk title is the row's title cell; it flies into the sheet's
	// title, so the sheet has no Title row of its own.
	expect(row).toEqual({
		cells: ["partner", "category", "validUntil"],
		title: "title",
	});
	renderSheet("member", { perk });
	expect(sheetKeys()).toEqual([
		"partner",
		"category",
		"validUntil",
		"link",
		"contact",
		"terms",
	]);
});

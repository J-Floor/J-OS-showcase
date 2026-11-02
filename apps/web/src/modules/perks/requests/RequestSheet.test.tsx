// @vitest-environment happy-dom
import {
	HOVER_INTENT_MS,
	MORPH_OF,
	ShortcutPeekProvider,
} from "@j-os/design-system";
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

afterEach(cleanup);

// `setPerkRequestStatus` is the one mutation; each query reads
// `backend.queries` by name (missing: still loading). Routed by name:
// Convex's `api` refs are proxies, not `===`-stable.
const backend = vi.hoisted(() => ({
	setStatus: vi.fn<(args: unknown) => Promise<null>>(() =>
		Promise.resolve(null)
	),
	queries: new Map<string, unknown>(),
	queried: [] as { name: string; args: unknown }[],
}));

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutateAsync: backend.setStatus }),
	useQuery: (reference: FunctionReference<"query">, args: unknown) => {
		const name = getFunctionName(reference);
		backend.queried.push({
			name,
			args: typeof args === "function" ? (args as () => unknown)() : args,
		});
		return {
			data: () => backend.queries.get(name),
			error: () => {},
			isLoading: () => false,
		};
	},
}));

import type { Id } from "../../../../convex/_generated/dataModel";
import type { HistoryEntry } from "../../../../convex/history/types.ts";
import { SITE_TIMEZONE } from "../../../../convex/lib/time.ts";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import { AbilityProvider } from "../../../lib/ability.tsx";
import { ShortcutPeekButton } from "../../../shared/ShortcutPeekButton.tsx";
import { formatDateIn } from "../../../shared/time.ts";
import { perksEntity } from "../entity.ts";

import { RequestSheet } from "./RequestSheet.tsx";

const REQUEST: PerkRequestRow = {
	_id: "request1" as Id<"perkRequests">,
	perkId: "perk1" as Id<"perks">,
	personId: "person2" as Id<"people">,
	requesterName: "Ada Lovelace",
	requesterEmail: "ada@example.com",
	ventureName: "Analytical Engines",
	perkTitle: "Cloud credits",
	partner: "Acme Cloud",
	contactName: "Grace Hopper",
	requestedAt: Date.parse("2026-10-20T09:00:00Z"),
	note: "We run our build farm on it.\nTwo teams of four.",
	status: "contacted",
	statusAt: Date.parse("2026-10-21T09:00:00Z"),
	statusByName: "Grace Hopper",
};

const HISTORY: HistoryEntry[] = [
	{
		kind: "perk",
		_id: "event2",
		at: Date.parse("2026-10-21T09:00:00Z"),
		event: "contacted",
		perkRequestId: REQUEST._id,
		perkId: REQUEST.perkId,
		perkTitle: "Cloud credits",
		partner: "Acme Cloud",
		actorName: "Cleo Board",
	},
	{
		kind: "perk",
		_id: "event1",
		at: Date.parse("2026-10-20T09:00:00Z"),
		event: "requested",
		perkRequestId: REQUEST._id,
		perkId: REQUEST.perkId,
		perkTitle: "Cloud credits",
		partner: "Acme Cloud",
		actorName: "Ada Lovelace",
	},
];

beforeEach(() => {
	backend.queries.set("perkRequests:perkRequestHistory", HISTORY);
});

afterEach(() => {
	backend.queries.clear();
	backend.queried.length = 0;
	vi.clearAllMocks();
});

function renderSheet(
	props: { request?: PerkRequestRow; loading?: boolean; open?: boolean } = {
		request: REQUEST,
	}
) {
	const history = createMemoryHistory();
	history.set({
		value: "/perks?tab=requests&open=request%3Arequest1",
		scroll: false,
		replace: true,
	});
	render(() => (
		<MemoryRouter history={history}>
			<Route
				path="*"
				component={() => (
					<ShortcutPeekProvider>
						<ShortcutPeekButton />
						<AbilityProvider role="board">
							<RequestSheet
								open={props.open ?? true}
								onOpenChange={() => {}}
								request={props.request}
								loading={props.loading}
							/>
						</AbilityProvider>
					</ShortcutPeekProvider>
				)}
			/>
		</MemoryRouter>
	));
	return history;
}

function sheet(): HTMLElement {
	return screen.getByRole("dialog");
}

test("heads with who asked, with the perk below", () => {
	renderSheet();
	expect(
		within(sheet()).getByRole("heading", { name: "Ada Lovelace" })
	).toBeInTheDocument();
	// Exactly the title: the perk's own row reads "Acme Cloud · Cloud credits".
	expect(within(sheet()).getByText("Cloud credits").tagName).toBe("P");
});

test("lists the request's details", () => {
	renderSheet();
	const details = within(sheet());
	expect(details.getByText("ada@example.com")).toBeInTheDocument();
	expect(details.getByText("Analytical Engines")).toBeInTheDocument();
	expect(details.getByText("Grace Hopper")).toBeInTheDocument();
	expect(
		details.getByText(formatDateIn(REQUEST.requestedAt, SITE_TIMEZONE))
	).toBeInTheDocument();
});

test("keeps the note as written, line breaks and all, read-only", () => {
	renderSheet();
	const note = within(sheet()).getByText(/We run our build farm on it\./);
	expect(note.textContent).toBe(REQUEST.note);
	expect(note.tagName).toBe("P");
	expect(within(sheet()).queryByRole("textbox")).toBeNull();
});

test("says so when there is no contact, no venture and no note", () => {
	renderSheet({
		request: {
			...REQUEST,
			contactName: undefined,
			ventureName: undefined,
			note: undefined,
		},
	});
	expect(within(sheet()).getByText("No contact")).toBeInTheDocument();
	expect(within(sheet()).getByText("No venture")).toBeInTheDocument();
	expect(within(sheet()).queryByText(/build farm/)).toBeNull();
});

test("the requester opens their person's peek, morphing from their row", async () => {
	const history = renderSheet();
	const requester = within(sheet()).getByRole("button", {
		name: /Ada Lovelace/,
	});
	expect(requester.closest(`[${MORPH_OF}]`)).toHaveAttribute(
		MORPH_OF,
		"person2"
	);
	fireEvent.click(requester);
	await waitFor(() => {
		expect(history.get()).toContain("open=person%3Aperson2");
	});
});

test("the perk opens its peek, morphing from its row", async () => {
	const history = renderSheet();
	const perk = within(sheet()).getByRole("button", {
		name: /Acme Cloud · Cloud credits/,
	});
	expect(perk.closest(`[${MORPH_OF}]`)).toHaveAttribute(MORPH_OF, "perk1");
	fireEvent.click(perk);
	await waitFor(() => {
		expect(history.get()).toContain("open=perk%3Aperk1");
	});
});

test("the perk warms its peek on a press, a touch included: a touch has no hover", () => {
	const preload = vi
		.spyOn(perksEntity.peek!, "preload")
		.mockResolvedValue(undefined as never);
	try {
		renderSheet();
		const perk = within(sheet()).getByRole("button", {
			name: /Acme Cloud · Cloud credits/,
		});
		expect(preload).not.toHaveBeenCalled();
		fireEvent.pointerDown(perk, { pointerType: "touch" });
		expect(preload).toHaveBeenCalledTimes(1);
	} finally {
		preload.mockRestore();
	}
});

test("resting the pointer on the perk warms its peek", () => {
	vi.useFakeTimers();
	const preload = vi
		.spyOn(perksEntity.peek!, "preload")
		.mockResolvedValue(undefined as never);
	try {
		renderSheet();
		const perk = within(sheet()).getByRole("button", {
			name: /Acme Cloud · Cloud credits/,
		});
		fireEvent.pointerEnter(perk, { pointerType: "mouse" });
		expect(preload).not.toHaveBeenCalled();
		vi.advanceTimersByTime(HOVER_INTENT_MS);
		expect(preload).toHaveBeenCalledTimes(1);
	} finally {
		preload.mockRestore();
		vi.useRealTimers();
	}
});

test("shows the request's own history, newest first", () => {
	renderSheet();
	expect(
		backend.queried.find(
			(query) => query.name === "perkRequests:perkRequestHistory"
		)?.args
	).toEqual({ requestId: "request1" });
	const entries = within(sheet()).getAllByText(
		/^(Contacted|Requested) Cloud credits$/
	);
	expect(entries.map((entry) => entry.textContent)).toEqual([
		"Contacted Cloud credits",
		"Requested Cloud credits",
	]);
});

test("offers Contacted, Granted and Declined, the current status disabled with why", () => {
	renderSheet();
	const footer = within(sheet());
	expect(footer.getByRole("button", { name: /Contacted/ })).toBeDisabled();
	expect(footer.getByRole("button", { name: /Granted/ })).toBeEnabled();
	expect(footer.getByRole("button", { name: /Declined/ })).toBeEnabled();
	expect(
		footer.getByRole("button", { name: /Contacted/ }).parentElement
	).toHaveAttribute("data-disabled");
});

test("a status button moves the request there", async () => {
	renderSheet();
	fireEvent.click(within(sheet()).getByRole("button", { name: /Declined/ }));
	await waitFor(() => {
		expect(backend.setStatus).toHaveBeenCalledWith({
			requestId: "request1",
			status: "declined",
		});
	});
});

test.each([
	["g", "granted"],
	["x", "declined"],
] as const)("%s moves the request to %s", async (key, status) => {
	renderSheet();
	fireEvent.keyDown(document.body, { key });
	await waitFor(() => {
		expect(backend.setStatus).toHaveBeenCalledWith({
			requestId: "request1",
			status,
		});
	});
	expect(backend.setStatus).toHaveBeenCalledTimes(1);
});

test("C does nothing on a request already contacted", async () => {
	renderSheet();
	fireEvent.keyDown(document.body, { key: "c" });
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
	expect(backend.setStatus).not.toHaveBeenCalled();
});

test("C moves a new request to Contacted", async () => {
	renderSheet({ request: { ...REQUEST, status: "requested" } });
	fireEvent.keyDown(document.body, { key: "c" });
	await waitFor(() => {
		expect(backend.setStatus).toHaveBeenCalledWith({
			requestId: "request1",
			status: "contacted",
		});
	});
});

test("the keys do nothing while the sheet is closed", async () => {
	renderSheet({ request: REQUEST, open: false });
	fireEvent.keyDown(document.body, { key: "g" });
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
	expect(backend.setStatus).not.toHaveBeenCalled();
});

test("every status button shows its key while peeking", () => {
	renderSheet();
	fireEvent.click(screen.getByRole("button", { name: /shortcut/i }));
	for (const name of [/Contacted/, /Granted/, /Declined/])
		expect(
			within(sheet()).getByRole("button", { name }).querySelector("kbd")
		).not.toBeNull();
});

test("a refused change says why in the footer", async () => {
	backend.setStatus.mockRejectedValueOnce(
		new ConvexError({ code: "Forbidden", message: "You can't do that." })
	);
	renderSheet();
	fireEvent.click(within(sheet()).getByRole("button", { name: /Granted/ }));
	expect(
		await within(sheet()).findByText("You can't do that.")
	).toBeInTheDocument();
});

test("while the request loads: no actions, and no history read", () => {
	renderSheet({ loading: true });
	expect(
		within(sheet()).queryByRole("button", { name: /Granted/ })
	).toBeNull();
	expect(
		backend.queried.some(
			(query) => query.name === "perkRequests:perkRequestHistory"
		)
	).toBe(false);
});

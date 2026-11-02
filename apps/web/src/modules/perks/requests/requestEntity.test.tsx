// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { getFunctionName, type FunctionReference } from "convex/server";
import type { Accessor } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

const prefetch =
	vi.fn<(query: FunctionReference<"query">, args: unknown) => void>();
vi.mock("../../../shared/data/queryKeeper.ts", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../../shared/data/queryKeeper.ts")
	>()),
	prefetchSpec: (
		spec: {
			query: FunctionReference<"query">;
			args: (key: unknown) => unknown;
		},
		key: unknown
	) => {
		prefetch(spec.query, spec.args(key));
	},
}));

// What `getPerkRequest` answers for each id: `undefined` while it loads,
// `null` once the request is gone or the id is not a request's. Every read
// is logged with whether it ran.
const answers = vi.hoisted(() => new Map<string, unknown>());
// The error each id's read fails with. Like convex-solidjs, whose `data` is
// a resource: reading an errored one throws.
const failures = vi.hoisted(() => new Map<string, Error>());
const reads = vi.hoisted(
	() => [] as { name: string; requestId: string; enabled: boolean }[]
);
vi.mock("../../../shared/data/useQuery.ts", () => ({
	useQuery: (
		query: FunctionReference<"query">,
		args: () => { requestId: string },
		options: () => { enabled?: boolean; keepPreviousData?: boolean }
	) => ({
		data: () => {
			const { requestId } = args();
			const { enabled = true } = options();
			reads.push({ name: getFunctionName(query), requestId, enabled });
			if (!enabled) return;
			const failure = failures.get(requestId);
			if (failure) throw failure;
			return answers.get(requestId);
		},
		error: () => failures.get(args().requestId),
	}),
}));

import type { Id } from "../../../../convex/_generated/dataModel";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import { entityPath } from "../../../shared/entity/entityDescriptor.ts";

import { requestEntity } from "./requestEntity.ts";

afterEach(() => {
	answers.clear();
	failures.clear();
	reads.length = 0;
	prefetch.mockClear();
});

function row(id: string): PerkRequestRow {
	return {
		_id: id as Id<"perkRequests">,
		perkId: "perk1" as Id<"perks">,
		personId: "person1" as Id<"people">,
		requesterName: "Ada Example",
		requesterEmail: "ada@example.com",
		perkTitle: "Cloud credits",
		partner: "Alpha Labs",
		requestedAt: Date.UTC(2026, 9, 20, 9),
		status: "requested",
		statusAt: Date.UTC(2026, 9, 20, 9),
	};
}

/** The descriptor's rows, read inside a router at `url`. */
function rowsAt(url: string) {
	const history = createMemoryHistory();
	history.set({ value: url, scroll: false, replace: true });
	let rows!: Accessor<PerkRequestRow[] | undefined>;
	render(() => (
		<MemoryRouter history={history}>
			<Route
				path="*"
				component={() => {
					rows = requestEntity.useRows();
					return null;
				}}
			/>
		</MemoryRouter>
	));
	return { rows: () => rows(), history };
}

test("names a request by its requester, with the perk beside it", () => {
	expect(requestEntity.label(row("r1"))).toBe("Ada Example");
	expect(requestEntity.detail?.(row("r1"))).toBe("Cloud credits");
	expect(requestEntity.keywords?.(row("r1"))).toEqual([
		"Cloud credits",
		"Alpha Labs",
	]);
});

test("links to the request on the board's Requests tab", () => {
	expect(entityPath(requestEntity, row("r1"))).toBe(
		"/perks?tab=requests&request=r1"
	);
});

test("is the board's alone", () => {
	expect(requestEntity.ability).toEqual({
		action: "manage",
		subject: "Perks",
	});
});

test("holds the one request the peek names, read by its id", async () => {
	answers.set("r1", row("r1"));
	const { rows } = rowsAt("/perks?open=request:r1");
	await waitFor(() => {
		expect(rows()).toEqual([row("r1")]);
	});
	expect(reads.at(-1)).toEqual({
		name: "perkRequests:getPerkRequest",
		requestId: "r1",
		enabled: true,
	});
});

test("is loading while the request loads, and empty once it is gone", async () => {
	const { rows, history } = rowsAt("/perks?open=request:r1");
	expect(rows()).toBeUndefined();
	answers.set("r2", null);
	history.set({ value: "/perks?open=request:r2" });
	await waitFor(() => {
		expect(rows()).toEqual([]);
	});
});

test("keeps the request once the peek closes, so the sheet closes with it", async () => {
	answers.set("r1", row("r1"));
	const { rows, history } = rowsAt("/perks?open=request:r1");
	await waitFor(() => {
		expect(rows()).toEqual([row("r1")]);
	});
	history.set({ value: "/perks" });
	await waitFor(() => {
		expect(history.get()).toBe("/perks");
	});
	expect(rows()).toEqual([row("r1")]);
	// Another kind's peek keeps it too.
	history.set({ value: "/perks?open=perk:perk1" });
	expect(rows()).toEqual([row("r1")]);
});

test("reads nothing and holds no rows while no request was asked for", () => {
	const { rows } = rowsAt("/perks?open=perk:perk1");
	expect(rows()).toEqual([]);
	expect(reads.every((read) => !read.enabled)).toBe(true);
});

test("warms the request and its history for the sheet", () => {
	requestEntity.prefetch?.(row("r1"), () => true);
	expect(
		prefetch.mock.calls.map(([query, args]) => [
			getFunctionName(query),
			args,
		])
	).toEqual([
		["perkRequests:getPerkRequest", { requestId: "r1" }],
		["perkRequests:perkRequestHistory", { requestId: "r1" }],
	]);
});

test("a malformed id is a dead link, not a request forever loading", async () => {
	// The server answers a malformed id with null, as it does a gone one.
	answers.set("not-an-id", null);
	const { rows } = rowsAt("/perks?open=request:not-an-id");
	await waitFor(() => {
		expect(rows()).toEqual([]);
	});
});

test("a failed read is not mistaken for a dead link", () => {
	failures.set("r1", new Error("Network unreachable."));
	// Thrown to the nearest error boundary, as any other failed read.
	expect(() => rowsAt("/perks?open=request:r1")).toThrow(
		"Network unreachable."
	);
});

// @vitest-environment happy-dom
import {
	createMemoryHistory,
	MemoryRouter,
	Route,
	useNavigate,
} from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { getFunctionName } from "convex/server";
import { Show } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

const {
	mockStart,
	mockQuery,
	mockPrint,
	itemsData,
	itemTypesData,
	categoriesData,
} = vi.hoisted(() => ({
	mockStart: vi.fn(),
	mockQuery: vi.fn(),
	mockPrint: vi.fn(() => Promise.resolve()),
	// `undefined` matches the routed `useQuery` stub below — set per-test to
	// exercise the entity-selection wiring without disturbing the tests that
	// never touch it.
	itemsData: { current: undefined as unknown[] | undefined },
	itemTypesData: { current: undefined as unknown[] | undefined },
	categoriesData: { current: undefined as unknown[] | undefined },
}));

// `ItemsTab`/`ItemTypesTab`/`CategoriesTab` are fully mocked so these tests
// never render the real table/drawer stack (Select, canvas QR codes, etc.) —
// but each mock renders a `role="dialog"` whenever the REAL
// `createEntitySelection` it's handed (built by `InventoryPage`, not mocked)
// reports a row open. That way the tests assert the observable drawer output
// of the actual migrated selection wiring, not an internal prop shape.
vi.mock("./tabs/ItemsTab.tsx", () => ({
	ItemsTab: (props: {
		selection: {
			open: () => boolean;
			selected: () => { assetTag: string } | undefined;
		};
	}) => (
		<div>
			items-tab
			<Show when={props.selection.open() && props.selection.selected()}>
				{(row) => <div role="dialog">Item {row().assetTag}</div>}
			</Show>
		</div>
	),
}));
vi.mock("./tabs/ItemTypesTab.tsx", () => ({
	ItemTypesTab: (props: {
		selection: {
			open: () => boolean;
			selected: () => { name: string } | undefined;
		};
	}) => (
		<div>
			types-tab
			<Show when={props.selection.open() && props.selection.selected()}>
				{(row) => <div role="dialog">Item type {row().name}</div>}
			</Show>
		</div>
	),
}));
vi.mock("./tabs/CategoriesTab.tsx", () => ({
	CategoriesTab: (props: {
		selection: {
			open: () => boolean;
			selected: () => { name: string } | undefined;
		};
	}) => (
		<div>
			categories-tab
			<Show when={props.selection.open() && props.selection.selected()}>
				{(row) => <div role="dialog">Category {row().name}</div>}
			</Show>
		</div>
	),
}));

vi.mock("convex-solidjs", () => ({
	useConvexClient: () => ({ query: mockQuery }),
	useMutation: () => ({ mutate: vi.fn() }),
	// `ItemsTab`/`ItemTypesTab`/`CategoriesTab` are all mocked above, so the
	// only live `useQuery` callers left in the tree are the three
	// `entity.useRows()` calls `InventoryPage` makes directly. Convex's `api`
	// is a proxy whose refs aren't `===`-stable (see EventsPage.test.tsx), so
	// route by the query's stable string name instead.
	useQuery: (fn: unknown) => {
		const name = getFunctionName(
			fn as Parameters<typeof getFunctionName>[0]
		);
		if (name === "inventory:listItemTypes") {
			return { data: () => itemTypesData.current };
		}
		if (name === "inventory:listCategories") {
			return { data: () => categoriesData.current };
		}
		return { data: () => itemsData.current };
	},
}));

vi.mock("./scan/qrScan.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./scan/qrScan.ts")>();
	return { ...actual, startQrScan: mockStart };
});

vi.mock("./print/printInventoryList.ts", () => ({
	printInventoryList: mockPrint,
}));

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}
if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}
if (!(Element.prototype as { hasPointerCapture?: unknown }).hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
}

import { AbilityProvider, type Role } from "../../lib/ability.tsx";

import { InventoryPage } from "./InventoryPage.tsx";

afterEach(() => {
	cleanup();
	mockStart.mockReset();
	mockQuery.mockReset();
	mockPrint.mockClear();
	itemsData.current = undefined;
	itemTypesData.current = undefined;
	categoriesData.current = undefined;
});

const chairItem = {
	_id: "items:chair",
	_creationTime: 0,
	assetTag: "A00001",
	typeId: "itemTypes:chair",
	typeName: "Chair",
	categoryId: "itemCategories:furniture",
	categoryName: "Furniture",
};

function hangUntilAbort() {
	mockStart.mockImplementation(
		(_video: unknown, _onDetect: unknown, signal: AbortSignal) =>
			new Promise<void>((resolve) => {
				signal.addEventListener(
					"abort",
					() => {
						resolve();
					},
					{ once: true }
				);
			})
	);
}

function detectThenHang(raw: string) {
	mockStart.mockImplementation(
		(
			_video: unknown,
			detect: (value: string) => void,
			signal: AbortSignal
		) => {
			detect(raw);
			return new Promise<void>((resolve) => {
				signal.addEventListener(
					"abort",
					() => {
						resolve();
					},
					{ once: true }
				);
			});
		}
	);
}

function renderAs(role: Role) {
	return render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role={role}>
						<InventoryPage />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
}

test("board sees all three tab triggers and add buttons", () => {
	renderAs("board");
	expect(screen.getByRole("tab", { name: "Items" })).toBeInTheDocument();
	expect(screen.getByRole("tab", { name: "Item types" })).toBeInTheDocument();
	expect(screen.getByRole("tab", { name: "Categories" })).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /New item/ })
	).toBeInTheDocument();
	expect(screen.getByRole("button", { name: /Scan QR/ })).toBeInTheDocument();
});

test("member sees no inventory tabs", () => {
	renderAs("member");
	expect(
		screen.queryByRole("tab", { name: "Items" })
	).not.toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: /Scan QR/ })
	).not.toBeInTheDocument();
});

test("Scan QR opens the camera dialog", async () => {
	hangUntilAbort();
	renderAs("board");
	fireEvent.click(screen.getByRole("button", { name: /Scan QR/ }));
	expect(await screen.findByText("Scan asset tag")).toBeInTheDocument();
});

test("an invalid QR payload keeps the scanner open with an error", async () => {
	detectThenHang("not-a-tag");
	renderAs("board");
	fireEvent.click(screen.getByRole("button", { name: /Scan QR/ }));
	expect(
		await screen.findByText(
			"This QR isn't an asset tag (expected e.g. A00000)."
		)
	).toBeInTheDocument();
	expect(mockQuery).not.toHaveBeenCalled();
});

test("an unknown asset tag asks whether to add it", async () => {
	detectThenHang("Z00099");
	mockQuery.mockResolvedValue(null);
	renderAs("board");
	fireEvent.click(screen.getByRole("button", { name: /Scan QR/ }));
	expect(await screen.findByText("No item for Z00099")).toBeInTheDocument();
	expect(
		screen.getByText(
			"Nothing is registered under this asset tag. Add a new item with this tag?"
		)
	).toBeInTheDocument();
	expect(
		await screen.findByRole("button", { name: /Add item/ })
	).toBeInTheDocument();
});

function renderAt(start: string) {
	const history = createMemoryHistory();
	history.set({ value: start, scroll: false, replace: true });
	return render(() => (
		<MemoryRouter history={history}>
			<Route
				path="/inventory"
				component={() => (
					<AbilityProvider role="board">
						<InventoryPage />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
}

const chairType = {
	_id: "itemTypes:chair",
	_creationTime: 0,
	name: "Chair",
	categoryId: "itemCategories:furniture",
	categoryName: "Furniture",
};

const furnitureCategory = {
	_id: "itemCategories:furniture",
	_creationTime: 0,
	name: "Furniture",
};

test("a deep-link item param opens the item drawer once the item is loaded", async () => {
	itemsData.current = [chairItem];
	renderAt("/inventory?tab=items&item=A00001");
	expect(await screen.findByRole("dialog")).toHaveTextContent("A00001");
});

test("scanning a full deep-link URL opens the matching item", async () => {
	itemsData.current = [chairItem];
	mockQuery.mockResolvedValue({ _id: "items:chair" });
	detectThenHang("https://x.test/inventory?tab=items&item=A00001");
	renderAs("board");
	fireEvent.click(screen.getByRole("button", { name: /Scan QR/ }));
	// The scan dialog and the item drawer are both `role="dialog"`, and the
	// scan-to-item handoff is async (resolves the tag, closes the scanner,
	// opens the drawer) — `findByRole` alone would grab whichever dialog is
	// mounted on its first check. Keep asserting until the one on screen is
	// the item drawer.
	await waitFor(() => {
		expect(screen.getByRole("dialog")).toHaveTextContent("A00001");
	});
});

test("a deep-link type param opens the item-type drawer", async () => {
	itemTypesData.current = [chairType];
	renderAt("/inventory?tab=types&type=itemTypes:chair");
	expect(await screen.findByRole("dialog")).toHaveTextContent("Chair");
});

test("a deep-link category param opens the category drawer", async () => {
	categoriesData.current = [furnitureCategory];
	renderAt("/inventory?tab=categories&category=itemCategories:furniture");
	expect(await screen.findByRole("dialog")).toHaveTextContent("Furniture");
});

test("switching tabs closes the open drawer and does not reopen it on switching back (#63)", async () => {
	itemsData.current = [chairItem];
	renderAt("/inventory?tab=items&item=A00001");
	expect(await screen.findByRole("dialog")).toHaveTextContent("A00001");

	// A manual tab switch is a new subject: the item drawer (a Portal, still
	// mounted on the now-hidden Items tab) must close rather than float over
	// the tab the user just asked for.
	fireEvent.click(screen.getByRole("tab", { name: "Item types" }));
	await waitFor(() => {
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	// Switching back must not reopen it from a lingering `?item=` param —
	// `close()` only writes the URL while its own tab is active, so without an
	// explicit clear the stale param would silently reopen the drawer here.
	fireEvent.click(screen.getByRole("tab", { name: "Items" }));
	await waitFor(() => {
		expect(screen.getByText("items-tab")).toBeInTheDocument();
	});
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("a command-palette navigation to another tab closes the previous tab's drawer (#63)", async () => {
	itemsData.current = [chairItem];
	itemTypesData.current = [chairType];
	let navigate!: ReturnType<typeof useNavigate>;
	const history = createMemoryHistory();
	history.set({
		value: "/inventory?tab=items&item=A00001",
		scroll: false,
		replace: true,
	});
	render(() => (
		<MemoryRouter history={history}>
			<Route
				path="/inventory"
				component={() => {
					navigate = useNavigate();
					return (
						<AbilityProvider role="board">
							<InventoryPage />
						</AbilityProvider>
					);
				}}
			/>
		</MemoryRouter>
	));

	// The item drawer opens from the inbound deep-link.
	expect(await screen.findByRole("dialog")).toHaveTextContent("A00001");

	// A command-palette navigation changes `?tab=` WITHOUT going through the
	// Tabs' own `urlParam.set` (which is the only place that used to close the
	// siblings). The item drawer — a still-mounted Portal on the now-hidden
	// Items tab — must close rather than float under the type drawer.
	navigate("/inventory?tab=types&type=itemTypes:chair", { scroll: false });

	// The type drawer opens...
	await waitFor(() => {
		expect(screen.getByText("Item type Chair")).toBeInTheDocument();
	});
	// ...and the item drawer is gone. `queryByText` matches hidden nodes too, so
	// a drawer left open inside the now-hidden Items tab would still be found —
	// this is the assertion that goes red without the close-when-inactive fix.
	expect(screen.queryByText("Item A00001")).not.toBeInTheDocument();
});

test("the toolbar Print button prints the whole list in query order", async () => {
	// Two rows in a deliberately non-sorted order: the toolbar prints
	// `itemRows()` verbatim (the PDF renderer does not sort), so this pins both
	// that the WHOLE list is forwarded (not just the first row) AND that the
	// query order is preserved. One row would pass even if it truncated.
	const deskItem = { ...chairItem, _id: "items:desk", assetTag: "A00002" };
	itemsData.current = [deskItem, chairItem];
	renderAs("board");
	const print = screen.getByRole("button", {
		name: /print inventory list/i,
	});
	fireEvent.click(print);
	await waitFor(() => {
		expect(mockPrint).toHaveBeenCalledTimes(1);
	});
	const [rows] = mockPrint.mock.calls[0] as unknown as [(typeof chairItem)[]];
	expect(rows.map((r) => r.assetTag)).toEqual(["A00002", "A00001"]);
});

test("the toolbar Print button is disabled when there are no items", () => {
	itemsData.current = [];
	renderAs("board");
	expect(
		screen.getByRole("button", { name: /print inventory list/i })
	).toBeDisabled();
});

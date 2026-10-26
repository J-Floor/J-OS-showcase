// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutate: vi.fn().mockResolvedValue(undefined) }),
	useQuery: () => ({ data: () => {} }),
}));

/* eslint-disable func-style, unicorn/consistent-function-scoping -- hoisted mock factories */
const { none, actions } = vi.hoisted(() => {
	const none = () => ({ data: () => [] as unknown[] });
	const actions = () => ({
		create: vi.fn(),
		update: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn(),
	});
	return { none, actions };
});
/* eslint-enable func-style, unicorn/consistent-function-scoping -- end of hoisted mock factories */

vi.mock("./data/inventoryData.ts", () => ({
	useItems: none,
	useItemTypes: none,
	useCategories: none,
	useItemsByType: none,
	useItemTypesByCategory: none,
	useItemActions: actions,
	useItemTypeActions: actions,
	useCategoryActions: actions,
}));

import type { Id } from "../../../convex/_generated/dataModel";
import { AbilityProvider } from "../../lib/ability.tsx";
import { ConfirmProvider } from "../../shared/confirm.tsx";
import type { PeekProps } from "../../shared/entity/entityDescriptor.ts";
import { PeekContext } from "../../shared/entity/PeekContext.tsx";

import { CategoryPeek } from "./CategoryPeek.tsx";
import type { Category, Item, ItemType } from "./data/inventoryData.ts";
import { categoryEntity, itemEntity, itemTypeEntity } from "./entity.ts";
import { ItemPeek } from "./ItemPeek.tsx";
import { ItemTypePeek } from "./ItemTypePeek.tsx";

const CATEGORY = "itemCategories:furniture" as Id<"itemCategories">;
const TYPE = "itemTypes:chair" as Id<"itemTypes">;

const category: Category = {
	_id: CATEGORY,
	_creationTime: 0,
	name: "Furniture",
};
const itemType: ItemType = {
	_id: TYPE,
	_creationTime: 0,
	name: "Chair",
	categoryId: CATEGORY,
	categoryName: "Furniture",
};
const item: Item = {
	_id: "items:chair" as Id<"items">,
	_creationTime: 0,
	assetTag: "A00001",
	typeId: TYPE,
	typeName: "Chair",
	categoryId: CATEGORY,
	categoryName: "Furniture",
};

function renderPeek(
	peek: (onOpenChange: (isOpen: boolean) => void) => JSX.Element,
	onOpenChange: (isOpen: boolean) => void
) {
	render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<ConfirmProvider>
						<AbilityProvider role="board">
							<PeekContext.Provider
								value={{
									viewIn: {
										label: "View in Inventory",
										href: "/inventory",
									},
								}}
							>
								{peek(onOpenChange)}
							</PeekContext.Provider>
						</AbilityProvider>
					</ConfirmProvider>
				)}
			/>
		</MemoryRouter>
	));
}

function peekProps<Row extends { _id: string }>(
	row: Row,
	onOpenChange: (isOpen: boolean) => void
): PeekProps<Row> {
	return { row, loading: false, open: true, prebuild: false, onOpenChange };
}

const cases: [
	string,
	string,
	(onOpenChange: (isOpen: boolean) => void) => JSX.Element,
][] = [
	[
		"item",
		"A00001",
		(onOpenChange) => <ItemPeek {...peekProps(item, onOpenChange)} />,
	],
	[
		"item type",
		"Chair",
		(onOpenChange) => (
			<ItemTypePeek {...peekProps(itemType, onOpenChange)} />
		),
	],
	[
		"category",
		"Furniture",
		(onOpenChange) => (
			<CategoryPeek {...peekProps(category, onOpenChange)} />
		),
	],
];

test("every inventory kind has a peek", () => {
	expect(itemEntity.peek).toBeDefined();
	expect(itemTypeEntity.peek).toBeDefined();
	expect(categoryEntity.peek).toBeDefined();
});

test.each(cases)(
	"%s peek shows its title, a View in button and no prev/next",
	async (_kind, title, peek) => {
		renderPeek(peek, () => {});
		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: title })
			).toBeInTheDocument();
		});
		expect(
			screen.getByRole("button", { name: "View in Inventory" })
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /previous|next/i })
		).toBeNull();
	}
);

test.each(cases)(
	"closing the %s peek calls onOpenChange(false)",
	async (_kind, _title, peek) => {
		const onOpenChange = vi.fn();
		renderPeek(peek, onOpenChange);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /close/i })
			).toBeInTheDocument();
		});
		fireEvent.click(screen.getByRole("button", { name: /close/i }));
		await waitFor(() => {
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});
	}
);

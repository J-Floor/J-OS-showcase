// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { ConvexError } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";

const { mockCreate, mockUpdate, mockRemove, mockUseItemTypesByCategory } =
	vi.hoisted(() => ({
		mockCreate: vi.fn(),
		mockUpdate: vi.fn().mockResolvedValue(undefined),
		mockRemove: vi.fn(),
		// Records the resolved categoryId each call so tests can assert the
		// drawer asks for `undefined` (no subscription) in create mode and the
		// real id in edit mode.
		mockUseItemTypesByCategory: vi.fn(),
	}));

const furnitureTypes = [
	{ _id: "itemTypes:chair", name: "Chair" },
	{ _id: "itemTypes:table", name: "Table" },
];

afterEach(() => {
	cleanup();
	mockCreate.mockClear();
	mockUpdate.mockClear();
	mockRemove.mockClear();
	mockUseItemTypesByCategory.mockClear();
});

vi.mock("../data/inventoryData.ts", () => ({
	useCategoryActions: () => ({
		create: mockCreate,
		update: mockUpdate,
		remove: mockRemove,
	}),
	useItemTypesByCategory: (categoryId: () => string | undefined) => {
		const id = categoryId();
		mockUseItemTypesByCategory(id);
		return {
			data: () => {
				if (id === "itemCategories:furniture") return furnitureTypes;
				return id === "itemCategories:empty" ? [] : undefined;
			},
		};
	},
}));

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

import type { Category } from "../data/inventoryData.ts";

import { CategoryDrawer } from "./CategoryDrawer.tsx";

const furniture: Category = {
	_id: "itemCategories:furniture" as Category["_id"],
	_creationTime: 0,
	name: "Furniture",
	description: "Chairs and tables",
};

test("new category: Create is disabled until a name is entered", () => {
	render(() => <CategoryDrawer open onOpenChange={() => {}} />);
	expect(screen.getByText("New category")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Create category/ })
	).toBeDisabled();

	fireEvent.input(screen.getByLabelText("Name"), {
		target: { value: "IT" },
	});
	// A disabled button with a `disabledReason` renders through a Tooltip
	// wrapper (MakeDisablable); losing `disabled` swaps back to the bare
	// button, which is a different DOM node — re-query rather than reuse the
	// captured reference from the disabled render.
	expect(
		screen.getByRole("button", { name: /Create category/ })
	).not.toBeDisabled();
});

test("editing an existing category shows its fields and no create button", () => {
	render(() => (
		<CategoryDrawer open onOpenChange={() => {}} category={furniture} />
	));
	expect(screen.getByText("Category")).toBeInTheDocument();
	expect(screen.getByLabelText("Name")).toHaveValue("Furniture");
	expect(screen.getByLabelText("Description")).toHaveValue(
		"Chairs and tables"
	);
	expect(
		screen.queryByRole("button", { name: /Create category/ })
	).not.toBeInTheDocument();
});

test("blurring the name field autosaves that field only", () => {
	render(() => (
		<CategoryDrawer open onOpenChange={() => {}} category={furniture} />
	));
	const name = screen.getByLabelText("Name");
	fireEvent.input(name, { target: { value: "Fixtures" } });
	expect(mockUpdate).not.toHaveBeenCalled();
	fireEvent.blur(name);
	expect(mockUpdate).toHaveBeenCalledTimes(1);
	expect(mockUpdate).toHaveBeenCalledWith({
		id: furniture._id,
		name: "Fixtures",
	});
});

test("edit mode: the item types accordion lists the category's types by name", () => {
	render(() => (
		<CategoryDrawer open onOpenChange={() => {}} category={furniture} />
	));
	expect(mockUseItemTypesByCategory).toHaveBeenCalledWith(furniture._id);
	expect(screen.getByText("Item types (2)")).toBeInTheDocument();
	expect(screen.getByText("Chair")).toBeInTheDocument();
	expect(screen.getByText("Table")).toBeInTheDocument();
});

test("create mode: no item-types sublist is rendered and no category id is requested", () => {
	render(() => <CategoryDrawer open onOpenChange={() => {}} />);
	expect(mockUseItemTypesByCategory).toHaveBeenCalledWith(undefined);
	expect(screen.queryByText(/^Item types \(/)).not.toBeInTheDocument();
	expect(screen.queryByText("Chair")).not.toBeInTheDocument();
});

// --- tri-state: create / loading / loaded --------------------------------

test("loading: shows the skeleton (shaped like the loaded fields), not the create form or the 'New category' title", () => {
	render(() => <CategoryDrawer open onOpenChange={() => {}} loading />);
	expect(screen.queryByText("New category")).toBeNull();
	expect(screen.queryByLabelText("Name")).toBeNull();
	expect(
		screen.queryByRole("button", { name: /Create category/ })
	).toBeNull();
	expect(
		document.querySelector("[data-drawer-skeleton]")
	).toBeInTheDocument();
	expect(screen.getByText("Description")).toBeInTheDocument();
});

test("loading with a category also set (stale-during-refetch) still shows the skeleton, not the name", () => {
	render(() => (
		<CategoryDrawer
			open
			onOpenChange={() => {}}
			category={furniture}
			loading
		/>
	));
	expect(screen.queryByDisplayValue("Furniture")).toBeNull();
	expect(screen.queryByText("Category")).toBeNull();
});

test("no category, not loading: shows the create form and 'New category' title", () => {
	render(() => <CategoryDrawer open onOpenChange={() => {}} />);
	expect(screen.getByText("New category")).toBeInTheDocument();
	expect(screen.getByLabelText("Name")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Create category/ })
	).toBeInTheDocument();
});

test("item types still loading: skeleton list and count skeleton, no '(0)' or empty copy", () => {
	render(() => (
		<CategoryDrawer
			open
			onOpenChange={() => {}}
			category={{
				...furniture,
				_id: "itemCategories:pending" as Category["_id"],
			}}
		/>
	));
	expect(document.querySelector("[data-skeleton-list]")).toBeInTheDocument();
	expect(screen.queryByText(/\(0\)/)).toBeNull();
	expect(screen.queryByText("No item types yet")).toBeNull();
});

test("item types loaded empty: shows (0) and the empty copy", () => {
	render(() => (
		<CategoryDrawer
			open
			onOpenChange={() => {}}
			category={{
				...furniture,
				_id: "itemCategories:empty" as Category["_id"],
			}}
		/>
	));
	expect(screen.getByText("Item types (0)")).toBeInTheDocument();
	expect(screen.getByText("No item types yet")).toBeInTheDocument();
	expect(document.querySelector("[data-skeleton-list]")).toBeNull();
});

test("a refused create keeps the drawer open and says why; a later success closes it", async () => {
	mockCreate.mockRejectedValueOnce(
		new ConvexError({ code: "Forbidden", message: "You can't do that." })
	);
	mockCreate.mockResolvedValueOnce("itemCategories:new");
	const onOpenChange = vi.fn();
	render(() => <CategoryDrawer open onOpenChange={onOpenChange} />);
	fireEvent.input(screen.getByLabelText("Name"), {
		target: { value: "IT" },
	});
	expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
	fireEvent.click(screen.getByRole("button", { name: /Create category/ }));
	expect(await screen.findByText("You can't do that.")).toBeInTheDocument();
	expect(screen.getByLabelText("Name")).toHaveAttribute(
		"aria-invalid",
		"true"
	);
	expect(onOpenChange).not.toHaveBeenCalled();

	fireEvent.click(screen.getByRole("button", { name: /Create category/ }));
	await waitFor(() => {
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
	expect(screen.queryByText("You can't do that.")).toBeNull();
});

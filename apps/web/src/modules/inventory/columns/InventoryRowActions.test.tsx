// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

// The real `QrCode.DownloadTrigger` rasterises to a data URL via canvas,
// which jsdom doesn't back — stub it the same way EntityQr.test.tsx does.
vi.mock("@ark-ui/solid/qr-code", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@ark-ui/solid/qr-code")>();
	return {
		...actual,
		QrCode: {
			...actual.QrCode,
			DownloadTrigger: (props: {
				fileName: string;
				mimeType: string;
				asChild: (
					triggerProps: () => Record<string, unknown>
				) => JSX.Element;
			}) => (
				<div data-testid="download-trigger">
					{props.asChild(() => ({}))}
				</div>
			),
		},
	};
});

afterEach(cleanup);

import { AbilityProvider, type Role } from "../../../lib/ability.tsx";
import type { Item } from "../data/inventoryData.ts";

import { InventoryRowActions } from "./InventoryRowActions.tsx";

const item = {
	_id: "items:chair",
	_creationTime: 0,
	assetTag: "A00001",
	typeId: "itemTypes:chair",
	typeName: "Chair",
	categoryId: "itemCategories:furniture",
	categoryName: "Furniture",
} as unknown as Item;

function renderAs(role: Role) {
	return render(() => (
		<AbilityProvider role={role}>
			<InventoryRowActions row={item} />
		</AbilityProvider>
	));
}

test("board sees copy link and download QR on an item row", () => {
	renderAs("board");
	expect(
		screen.getByRole("button", { name: "Copy link" })
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Download QR" })
	).toBeInTheDocument();
});

test("a non-manage role sees no row actions", () => {
	renderAs("member");
	expect(
		screen.queryByRole("button", { name: "Copy link" })
	).not.toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: "Download QR" })
	).not.toBeInTheDocument();
});

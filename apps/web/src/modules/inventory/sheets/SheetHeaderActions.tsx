import { Sheet, type FieldDefinition } from "@j-os/design-system";
import { createEffect, createSignal, on, type JSX, Show } from "solid-js";

import type { SheetNavState } from "../../../lib/createSheetNav.ts";
import { RowActionButton } from "../../../shared/actions/RowActions.tsx";
import { createSheetActions } from "../../../shared/actions/sheetActions.tsx";
import { EditToggle } from "../../../shared/components/EditToggle.tsx";
import { EntitySheetHeader } from "../../../shared/entity/EntitySheetHeader.tsx";

import { FieldsPlaceholder } from "./FieldsPlaceholder.tsx";

/**
 * An inventory sheet's actions: the shared sheet actions
 * (`createSheetActions`: Delete on a loaded row, Create on the create form,
 * and their `Keys`), plus its edit lock (`E`; locked again whenever the sheet
 * closes or shows another row).
 */
export function createInventorySheetActions<Row extends { _id: string }>(
	options: Parameters<typeof createSheetActions<Row>>[0]
) {
	const [editing, setEditing] = createSignal(false);
	createEffect(
		on(
			() => [options.isOpen(), options.row()?._id],
			() => {
				setEditing(false);
			}
		)
	);
	return {
		...createSheetActions<Row>(options),
		row: options.row,
		editing,
		toggleEditing: () => {
			setEditing((current) => !current);
		},
		/** An existing row's fields are read-only until the toggle is on. */
		isLocked: () => options.row() !== undefined && !editing(),
	};
}

export type InventorySheetActions<Row extends { _id: string }> = ReturnType<
	typeof createInventorySheetActions<Row>
>;

/** The header actions of an existing row's sheet: the edit toggle and
 *  Delete, whose label, icon and key come from the descriptor. Nothing while
 *  no row is loaded. */
export function SheetHeaderActions<Row extends { _id: string }>(props: {
	actions: InventorySheetActions<Row>;
	isOpen: boolean;
}): JSX.Element {
	return (
		<>
			<props.actions.Keys />
			<Show when={props.actions.row()}>
				{(row) => (
					<>
						<EditToggle
							editing={props.actions.editing()}
							enabled={props.isOpen}
							onToggle={props.actions.toggleEditing}
						/>
						<RowActionButton
							action={props.actions.remove}
							row={row()}
						/>
					</>
				)}
			</Show>
		</>
	);
}

/**
 * The top of an inventory sheet: its header (title, save status for an
 * existing row, prev/next, the row's actions) and the skeleton shown while the
 * row loads, shaped like the loaded fields.
 */
export function InventorySheetHeader<Row extends { _id: string }>(props: {
	title: string;
	loading?: boolean;
	nav?: SheetNavState;
	actions: InventorySheetActions<Row>;
	isOpen: boolean;
	placeholderFields: readonly (FieldDefinition & { icon: string })[];
}): JSX.Element {
	return (
		<>
			<EntitySheetHeader
				title={props.title}
				loading={props.loading}
				nav={props.nav}
				saveStatus={props.actions.row() !== undefined && !props.loading}
			>
				<SheetHeaderActions
					actions={props.actions}
					isOpen={props.isOpen}
				/>
			</EntitySheetHeader>
			<Sheet.Skeleton>
				<FieldsPlaceholder fields={props.placeholderFields} />
			</Sheet.Skeleton>
		</>
	);
}

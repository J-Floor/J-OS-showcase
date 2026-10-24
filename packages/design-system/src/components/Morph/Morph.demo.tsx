import { For, createSignal } from "solid-js";

import {
	Button,
	Morph,
	PropertyRow,
	Sheet,
	Table,
	defineFields,
	fieldColumn,
	morphPart,
	morphTitle,
} from "@j-os/design-system";

import type { JfColumnDefinition } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Morph.demo.module.scss";

type Item = { id: string; title: string; status: string; due: string };

const fields = defineFields({
	title: { label: "Title", icon: "title" },
	status: { label: "Status", icon: "flag" },
	due: { label: "Due", icon: "event" },
});

const CARDS: Item[] = [
	{ id: "card-1", title: "Draft the brief", status: "To do", due: "Mon" },
	{ id: "card-2", title: "Review the layout", status: "Doing", due: "Wed" },
	{ id: "card-3", title: "Ship the release", status: "Done", due: "Fri" },
];

const ROWS: Item[] = [
	{ id: "row-1", title: "Order supplies", status: "To do", due: "Tue" },
	{ id: "row-2", title: "Book the room", status: "Doing", due: "Thu" },
	{ id: "row-3", title: "Send the invites", status: "Done", due: "Sat" },
];

const columns: JfColumnDefinition<Item>[] = [
	fieldColumn(fields.title, { accessorKey: "title", dataType: "string" }),
	fieldColumn(fields.status, { accessorKey: "status", dataType: "string" }),
	fieldColumn(fields.due, { accessorKey: "due", dataType: "string" }),
];

/** Moves the first card to the end, so an open card's place changes. */
function rotated(cards: Item[]): Item[] {
	return [...cards.slice(1), ...cards.slice(0, 1)];
}

/**
 * Cards and table rows that open into one sheet, which closes back into
 * whichever of them it shows. "Move card" reorders the cards while the
 * sheet is open: it closes into the card at its new place. Focus a row and
 * press Enter to open it from the keyboard.
 */
function MorphDemo() {
	const [cards, setCards] = createSignal(CARDS);
	const [shown, setShown] = createSignal<Item>();
	const [isOpen, setOpen] = createSignal(false);
	function open(item: Item): void {
		setShown(item);
		setOpen(true);
	}
	return (
		<div class={styles.demo}>
			<div class={styles.cards}>
				<For each={cards()}>
					{(card) => (
						<Morph of={card.id}>
							<button
								type="button"
								class={styles.card}
								onClick={() => {
									open(card);
								}}
							>
								<span class={styles.cardTitle} {...morphTitle}>
									{card.title}
								</span>
								<span {...morphPart(fields.status)}>
									{card.status}
								</span>
								<span {...morphPart(fields.due)}>
									{card.due}
								</span>
							</button>
						</Morph>
					)}
				</For>
			</div>
			<Table.Root
				columns={columns}
				data={ROWS}
				getRowId={(row) => row.id}
				focusableRows
				onRowClick={open}
				onRowActivate={open}
			/>
			<Sheet.Root
				open={isOpen()}
				onOpenChange={setOpen}
				morph={shown()?.id}
			>
				<Sheet.Header>
					<Sheet.Title>{shown()?.title}</Sheet.Title>
					<Sheet.HeaderActions>
						<Sheet.Close />
					</Sheet.HeaderActions>
				</Sheet.Header>
				<Sheet.Body>
					<PropertyRow field={fields.status}>
						<span>{shown()?.status}</span>
					</PropertyRow>
					<PropertyRow field={fields.due}>
						<span>{shown()?.due}</span>
					</PropertyRow>
				</Sheet.Body>
				<Sheet.Footer>
					<Button
						variant="secondary"
						onClick={() => {
							setCards(rotated);
						}}
					>
						Move card
					</Button>
				</Sheet.Footer>
			</Sheet.Root>
		</div>
	);
}

export default {
	title: "Morph",
	render: () => <MorphDemo />,
	controls: {},
} satisfies Demo;

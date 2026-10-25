import { createHotkey } from "@tanstack/solid-hotkeys";
import { For, createSignal, type JSX } from "solid-js";

import {
	Badge,
	Button,
	CommandPalette,
	Dialog,
	ICONS,
	IconButton,
	Morph,
	NumberInput,
	PropertyRow,
	Sheet,
	Table,
	actionsColumnSize,
	createHoverIntent,
	defineFields,
	fieldColumn,
	morphPart,
	morphTitle,
} from "@j-os/design-system";

import type {
	JfColumnDefinition,
	OverlayOpenProps,
	TStatus,
} from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Morph.demo.module.scss";

type Item = {
	id: string;
	title: string;
	status: string;
	score: number;
	due: string;
};

const fields = defineFields({
	title: { label: "Title", icon: "title" },
	status: { label: "Status", icon: "flag" },
	score: { label: "Score", icon: "star" },
	due: { label: "Due", icon: "event" },
});

const STATUS_COLOUR: Record<string, TStatus> = {
	"To do": "neutral",
	Doing: "info",
	Done: "success",
};

const SCORE_MAX = 10;
const NEW_ITEM_KEY = "N";

const CARDS: Item[] = [
	{
		id: "card-1",
		title: "Draft the brief",
		status: "To do",
		score: 3,
		due: "Mon",
	},
	{
		id: "card-2",
		title: "Review the layout",
		status: "Doing",
		score: 5,
		due: "Wed",
	},
	{
		id: "card-3",
		title: "Ship the release",
		status: "Done",
		score: 8,
		due: "Fri",
	},
];

const ROWS: Item[] = [
	{
		id: "row-1",
		title: "Order supplies",
		status: "To do",
		score: 2,
		due: "Tue",
	},
	{
		id: "row-2",
		title: "Book the room",
		status: "Doing",
		score: 6,
		due: "Thu",
	},
	{
		id: "row-3",
		title: "Send the invites",
		status: "Done",
		score: 9,
		due: "Sat",
	},
];

/** Moves the first card to the end, so an open card's place changes. */
function rotated(cards: Item[]): Item[] {
	return [...cards.slice(1), ...cards.slice(0, 1)];
}

function withScore(items: Item[], id: string, score: number): Item[] {
	return items.map((item) => (item.id === id ? { ...item, score } : item));
}

/** The status as a pill: alone in its value, so it flies as one box. */
function StatusPill(props: { status: string }): JSX.Element {
	return <Badge status={STATUS_COLOUR[props.status]}>{props.status}</Badge>;
}

/** A compact score field: its box grows into the sheet's wider one. */
function ScoreField(props: {
	score: number;
	onScore: (score: number) => void;
}): JSX.Element {
	return (
		<NumberInput
			label="Score"
			labelHidden
			min={0}
			max={SCORE_MAX}
			value={String(props.score)}
			onValueChange={(detail) => {
				if (!Number.isNaN(detail.valueAsNumber))
					props.onScore(detail.valueAsNumber);
			}}
		/>
	);
}

type Handlers = {
	open: (item: Item) => void;
	intend: () => void;
	rename: (item: Item) => void;
	score: (id: string, score: number) => void;
};

function columns(on: Handlers): JfColumnDefinition<Item>[] {
	return [
		fieldColumn(fields.title, { accessorKey: "title", dataType: "string" }),
		fieldColumn(fields.status, {
			accessorKey: "status",
			dataType: "string",
			cell: (info) => <StatusPill status={info.row.original.status} />,
		}),
		fieldColumn(fields.score, {
			accessorKey: "score",
			dataType: "number",
			disableRowClick: true,
			cell: (info) => (
				<ScoreField
					score={info.row.original.score}
					onScore={(score) => {
						on.score(info.row.original.id, score);
					}}
				/>
			),
		}),
		fieldColumn(fields.due, { accessorKey: "due", dataType: "string" }),
		{
			id: "actions",
			header: "",
			disableRowClick: true,
			size: actionsColumnSize(1),
			cell: (info) => (
				<IconButton
					tooltipLabel="Rename"
					onClick={() => {
						on.rename(info.row.original);
					}}
				>
					{ICONS.edit}
				</IconButton>
			),
		},
	];
}

/** A card that opens its sheet; resting on it builds the sheet ahead. */
function CardButton(props: { card: Item; on: Handlers }): JSX.Element {
	const intent = createHoverIntent(() => {
		props.on.intend();
	});
	return (
		<Morph morphId={props.card.id}>
			<button
				type="button"
				class={styles.card}
				onPointerEnter={(event) => {
					intent.onPointerEnter(event);
				}}
				onPointerLeave={() => {
					intent.onPointerLeave();
				}}
				onClick={() => {
					props.on.open(props.card);
				}}
			>
				<span class={styles.cardTitle} {...morphTitle}>
					{props.card.title}
				</span>
				<span {...morphPart(fields.status)}>{props.card.status}</span>
				<span {...morphPart(fields.due)}>{props.card.due}</span>
			</button>
		</Morph>
	);
}

/** One sheet for every card and row; it closes into whichever it shows. */
function ItemSheet(props: {
	item: Item | undefined;
	open: boolean;
	prebuild: boolean;
	onOpenChange: (isOpen: boolean) => void;
	on: Handlers;
	onMove: () => void;
}): JSX.Element {
	return (
		<Sheet.Root
			open={props.open}
			onOpenChange={props.onOpenChange}
			morphId={props.item?.id}
			prebuild={props.prebuild}
		>
			<Sheet.Header>
				<Sheet.Title>{props.item?.title}</Sheet.Title>
				<Sheet.HeaderActions>
					<Sheet.Close />
				</Sheet.HeaderActions>
			</Sheet.Header>
			<Sheet.Body>
				<PropertyRow field={fields.status}>
					<StatusPill status={props.item?.status ?? "To do"} />
				</PropertyRow>
				<PropertyRow field={fields.score}>
					<ScoreField
						score={props.item?.score ?? 0}
						onScore={(score) => {
							if (props.item)
								props.on.score(props.item.id, score);
						}}
					/>
				</PropertyRow>
				<PropertyRow field={fields.due}>
					<span>{props.item?.due}</span>
				</PropertyRow>
			</Sheet.Body>
			<Sheet.Footer>
				<Button
					variant="secondary"
					onClick={() => {
						props.onMove();
					}}
				>
					Move card
				</Button>
			</Sheet.Footer>
		</Sheet.Root>
	);
}

/** A small dialog; its content is built for each opening. */
function ConfirmDialog(
	props: OverlayOpenProps & {
		title: string;
		description: string;
		confirm: string;
	}
): JSX.Element {
	return (
		<Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>{props.title}</Dialog.Title>
					<Dialog.Description>{props.description}</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer>
					<Dialog.Cancel />
					<Dialog.CloseTrigger
						asChild={(closeProps) => (
							<Button triggerProps={closeProps()}>
								{props.confirm}
							</Button>
						)}
					/>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	);
}

/** An icon button that opens a dialog, by click or by its key. */
function NewItem(): JSX.Element {
	const [isOpen, setOpen] = createSignal(false);
	createHotkey(NEW_ITEM_KEY, () => {
		setOpen(true);
	});
	return (
		<>
			<IconButton
				tooltipLabel="New item"
				shortcut={NEW_ITEM_KEY}
				onClick={() => {
					setOpen(true);
				}}
			>
				{ICONS.add}
			</IconButton>
			<ConfirmDialog
				open={isOpen()}
				onOpenChange={setOpen}
				title="New item"
				description="It grew out of the button you pressed."
				confirm="Create"
			/>
		</>
	);
}

/** The palette's results: picking one opens its sheet in the same morph. */
function paletteItems(items: Item[], open: (item: Item) => void) {
	return items.map((item) => ({
		value: item.id,
		label: item.title,
		group: "Items",
		icon: ICONS.edit,
		detail: item.status,
		onSelect: () => {
			open(item);
		},
	}));
}

/** Toolbar sources: an icon button with a key, and the palette. */
function Toolbar(props: { items: Item[]; open: (item: Item) => void }) {
	const [isSearching, setSearching] = createSignal(false);
	return (
		<div class={styles.toolbar}>
			<NewItem />
			<Button
				variant="secondary"
				onClick={() => {
					setSearching(true);
				}}
			>
				Search
			</Button>
			<CommandPalette
				open={isSearching()}
				onOpenChange={setSearching}
				items={paletteItems(props.items, props.open)}
				placeholder="Search items…"
			/>
		</div>
	);
}

/**
 * Every source a morph opens from: cards and table rows into one sheet
 * (resting on one first builds the sheet, so the first open flies values
 * too), a row's score field and status pill flying as boxes, a row action
 * and an icon button (or its key, N) into a dialog, and a palette pick into
 * the sheet. "Move card" reorders the cards while the sheet is open: it
 * closes into the card at its new place. Focus a row and press Enter to
 * open it from the keyboard.
 */
function MorphDemo() {
	const [cards, setCards] = createSignal(CARDS);
	const [rows, setRows] = createSignal(ROWS);
	const [shownId, setShownId] = createSignal<string>();
	const [isOpen, setOpen] = createSignal(false);
	const [isPrebuilt, setPrebuilt] = createSignal(false);
	const [renaming, setRenaming] = createSignal<Item>();
	const [isRenameOpen, setRenameOpen] = createSignal(false);
	const all = () => [...cards(), ...rows()];
	const on: Handlers = {
		open: (item) => {
			setShownId(item.id);
			setOpen(true);
		},
		intend: () => {
			setPrebuilt(true);
		},
		rename: (item) => {
			setRenaming(item);
			setRenameOpen(true);
		},
		score: (id, score) => {
			setCards((items) => withScore(items, id, score));
			setRows((items) => withScore(items, id, score));
		},
	};
	return (
		<div class={styles.demo}>
			<Toolbar items={all()} open={on.open} />
			<div class={styles.cards}>
				<For each={cards()}>
					{(card) => <CardButton card={card} on={on} />}
				</For>
			</div>
			<Table.Root
				columns={columns(on)}
				data={rows()}
				getRowId={(row) => row.id}
				focusableRows
				onRowClick={on.open}
				onRowActivate={on.open}
				onRowHoverIntent={on.intend}
			/>
			<ItemSheet
				item={all().find((item) => item.id === shownId())}
				open={isOpen()}
				prebuild={isPrebuilt()}
				onOpenChange={setOpen}
				on={on}
				onMove={() => {
					setCards(rotated);
				}}
			/>
			<ConfirmDialog
				open={isRenameOpen()}
				onOpenChange={setRenameOpen}
				title="Rename"
				description={`Rename “${renaming()?.title ?? ""}”.`}
				confirm="Rename"
			/>
		</div>
	);
}

export default {
	title: "Morph",
	render: () => <MorphDemo />,
	controls: {},
} satisfies Demo;

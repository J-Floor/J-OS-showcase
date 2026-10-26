import clsx from "clsx";
import {
	type Accessor,
	children,
	createContext,
	createMemo,
	For,
	type ComponentProps,
	type JSX,
	Show,
	splitProps,
	useContext,
} from "solid-js";

import { MORPH_LIST_ROW } from "../../utils/morphNames.ts";
import { Icon, type IconProps } from "../Icon/Icon.tsx";
import {
	MorphScope,
	morphAttributes,
	useMorphTitle,
	type Morphable,
} from "../Morph/Morph.tsx";

import styles from "./List.module.scss";

/**
 * Whether the surrounding `List.Root` announces itself as a list. A row only
 * claims `listitem` when it does: inside a listbox or a menu the rows are the
 * parent's options, and a second role would describe the same row twice.
 */
const InsideListContext = createContext<Accessor<boolean>>(() => false);

export type ListRootProps = ComponentProps<"div">;

/**
 * The list container. A `<div role="list">` rather than a `<ul>`: a `<ul>` may
 * only hold `<li>`, and a parent such as Select wraps every row in its own
 * element. A `role` passed in (`presentation` under an Ark listbox) wins, and
 * the rows then claim no role of their own.
 */
function ListRoot(props: ListRootProps): JSX.Element {
	const [own, rest] = splitProps(props, ["class", "role", "children"]);
	const isList = createMemo(() => (own.role ?? "list") === "list");

	return (
		<InsideListContext.Provider value={isList}>
			<div
				{...rest}
				role={own.role ?? "list"}
				class={clsx(styles.list, own.class)}
			>
				{own.children}
			</div>
		</InsideListContext.Provider>
	);
}

export type ListItemProps = Omit<ComponentProps<"div">, "onClick"> &
	Morphable & {
		/**
		 * Makes the whole row one button: the content renders inside a
		 * full-width `<button>`, so each row is one keyboard stop. Only a
		 * clickable row takes the pointer cursor and the hover colour. Keep
		 * interactive children out of a clickable item: a control nested in a
		 * button is invalid markup.
		 */
		onClick?: () => void;
	};

type RowSlots = {
	leading: JSX.Element[];
	text: JSX.Element[];
	trailing: JSX.Element[];
};

function isTextPart(node: unknown): boolean {
	return (
		node instanceof HTMLElement && node.hasAttribute("data-list-item-text")
	);
}

function isLeftIcon(node: unknown): boolean {
	return (
		node instanceof HTMLElement && node.classList.contains(styles.iconLeft)
	);
}

/** Splits a row's children by position: what comes before the first text part
 *  leads, the text parts form the text column, everything else trails. A row
 *  with no text part keeps all its other content trailing. */
function partitionRow(nodes: JSX.Element[]): RowSlots {
	const slots: RowSlots = { leading: [], text: [], trailing: [] };
	const firstText = nodes.findIndex((node) => isTextPart(node));
	nodes.forEach((node, index) => {
		if (isTextPart(node)) slots.text.push(node);
		else if (isLeftIcon(node) || (firstText >= 0 && index < firstText))
			slots.leading.push(node);
		else slots.trailing.push(node);
	});
	return slots;
}

function ListItem(props: ListItemProps): JSX.Element {
	const [own, rest] = splitProps(props, [
		"class",
		"role",
		"children",
		"onClick",
		"morphId",
	]);
	const isInsideList = useContext(InsideListContext);
	const resolved = children(() => (
		<MorphScope morphId={own.morphId}>{own.children}</MorphScope>
	));
	const slots = createMemo(() => partitionRow(resolved.toArray()));

	function role(): JSX.HTMLAttributes<HTMLDivElement>["role"] {
		return own.role ?? (isInsideList() ? "listitem" : undefined);
	}

	function content(): JSX.Element {
		return (
			<>
				<Show when={slots().leading.length > 0}>
					<span class={styles.leftContent}>
						<For each={slots().leading}>{(node) => node}</For>
					</span>
				</Show>
				<Show when={slots().text.length > 0}>
					<span class={styles.itemText}>
						<For each={slots().text}>{(node) => node}</For>
					</span>
				</Show>
				<Show when={slots().trailing.length > 0}>
					<span class={styles.rightItems}>
						<For each={slots().trailing}>{(node) => node}</For>
					</span>
				</Show>
			</>
		);
	}

	// An inert row is no tab stop: it would be a stop that does nothing.
	return (
		<div
			{...rest}
			role={role()}
			{...{ [MORPH_LIST_ROW]: "" }}
			class={clsx(styles.listItem, own.class)}
			data-clickable={own.onClick ? "" : undefined}
			{...morphAttributes(own)}
		>
			<Show when={own.onClick} keyed fallback={content()}>
				{(onClick) => (
					<button
						type="button"
						class={styles.itemButton}
						onClick={() => {
							onClick();
						}}
					>
						{content()}
					</button>
				)}
			</Show>
		</div>
	);
}

export type ListItemTitleProps = ComponentProps<"span">;

/** The row's title. Takes any children, so a parent can mark up its text
 *  (Combobox wraps it in `Highlight`). */
function ListItemTitle(props: ListItemTitleProps): JSX.Element {
	const [own, rest] = splitProps(props, ["class"]);
	const title = useMorphTitle();
	return (
		<span
			{...rest}
			class={clsx(styles.title, own.class)}
			data-list-item-text
			{...title()}
		/>
	);
}

export type ListItemDescriptionProps = ComponentProps<"span"> & {
	/** Lets the text run over several lines instead of one truncated line. */
	wrap?: boolean;
};

function ListItemDescription(props: ListItemDescriptionProps): JSX.Element {
	const [own, rest] = splitProps(props, ["class", "wrap"]);
	return (
		<span
			{...rest}
			class={clsx(styles.description, own.class)}
			data-list-item-text
			data-wrap={own.wrap ? "" : undefined}
		/>
	);
}

/** A sized leading icon. Any other leading content (an avatar, a bare `Icon`)
 *  only has to be written before the row's text. */
function ListItemLeftIcon(props: IconProps): JSX.Element {
	return <Icon {...props} class={clsx(styles.iconLeft, props.class)} />;
}

/**
 * A list of items arranged vertically. Compose children directly — no slot
 * extraction. Inside an `Item`, whatever is written before `ItemTitle` /
 * `ItemDescription` leads the row and whatever follows trails it.
 *
 * @example
 * ```tsx
 * <List.Root>
 *   <List.Item>
 *     <List.ItemLeftIcon>counter_1</List.ItemLeftIcon>
 *     <List.ItemTitle>Item 1</List.ItemTitle>
 *     <List.ItemDescription>Description for Item 1</List.ItemDescription>
 *   </List.Item>
 * </List.Root>
 * ```
 */
export const List = {
	Root: ListRoot,
	Item: ListItem,
	ItemTitle: ListItemTitle,
	ItemDescription: ListItemDescription,
	ItemLeftIcon: ListItemLeftIcon,
};

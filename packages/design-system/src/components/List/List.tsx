import clsx from "clsx";
import type { JSX } from "solid-js";
import { children, For, Show } from "solid-js";

import { Icon, type IconProps } from "../Icon/Icon.tsx";

import styles from "./List.module.scss";

type WithChildren = { children?: JSX.Element };
type WithClass = { class?: string };

function ListRoot(props: WithChildren & WithClass): JSX.Element {
	return <ul class={clsx(styles.list, props.class)}>{props.children}</ul>;
}

type ListItemProps = WithChildren &
	WithClass & {
		/**
		 * Makes the whole row one button: the content renders inside a
		 * full-width `<button>` and the row drops its own tab stop, so each row
		 * is one keyboard stop. Keep interactive children out of a clickable
		 * item: a control nested in a button is invalid markup.
		 */
		onClick?: () => void;
	};

function ListItem(props: ListItemProps): JSX.Element {
	const resolved = children(() => props.children);

	function partitioned() {
		const nodes = resolved.toArray();
		const leftIcon: JSX.Element[] = [];
		const text: JSX.Element[] = [];
		const rest: JSX.Element[] = [];
		for (const node of nodes) {
			if (
				node instanceof HTMLElement &&
				node.classList.contains(styles.iconLeft)
			) {
				leftIcon.push(node);
			} else if (
				node instanceof HTMLElement &&
				node.hasAttribute("data-list-item-text")
			) {
				text.push(node);
			} else {
				rest.push(node);
			}
		}
		return { leftIcon, text, rest };
	}

	function content(): JSX.Element {
		return (
			<>
				<For each={partitioned().leftIcon}>{(node) => node}</For>
				<Show when={partitioned().text.length > 0}>
					<span class={styles.itemText}>
						<For each={partitioned().text}>{(node) => node}</For>
					</span>
				</Show>
				<Show when={partitioned().rest.length > 0}>
					<span class={styles.rightItems}>
						<For each={partitioned().rest}>{(node) => node}</For>
					</span>
				</Show>
			</>
		);
	}

	return (
		<li
			class={clsx(styles.listItem, props.class)}
			tabindex={props.onClick ? undefined : 0}
			data-clickable={props.onClick ? "" : undefined}
		>
			<Show when={props.onClick} keyed fallback={content()}>
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
		</li>
	);
}

function ListItemTitle(props: { children: string } & WithClass): JSX.Element {
	return (
		<span class={clsx(styles.title, props.class)} data-list-item-text>
			{props.children}
		</span>
	);
}

function ListItemDescription(
	props: {
		children: string;
		/** Lets the text run over several lines instead of one truncated line. */
		wrap?: boolean;
	} & WithClass
): JSX.Element {
	return (
		<span
			class={clsx(styles.description, props.class)}
			data-list-item-text
			data-wrap={props.wrap ? "" : undefined}
		>
			{props.children}
		</span>
	);
}

function ListItemLeftIcon(props: IconProps): JSX.Element {
	return <Icon {...props} class={clsx(styles.iconLeft, props.class)} />;
}

/**
 * A list of items arranged vertically. Compose children directly — no slot
 * extraction; place `ItemLeftIcon` / `ItemTitle` / `ItemDescription` inside an
 * `Item` in whatever order is needed.
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

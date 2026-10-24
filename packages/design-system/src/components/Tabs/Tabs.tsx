import { Tabs as ArkTabs } from "@ark-ui/solid";
import { useTabsContext } from "@ark-ui/solid/tabs";
import clsx from "clsx";
import {
	Show,
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	onMount,
	splitProps,
	type ComponentProps,
	type JSX,
} from "solid-js";

import { listenForSwipe, type SwipeDirection } from "../../utils/swipe.ts";
import { moveName } from "../../utils/viewTransition.ts";
import { FloatingToolbar } from "../FloatingToolbar/FloatingToolbar.tsx";

import styles from "./Tabs.module.scss";

type ValueChangeDetails = Parameters<
	NonNullable<ArkTabs.RootProps["onValueChange"]>
>[0];

/**
 * Binds the active tab to a URL search param. The component owns the
 * read/validate/write logic; the consumer injects the router primitives
 * (`get`/`set`), so `Tabs` itself stays router-agnostic. `K` is the union of
 * valid tab values, so `fallback`/`keys`/`set` are all checked against it.
 */
type TabsUrlParameter<K extends string = string> = {
	/** Reads the current raw param value (a router getter). A repeated param
	 * (`string[]`) or absent param falls back. */
	get: () => string | string[] | undefined;
	/** Writes the param (a router setter). */
	set: (value: K) => void;
	/** Value used when the param is absent or not listed in `keys`. */
	fallback: K;
	/** Allowed values. A param outside this set falls back. */
	keys?: readonly K[];
};

/** The parts of THIS root, not of a Tabs nested inside one of its panels. */
function ownParts(
	root: HTMLElement,
	part: "trigger" | "content"
): HTMLElement[] {
	return [
		...root.querySelectorAll<HTMLElement>(
			`[data-scope="tabs"][data-part="${part}"]`
		),
	].filter(
		(element) =>
			element.closest('[data-scope="tabs"][data-part="root"]') === root
	);
}

/** zag marks a trigger with `data-value` but a panel with nothing, so
 *  `Content` adds `data-tab-value`. */
function panel(root: HTMLElement, value: string): HTMLElement | undefined {
	return ownParts(root, "content").find(
		(element) => element.dataset.tabValue === value
	);
}

/** The enabled tab a swipe lands on, if any. A finger moving left pulls the
 *  next panel in. */
function neighbour(
	root: HTMLElement,
	current: string | undefined,
	direction: SwipeDirection
): string | undefined {
	if (current === undefined) return undefined;
	const order = ownParts(root, "trigger")
		.filter((element) => !element.hasAttribute("data-disabled"))
		.map((element) => element.dataset.value);
	const at = order.indexOf(current);
	if (at === -1) return undefined;
	return order[direction === "left" ? at + 1 : at - 1];
}

/** Swipes on `root`'s own panels (not its bar, not a nested tabs' panel)
 *  call `change` like a trigger click. Returns the cleanup. */
function swipeBetweenTabs(
	root: HTMLElement,
	value: () => string | undefined,
	change: (details: ValueChangeDetails) => void
): () => void {
	return listenForSwipe(root, {
		startsHere: (target) => {
			const panelElement = target.closest(
				'[data-scope="tabs"][data-part="content"]'
			);
			return (
				panelElement instanceof HTMLElement &&
				ownParts(root, "content").includes(panelElement)
			);
		},
		onSwipe: (direction) => {
			const next = neighbour(root, value(), direction);
			if (next !== undefined) change({ value: next });
		},
	});
}

/**
 * Tabs root. Controlled inside: Ark gets `current()`, and a change flips it
 * inside a View Transition, because with uncontrolled Ark the panel has
 * already swapped when `onValueChange` fires and there is nothing left to
 * capture. The panel slides in the direction of the trigger order.
 *
 * A sideways swipe (touch or pen) on one of its own panels moves to the next
 * or previous enabled tab through the same change, so it slides and writes
 * the URL param as a click does. See `utils/swipe.ts` for what never starts
 * a swipe.
 */
function Root<K extends string = string>(
	props: ArkTabs.RootProps & { value?: K; urlParam?: TabsUrlParameter<K> }
) {
	const [local, rest] = splitProps(props, [
		"urlParam",
		"value",
		"onValueChange",
		"ref",
	]);
	const [inner, setInner] = createSignal<string | undefined>(
		rest.defaultValue ?? undefined
	);
	let rootElement: HTMLElement | undefined;

	function value(): string | undefined {
		const urlParameter = local.urlParam;
		if (!urlParameter) return local.value ?? inner();
		const current = urlParameter.get();
		return typeof current === "string" &&
			(!urlParameter.keys ||
				(urlParameter.keys as readonly string[]).includes(current))
			? current
			: urlParameter.fallback;
	}

	function change(details: ValueChangeDetails): void {
		const next = details.value;
		const urlParameter = local.urlParam;
		const onChange = local.onValueChange;
		const previous = value();
		const root = rootElement;
		function apply(): void {
			setInner(next);
			urlParameter?.set(next as K);
			onChange?.(details);
		}
		if (!root || previous === undefined) {
			apply();
			return;
		}
		const order = ownParts(root, "trigger").map(
			(element) => element.dataset.value
		);
		const isForward = order.indexOf(next) > order.indexOf(previous);
		void moveName({
			from: panel(root, previous),
			to: () => panel(root, next),
			name: "jf-tab",
			kind: isForward ? "tab-forward" : "tab-back",
			update: apply,
		});
	}

	onMount(() => {
		if (rootElement)
			onCleanup(swipeBetweenTabs(rootElement, value, change));
	});

	return (
		<ArkTabs.Root
			{...rest}
			ref={(element: HTMLElement) => {
				rootElement = element;
				(local.ref as ((target: HTMLElement) => void) | undefined)?.(
					element
				);
			}}
			value={value()}
			onValueChange={change}
		/>
	);
}

function List(props: ArkTabs.ListProps) {
	return (
		<ArkTabs.List {...props} class={clsx(styles.list, props.class)}>
			<ArkTabs.Indicator class={styles.indicator} />
			{props.children}
		</ArkTabs.List>
	);
}

function Trigger(props: ArkTabs.TriggerProps) {
	return (
		<ArkTabs.Trigger {...props} class={clsx(styles.trigger, props.class)}>
			{props.children}
		</ArkTabs.Trigger>
	);
}

function Content(props: ArkTabs.ContentProps) {
	return (
		<ArkTabs.Content
			{...props}
			data-tab-value={props.value}
			class={clsx(styles.content, props.class)}
		>
			{props.children}
		</ArkTabs.Content>
	);
}

/**
 * Declarative, tab-scoped slot for tab-bar controls — the sibling of
 * `Content`, but for the bar instead of the panel. Renders its children only
 * while `value` is the active tab (on every tab when `value` is omitted),
 * reading the active value from the tabs machine (so it follows the same
 * source of truth as the triggers). Place it inside a `Bar`, after the list;
 * a bar shows one at a time.
 */
function Actions(props: { value?: string; children: JSX.Element }) {
	return (
		<ArkTabs.Context>
			{(api) => (
				<Show
					when={
						props.value === undefined || api().value === props.value
					}
				>
					<FloatingToolbar data-part="tab-actions">
						{props.children}
					</FloatingToolbar>
				</Show>
			)}
		</ArkTabs.Context>
	);
}

/**
 * The tab row: a `List` followed by its `Actions`. On a wide screen the
 * actions sit at the row's end. On a phone the list scrolls sideways within
 * the page and the active tab's actions are a `FloatingToolbar`: below a
 * `FloatingStack`, a pill in the stack (see its contract).
 */
function Bar(props: Omit<ComponentProps<"div">, "ref">) {
	const tabs = useTabsContext();
	// The machine's api object changes on every state update; follow the value.
	const active = createMemo(() => tabs().value);
	let bar: HTMLDivElement | undefined;

	createEffect(
		on(active, (value) => {
			if (!bar || value === null) return;
			const trigger = [
				...bar.querySelectorAll<HTMLElement>(
					'[data-scope="tabs"][data-part="trigger"]'
				),
			].find((element) => element.dataset.value === value);
			// jsdom ships no `scrollIntoView`; a test must not be what throws.
			if (typeof trigger?.scrollIntoView === "function")
				trigger.scrollIntoView({ block: "nearest", inline: "nearest" });
		})
	);

	return (
		<div
			{...props}
			ref={(element) => {
				bar = element;
			}}
			data-part="tab-bar"
			class={clsx(styles.bar, props.class)}
		/>
	);
}

export const Tabs = {
	Root,
	Bar,
	List,
	Trigger,
	Content,
	Actions,
};

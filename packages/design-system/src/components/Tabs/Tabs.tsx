import { Tabs as ArkTabs } from "@ark-ui/solid";
import {
	useTabsContext,
	type TabsValueChangeDetails,
} from "@ark-ui/solid/tabs";
import { mergeRefs } from "@solid-primitives/refs";
import clsx from "clsx";
import {
	For,
	createContext,
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	onMount,
	splitProps,
	useContext,
	type Accessor,
	type ComponentProps,
	type JSX,
} from "solid-js";

import { useRequiredContext } from "../../utils/context.ts";
import { createPresence } from "../../utils/presence.tsx";
import { listenForSwipe, type SwipeDirection } from "../../utils/swipe.ts";
import { moveName } from "../../utils/viewTransition.ts";
import { FloatingToolbar } from "../FloatingToolbar/FloatingToolbar.tsx";

import styles from "./Tabs.module.scss";

/** One `Actions` part: where it is declared, and its toolbar while its tab
 *  is active (else nothing). */
type ActionsEntry = {
	anchor: Node;
	toolbar: Accessor<JSX.Element>;
};

/** Where `Actions` parts register, so the `Bar` can show them. */
type ActionsRegistry = {
	/** In declaration (document) order. */
	entries: Accessor<readonly ActionsEntry[]>;
	/** Registers until the caller's owner is disposed. */
	register: (entry: ActionsEntry) => void;
	/** Marks a `Bar` mounted until the caller's owner is disposed. */
	registerBar: () => void;
	/** In development, warns once when actions have no `Bar` to show them. */
	checkBar: () => void;
};

const ActionsContext = createContext<ActionsRegistry>();

function byDocumentOrder(first: ActionsEntry, second: ActionsEntry): number {
	return first.anchor.compareDocumentPosition(second.anchor) &
		Node.DOCUMENT_POSITION_FOLLOWING
		? -1
		: 1;
}

function createActionsRegistry(): ActionsRegistry {
	const [entries, setEntries] = createSignal<readonly ActionsEntry[]>([]);
	const [hasBar, registerBar] = createPresence();
	let hasWarned = false;
	return {
		entries,
		register: (entry) => {
			setEntries((current) => [...current, entry].sort(byDocumentOrder));
			onCleanup(() => {
				setEntries((current) =>
					current.filter((item) => item !== entry)
				);
			});
		},
		registerBar,
		checkBar: () => {
			if (!import.meta.env.DEV || hasWarned || hasBar()) return;
			hasWarned = true;
			// eslint-disable-next-line no-console -- a warning for the developer, not the user
			console.warn(
				"Tabs.Actions render inside a Tabs.Bar, and this Tabs.Root has none."
			);
		},
	};
}

const ROOT_SELECTOR = '[data-scope="tabs"][data-part="root"]';

/**
 * Binds the active tab to a URL search param. The component owns the
 * read/validate/write logic; the consumer injects the router primitives
 * (`get`/`set`), so `Tabs` itself stays router-agnostic. `K` is the union of
 * valid tab values, so `fallback`/`keys`/`set` are all checked against it.
 */
export type TabsUrlParameter<K extends string = string> = {
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
	].filter((element) => element.closest(ROOT_SELECTOR) === root);
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
	change: (details: TabsValueChangeDetails) => void
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

export type TabsRootProps<K extends string = string> = ArkTabs.RootProps & {
	value?: K;
	urlParam?: TabsUrlParameter<K>;
};

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
function Root<K extends string = string>(props: TabsRootProps<K>) {
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

	function change(details: TabsValueChangeDetails): void {
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
		<ActionsContext.Provider value={createActionsRegistry()}>
			<ArkTabs.Root
				{...rest}
				ref={mergeRefs((element: HTMLElement) => {
					rootElement = element;
				}, local.ref)}
				value={value()}
				onValueChange={change}
			/>
		</ActionsContext.Provider>
	);
}

function List(props: ArkTabs.ListProps) {
	const [local, rest] = splitProps(props, ["children", "class"]);
	return (
		<ArkTabs.List {...rest} class={clsx(styles.list, local.class)}>
			<ArkTabs.Indicator class={styles.indicator} />
			{local.children}
		</ArkTabs.List>
	);
}

function Trigger(props: ArkTabs.TriggerProps) {
	const [local, rest] = splitProps(props, ["children", "class"]);
	return (
		<ArkTabs.Trigger {...rest} class={clsx(styles.trigger, local.class)}>
			{local.children}
		</ArkTabs.Trigger>
	);
}

/** `children` and `class` are split off, so each reaches Ark from one
 *  source: the children passed once, the class merged with the panel's. */
function Content(props: ArkTabs.ContentProps) {
	const [local, rest] = splitProps(props, ["children", "class"]);
	return (
		<ArkTabs.Content
			{...rest}
			data-tab-value={rest.value}
			class={clsx(styles.content, local.class)}
		>
			{local.children}
		</ArkTabs.Content>
	);
}

export type TabsActionsProps = {
	/** The tab these actions belong to. Omitted, they show on every tab. */
	value?: ArkTabs.ContentProps["value"];
	children: JSX.Element;
};

/**
 * A tab's bar controls, declared anywhere under `Tabs.Root`: typically
 * inside that tab's `Content`, so the handlers close over the tab's own
 * state. They render inside the root's `Bar`, never where they are declared
 * (without a `Bar` they show nowhere, and development warns). The `Bar`
 * shows them at its end while `value` is the active tab (reading the tabs
 * machine, the same source of truth as the triggers), several in declaration
 * order. The controls are built here, so they see the contexts of the place
 * they are declared.
 */
function Actions(props: TabsActionsProps): JSX.Element {
	const registry = useRequiredContext(
		ActionsContext,
		"Tabs.Actions",
		"Tabs.Root"
	);
	const tabs = useTabsContext();
	const isActive = createMemo(
		() => props.value === undefined || tabs().value === props.value
	);
	const toolbar = createMemo(() =>
		isActive() ? (
			<FloatingToolbar data-part="tab-actions">
				{props.children}
			</FloatingToolbar>
		) : undefined
	);
	// An empty text node: invisible, and it marks the declaration's position.
	const anchor = document.createTextNode("");
	onMount(() => {
		registry.register({ anchor, toolbar });
		registry.checkBar();
	});
	return anchor;
}

export type TabsBarProps = Omit<ComponentProps<"div">, "ref">;

/**
 * The tab row: a `List`, then the active tab's `Actions` (declared here or
 * anywhere else under the root). On a wide screen the actions sit at the
 * row's end. On a phone the list scrolls sideways within the page and the
 * active tab's actions are a `FloatingToolbar`: below a `FloatingStack`, a
 * pill in the stack (see its contract).
 */
function Bar(props: TabsBarProps) {
	const tabs = useTabsContext();
	const registry = useContext(ActionsContext);
	registry?.registerBar();
	// The machine's api object changes on every state update; follow the value.
	const active = createMemo(() => tabs().value);
	let bar: HTMLDivElement | undefined;

	createEffect(
		on(active, (value) => {
			const root = bar?.closest<HTMLElement>(ROOT_SELECTOR);
			if (!bar || !root || value === null) return;
			const trigger = ownParts(root, "trigger").find(
				(element) =>
					element.dataset.value === value && bar?.contains(element)
			);
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
		>
			{props.children}
			<For each={registry?.entries()}>
				{(entry) => <>{entry.toolbar()}</>}
			</For>
		</div>
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

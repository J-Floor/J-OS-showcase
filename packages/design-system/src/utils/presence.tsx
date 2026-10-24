import {
	createContext,
	createSignal,
	onCleanup,
	Show,
	useContext,
	untrack,
	type Accessor,
	type JSX,
} from "solid-js";

import { useRequiredContext } from "./context.ts";

/** A presence counter: parts register on creation, unregister on cleanup. */
export function createPresence(): [Accessor<boolean>, () => void] {
	const [count, setCount] = createSignal(0);
	return [
		// eslint-disable-next-line solid/reactivity -- an accessor handed to context
		() => count() > 0,
		() => {
			setCount((current) => current + 1);
			onCleanup(() => setCount((current) => current - 1));
		},
	];
}

type Registry = {
	content: Accessor<(() => JSX.Element) | undefined>;
	register: (content: () => JSX.Element) => void;
};

type SlotProps = {
	fallback: JSX.Element;
	/** Wraps the content the part handed over. */
	children?: (content: JSX.Element) => JSX.Element;
};

/** The three pieces of a component's slot part (its `.Empty`, say). */
export type SlotPart = {
	/** The part itself: hands its children to the slot and renders nothing
	 *  where it is placed. */
	Part: (props: { children: JSX.Element }) => JSX.Element;
	/** Wraps the component's tree, so a part among its children and the
	 *  slot find each other. One per component instance. */
	Scope: (props: { children: JSX.Element }) => JSX.Element;
	/** Where the part's content shows, else `fallback`. The content is built
	 *  each time the slot shows it. */
	Slot: (props: SlotProps) => JSX.Element;
};

type SlotPartOptions = {
	/** One part per scope: a second one throws in development. Otherwise the
	 *  latest one wins (a part swapped behind a `Show` replaces the last). */
	unique?: boolean;
};

/**
 * A declarative slot part, `owner.part`: a child that replaces the
 * component's default content wherever in the component's own tree the
 * slot shows. `root` names what the part must sit inside (`Table.Root`).
 */
export function createSlotPart(
	owner: string,
	part: string,
	root: string,
	options: SlotPartOptions = {}
): SlotPart {
	const name = `${owner}.${part}`;
	const RegistryContext = createContext<Registry>();

	function Scope(props: { children: JSX.Element }): JSX.Element {
		const [content, setContent] = createSignal<() => JSX.Element>();
		const registry: Registry = {
			content,
			register(next) {
				if (import.meta.env.DEV && options.unique && untrack(content)) {
					throw new Error(`A ${owner} takes one ${name}.`);
				}
				setContent(() => next);
				onCleanup(() => {
					setContent((current) =>
						current === next ? undefined : current
					);
				});
			},
		};
		return (
			<RegistryContext.Provider value={registry}>
				{props.children}
			</RegistryContext.Provider>
		);
	}

	function Part(props: { children: JSX.Element }): JSX.Element {
		const registry = useRequiredContext(RegistryContext, name, root);
		// eslint-disable-next-line solid/reactivity -- an accessor the slot calls in its own tracked scope
		registry.register(() => props.children);
		return null;
	}

	function Slot(props: SlotProps): JSX.Element {
		const registry = useContext(RegistryContext);
		return (
			<Show when={registry?.content()} keyed fallback={props.fallback}>
				{(content) =>
					props.children ? props.children(content()) : content()
				}
			</Show>
		);
	}

	return { Part, Scope, Slot };
}

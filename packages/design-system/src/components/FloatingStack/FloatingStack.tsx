import {
	type Accessor,
	createContext,
	createSignal,
	onCleanup,
	onMount,
	type ParentProps,
	useContext,
	type JSX,
} from "solid-js";

import styles from "./FloatingStack.module.scss";

/** The room the stack takes at the foot of its box, on the root. */
export const FLOATING_STACK_SIZE_VAR = "--jf-floating-stack-block-size";

/** Where a floating toolbar joins the stack: the stack's last slot, set
 *  once the stack mounts. */
type Slot = {
	slot: Accessor<HTMLElement | undefined>;
	setSlot: (element: HTMLElement | undefined) => void;
};

const SlotContext = createContext<Slot>();

function createSlot(): Slot {
	const [slot, setSlot] = createSignal<HTMLElement>();
	return { slot, setSlot };
}

/** The stack's toolbar slot, when a {@link FloatingStackProvider} (or a
 *  `FloatingStack`) is above the caller. */
export function useFloatingStackSlot():
	| Accessor<HTMLElement | undefined>
	| undefined {
	return useContext(SlotContext)?.slot;
}

/** Set around a `FloatingStack`'s own children: a toolbar among them is
 *  already in the stack. */
const InStackContext = createContext(false);

/** Whether the caller is one of a `FloatingStack`'s own children. */
export function useInFloatingStack(): boolean {
	return useContext(InStackContext);
}

/**
 * Lets a `FloatingToolbar` anywhere inside it join the `FloatingStack`
 * inside it: wrap the page and the stack, which usually sit side by side
 * (the page scrolls, the stack floats over its box).
 */
export function FloatingStackProvider(props: ParentProps): JSX.Element {
	return (
		<SlotContext.Provider value={createSlot()}>
			{props.children}
		</SlotContext.Provider>
	);
}

/** The stack's height plus its inset from the box's foot; 0 while empty. */
function roomTaken(stack: HTMLElement): number {
	const height = stack.getBoundingClientRect().height;
	if (height === 0) return 0;
	const inset = Number.parseFloat(getComputedStyle(stack).bottom);
	return height + (Number.isNaN(inset) ? 0 : inset);
}

/** Keeps {@link FLOATING_STACK_SIZE_VAR} on the root in step with the stack. */
function publishRoom(stack: HTMLElement): void {
	if (typeof ResizeObserver === "undefined") return;
	const root = document.documentElement;
	const observer = new ResizeObserver(() => {
		const room = roomTaken(stack);
		if (room === 0) root.style.removeProperty(FLOATING_STACK_SIZE_VAR);
		else root.style.setProperty(FLOATING_STACK_SIZE_VAR, `${room}px`);
	});
	observer.observe(stack);
	onCleanup(() => {
		observer.disconnect();
		root.style.removeProperty(FLOATING_STACK_SIZE_VAR);
	});
}

/**
 * The pills that float at the foot of the nearest positioned ancestor, one
 * column in document order: its children first, top to bottom, then a
 * page's `FloatingToolbar` on a phone, which joins the stack by itself. They
 * stack in flow, so they never overlap. While it holds anything,
 * {@link FLOATING_STACK_SIZE_VAR} on the root holds the room it takes:
 * scrolling areas leave it free at their end and other bottom-anchored
 * floaters clear it. Mount one per app, in the box the pills float in, and
 * wrap it with the page in a {@link FloatingStackProvider} so the page's
 * toolbar finds it. A `FloatingToolbar` among its own children is a pill
 * where it sits, on every screen, so an app floats its own prompts. The
 * stack takes no pointer events itself, so the page under its gaps keeps
 * taking clicks; each pill does.
 */
export function FloatingStack(props: ParentProps): JSX.Element {
	const shared = useContext(SlotContext);
	const own = shared ?? createSlot();
	let stack: HTMLDivElement | undefined;
	onMount(() => {
		if (stack) publishRoom(stack);
	});
	onCleanup(() => {
		own.setSlot(undefined);
	});
	return (
		<SlotContext.Provider value={own}>
			<div
				class={styles.stack}
				data-part="floating-stack"
				ref={(element) => {
					stack = element;
				}}
			>
				<InStackContext.Provider value>
					{props.children}
				</InStackContext.Provider>
				<div class={styles.slot} ref={own.setSlot} />
			</div>
		</SlotContext.Provider>
	);
}

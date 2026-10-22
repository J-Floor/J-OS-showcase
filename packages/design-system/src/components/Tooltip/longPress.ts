/** How long a finger must rest on a trigger to open its tooltip. */
export const LONG_PRESS_MS = 500;
/** How far (px) the finger may drift during the hold before it is a gesture. */
export const LONG_PRESS_SLOP_PX = 10;
/** How long the tooltip lingers after the finger lifts, so it can be read. */
export const LONG_PRESS_CLOSE_DELAY_MS = 1500;

/** How long after release a pending click still counts as the long press's. */
export const LONG_PRESS_SWALLOW_MS = 400;

type LongPressOptions = {
	/** Whether the tooltip is off, in which case holding does nothing. */
	isDisabled: () => boolean;
	setOpen: (isOpen: boolean) => void;
};

type PressState = {
	holdTimer: ReturnType<typeof setTimeout> | undefined;
	closeTimer: ReturnType<typeof setTimeout> | undefined;
	originX: number;
	originY: number;
	isTouching: boolean;
	/** A touch press is down, whether or not it has drifted out of the hold. */
	isPressing: boolean;
	/** The finger is up but the tooltip is still held open for reading. */
	isLingering: boolean;
	swallowTimer: ReturnType<typeof setTimeout> | undefined;
	hasOpened: boolean;
	shouldSwallowClick: boolean;
};

function newPressState(): PressState {
	return {
		holdTimer: undefined,
		closeTimer: undefined,
		originX: 0,
		originY: 0,
		isTouching: false,
		isPressing: false,
		isLingering: false,
		swallowTimer: undefined,
		hasOpened: false,
		shouldSwallowClick: false,
	};
}

/** The click that ends a completed long press must not activate the trigger. */
function clickGuard(state: PressState): EventListener {
	return (event) => {
		if (!state.shouldSwallowClick) {
			return;
		}
		state.shouldSwallowClick = false;
		event.preventDefault();
		event.stopPropagation();
	};
}

/** zag closes on pointerleave, which a touch fires right after pointerup;
 *  hide it from zag while the lingering tooltip is meant to stay. */
function lingerShield(state: PressState, trigger: HTMLElement): EventListener {
	return (event) => {
		if (
			state.isLingering &&
			event.target === trigger &&
			(event as PointerEvent).pointerType === "touch"
		) {
			event.stopImmediatePropagation();
		}
	};
}

/** The OS context menu would claim the same hold; block it once ours won. */
function contextMenuGuard(state: PressState): EventListener {
	return (event) => {
		if (state.isPressing || state.shouldSwallowClick) {
			event.preventDefault();
		}
	};
}

function cancelHold(state: PressState): void {
	clearTimeout(state.holdTimer);
	state.holdTimer = undefined;
	state.isTouching = false;
}

/** Drifting past the slop turns the hold into a gesture, so it is dropped. */
function driftGuard(state: PressState): EventListener {
	return (event) => {
		if (!state.isTouching || state.hasOpened) {
			return;
		}
		const { clientX, clientY } = event as PointerEvent;
		const moved = Math.hypot(
			clientX - state.originX,
			clientY - state.originY
		);
		if (moved > LONG_PRESS_SLOP_PX) {
			cancelHold(state);
		}
	};
}

/**
 * Touch screens cannot hover, so a held finger stands in for it. Native
 * listeners on the trigger element, so it composes with whatever else shares
 * that element without replacing any of its handlers. Returns the cleanup.
 */
export function attachLongPress(
	trigger: HTMLElement,
	options: LongPressOptions
): () => void {
	const state = newPressState();

	function onDown(event: PointerEvent): void {
		clearTimeout(state.swallowTimer);
		state.shouldSwallowClick = false;
		if (event.pointerType !== "touch" || options.isDisabled()) {
			return;
		}
		clearTimeout(state.closeTimer);
		state.isLingering = false;
		cancelHold(state);
		state.isTouching = true;
		state.isPressing = true;
		state.hasOpened = false;
		state.originX = event.clientX;
		state.originY = event.clientY;
		state.holdTimer = setTimeout(() => {
			state.hasOpened = true;
			options.setOpen(true);
		}, LONG_PRESS_MS);
	}

	function onUp(event: PointerEvent): void {
		if (event.pointerType !== "touch") {
			return;
		}
		cancelHold(state);
		state.isPressing = false;
		const wasLongPress = state.hasOpened;
		state.hasOpened = false;
		if (!wasLongPress) {
			return;
		}
		state.shouldSwallowClick = true;
		state.isLingering = true;
		state.swallowTimer = setTimeout(() => {
			state.shouldSwallowClick = false;
		}, LONG_PRESS_SWALLOW_MS);
		state.closeTimer = setTimeout(() => {
			state.isLingering = false;
			options.setOpen(false);
		}, LONG_PRESS_CLOSE_DELAY_MS);
	}

	function onCancel(event: PointerEvent): void {
		if (event.pointerType !== "touch") {
			return;
		}
		cancelHold(state);
		state.isPressing = false;
		if (state.hasOpened) {
			options.setOpen(false);
		}
		state.hasOpened = false;
	}

	const shield = lingerShield(state, trigger);

	const listeners: [string, EventListener, boolean][] = [
		["pointerleave", shield, true],
		["pointercancel", shield, true],
		["pointerdown", onDown as EventListener, false],
		["pointermove", driftGuard(state), false],
		["pointerup", onUp as EventListener, false],
		["pointercancel", onCancel as EventListener, false],
		["click", clickGuard(state), true],
		["contextmenu", contextMenuGuard(state), false],
	];
	for (const [type, listener, capture] of listeners) {
		trigger.addEventListener(type, listener, capture);
	}
	return () => {
		clearTimeout(state.holdTimer);
		clearTimeout(state.closeTimer);
		clearTimeout(state.swallowTimer);
		for (const [type, listener, capture] of listeners) {
			trigger.removeEventListener(type, listener, capture);
		}
	};
}

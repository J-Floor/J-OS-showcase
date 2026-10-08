import {
	SignaturePad as Ark,
	type SignaturePadDrawEndDetails,
	type SignaturePadRootProps,
	useSignaturePadContext,
} from "@ark-ui/solid/signature-pad";
import { type JSX, Show, splitProps } from "solid-js";

import { ICONS } from "../../icons.ts";
import { Icon } from "../Icon/Icon.tsx";

import styles from "./SignaturePad.module.scss";

/**
 * Our own additions to the ark SignaturePad Root props:
 * - `onChange` replaces `onDrawEnd` (we convert draw-end → PNG data URL).
 * - `label` renders the ark Label part above the control.
 * - `class` is re-declared so we can merge it with our root style.
 *
 * Everything else in `SignaturePadRootProps` passes through: `drawing` (stroke
 * colour/options), `disabled`, `readOnly`, `required`, `name`, `paths`,
 * `defaultPaths`, `onDraw`, `ids`, `translations`, and all HTML div attributes.
 */
export type SignaturePadProps = Omit<
	SignaturePadRootProps,
	"onDrawEnd" | "onChange" | "class" | "children"
> & {
	/** Fires with a PNG data URL when a stroke ends, or null when cleared. */
	onChange: (pngDataUrl: string | null) => void;
	label?: string;
	class?: string;
};

/**
 * Clear button that is always visible (ark hides `ClearTrigger` when the pad
 * is empty; using the raw context lets us control visibility ourselves so the
 * button is always accessible and testable).
 */
function ClearButton(props: { onClear: () => void }): JSX.Element {
	const api = useSignaturePadContext();
	function handleClick(): void {
		api().clear();
		props.onClear();
	}
	// The button lives INSIDE ark's `control` element, which owns the native
	// pointerdown/up listeners that drive drawing. Without stopping propagation,
	// a click on Clear bubbles to the control and registers as a fresh stroke
	// (a dot) — so `clear()` runs but the pointer interaction immediately re-arms
	// the pad. `on:pointer*` attaches DIRECT (non-delegated) native listeners so
	// they fire at the button, before the control's listener, and stop the bubble.
	function stop(event: PointerEvent): void {
		event.stopPropagation();
	}
	return (
		<button
			type="button"
			class={styles.clear}
			aria-label="Clear signature"
			on:pointerdown={stop}
			on:pointerup={stop}
			onClick={handleClick}
		>
			<Icon>{ICONS.refresh}</Icon>
		</button>
	);
}

/**
 * Drawn-signature capture, wrapping ark-ui's signature-pad. Emits the drawing
 * as a PNG data URL via `onChange` (null on clear). Used by the onboarding
 * document step; the PNG is stamped into the generated agreement PDF.
 *
 * All `SignaturePadRootProps` not listed in the `Omit` above pass through to
 * the ark Root: `drawing` (stroke colour/options), `disabled`, `readOnly`,
 * `required`, `name`, `paths`, `defaultPaths`, `onDraw`, `ids`,
 * `translations`, and any HTML `<div>` attribute.
 */
export function SignaturePad(props: SignaturePadProps): JSX.Element {
	// Separate our additions from the props forwarded to ark Root.
	const [own, rootProps] = splitProps(props, ["onChange", "label", "class"]);

	// Monotonic stroke generation. `getDataUrl()` is async (it rasterises the
	// strokes via an Image -> canvas), so a stroke's promise can still be
	// in-flight when the pad is cleared. Bumping this on every draw-end AND on
	// clear means a stale resolution (seq !== latest) is dropped — otherwise a
	// slow stroke promise resolving after a clear would re-arm consumers.
	let drawSeq = 0;

	function handleDrawEnd(details: SignaturePadDrawEndDetails): void {
		const notify = own.onChange;
		// ark fires onDrawEnd on CLEAR too, with empty paths. Treat that as
		// cleared: emit null and invalidate any in-flight stroke promise.
		if (details.paths.length === 0) {
			drawSeq++;
			notify(null);
			return;
		}
		const seq = ++drawSeq;
		void details.getDataUrl("image/png").then((url) => {
			if (seq === drawSeq) notify(url);
		});
	}

	function handleClear(): void {
		drawSeq++; // invalidate the in-flight stroke promise
		own.onChange(null);
	}

	return (
		<Ark.Root
			{...rootProps}
			class={own.class ? `${styles.root} ${own.class}` : styles.root}
			onDrawEnd={handleDrawEnd}
		>
			<Show when={own.label}>
				<Ark.Label class={styles.label}>{own.label}</Ark.Label>
			</Show>
			<Ark.Control class={styles.control}>
				<Ark.Segment class={styles.segment} />
				<ClearButton onClear={handleClear} />
				<Ark.Guide class={styles.guide} />
			</Ark.Control>
		</Ark.Root>
	);
}

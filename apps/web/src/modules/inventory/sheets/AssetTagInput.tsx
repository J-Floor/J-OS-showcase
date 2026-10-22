import { Input } from "@j-os/design-system";
import {
	createEffect,
	createSignal,
	createUniqueId,
	on,
	Show,
	untrack,
	type JSX,
} from "solid-js";

import { parseAssetTag } from "../../../../convex/lib/assetTag.ts";

import styles from "./AssetTagInput.module.scss";

const DIGIT_COUNT = 5;
const LETTER_PATTERN = /[A-Za-z]/g;
const NON_DIGIT_PATTERN = /\D/g;

type TagParts = { letter: string; digits: string };

function isWholeTag(raw: string): boolean {
	return parseAssetTag(raw).isOk();
}

function onlyDigits(raw: string): string {
	return raw.replaceAll(NON_DIGIT_PATTERN, "").slice(0, DIGIT_COUNT);
}

/** Splits a tag into its two fields. A value that isn't a whole tag keeps what
 *  fits (a leading letter, up to five digits) so a partial tag isn't lost. */
function splitTag(raw: string): TagParts {
	const parsed = parseAssetTag(raw);
	if (parsed.isOk()) {
		return {
			letter: parsed.value.slice(0, 1),
			digits: parsed.value.slice(1),
		};
	}
	const trimmed = raw.trim();
	const first = trimmed.slice(0, 1).match(LETTER_PATTERN);
	return {
		letter: first ? first[0].toLocaleUpperCase() : "",
		digits: onlyDigits(trimmed.slice(1)),
	};
}

type GroupFocusEvent = FocusEvent & { currentTarget: HTMLElement };

/** Whether focus left the group, rather than moving between its fields. */
function isLeavingGroup(event: GroupFocusEvent): boolean {
	const next = event.relatedTarget;
	return !(next instanceof Node && event.currentTarget.contains(next));
}

type InputHandlerEvent = InputEvent & { currentTarget: HTMLInputElement };

/** The letter a typed or pasted value leaves: its last letter uppercased,
 *  nothing when it was cleared, the previous letter when it had no letter. */
function nextLetter(raw: string, previous: string): string {
	if (raw === "") return "";
	const letters = raw.match(LETTER_PATTERN);
	return letters ? letters.at(-1)!.toLocaleUpperCase() : previous;
}

type AssetTagInputProps = {
	value: string;
	onChange: (tag: string) => void;
	onFlush: () => void;
	hasError: boolean;
	onElement?: (element: HTMLInputElement) => void;
};

/** The two fields' state and handlers; the combined tag goes to `onChange`. */
function createAssetTagFields(props: AssetTagInputProps) {
	const initial = splitTag(untrack(() => props.value));
	const [letter, setLetter] = createSignal(initial.letter);
	const [digits, setDigits] = createSignal(initial.digits);
	const [isLeft, setLeft] = createSignal(false);
	let letterElement: HTMLInputElement | undefined;
	let numberElement: HTMLInputElement | undefined;

	function combined(): string {
		return letter() + digits();
	}

	// The sheet re-seeds the value when it reopens or a different tag is
	// prefilled; adopt that, but never overwrite what is being typed.
	createEffect(
		on(
			() => props.value,
			(value) => {
				if (value === untrack(combined)) return;
				const parts = splitTag(value);
				setLetter(parts.letter);
				setDigits(parts.digits);
			},
			{ defer: true }
		)
	);

	function change(parts: Partial<TagParts>) {
		setLetter(parts.letter ?? letter());
		setDigits(parts.digits ?? digits());
		props.onChange(combined());
	}

	return {
		letter,
		digits,
		isIncomplete: () =>
			isLeft() && combined() !== "" && !isWholeTag(combined()),
		setLetterElement: (element: HTMLInputElement) => {
			letterElement = element;
			props.onElement?.(element);
		},
		setNumberElement: (element: HTMLInputElement) => {
			numberElement = element;
		},
		onLetterInput: (event: InputHandlerEvent) => {
			const next = nextLetter(event.currentTarget.value, letter());
			event.currentTarget.value = next;
			change({ letter: next });
			if (next !== "") numberElement?.focus();
		},
		onNumberInput: (event: InputHandlerEvent) => {
			const next = onlyDigits(event.currentTarget.value);
			event.currentTarget.value = next;
			change({ digits: next });
		},
		onNumberKeyDown: (event: KeyboardEvent) => {
			if (event.key !== "Backspace" || digits() !== "") return;
			event.preventDefault();
			letterElement?.focus();
		},
		/** A digit run pasted into the number field; a whole tag is left to
		 *  the group's handler. */
		onNumberPaste: (event: ClipboardEvent) => {
			const text = event.clipboardData?.getData("text") ?? "";
			if (isWholeTag(text)) return;
			event.preventDefault();
			change({ digits: onlyDigits(text) });
		},
		onGroupPaste: (event: ClipboardEvent) => {
			const parsed = parseAssetTag(
				event.clipboardData?.getData("text") ?? ""
			);
			if (!parsed.isOk()) return;
			event.preventDefault();
			change(splitTag(parsed.value));
			numberElement?.focus();
		},
		onGroupFocusOut: (event: GroupFocusEvent) => {
			if (!isLeavingGroup(event)) return;
			setLeft(true);
			props.onFlush();
		},
	};
}

/**
 * The asset tag as two fields (one letter, five digits) that only accept what
 * a tag is made of, so a wrong tag can't be typed. Leaving the group flushes
 * and, when the tag is partly filled, says what is missing.
 */
export function AssetTagInput(props: AssetTagInputProps): JSX.Element {
	const fields = createAssetTagFields(props);
	const labelId = createUniqueId();
	function isInvalid(): boolean {
		return props.hasError || fields.isIncomplete();
	}

	return (
		<div
			class={styles.group}
			role="group"
			aria-labelledby={labelId}
			onPaste={fields.onGroupPaste}
			onFocusOut={fields.onGroupFocusOut}
		>
			<span id={labelId} class={styles.label}>
				Asset tag
			</span>
			{/* One marker for the pair, where the design system puts it: in the
			    label row. Each Input's own marker would sit inside its box,
			    since neither has a visible label. */}
			<span class={styles.requiredIndicator} aria-hidden="true">
				Required
			</span>
			<div class={styles.fields}>
				<div class={styles.letter}>
					<Input
						aria-label="Asset tag letter"
						aria-required="true"
						value={fields.letter()}
						maxLength={1}
						autocomplete="off"
						ref={fields.setLetterElement}
						onInput={fields.onLetterInput}
						invalid={isInvalid()}
					/>
				</div>
				<div class={styles.number}>
					<Input
						aria-label="Asset tag number"
						aria-required="true"
						value={fields.digits()}
						inputMode="numeric"
						autocomplete="off"
						ref={fields.setNumberElement}
						onInput={fields.onNumberInput}
						onKeyDown={fields.onNumberKeyDown}
						onPaste={fields.onNumberPaste}
						invalid={isInvalid()}
					/>
				</div>
			</div>
			<Show
				when={fields.isIncomplete()}
				fallback={
					<span class={styles.helper}>
						One letter and five digits, e.g. A00000
					</span>
				}
			>
				<span class={styles.error}>
					Enter one letter and five digits.
				</span>
			</Show>
		</div>
	);
}

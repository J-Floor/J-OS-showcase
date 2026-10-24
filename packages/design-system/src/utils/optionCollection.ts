/**
 * Options as children, shared by the selection components (Select, Combobox).
 *
 * A selection Root resolves its own children (Solid's `children()`), so every
 * part runs as soon as the Root does, even while the list is closed. A part
 * renders nothing where it is written: it hands the Root a record of itself
 * (an option's value, label and disabled state) and a `render` the Root calls
 * where the part belongs (the list, the control, the empty state). The Root
 * reads the parts in render order, so a `<For>` over options keeps its order
 * and an update to its data updates the records. The option records are the
 * Ark list collection.
 *
 * React→Solid: EmboUI walks `React.Children` for the same records. Solid has
 * no element tree to walk, so the parts describe themselves instead.
 */
import {
	createListCollection,
	type ListCollection,
} from "@ark-ui/solid/collection";
import type { SelectValueTextProps as ValueTextProps } from "@ark-ui/solid/select";
import { type Accessor, children, createMemo, type JSX } from "solid-js";

import { isBlank } from "./blank.ts";

/** One option, as the collection and every part that reads it see it. */
export type OptionRecord = {
	value: string;
	label: string;
	disabled: boolean;
};

/** The field props Select and Combobox share. */
export type SelectionFieldProps = {
	/** Show a clear control when a value is selected. */
	allowClearing?: boolean;
	/** Placeholder shown while nothing is selected. */
	placeholder?: ValueTextProps["placeholder"];
};

/** The props every option part takes. */
export type OptionPartProps = {
	/** The value this option stands for. */
	value: string;
	/**
	 * The text the option is displayed and matched by. Defaults to the
	 * option's own text (its `OptionText`, or its plain text children), so
	 * it is only needed when that text is not a string.
	 */
	label?: string;
	/** The option cannot be picked. */
	disabled?: boolean;
	children?: JSX.Element;
};

const PART = Symbol("selectionPart");

type PartBase<Kind extends string> = {
	readonly [PART]: true;
	readonly kind: Kind;
	/** Renders the part where its Root places it. */
	readonly render: () => JSX.Element;
};

export type OptionPart = PartBase<"option"> & {
	readonly record: Accessor<OptionRecord>;
};

export type GroupPart = PartBase<"group"> & {
	readonly parts: Accessor<SelectionPart[]>;
};

/** A part with no record of its own, hoisted by the Root into its place. */
type HoistedKind = "selectedOptions" | "empty" | "groupLabel";

export type HoistedPart = PartBase<HoistedKind>;

export type SelectionPart = OptionPart | GroupPart | HoistedPart;

type PartKind = SelectionPart["kind"];

/** A part travels through Solid's children as an opaque value. */
function asElement(part: SelectionPart): JSX.Element {
	return part as unknown as JSX.Element;
}

function isPart(node: unknown): node is SelectionPart {
	return typeof node === "object" && node !== null && PART in node;
}

const optionTexts = new WeakMap<Element, Accessor<string>>();

/**
 * A `ref` that marks an element as an option's text: its text then counts
 * toward the option's label, and the row's bare text is not wrapped again.
 */
export function markOptionText(
	text: Accessor<string>
): (element: HTMLElement) => void {
	return (element) => {
		optionTexts.set(element, text);
	};
}

/** The strings and numbers among resolved children, joined: the text an
 *  `OptionText` stands for. */
export function plainText(nodes: unknown[]): string {
	return nodes
		.filter(
			(node): node is string | number =>
				typeof node === "string" || typeof node === "number"
		)
		.join("");
}

function isOptionText(node: unknown): node is Element {
	return node instanceof Element && optionTexts.has(node);
}

/** The text an option's children give it: its plain strings and numbers, and
 *  its marked option text. A description or an icon adds nothing. */
function readOptionLabel(nodes: unknown[]): string {
	return nodes
		.map((node) => {
			if (typeof node === "string" || typeof node === "number")
				return String(node);
			return isOptionText(node) ? (optionTexts.get(node)?.() ?? "") : "";
		})
		.join("")
		.replaceAll(/\s+/g, " ")
		.trim();
}

/**
 * An option part. Its children resolve once, here: their text is the label,
 * and the same nodes are what `render` places in the row.
 */
export function createOptionPart(
	props: OptionPartProps,
	render: (
		content: Accessor<JSX.Element[]>,
		record: Accessor<OptionRecord>
	) => JSX.Element
): JSX.Element {
	const content = children(() => props.children);
	const record = createMemo(
		(): OptionRecord => ({
			value: props.value,
			label:
				props.label ??
				(readOptionLabel(content.toArray()) || props.value),
			disabled: props.disabled ?? false,
		})
	);
	return asElement({
		[PART]: true,
		kind: "option",
		record,
		render: () => render(content.toArray, record),
	});
}

/** A group of options: its own children are option parts and a label. */
export function createGroupPart(
	props: { children?: JSX.Element },
	owner: string,
	render: (parts: Accessor<SelectionPart[]>) => JSX.Element
): JSX.Element {
	const resolved = children(() => props.children);
	const parts = createMemo(() =>
		readParts(resolved.toArray(), owner, ["option", "groupLabel"])
	);
	return asElement({
		[PART]: true,
		kind: "group",
		parts,
		render: () => render(parts),
	});
}

/** A part the Root moves elsewhere (the chips, the empty state, a label). */
export function createHoistedPart(
	kind: HoistedKind,
	render: () => JSX.Element
): JSX.Element {
	return asElement({ [PART]: true, kind, render });
}

/**
 * A Root's resolved children as parts, in render order. Throws on anything
 * else, so a stray element is not silently dropped from the list.
 */
export function readParts<Kind extends PartKind>(
	nodes: unknown[],
	owner: string,
	kinds: readonly Kind[]
): Extract<SelectionPart, { kind: Kind }>[] {
	const parts: Extract<SelectionPart, { kind: Kind }>[] = [];
	for (const node of nodes) {
		if (isBlank(node)) continue;
		if (
			!isPart(node) ||
			!(kinds as readonly PartKind[]).includes(node.kind)
		) {
			throw new Error(
				`Only its own option parts can be children of ${owner}.`
			);
		}
		parts.push(node as Extract<SelectionPart, { kind: Kind }>);
	}
	return parts;
}

/** The first part of a kind, for a Root to hoist into place. */
export function findPart(
	parts: SelectionPart[],
	kind: HoistedKind
): HoistedPart | undefined {
	return parts.find((part): part is HoistedPart => part.kind === kind);
}

/** The parts the list renders: the options and groups, in order. */
export function listParts<Part extends SelectionPart>(
	parts: Part[]
): Extract<Part, OptionPart | GroupPart>[] {
	return parts.filter(
		(part): part is Extract<Part, OptionPart | GroupPart> =>
			part.kind === "option" || part.kind === "group"
	);
}

/** Every option's record, in render order, groups included. */
function optionRecords(parts: SelectionPart[]): OptionRecord[] {
	return parts.flatMap((part) => {
		if (part.kind === "option") return [part.record()];
		return part.kind === "group" ? optionRecords(part.parts()) : [];
	});
}

/**
 * A Root's parts, read from its resolved children, and the option records
 * they declare.
 */
export function createSelectionParts<Kind extends PartKind>(
	resolved: { toArray: () => unknown[] },
	owner: string,
	kinds: readonly Kind[]
): {
	parts: Accessor<Extract<SelectionPart, { kind: Kind }>[]>;
	records: Accessor<OptionRecord[]>;
} {
	const parts = createMemo(() => readParts(resolved.toArray(), owner, kinds));
	const records = createMemo(() => optionRecords(parts()));
	return { parts, records };
}

/**
 * What renders the chips in a Root's control: a declared `SelectedOptions`
 * part, else the Root's default row while `multiple` is on, else nothing.
 */
export function chipsRenderer(
	parts: SelectionPart[],
	multiple: boolean | undefined,
	renderDefault: () => JSX.Element
): (() => JSX.Element) | undefined {
	return (
		findPart(parts, "selectedOptions")?.render ??
		(multiple ? renderDefault : undefined)
	);
}

/** The records of the selected values, in selection order. A value no
 *  option declares (yet) is skipped. */
export function recordsFor(
	values: string[],
	records: OptionRecord[]
): OptionRecord[] {
	const byValue = new Map(records.map((record) => [record.value, record]));
	return values.flatMap((value) => {
		const record = byValue.get(value);
		return record ? [record] : [];
	});
}

/** The Ark collection over option records. */
export function createOptionCollection(
	records: OptionRecord[]
): ListCollection<OptionRecord> {
	return createListCollection({
		items: records,
		itemToValue: (record) => record.value,
		itemToString: (record) => record.label,
		isItemDisabled: (record) => record.disabled,
	});
}

/**
 * Wraps each run of bare text in an option's children with `wrap` (the
 * component's `OptionText`), so the row has a title. Children that already
 * hold option text are returned as they are.
 */
export function wrapBareText(
	nodes: JSX.Element[],
	wrap: (text: string) => JSX.Element
): JSX.Element[] {
	if (nodes.some((node) => isOptionText(node))) return nodes;

	const wrapped: JSX.Element[] = [];
	let run: string[] = [];
	function flushRun(): void {
		if (run.length === 0) return;
		wrapped.push(wrap(run.join("")));
		run = [];
	}
	for (const node of nodes) {
		if (typeof node === "string" || typeof node === "number") {
			run.push(String(node));
			continue;
		}
		flushRun();
		wrapped.push(node);
	}
	flushRun();
	return wrapped;
}

/** The part of zag's outside-press event a selection Root reads. */
type OutsidePress = {
	detail: { target: EventTarget | null };
	preventDefault: () => void;
};

/**
 * An `onPointerDownOutside` that keeps the list open for a press on the
 * field's own control (a chip, the chevron, the padding). zag counts those as
 * outside, so the press would close the list and the control's click reopen
 * it; kept open, the click toggles it once. The caller's handler still runs.
 */
export function keepOpenOnPressIn<Event extends OutsidePress>(
	getElement: () => Element | undefined,
	onPointerDownOutside?: (event: Event) => void
): (event: Event) => void {
	return (event) => {
		onPointerDownOutside?.(event);
		const target = event.detail.target;
		if (target instanceof Node && getElement()?.contains(target)) {
			event.preventDefault();
		}
	};
}

/** The name of a field's clear button: whether it clears one or many. */
export function clearLabel(selectedCount: number): string {
	return selectedCount > 1 ? "Clear all" : "Clear value";
}

/** Case-insensitive substring match on the option's label. */
export function matchesLabel(
	inputValue: string,
	option: OptionRecord
): boolean {
	// eslint-disable-next-line no-restricted-syntax -- case-insensitive search
	return option.label.toLowerCase().includes(inputValue.toLowerCase());
}

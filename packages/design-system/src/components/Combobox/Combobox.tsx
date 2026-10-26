/* eslint-disable max-lines -- one compound: Root, its control, filter and popup, and the option parts, sharing a private context */
import type { ListCollection } from "@ark-ui/solid/collection";
import {
	Combobox as ArkCombobox,
	type ComboboxInputValueChangeDetails,
	type ComboboxRootProps as ArkComboboxRootProps,
	type UseComboboxContext,
	useComboboxContext,
} from "@ark-ui/solid/combobox";
import clsx from "clsx";
import {
	type Accessor,
	children,
	createContext,
	createMemo,
	createSignal,
	For,
	type JSX,
	type ParentProps,
	Show,
	splitProps,
} from "solid-js";
import { Portal } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { useRequiredContext } from "../../utils/context.ts";
import {
	fieldBoxHandlers,
	splitMakeFieldProps,
} from "../../utils/makeFieldProps.ts";
import {
	chipsRenderer,
	clearLabel,
	createOptionCollection,
	createOptionPart,
	createSelectionParts,
	createHoistedPart,
	findPart,
	keepOpenOnPressIn,
	listParts,
	markOptionText,
	matchesLabel,
	type OptionPart,
	type OptionPartProps,
	type OptionRecord,
	plainText,
	recordsFor,
	type HoistedPart,
	type SelectionFieldProps,
	wrapBareText,
} from "../../utils/optionCollection.ts";
import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import { splitArkProps } from "../../utils/splitArkProps.ts";
import { Highlight } from "../Highlight/Highlight.tsx";
import { Icon } from "../Icon/Icon.tsx";
import {
	List,
	type ListItemDescriptionProps,
	type ListItemTitleProps,
} from "../List/List.tsx";
import { MakeField, type MakeFieldProps } from "../MakeField/MakeField.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import styles from "./Combobox.module.scss";
import {
	SelectedItemsRow,
	type SelectedItemsRowProps,
} from "./SelectedItemsRow.tsx";

const OWNER = "Combobox.Root";
const ROOT_PARTS = ["option", "selectedOptions", "empty"] as const;
const DEFAULT_PLACEHOLDER = "Type or select an option";
const DEFAULT_EMPTY_TEXT = "No results found";

/** What the parts read from their Root. */
type ComboboxRootState = {
	/** Every declared option, in render order, whatever the filter. */
	records: Accessor<OptionRecord[]>;
	/** What was typed: the filter, and the text each option marks. */
	query: Accessor<string>;
};

const ComboboxRootContext = createContext<ComboboxRootState>();

function useComboboxRoot(part: string): ComboboxRootState {
	return useRequiredContext(ComboboxRootContext, `Combobox.${part}`, OWNER);
}

export type ComboboxRootProps = Omit<
	ArkComboboxRootProps<OptionRecord>,
	"collection" | "class" | "children" | "allowCustomValue"
> &
	MakeFieldProps &
	SelectionFieldProps &
	WithPartClasses<"positioner" | "content"> & {
		/** Replaces the default case-insensitive match on the option's label. */
		filter?: (inputValue: string, option: OptionRecord) => boolean;
		/**
		 * The options: `Combobox.Option` parts (a `<For>` over data is fine),
		 * plus an optional `Combobox.SelectedOptions` and `Combobox.Empty`.
		 */
		children?: JSX.Element;
	};

const OWN_KEYS = [
	"allowClearing",
	"placeholder",
	"filter",
	"children",
	"onInputValueChange",
	"onPointerDownOutside",
] as const satisfies readonly (keyof ComboboxRootProps)[];

/** Backspace with nothing left to delete in the input takes the most recent
 *  selection with it. */
function removeLastOnBackspace(
	event: KeyboardEvent & { currentTarget: HTMLInputElement },
	context: UseComboboxContext<unknown>
): void {
	if (
		event.key !== "Backspace" ||
		event.currentTarget.value !== "" ||
		context().value.length === 0
	) {
		return;
	}

	event.preventDefault();
	context().clearValue(context().value[context().value.length - 1]);
}

/** Clears every selection; its label says whether that is one or many. */
function ClearButton(props: {
	context: UseComboboxContext<unknown>;
}): JSX.Element {
	return (
		<Tooltip.Anchor label={clearLabel(props.context().value.length)}>
			<ArkCombobox.ClearTrigger
				class={styles.clearTrigger}
				aria-label={clearLabel(props.context().value.length)}
			>
				<Icon>{ICONS.close}</Icon>
			</ArkCombobox.ClearTrigger>
		</Tooltip.Anchor>
	);
}

/** The chevron that opens and closes the list. */
function ExpandButton(props: {
	context: UseComboboxContext<unknown>;
}): JSX.Element {
	return (
		<Tooltip.Anchor label={props.context().open ? "Close" : "Show options"}>
			<ArkCombobox.Trigger class={styles.trigger}>
				<Icon>
					{props.context().open ? ICONS.collapseAll : ICONS.expandAll}
				</Icon>
			</ArkCombobox.Trigger>
		</Tooltip.Anchor>
	);
}

/** The field's control row: the chips, the input, and the clear and expand
 *  buttons. */
function InputControl(
	props: Pick<ComboboxRootProps, "placeholder" | "allowClearing"> & {
		setControlElement: (element: HTMLDivElement) => void;
		getInputElement: () => HTMLInputElement | undefined;
		setInputElement: (element: HTMLInputElement) => void;
		isInvalid: boolean;
		isTyping: boolean;
		/** Renders the chips, when the field shows them. */
		chips: (() => JSX.Element) | undefined;
	}
): JSX.Element {
	return (
		<ArkCombobox.Control
			ref={props.setControlElement}
			class={styles.inputWrapper}
			data-invalid={props.isInvalid ? "true" : undefined}
			// While there is a filter to read, the line belongs to the
			// input: the chips give their room back and collapse.
			data-typing={props.isTyping}
			// With chips present the input collapses to a caret pinned
			// after them (see `.inputWrapper` in the module), so most of
			// the field is a dead zone: a click there hit the control,
			// not the input, and nothing opened. Forward those clicks to
			// the input so the whole field behaves like a text field —
			// focus it and open the list (`openOnClick`). The real
			// controls (clear, expand, each chip's dismiss) are buttons
			// and keep their own behaviour.
			{...fieldBoxHandlers(props.getInputElement)}
		>
			<ArkCombobox.Context>
				{(context) => (
					<>
						{props.chips?.()}
						<ArkCombobox.Input
							ref={props.setInputElement}
							// The chips already say what is selected, so
							// the placeholder would repeat the ask.
							placeholder={
								props.chips && context().value.length > 0
									? undefined
									: (props.placeholder ?? DEFAULT_PLACEHOLDER)
							}
							class={styles.input}
							onKeyDown={(event) => {
								if (props.chips) {
									removeLastOnBackspace(event, context);
								}
							}}
						/>
						<Show
							when={
								context().value.length > 0 &&
								props.allowClearing
							}
						>
							<ClearButton context={context} />
						</Show>
						<ExpandButton context={context} />
					</>
				)}
			</ArkCombobox.Context>
		</ArkCombobox.Control>
	);
}

/** The selection as removable chips. */
function SelectedOptionsRow(props: ComboboxSelectedOptionsProps): JSX.Element {
	const root = useComboboxRoot("SelectedOptions");
	const combobox = useComboboxContext();
	return (
		<SelectedItemsRow
			class={props.class}
			// The full records, not the filtered collection: typing must not
			// take a selection's chip away.
			items={recordsFor(combobox().value, root.records())}
			getValue={(option) => option.value}
			getLabel={(option) => option.label}
			onRemove={(value) => {
				combobox().clearValue(value);
			}}
		/>
	);
}

/**
 * What was typed, and the collection it narrows the options to.
 *
 * The query is NOT ark's own (uncontrolled) visible input text, which keeps
 * showing exactly what was typed regardless of it. It resets to "" whenever
 * the input changed for any reason OTHER than typing (a selection, a clear, a
 * script), so the full list comes back rather than staying narrowed to text
 * that is no longer in the box.
 */
function createOptionFilter(
	props: Pick<ComboboxRootProps, "filter" | "onInputValueChange">
): {
	query: Accessor<string>;
	/** The collection of the records the query leaves. */
	createCollection: (
		records: Accessor<OptionRecord[]>
	) => Accessor<ListCollection<OptionRecord>>;
	onInputValueChange: (details: ComboboxInputValueChangeDetails) => void;
} {
	const [query, setQuery] = createSignal("");

	function visibleRecords(records: OptionRecord[]): OptionRecord[] {
		const typed = query();
		if (!typed) return records;
		const isMatch = props.filter ?? matchesLabel;
		return records.filter((option) => isMatch(typed, option));
	}

	return {
		query,
		// Only the survivors are in the collection, so each option reads it
		// to know whether it still has a row to render.
		createCollection: (records) => {
			const collection = createMemo(() =>
				createOptionCollection(visibleRecords(records()))
			);
			return collection;
		},
		onInputValueChange: (details) => {
			setQuery(
				details.reason === "input-change" ? details.inputValue : ""
			);
			props.onInputValueChange?.(details);
		},
	};
}

/** The floating list: the options the filter left, or the empty state. */
function Popup(
	props: WithPartClasses<"positioner" | "content"> & {
		parts: OptionPart[];
		/** A declared `Combobox.Empty`, replacing the default text. */
		empty: HoistedPart | undefined;
	}
): JSX.Element {
	const combobox = useComboboxContext();
	return (
		<Portal>
			<ArkCombobox.Positioner
				class={getPartStyles(styles, props, "positioner")}
			>
				<ArkCombobox.Content
					class={getPartStyles(styles, props, "content")}
				>
					{/* An empty list would still take the content's gap,
					    leaving a stray band above the empty state. */}
					<Show when={combobox().collection.items.length > 0}>
						<ArkCombobox.List
							asChild={(listProps) => (
								// The listbox owns the semantics: the rows are
								// Ark's options, so the list inside only lays
								// them out.
								<List.Root
									{...listProps()}
									role={listProps().role ?? "presentation"}
								>
									<For each={props.parts}>
										{(part) => part.render()}
									</For>
								</List.Root>
							)}
						/>
					</Show>
					<ArkCombobox.Empty class={styles.empty}>
						{props.empty?.render() ?? DEFAULT_EMPTY_TEXT}
					</ArkCombobox.Empty>
				</ArkCombobox.Content>
			</ArkCombobox.Positioner>
		</Portal>
	);
}

/**
 * An input that filters a list of options as you type.
 *
 * Port of EmboUI's Combobox options-as-children path. The options are
 * `Combobox.Option` children of `Root`: they declare the collection (value,
 * label, disabled), typing filters those records, and only the survivors
 * render. `Combobox.SelectedOptions` and `Combobox.Empty`, written among the
 * options, are moved into the control and the empty state.
 *
 * React→Solid: `React.Children` → parts that describe themselves to `Root`
 * (`utils/optionCollection.ts`). Not ported: the deprecated `items` path, the
 * hidden `<select>` for form submission and `allowCustomValue` (no use yet).
 *
 * @example
 * ```tsx
 * <Combobox.Root label="Framework" multiple onValueChange={(details) => …}>
 *   <Combobox.Option value="solid">Solid</Combobox.Option>
 *   <Combobox.Option value="react">
 *     <Combobox.OptionText>React</Combobox.OptionText>
 *     <Combobox.OptionDescription>By Meta</Combobox.OptionDescription>
 *   </Combobox.Option>
 * </Combobox.Root>
 * ```
 */
function Root(props: ComboboxRootProps): JSX.Element {
	let controlElement: HTMLDivElement | undefined;
	let inputElement: HTMLInputElement | undefined;

	const [own, rest] = splitArkProps(props, OWN_KEYS);
	// MakeField props (label/helper/error + semantics + the full disabling set)
	// route to MakeField; the rest spreads on ArkCombobox.Root. `disabled`/
	// `required` are re-forwarded to the ark Root below (it is not a Field.*
	// part, so it doesn't inherit them from Field.Root's context).
	const [makeFieldProps, arkRest] = splitMakeFieldProps(rest);

	const filter = createOptionFilter(own);
	const state: ComboboxRootState = {
		records: () => records(),
		query: filter.query,
	};
	// Resolved here, not where the list renders, so every option has declared
	// itself before the list first opens.
	const resolved = children(() => (
		<ComboboxRootContext.Provider value={state}>
			{own.children}
		</ComboboxRootContext.Provider>
	));
	const { parts, records } = createSelectionParts(
		resolved,
		OWNER,
		ROOT_PARTS
	);
	const collection = filter.createCollection(records);
	const chips = createMemo(() =>
		chipsRenderer(parts(), props.multiple, () => <SelectedOptionsRow />)
	);

	function focusInput(): void {
		inputElement?.focus();
	}

	return (
		<ComboboxRootContext.Provider value={state}>
			<MakeField
				{...makeFieldProps}
				onLabelClicked={focusInput}
				focusField={focusInput}
			>
				<ArkCombobox.Root
					// Content builds on first open. No `unmountOnExit`: the close is a CSS
					// transition, which unmounting would cut off.
					lazyMount
					{...arkRest}
					disabled={makeFieldProps.disabled}
					required={makeFieldProps.required}
					collection={collection()}
					onInputValueChange={filter.onInputValueChange}
					allowCustomValue={false}
					openOnClick={arkRest.openOnClick ?? true}
					// Typing highlights the first match, so Enter takes it without
					// arrowing down to it first.
					inputBehavior={arkRest.inputBehavior ?? "autohighlight"}
					positioning={{
						sameWidth: true,
						placement: "bottom-start",
						// Read the box off the control directly rather than the
						// element zag passes: zag already anchors a combobox to its
						// control, but doing it explicitly here means there is no
						// render where the rect silently falls back to something else.
						getAnchorRect: () =>
							controlElement?.getBoundingClientRect() ?? null,
						...arkRest.positioning,
					}}
					onPointerDownOutside={keepOpenOnPressIn(
						() => controlElement,
						own.onPointerDownOutside
					)}
				>
					<InputControl
						setControlElement={(element) => {
							controlElement = element;
						}}
						getInputElement={() => inputElement}
						setInputElement={(element) => {
							inputElement = element;
						}}
						isInvalid={Boolean(makeFieldProps.invalid)}
						isTyping={filter.query().length > 0}
						chips={chips()}
						placeholder={own.placeholder}
						allowClearing={own.allowClearing}
					/>
					<Popup
						parts={listParts(parts())}
						empty={findPart(parts(), "empty")}
						classOverride={makeFieldProps.classOverride}
					/>
				</ArkCombobox.Root>
			</MakeField>
		</ComboboxRootContext.Provider>
	);
}

export type ComboboxOptionProps = OptionPartProps &
	Omit<ArkCombobox.ItemProps, "item" | "children">;

/** The check on the selected row. The option renders it; no author writes it. */
function SelectedIndicator(): JSX.Element {
	return (
		<ArkCombobox.ItemContext>
			{(item) => (
				<Show when={item().selected}>
					<ArkCombobox.ItemIndicator class={styles.itemIndicator}>
						<Icon>{ICONS.check}</Icon>
					</ArkCombobox.ItemIndicator>
				</Show>
			)}
		</ArkCombobox.ItemContext>
	);
}

/**
 * One option. Its text is its label: a bare string child, or a
 * `Combobox.OptionText` beside a `Combobox.OptionDescription`. Typing filters
 * by that label and marks the match in it. Pass `label` when the text is not a
 * string.
 */
function Option(props: ComboboxOptionProps): JSX.Element {
	useComboboxRoot("Option");
	const [own, itemProps] = splitProps(props, [
		"value",
		"label",
		"disabled",
		"children",
		"class",
	]);

	return createOptionPart(own, (content, record) => {
		const combobox = useComboboxContext();
		return (
			// The collection holds only what the filter left, so a dropped
			// option renders nothing rather than a row nothing can reach.
			<Show when={combobox().collection.has(record().value)}>
				<ArkCombobox.Item
					{...itemProps}
					item={record()}
					class={clsx(styles.item, own.class)}
				>
					<List.Item>
						{wrapBareText(content(), (text) => (
							<OptionText>{text}</OptionText>
						))}
						<SelectedIndicator />
					</List.Item>
				</ArkCombobox.Item>
			</Show>
		);
	});
}

export type ComboboxOptionTextProps = Omit<ListItemTitleProps, "ref">;

/** An option's text: what filtering matches, with the typed match marked. */
function OptionText(props: ComboboxOptionTextProps): JSX.Element {
	const root = useComboboxRoot("OptionText");
	const [own, rest] = splitProps(props, ["children"]);
	const text = children(() => own.children);

	function label(): string {
		return plainText(text.toArray());
	}

	// Only text alone can be marked up: an element child keeps its own markup.
	function isTextOnly(): boolean {
		return text
			.toArray()
			.every(
				(node) => typeof node === "string" || typeof node === "number"
			);
	}

	return (
		<List.ItemTitle {...rest} ref={markOptionText(label)}>
			<Show when={isTextOnly() && label()} fallback={text()}>
				{(value) => <Highlight text={value()} query={root.query()} />}
			</Show>
		</List.ItemTitle>
	);
}

/** A second line under an option's text. Never matched by the filter. */
function OptionDescription(props: ListItemDescriptionProps): JSX.Element {
	return <List.ItemDescription {...props} />;
}

export type ComboboxSelectedOptionsProps = Pick<
	SelectedItemsRowProps<OptionRecord>,
	"class"
>;

/**
 * The selection as removable chips, shown in the control. `multiple` shows
 * them on its own; declare this part to show them for a single selection or
 * to style the row.
 */
function SelectedOptions(props: ComboboxSelectedOptionsProps): JSX.Element {
	useComboboxRoot("SelectedOptions");
	return createHoistedPart("selectedOptions", () => (
		<SelectedOptionsRow class={props.class} />
	));
}

/** What the list shows when nothing matches. Replaces the default text. */
function Empty(props: ParentProps): JSX.Element {
	useComboboxRoot("Empty");
	// Resolved once, so the empty state re-renders the same nodes.
	const content = children(() => props.children);
	return createHoistedPart("empty", content);
}

export const Combobox = {
	Root,
	Option,
	OptionText,
	OptionDescription,
	SelectedOptions,
	Empty,
};

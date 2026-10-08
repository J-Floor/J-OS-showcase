import {
	Combobox as ArkCombobox,
	type ComboboxInputValueChangeDetails,
	type ComboboxRootProps as ArkComboboxRootProps,
	createListCollection,
} from "@ark-ui/solid/combobox";
import clsx from "clsx";
import {
	createMemo,
	createSignal,
	For,
	type JSX,
	Show,
	splitProps,
} from "solid-js";
import { Portal } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { splitMakeFieldProps } from "../../utils/makeFieldProps.ts";
import {
	defaultIsItemDisabled,
	defaultItemToString,
	defaultItemToValue,
	filterItemsByInput,
	type ComboboxItem,
} from "../../utils/optionCollection.ts";
import { splitArkProps } from "../../utils/splitArkProps.ts";
import { Highlight } from "../Highlight/Highlight.tsx";
import { Icon } from "../Icon/Icon.tsx";
import { List } from "../List/List.tsx";
import { MakeField, type MakeFieldProps } from "../MakeField/MakeField.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import styles from "./Combobox.module.scss";
import { SelectedItemsRow } from "./SelectedItemsRow.tsx";

export type { ComboboxItem } from "../../utils/optionCollection.ts";

const DEFAULT_PLACEHOLDER = "Type or select an option";
const DEFAULT_EMPTY_TEXT = "No results found";

/** The value identifying a `ComboboxItem`. */
function itemToValue(item: ComboboxItem): string {
	return defaultItemToValue(item);
}

/** The text a `ComboboxItem` is displayed and filtered by. */
function itemToString(item: ComboboxItem): string {
	return defaultItemToString(item, itemToValue);
}

/** Whether a `ComboboxItem` cannot be selected. */
function isItemDisabled(item: ComboboxItem): boolean {
	return defaultIsItemDisabled(item);
}

export type ComboboxRootProps = Omit<
	ArkComboboxRootProps<ComboboxItem>,
	"collection" | "class" | "children"
> &
	MakeFieldProps & {
		/** The options to choose from; typing narrows them to a match. */
		items: ComboboxItem[];
		/**
		 * Make the options as wide as the field. Turn it off to let a long
		 * option decide the list's width instead.
		 * @default true
		 */
		sameWidth?: boolean;
		/** Show a clear control when a value is selected. */
		allowClearing?: boolean;
		/** Placeholder shown while the field is empty. */
		placeholder?: string;
		/** Text shown when nothing matches the current filter. */
		emptyText?: string;
		/** Replaces the default case-insensitive substring match. */
		filter?: (inputValue: string, item: ComboboxItem) => boolean;
		/** Extra static content rendered after the filtered options. */
		children?: JSX.Element;
	};

/**
 * An input that filters a list of options as you type.
 *
 * Port of EmboUI's Combobox `OptionsRoot` path (the deprecated
 * options-as-children/`LegacyRoot` paths are not ported). **Deviates from
 * EmboUI**: a single `items` prop drives the collection instead of
 * `Combobox.Option` children — Solid has no `React.Children` to walk, so the
 * options are rendered internally with `<For>` over the (filtered) ark
 * collection, using the very same `Option` this module exports.
 *
 * @example
 * ```tsx
 * <Combobox.Root
 *   label="Framework"
 *   items={[{ value: "solid", label: "Solid" }, { value: "react", label: "React" }]}
 *   onValueChange={(d) => …}
 * />
 * ```
 */
function Root(props: ComboboxRootProps): JSX.Element {
	// eslint-disable-next-line no-unassigned-vars -- assigned by Solid's `ref={controlEl}` binding below, which the rule can't see
	let controlEl: HTMLDivElement | undefined;
	// eslint-disable-next-line no-unassigned-vars -- assigned by Solid's `ref={inputEl}` binding below, which the rule can't see
	let inputEl: HTMLInputElement | undefined;

	const [own, rest] = splitArkProps(props, [
		"items",
		"sameWidth",
		"allowClearing",
		"placeholder",
		"emptyText",
		"filter",
		"children",
		"onInputValueChange",
	]);
	// MakeField props (label/helper/error + semantics + the full disabling set)
	// route to MakeField; the rest spreads on ArkCombobox.Root. `disabled`/
	// `required` are re-forwarded to the ark Root below (it is not a Field.*
	// part, so it doesn't inherit them from Field.Root's context).
	const [makeFieldProps, arkRest] = splitMakeFieldProps(rest);

	// Filters the options; NOT ark's own (uncontrolled) visible input text,
	// which keeps showing exactly what was typed regardless of this signal.
	// Reset to "" whenever the input changed for any reason OTHER than typing
	// (a selection, a clear, a script) so the full list comes back rather than
	// staying narrowed to text that is no longer in the box.
	const [inputValue, setInputValue] = createSignal("");

	function filteredItems(): ComboboxItem[] {
		const query = inputValue();
		if (!query) return own.items;
		const predicate = own.filter;
		if (predicate) {
			return own.items.filter((item) => predicate(query, item));
		}
		return filterItemsByInput(own.items, query, itemToString);
	}

	// Memoised so a keystroke filters and rebuilds the collection once, not
	// once per read (the ark `collection` prop and the `<For>` both read it).
	const collection = createMemo(() =>
		createListCollection({
			items: filteredItems(),
			itemToValue,
			itemToString,
			isItemDisabled,
		})
	);

	function handleInputValueChange(
		details: ComboboxInputValueChangeDetails
	): void {
		setInputValue(
			details.reason === "input-change" ? details.inputValue : ""
		);
		own.onInputValueChange?.(details);
	}

	function focusInput(): void {
		inputEl?.focus();
	}

	return (
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
				onInputValueChange={handleInputValueChange}
				allowCustomValue={false}
				openOnClick={arkRest.openOnClick ?? true}
				// Typing highlights the first match, so Enter takes it without
				// arrowing down to it first.
				inputBehavior={arkRest.inputBehavior ?? "autohighlight"}
				positioning={{
					sameWidth: own.sameWidth ?? true,
					placement: "bottom-start",
					// Read the box off the control directly rather than the
					// element zag passes: zag already anchors a combobox to its
					// control, but doing it explicitly here means there is no
					// render where the rect silently falls back to something else.
					getAnchorRect: () =>
						controlEl?.getBoundingClientRect() ?? null,
				}}
			>
				<ArkCombobox.Control
					ref={controlEl}
					class={styles.inputWrapper}
					data-invalid={makeFieldProps.invalid ? "true" : undefined}
					// While there is a filter to read, the line belongs to the
					// input: the chips give their room back and collapse.
					data-typing={inputValue().length > 0}
					// With chips present the input collapses to a caret pinned
					// after them (see `.inputWrapper` in the module), so most of
					// the field is a dead zone: a click there hit the control,
					// not the input, and nothing opened. Forward those clicks to
					// the input so the whole field behaves like a text field —
					// focus it and open the list (`openOnClick`). The real
					// controls (clear, expand, each chip's dismiss) are buttons
					// and keep their own behaviour.
					onClick={(event) => {
						const target = event.target as HTMLElement;
						if (target === inputEl || target.closest("button"))
							return;
						inputEl?.focus();
						inputEl?.click();
					}}
				>
					<ArkCombobox.Context>
						{(context) => (
							<>
								<Show when={props.multiple}>
									<SelectedOptions />
								</Show>
								<ArkCombobox.Input
									ref={inputEl}
									// The chips already say what is selected, so
									// the placeholder would repeat the ask.
									placeholder={
										props.multiple &&
										context().value.length > 0
											? undefined
											: (own.placeholder ??
												DEFAULT_PLACEHOLDER)
									}
									class={styles.input}
									onKeyDown={(event) => {
										// Backspace with nothing left to delete
										// in the input takes the most recent
										// selection with it.
										if (
											!props.multiple ||
											event.key !== "Backspace" ||
											event.currentTarget.value !== "" ||
											context().value.length === 0
										) {
											return;
										}

										event.preventDefault();
										context().clearValue(
											context().value[
												context().value.length - 1
											]
										);
									}}
								/>
								<Show
									when={
										context().value.length > 0 &&
										own.allowClearing
									}
								>
									<Tooltip
										tooltipContent={
											context().value.length > 1
												? "Clear all"
												: "Clear value"
										}
										asChild={(tooltipProps) => (
											<span
												{...(tooltipProps() as object)}
												class={styles.clearTriggerWrap}
											>
												<ArkCombobox.ClearTrigger
													class={styles.clearTrigger}
												>
													<Icon>{ICONS.close}</Icon>
												</ArkCombobox.ClearTrigger>
											</span>
										)}
									/>
								</Show>
								<Tooltip
									tooltipContent={
										context().open
											? "Close"
											: "Show options"
									}
									asChild={(tooltipProps) => (
										<span
											{...(tooltipProps() as object)}
											class={styles.triggerWrap}
										>
											<ArkCombobox.Trigger
												class={styles.trigger}
											>
												<Icon>
													{context().open
														? ICONS.collapseAll
														: ICONS.expandAll}
												</Icon>
											</ArkCombobox.Trigger>
										</span>
									)}
								/>
							</>
						)}
					</ArkCombobox.Context>
				</ArkCombobox.Control>
				<Content emptyText={own.emptyText}>
					<For each={collection().items}>
						{(item) => <Option item={item} />}
					</For>
					{own.children}
				</Content>
			</ArkCombobox.Root>
		</MakeField>
	);
}

export type ComboboxContentProps = ArkCombobox.ContentProps & {
	/** Text shown when nothing matches the current filter. */
	emptyText?: string;
};

/**
 * Wraps `ArkCombobox.Positioner > Content` (portalled), the options passed as
 * children, and the `ArkCombobox.Empty` state. Rendered internally by `Root`
 * around its own `items`-driven options; exported for parity with the rest of
 * the compound and for a fully custom composition via `Root`'s `children`.
 */
function Content(props: ComboboxContentProps): JSX.Element {
	const [own, rest] = splitProps(props, ["emptyText", "children", "class"]);

	return (
		<Portal>
			<ArkCombobox.Positioner class={styles.positioner}>
				<ArkCombobox.Content
					{...rest}
					class={clsx(styles.content, own.class)}
				>
					<List.Root>{own.children}</List.Root>
					<ArkCombobox.Empty class={styles.empty}>
						{own.emptyText ?? DEFAULT_EMPTY_TEXT}
					</ArkCombobox.Empty>
				</ArkCombobox.Content>
			</ArkCombobox.Positioner>
		</Portal>
	);
}

export type ComboboxOptionProps = Omit<ArkCombobox.ItemProps, "item"> & {
	/** The item this option renders and stands for. */
	item: ComboboxItem;
};

/** A single option. Wraps `ArkCombobox.Item` + `List.Item` rendering. */
function Option(props: ComboboxOptionProps): JSX.Element {
	const [own, rest] = splitProps(props, ["item"]);

	return (
		<ArkCombobox.Context>
			{(context) => (
				<ArkCombobox.Item {...rest} item={own.item} class={styles.item}>
					<List.Item>
						{/* `ArkCombobox.ItemText` carries `data-part="item-text"`
						    (ark's own semantics) AND `data-list-item-text`, so
						    `List.Item` places it in its main (left) text slot
						    alongside `List.ItemTitle`/`ItemDescription`. */}
						<ArkCombobox.ItemText
							data-list-item-text
							class={styles.optionLabel}
						>
							<Highlight
								text={own.item.label ?? own.item.value}
								query={context().inputValue}
							/>
						</ArkCombobox.ItemText>
						<ArkCombobox.ItemIndicator class={styles.itemIndicator}>
							<Icon>{ICONS.check}</Icon>
						</ArkCombobox.ItemIndicator>
					</List.Item>
				</ArkCombobox.Item>
			)}
		</ArkCombobox.Context>
	);
}

export type ComboboxOptionGroupProps = Omit<
	ArkCombobox.ItemGroupProps,
	"children"
> & {
	/** The heading shown above the group. */
	label: string;
	children: JSX.Element;
};

/**
 * A labelled group of options. Wraps `ArkCombobox.ItemGroup` + label.
 *
 * Not used by `Root`'s own `items`-driven rendering (a flat `ComboboxItem`
 * list has no group field); exported for parity with the compound and for a
 * fully custom composition via `Root`'s `children`.
 */
function OptionGroup(props: ComboboxOptionGroupProps): JSX.Element {
	const [own, rest] = splitProps(props, ["label", "children", "class"]);

	return (
		<ArkCombobox.ItemGroup {...rest} class={clsx(styles.group, own.class)}>
			<ArkCombobox.ItemGroupLabel class={styles.groupLabel}>
				{own.label}
			</ArkCombobox.ItemGroupLabel>
			{own.children}
		</ArkCombobox.ItemGroup>
	);
}

export type ComboboxSelectedOptionsProps = {
	/**
	 * Replaces the default chip for each selected item. Leave it off and each
	 * selection renders as a chip that removes it when dismissed.
	 */
	renderItem?: (item: ComboboxItem) => JSX.Element;
} & Omit<JSX.HTMLAttributes<HTMLDivElement>, "children">;

/**
 * The current selection, shown inside the control. `Root` renders this on its
 * own line whenever `multiple` is set.
 */
function SelectedOptions(props: ComboboxSelectedOptionsProps): JSX.Element {
	const [own, rest] = splitProps(props, ["renderItem"]);

	return (
		<ArkCombobox.Context>
			{(context) => (
				<SelectedItemsRow
					{...rest}
					// The generic context widens the item to `unknown`; the
					// collection Root builds holds only `ComboboxItem` records.
					items={context().selectedItems as ComboboxItem[]}
					getValue={itemToValue}
					getLabel={itemToString}
					onRemove={(value) => {
						context().clearValue(value);
					}}
					renderItem={own.renderItem}
				/>
			)}
		</ArkCombobox.Context>
	);
}

export const Combobox = {
	Root,
	Content,
	Option,
	OptionGroup,
	SelectedOptions,
};

import {
	Select as ArkSelect,
	type SelectRootProps as ArkSelectRootProps,
	useSelectContext,
} from "@ark-ui/solid/select";
import clsx from "clsx";
import {
	type Accessor,
	children,
	createContext,
	createMemo,
	For,
	type JSX,
	Show,
	splitProps,
} from "solid-js";
import { Portal } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { useRequiredContext } from "../../utils/context.ts";
import { type PropsWithDisabling } from "../../utils/disablingProps.ts";
import {
	fieldBoxHandlers,
	splitMakeFieldProps,
} from "../../utils/makeFieldProps.ts";
import {
	chipsRenderer,
	clearLabel,
	createGroupPart,
	createOptionCollection,
	createOptionPart,
	createSelectionParts,
	createHoistedPart,
	type GroupPart,
	keepOpenOnPressIn,
	markOptionText,
	listParts,
	type OptionPart,
	type OptionPartProps,
	type OptionRecord,
	plainText,
	recordsFor,
	type SelectionFieldProps,
	wrapBareText,
} from "../../utils/optionCollection.ts";
import { splitArkProps } from "../../utils/splitArkProps.ts";
import {
	SelectedItemsRow,
	type SelectedItemsRowProps,
} from "../Combobox/SelectedItemsRow.tsx";
import { Icon } from "../Icon/Icon.tsx";
import {
	List,
	type ListItemDescriptionProps,
	type ListItemTitleProps,
} from "../List/List.tsx";
import { MakeField, type MakeFieldProps } from "../MakeField/MakeField.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import styles from "./Select.module.scss";

const OWNER = "Select.Root";
const ROOT_PARTS = ["option", "group", "selectedOptions"] as const;

/** What the parts read from their Root. */
type SelectRootState = {
	/** Every declared option, in render order. */
	records: Accessor<OptionRecord[]>;
};

const SelectRootContext = createContext<SelectRootState>();

function useSelectRoot(part: string): SelectRootState {
	return useRequiredContext(SelectRootContext, `Select.${part}`, OWNER);
}

export type SelectRootProps = PropsWithDisabling<
	MakeFieldProps &
		SelectionFieldProps & {
			/**
			 * The options: `Select.Option` parts (a `<For>` over data is fine),
			 * optionally inside `Select.OptionsGroup`, and an optional
			 * `Select.SelectedOptions`.
			 */
			children?: JSX.Element;
		} & Omit<
			ArkSelectRootProps<OptionRecord>,
			"collection" | "asChild" | "class" | "children"
		>
>;

/** Lines the list up with the painted control rather than the trigger inside
 *  it, so `sameWidth` matches the whole field. */
function anchorToControl(element: unknown): DOMRect | null {
	if (!(element instanceof HTMLElement)) return null;
	const box =
		element.closest<HTMLElement>('[data-part="control"]') ?? element;
	return box.getBoundingClientRect();
}

/** The selection as removable chips. */
function SelectedOptionsRow(props: SelectSelectedOptionsProps): JSX.Element {
	const root = useSelectRoot("SelectedOptions");
	const select = useSelectContext();
	return (
		<SelectedItemsRow
			class={props.class}
			items={recordsFor(select().value, root.records())}
			getValue={(option) => option.value}
			getLabel={(option) => option.label}
			onRemove={(value) => {
				select().clearValue(value);
			}}
		/>
	);
}

/**
 * The painted box: the chips, the trigger holding the value text, the clear
 * button and the chevron, side by side. The trigger paints nothing, so the
 * clear button is its sibling rather than a button nested in it.
 */
function Control(
	props: Pick<SelectRootProps, "placeholder" | "allowClearing"> & {
		isInvalid: boolean;
		/** Renders the chips, when the field shows them. */
		chips: (() => JSX.Element) | undefined;
		setControlElement: (element: HTMLDivElement) => void;
		setTriggerElement: (element: HTMLButtonElement) => void;
		getTriggerElement: () => HTMLButtonElement | undefined;
	}
): JSX.Element {
	const select = useSelectContext();
	return (
		<ArkSelect.Control
			ref={props.setControlElement}
			class={styles.inputWrapper}
			data-invalid={props.isInvalid ? "true" : undefined}
			// The chips and the chevron sit outside the trigger, so a click
			// anywhere on the field that is not a button of its own drives
			// the trigger.
			{...fieldBoxHandlers(props.getTriggerElement)}
		>
			{props.chips?.()}
			<ArkSelect.Trigger
				ref={props.setTriggerElement}
				class={styles.trigger}
			>
				{/* The value text names the trigger, so it only gives way to
				    chips that show a selection. */}
				<Show when={!props.chips || select().value.length === 0}>
					<ArkSelect.ValueText
						placeholder={props.placeholder}
						class={styles.value}
					/>
				</Show>
			</ArkSelect.Trigger>
			<Show when={select().value.length > 0 && props.allowClearing}>
				<Tooltip.Anchor label={clearLabel(select().value.length)}>
					<ArkSelect.ClearTrigger
						class={styles.clearTrigger}
						aria-label={clearLabel(select().value.length)}
					>
						<Icon>{ICONS.close}</Icon>
					</ArkSelect.ClearTrigger>
				</Tooltip.Anchor>
			</Show>
			<ArkSelect.Indicator class={styles.icon}>
				<Icon>
					{select().open ? ICONS.collapseAll : ICONS.expandAll}
				</Icon>
			</ArkSelect.Indicator>
		</ArkSelect.Control>
	);
}

/** The floating list. Every option and group renders in it, in order. */
function Popup(props: { parts: (OptionPart | GroupPart)[] }): JSX.Element {
	return (
		<Portal>
			<ArkSelect.Positioner class={styles.positioner}>
				<ArkSelect.Content class={styles.content}>
					<ArkSelect.List
						asChild={(listProps) => (
							// The listbox owns the semantics: the rows are Ark's
							// options, so the list inside only lays them out.
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
				</ArkSelect.Content>
			</ArkSelect.Positioner>
		</Portal>
	);
}

/**
 * Select field. Ported from EmboUI's Select (options as children). The options
 * are `Select.Option` children of `Root`: they declare the collection (value,
 * label, disabled) and render in the list. Ark's `Select.*` is never exposed.
 * A hidden `<select>` carries `name` / `required` into native forms.
 *
 * React→Solid: `React.Children` → parts that describe themselves to `Root`
 * (`utils/optionCollection.ts`); `useRef`(DOM) → `let el; ref={el}`; ark
 * `asChild` is a render function; `Portal` from `solid-js/web`.
 *
 * @example
 * ```tsx
 * <Select.Root label="Plan" onValueChange={(details) => …}>
 *   <Select.Option value="basic">Basic</Select.Option>
 *   <For each={rows}>{(row) => <Select.Option value={row.id}>{row.name}</Select.Option>}</For>
 * </Select.Root>
 * ```
 */
function Root(props: SelectRootProps): JSX.Element {
	let controlElement: HTMLDivElement | undefined;
	let triggerElement: HTMLButtonElement | undefined;

	const [own, rest] = splitArkProps(props, [
		"allowClearing",
		"placeholder",
		"children",
		"onPointerDownOutside",
	]);
	// MakeField props (label/helper/error + semantics + the full disabling set,
	// incl. disabledReason → the dim + reason tooltip) route to MakeField; the
	// rest spreads on ArkSelect.Root. `disabled`/`required` are re-forwarded to
	// the ark Root below (it is not a Field.* part, so it doesn't inherit them).
	const [makeFieldProps, arkRest] = splitMakeFieldProps(rest);

	const state: SelectRootState = { records: () => records() };
	// Resolved here, not where the list renders, so every option has declared
	// itself before the list first opens.
	const resolved = children(() => (
		<SelectRootContext.Provider value={state}>
			{own.children}
		</SelectRootContext.Provider>
	));
	const { parts, records } = createSelectionParts(
		resolved,
		OWNER,
		ROOT_PARTS
	);
	const collection = createMemo(() => createOptionCollection(records()));
	const chips = createMemo(() =>
		chipsRenderer(parts(), props.multiple, () => <SelectedOptionsRow />)
	);

	function focusTrigger(): void {
		triggerElement?.focus();
	}

	// A button opens on a click, not on `.focus()`, so the label drives one.
	function clickTrigger(): void {
		triggerElement?.click();
	}

	return (
		<SelectRootContext.Provider value={state}>
			<MakeField
				{...makeFieldProps}
				onLabelClicked={clickTrigger}
				focusField={focusTrigger}
			>
				<ArkSelect.Root
					// Content builds on first open. No `unmountOnExit`: the close is a CSS
					// transition, which unmounting would cut off.
					lazyMount
					{...arkRest}
					disabled={makeFieldProps.disabled}
					required={makeFieldProps.required}
					collection={collection()}
					positioning={{
						getAnchorRect: anchorToControl,
						...arkRest.positioning,
					}}
					onPointerDownOutside={keepOpenOnPressIn(
						() => controlElement,
						own.onPointerDownOutside
					)}
				>
					<Control
						isInvalid={Boolean(makeFieldProps.invalid)}
						chips={chips()}
						placeholder={own.placeholder}
						allowClearing={own.allowClearing}
						setControlElement={(element) => {
							controlElement = element;
						}}
						setTriggerElement={(element) => {
							triggerElement = element;
						}}
						getTriggerElement={() => triggerElement}
					/>
					<ArkSelect.HiddenSelect />
					<Popup parts={listParts(parts())} />
				</ArkSelect.Root>
			</MakeField>
		</SelectRootContext.Provider>
	);
}

export type SelectOptionProps = OptionPartProps &
	Omit<ArkSelect.ItemProps, "item" | "children">;

/**
 * One option. Its text is its label: a bare string child, or a
 * `Select.OptionText` beside a `Select.OptionDescription`. Anything written
 * before the text (an `Icon`) leads the row. Pass `label` when the text is not
 * a string.
 */
function Option(props: SelectOptionProps): JSX.Element {
	useSelectRoot("Option");
	const [own, itemProps] = splitProps(props, [
		"value",
		"label",
		"disabled",
		"children",
		"class",
	]);

	return createOptionPart(own, (content, record) => (
		<ArkSelect.Item
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
		</ArkSelect.Item>
	));
}

/** The check on the selected row. The option renders it; no author writes it. */
function SelectedIndicator(): JSX.Element {
	return (
		<ArkSelect.ItemContext>
			{(item) => (
				<Show when={item().selected}>
					<ArkSelect.ItemIndicator class={styles.itemIndicator}>
						<Icon>{ICONS.check}</Icon>
					</ArkSelect.ItemIndicator>
				</Show>
			)}
		</ArkSelect.ItemContext>
	);
}

export type SelectOptionTextProps = Omit<ListItemTitleProps, "ref">;

/** An option's text: what the trigger shows and typeahead matches. */
function OptionText(props: SelectOptionTextProps): JSX.Element {
	const [own, rest] = splitProps(props, ["children"]);
	const text = children(() => own.children);
	return (
		<List.ItemTitle
			{...rest}
			ref={markOptionText(() => plainText(text.toArray()))}
		>
			{text()}
		</List.ItemTitle>
	);
}

/** A second line under an option's text. Never part of its label. */
function OptionDescription(props: ListItemDescriptionProps): JSX.Element {
	return <List.ItemDescription {...props} />;
}

export type SelectOptionsGroupProps = Omit<
	ArkSelect.ItemGroupProps,
	"children"
> & {
	/** `Select.OptionsGroupLabel` and the group's `Select.Option`s. */
	children?: JSX.Element;
};

/** A labelled group of options. */
function OptionsGroup(props: SelectOptionsGroupProps): JSX.Element {
	useSelectRoot("OptionsGroup");
	const [own, groupProps] = splitProps(props, ["children", "class"]);

	return createGroupPart(own, "Select.OptionsGroup", (groupParts) => (
		<ArkSelect.ItemGroup
			{...groupProps}
			class={clsx(styles.itemGroup, own.class)}
		>
			<For each={groupParts()}>{(part) => part.render()}</For>
		</ArkSelect.ItemGroup>
	));
}

/** The heading of a `Select.OptionsGroup`. */
function OptionsGroupLabel(props: ArkSelect.ItemGroupLabelProps): JSX.Element {
	useSelectRoot("OptionsGroupLabel");
	return createHoistedPart("groupLabel", () => (
		<ArkSelect.ItemGroupLabel
			{...props}
			class={clsx(styles.groupLabel, props.class)}
		/>
	));
}

export type SelectSelectedOptionsProps = Pick<
	SelectedItemsRowProps<OptionRecord>,
	"class"
>;

/**
 * The selection as removable chips, shown in the control. `multiple` shows
 * them on its own; declare this part to show them for a single selection or
 * to style the row.
 */
function SelectedOptions(props: SelectSelectedOptionsProps): JSX.Element {
	useSelectRoot("SelectedOptions");
	return createHoistedPart("selectedOptions", () => (
		<SelectedOptionsRow class={props.class} />
	));
}

export const Select = {
	Root,
	Option,
	OptionText,
	OptionDescription,
	OptionsGroup,
	OptionsGroupLabel,
	SelectedOptions,
};

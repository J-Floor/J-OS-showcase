import clsx from "clsx";
import { Show, splitProps, type JSX } from "solid-js";

import { ICONS } from "../../icons.ts";
import { Input, type InputProps } from "../Input/Input.tsx";

import { ClearSearchButton } from "./ClearSearchButton.tsx";
import styles from "./SearchInput.module.scss";

/** `Omit` per union member: `InputProps` is a `PropsWithDisabling` union, and a
 *  plain `Omit` flattens it so a spread back into `Input` no longer type-checks. */
type OmitEach<T, K extends PropertyKey> = T extends unknown
	? Omit<T, K>
	: never;

export type SearchInputProps = OmitEach<
	InputProps,
	"value" | "onValueChange" | "onInput" | "trailing" | "leadingIconName"
> & {
	value: string;
	/** The new text, not the event — a search box only ever wants the string. */
	onValueChange: (value: string) => void;
};

/**
 * A text field for filtering a list: `Input` with the search glyph in front and
 * a clear button behind once there is text. Controlled — the caller owns the
 * query, because the caller is what filters on it.
 */
export function SearchInput(props: SearchInputProps): JSX.Element {
	let inputEl: HTMLInputElement | undefined;
	const [own, rest] = splitProps(props, [
		"value",
		"onValueChange",
		"ref",
		"class",
	]);
	return (
		<Input
			{...rest}
			type="search"
			class={clsx(styles.field, own.class)}
			leadingIconName={ICONS.search}
			value={own.value}
			ref={(el: HTMLInputElement) => {
				inputEl = el;
				const ref = own.ref;
				if (typeof ref === "function") ref(el);
			}}
			onValueChange={(event) => {
				own.onValueChange(event.currentTarget.value);
			}}
			trailing={
				<Show when={own.value !== ""}>
					<ClearSearchButton
						onClear={() => {
							own.onValueChange("");
							inputEl?.focus();
						}}
					/>
				</Show>
			}
		/>
	);
}

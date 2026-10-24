import clsx from "clsx";
import { Show, splitProps, type JSX } from "solid-js";

import { ICONS } from "../../icons.ts";
import type { DistributiveOmit } from "../../utils/types.ts";
import { Input, type InputProps } from "../Input/Input.tsx";

import { ClearSearchButton } from "./ClearSearchButton.tsx";
import styles from "./SearchInput.module.scss";

export type SearchInputProps = DistributiveOmit<
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
	let inputElement: HTMLInputElement | undefined;
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
			ref={(element: HTMLInputElement) => {
				inputElement = element;
				const reference = own.ref;
				if (typeof reference === "function") reference(element);
			}}
			onValueChange={(event) => {
				own.onValueChange(event.currentTarget.value);
			}}
			trailing={
				<Show when={own.value !== ""}>
					<ClearSearchButton
						onClear={() => {
							own.onValueChange("");
							inputElement?.focus();
						}}
					/>
				</Show>
			}
		/>
	);
}

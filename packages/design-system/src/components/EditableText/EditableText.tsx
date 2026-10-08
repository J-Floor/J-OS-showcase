import { Show, createSignal } from "solid-js";

import { Input } from "../Input/Input.tsx";
import { TextArea } from "../TextArea/TextArea.tsx";

export type EditableTextProps = {
	/** Current (server) value the field mirrors when not being edited. */
	value: string;
	/** Render a multiline `TextArea` instead of a single-line `Input`. */
	multiline?: boolean;
	placeholder?: string;
	/** Maximum number of characters the field accepts. */
	maxLength?: number;
	/** Called with the new value when the edit is committed (on blur), and only
	 * when the value actually changed. */
	onCommit: (value: string) => void;
};

/**
 * Inline text editor that mirrors a server value and commits on blur — the
 * edit-in-place convention used across tables and detail drawers. Local edits
 * live in a draft; committing per keystroke would refetch/re-render on every
 * character, so the value is written once on blur (and only if it changed).
 */
export function EditableText(props: EditableTextProps) {
	const [draft, setDraft] = createSignal<string | null>(null);
	function display(): string {
		const d = draft();
		return d ?? props.value;
	}
	function commit() {
		const v = draft();
		if (v === null || v === props.value) {
			setDraft(null);
			return;
		}
		props.onCommit(v);
		setDraft(null);
	}
	return (
		<Show
			when={props.multiline}
			fallback={
				<Input
					label=""
					placeholder={props.placeholder}
					maxLength={props.maxLength}
					value={display()}
					onValueChange={(e) => setDraft(e.currentTarget.value)}
					onBlur={commit}
				/>
			}
		>
			<TextArea
				label=""
				placeholder={props.placeholder}
				maxLength={props.maxLength}
				value={display()}
				onInput={setDraft}
				onBlur={commit}
			/>
		</Show>
	);
}

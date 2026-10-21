import { Status } from "@j-os/design-system";
import { Show, type JSX } from "solid-js";

/** A failed action, shown where the action happened. */
export function InlineError(props: {
	message: string | null | undefined;
}): JSX.Element {
	return (
		<Show when={props.message}>
			{(message) => (
				<Status status="error">
					<span role="alert">{message()}</span>
				</Status>
			)}
		</Show>
	);
}

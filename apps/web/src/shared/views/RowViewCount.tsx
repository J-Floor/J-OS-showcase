import { Show, type JSX } from "solid-js";

import { ViewCount } from "./ViewCount.tsx";

/** A sheet header's view badge: none on a create form or while the row
 *  loads (`viewKey` undefined, see `rowViewKey`). Keyed: prev/next swaps the
 *  row, and a plain Show callback would keep counting the first one
 *  (src/AGENTS.md:39). */
export function RowViewCount(props: {
	viewKey: string | undefined;
}): JSX.Element {
	return (
		<Show when={props.viewKey} keyed>
			{(key) => <ViewCount viewKey={key} />}
		</Show>
	);
}

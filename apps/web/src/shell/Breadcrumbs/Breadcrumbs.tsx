import { useLocation, A } from "@solidjs/router";
import { For, Show } from "solid-js";

import styles from "./Breadcrumbs.module.scss";

export function Breadcrumbs() {
	const location = useLocation();
	function segments() {
		return location.pathname.split("/").filter(Boolean);
	}
	return (
		<h1 class={styles.breadcrumbs}>
			<For each={segments()}>
				{(seg, index) => (
					<>
						<Show when={index() > 0}>
							<span class={styles.separator}>/</span>
						</Show>
						<A
							class={styles.crumb}
							href={
								"/" +
								segments()
									.slice(0, index() + 1)
									.join("/")
							}
						>
							{seg}
						</A>
					</>
				)}
			</For>
		</h1>
	);
}

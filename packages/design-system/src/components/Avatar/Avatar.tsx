import { Avatar as ArkAvatar } from "@ark-ui/solid/avatar";
import clsx from "clsx";
import { type JSX, Show } from "solid-js";

import styles from "./Avatar.module.scss";
import { initials } from "./initials.ts";

export type AvatarProps = {
	/** The person or entity the avatar represents. Drives the initials fallback
	 *  and the image `alt`. */
	name: string;
	/** Image URL. When it is absent or fails to load, the initials show instead. */
	src?: string;
	class?: string;
};

/**
 * A round person marker: an image when one is given, otherwise the person's
 * initials on a tinted circle. Sized by `font-size` (the circle is a multiple of
 * it, the initials a fraction), so one property scales the whole thing — a
 * consumer resizes it from CSS, not a size prop. Ported from EmboUI.
 */
export function Avatar(props: AvatarProps): JSX.Element {
	return (
		// The circle paints a surface tint behind the initials, so it declares
		// `data-surface` — the pinned-colour selector below explains why.
		<ArkAvatar.Root class={clsx(styles.avatar, props.class)} data-surface>
			<ArkAvatar.Fallback class={styles.fallback}>
				{initials(props.name)}
			</ArkAvatar.Fallback>
			<Show when={props.src}>
				{(src) => (
					<ArkAvatar.Image
						class={styles.image}
						src={src()}
						alt={props.name}
					/>
				)}
			</Show>
		</ArkAvatar.Root>
	);
}

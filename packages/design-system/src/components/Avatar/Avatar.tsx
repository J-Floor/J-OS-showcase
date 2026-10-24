import { Avatar as ArkAvatar } from "@ark-ui/solid/avatar";
import clsx from "clsx";
import { type JSX, Show, splitProps } from "solid-js";

import styles from "./Avatar.module.scss";
import { initials } from "./initials.ts";

export type AvatarProps = Omit<ArkAvatar.RootProps, "children"> &
	Pick<ArkAvatar.ImageProps, "src"> & {
		/** Who or what the avatar represents. */
		name: string;
	};

/**
 * A round marker for a named entity: the `src` image when one is given and
 * loads, otherwise the initials of `name` on a tinted circle. `name` is also
 * the image's `alt`. Sized by `font-size` (the circle is a multiple of it,
 * the initials a fraction), so one property scales the whole thing — a
 * consumer resizes it from CSS, not a size prop. Every other Ark root prop
 * reaches the root. Ported from EmboUI.
 */
export function Avatar(props: AvatarProps): JSX.Element {
	const [local, rest] = splitProps(props, ["name", "src", "class"]);
	return (
		// The circle paints a surface tint behind the initials, so it declares
		// `data-surface` — the pinned-colour selector below explains why.
		<ArkAvatar.Root
			{...rest}
			class={clsx(styles.avatar, local.class)}
			data-surface
		>
			<ArkAvatar.Fallback class={styles.fallback}>
				{initials(local.name)}
			</ArkAvatar.Fallback>
			<Show when={local.src}>
				{(source) => (
					<ArkAvatar.Image
						class={styles.image}
						src={source()}
						alt={local.name}
					/>
				)}
			</Show>
		</ArkAvatar.Root>
	);
}

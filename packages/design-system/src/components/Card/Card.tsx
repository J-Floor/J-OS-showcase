import { ark, type HTMLArkProps } from "@ark-ui/solid/factory";
import clsx from "clsx";
import type { JSX } from "solid-js";

import styles from "./Card.module.scss";

export type CardRootProps = HTMLArkProps<"div">;
export type CardHeaderProps = HTMLArkProps<"div">;
/** An `h3` by default; `asChild` renders another heading level. */
export type CardTitleProps = HTMLArkProps<"h3">;
export type CardDescriptionProps = HTMLArkProps<"p">;
export type CardActionProps = HTMLArkProps<"div">;
export type CardBodyProps = HTMLArkProps<"div">;
export type CardFooterProps = HTMLArkProps<"div">;

/** One Card part: `Element` with the caller's props, its own class merged
 *  with theirs, and `data-scope="card"` + `data-part` to find it by. */
function part<P extends { class?: string }>(
	Element: (props: P) => JSX.Element,
	name: string,
	className: string | undefined
) {
	return function CardPart(props: P): JSX.Element {
		return (
			<Element
				{...props}
				class={clsx(className, props.class)}
				data-scope="card"
				data-part={name}
			/>
		);
	};
}

/**
 * Content grouped on its own rounded, raised surface. Ported from EmboUI.
 * Every part is optional and renders its element with the caller's props;
 * `Header` lays `Title` and `Description` out with `Action` at their end.
 */
export const Card = {
	Root: part(ark.div, "root", styles.root),
	Header: part(ark.div, "header", styles.header),
	Title: part(ark.h3, "title", styles.title),
	Description: part(ark.p, "description", styles.description),
	Action: part(ark.div, "action", styles.action),
	Body: part(ark.div, "body", styles.body),
	Footer: part(ark.div, "footer", styles.footer),
};

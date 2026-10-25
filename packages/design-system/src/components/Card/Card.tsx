import { ark, type HTMLArkProps } from "@ark-ui/solid/factory";
import clsx from "clsx";
import { splitProps, type JSX } from "solid-js";

import { createHoverIntent } from "../../utils/hoverIntent.ts";
import {
	MorphScope,
	morphAttributes,
	useMorphTitle,
	type Morphable,
} from "../Morph/Morph.tsx";

import styles from "./Card.module.scss";

export type CardRootProps = HTMLArkProps<"div"> &
	Morphable & {
		/** The pointer rested on the card (`createHoverIntent`): a sign the
		 *  card is about to be opened, so whatever it opens can get ready. */
		onHoverIntent?: () => void;
	};
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

const RootPart = part(ark.div, "root", styles.root);
const TitlePart = part(ark.h3, "title", styles.title);

type PointerHandler = JSX.EventHandlerUnion<HTMLDivElement, PointerEvent>;
type PointerHandlerEvent = Parameters<
	JSX.EventHandler<HTMLDivElement, PointerEvent>
>[0];

/** Runs a Solid handler in either form: a function, or `[handler, data]`. */
function callPointerHandler(
	handler: PointerHandler | undefined,
	event: PointerHandlerEvent
): void {
	if (typeof handler === "function") {
		handler(event);
	} else if (handler) {
		handler[0](handler[1], event);
	}
}

function CardRoot(props: CardRootProps): JSX.Element {
	const [own, pointer, rest] = splitProps(
		props,
		["morphId", "onHoverIntent"],
		["onPointerEnter", "onPointerLeave"]
	);
	const hoverIntent = createHoverIntent(() => {
		own.onHoverIntent?.();
	});
	return (
		<MorphScope morphId={own.morphId}>
			<RootPart
				{...rest}
				{...morphAttributes(own)}
				onPointerEnter={(event: PointerHandlerEvent) => {
					callPointerHandler(pointer.onPointerEnter, event);
					if (own.onHoverIntent) hoverIntent.onPointerEnter(event);
				}}
				onPointerLeave={(event: PointerHandlerEvent) => {
					callPointerHandler(pointer.onPointerLeave, event);
					hoverIntent.onPointerLeave();
				}}
			/>
		</MorphScope>
	);
}

/** Inside a card with a `morphId` it marks itself as the card's title, so it
 *  flies into the title of the overlay the card opens. */
function CardTitle(props: CardTitleProps): JSX.Element {
	const title = useMorphTitle();
	return <TitlePart {...props} {...title()} />;
}

/**
 * Content grouped on its own rounded, raised surface. Ported from EmboUI.
 * Every part is optional and renders its element with the caller's props;
 * `Header` lays `Title` and `Description` out with `Action` at their end.
 */
export const Card = {
	Root: CardRoot,
	Header: part(ark.div, "header", styles.header),
	Title: CardTitle,
	Description: part(ark.p, "description", styles.description),
	Action: part(ark.div, "action", styles.action),
	Body: part(ark.div, "body", styles.body),
	Footer: part(ark.div, "footer", styles.footer),
};

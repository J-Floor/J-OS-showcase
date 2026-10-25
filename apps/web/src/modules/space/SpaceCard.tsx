import {
	Card,
	Deferred,
	Icon,
	SkeletonList,
	Tooltip,
} from "@j-os/design-system";
import {
	children,
	createContext,
	Show,
	type Accessor,
	type JSX,
} from "solid-js";

import {
	createPartSlot,
	useRequiredContext,
	type PartSlot,
} from "../../shared/compound.ts";
import { ICONS } from "../../shared/icons.ts";

import styles from "./SpaceCard.module.scss";

const DEFAULT_SKELETON_ROWS = 2;

type SpaceCardState = {
	loading: Accessor<boolean>;
	help: PartSlot<JSX.Element>;
};

const SpaceCardContext = createContext<SpaceCardState>();

function useSpaceCard(part: string): SpaceCardState {
	return useRequiredContext(SpaceCardContext, part, "SpaceCard.Root");
}

type SpaceCardRootProps = {
	/** The card's data is not here yet: the title stays, `SpaceCard.Skeleton`
	 *  shows as a "Loading" status, and the header action, body and note
	 *  wait. */
	loading?: boolean;
	children: JSX.Element;
};

function Root(props: SpaceCardRootProps): JSX.Element {
	const help = createPartSlot<JSX.Element>();
	return (
		<SpaceCardContext.Provider
			value={{ loading: () => props.loading === true, help }}
		>
			<Card.Root
				class={styles.card}
				asChild={(rootProps) => <section {...rootProps()} />}
			>
				{props.children}
			</Card.Root>
		</SpaceCardContext.Provider>
	);
}

type SpaceCardHeaderProps = {
	title: string;
	/** A short muted line under the title, inside the header block. */
	subtitle?: string;
	/** A `SpaceCard.Action`, at the end of the title row after the help
	 *  icon. */
	children?: JSX.Element;
};

function Header(props: SpaceCardHeaderProps): JSX.Element {
	const card = useSpaceCard("SpaceCard.Header");
	return (
		<Card.Header
			class={styles.header}
			asChild={(headerProps) => <header {...headerProps()} />}
		>
			<Card.Title
				class={styles.title}
				asChild={(titleProps) => <h2 {...titleProps()} />}
			>
				{props.title}
			</Card.Title>
			<Show when={props.subtitle}>
				<Card.Description>{props.subtitle}</Card.Description>
			</Show>
			<Card.Action class={styles.trailing}>
				<Show when={card.help.value()}>
					{(help) => (
						<Tooltip.Anchor
							label={help()}
							class={styles.help}
							triggerTabIndex={0}
						>
							<Icon>{ICONS.help}</Icon>
						</Tooltip.Anchor>
					)}
				</Show>
				{props.children}
			</Card.Action>
		</Card.Header>
	);
}

/** Content that waits while the card loads. */
function Loaded(props: { children: JSX.Element }): JSX.Element {
	const card = useSpaceCard("A SpaceCard part");
	return <Show when={!card.loading()}>{props.children}</Show>;
}

/** The header's control (e.g. an "Edit" button). Waits while the card loads. */
const Action = Loaded;

/** Hover-help for the title. Omit it and no help icon renders. Renders
 *  nothing itself: the header shows the icon. */
function Help(props: { children: JSX.Element }): JSX.Element {
	const card = useSpaceCard("SpaceCard.Help");
	card.help.fill(children(() => props.children));
	return null;
}

/** The centered body. Waits while the card loads. */
function Body(props: { children: JSX.Element }): JSX.Element {
	const card = useSpaceCard("SpaceCard.Body");
	return (
		<Show when={!card.loading()}>
			<Card.Body class={styles.body}>{props.children}</Card.Body>
		</Show>
	);
}

/** A status line under the body. Waits while the card loads. */
const Note = Loaded;

/** The body while the card loads: the given children, else a short list of
 *  bars, as a "Loading" status. */
function Skeleton(props: { children?: JSX.Element }): JSX.Element {
	const card = useSpaceCard("SpaceCard.Skeleton");
	return (
		<Show when={card.loading()}>
			<Card.Body class={styles.body}>
				<Deferred fallback={null}>
					<Show
						when={props.children}
						fallback={<SkeletonList rows={DEFAULT_SKELETON_ROWS} />}
					>
						{(skeleton) => (
							<div role="status" aria-label="Loading">
								{skeleton()}
							</div>
						)}
					</Show>
				</Deferred>
			</Card.Body>
		</Show>
	);
}

/**
 * The shared Space-page card shell, built on the design system's `Card`:
 * `Header` (title, optional subtitle, an `Action` at its end), an optional
 * `Help` tooltip on the title, a centered `Body`, an optional `Note` and the
 * `Skeleton` shown in the body's place while `Root` is loading.
 */
export const SpaceCard = { Root, Header, Action, Help, Body, Note, Skeleton };

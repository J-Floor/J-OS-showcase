/* eslint-disable max-lines -- one cohesive tab: slide actions, row, sortable list and toolbar share the same row store */
import {
	Badge,
	Button,
	EmptyState,
	IconButton,
	NumberInput,
	Select,
	Switch,
} from "@j-os/design-system";
import type { Transition } from "@j-os/tv-player";
import {
	closestCenter,
	createSortable,
	DragDropProvider,
	DragDropSensors,
	SortableProvider,
	type DragEvent,
} from "@thisbeyond/solid-dnd";
import { useMutation } from "convex-solidjs";
import {
	type Accessor,
	createComputed,
	createEffect,
	createSignal,
	For,
	Show,
	type JSX,
	on,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { api } from "../../../../convex/_generated/api";
import {
	TV_LIMITS,
	TV_MIGRATING_MESSAGE,
} from "../../../../convex/lib/tv/constants.ts";
import { call } from "../../../lib/call.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { createActionError } from "../../../shared/createActionError.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { createEntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";

import { ConfigXmlEditor } from "./ConfigXmlEditor.tsx";
import { DevicesCard } from "./DevicesCard.tsx";
import { durationProblem } from "./durationProblem.ts";
import { PackActions } from "./PackActions.tsx";
import { resolveReorder } from "./slideOrder.ts";
import { SlideSheet } from "./SlideSheet.tsx";
import type { Slide } from "./slideTypes.ts";
import { TvPreview } from "./TvPreview.tsx";
import styles from "./TvTab.module.scss";

const FAILED = "Could not update the TV. Try again.";

const TRANSITIONS = [
	{ value: "fade", label: "Fade" },
	{ value: "slide", label: "Slide" },
	{ value: "none", label: "None" },
] as const;

type TransitionValue = Transition;

function isTransition(value: string | undefined): value is TransitionValue {
	return TRANSITIONS.some((option) => option.value === value);
}

/** The actions of the slide list, each reporting its failure beside the list. */
function createSlideActions() {
	const updateSlide = useMutation(api.tvContent.updateConfigSlide);
	const moveSlide = useMutation(api.tvContent.moveConfigSlide);
	const reorderSlides = useMutation(api.tvContent.reorderConfigSlides);
	const deleteSlide = useMutation(api.tvContent.removeConfigSlide);
	const setTransition = useMutation(api.tv.setTransition);
	const confirm = useConfirm();
	const { error, trackResult } = createActionError();

	return {
		error,
		setEnabled: async (id: string, isEnabled: boolean): Promise<void> => {
			await trackResult(
				call(
					updateSlide.mutateAsync({ id, enabled: isEnabled }),
					FAILED
				)
			);
		},
		setDuration: async (
			id: string,
			durationSec: number
		): Promise<boolean> => {
			const result = await trackResult(
				call(updateSlide.mutateAsync({ id, durationSec }), FAILED)
			);
			return result.isOk();
		},
		move: async (id: string, direction: "up" | "down"): Promise<void> => {
			await trackResult(
				call(moveSlide.mutateAsync({ id, direction }), FAILED)
			);
		},
		reorder: async (ids: string[]): Promise<boolean> => {
			const result = await trackResult(
				call(reorderSlides.mutateAsync({ ids }), FAILED)
			);
			return result.isOk();
		},
		setTransition: async (transition: TransitionValue): Promise<void> => {
			await trackResult(
				call(setTransition.mutateAsync({ transition }), FAILED)
			);
		},
		remove: async (slide: Slide): Promise<void> => {
			const isConfirmed = await confirm({
				title: `Delete "${slide.title}"?`,
				message: "The slide is removed from the TV.",
				confirmLabel: "Delete",
				tone: "danger",
			});
			if (!isConfirmed) return;
			await trackResult(
				call(deleteSlide.mutateAsync({ id: slide._id }), FAILED)
			);
		},
	};
}

type SlideActions = ReturnType<typeof createSlideActions>;

/** A slide's seconds on screen: typed freely, saved when the field is left
 *  or Enter is pressed. A value that cannot be saved stays in the field with
 *  the reason beside it; a saved one is held until the list shows it, so the
 *  field does not flick back to the old number meanwhile. */
function DurationField(props: {
	seconds: number;
	title: string;
	onCommit: (seconds: number) => Promise<boolean>;
}): JSX.Element {
	const [draft, setDraft] = createSignal<string>();
	const [pending, setPending] = createSignal<number>();
	const [problem, setProblem] = createSignal<string | null>(null);
	createEffect(
		on(
			() => props.seconds,
			() => {
				setPending(undefined);
			},
			{ defer: true }
		)
	);
	function shown(): string {
		return draft() ?? String(pending() ?? props.seconds);
	}
	function commit(): void {
		const text = shown();
		const found = durationProblem(text);
		setProblem(found);
		if (found !== null) return;
		const value = Number(text);
		setDraft(undefined);
		if (value === (pending() ?? props.seconds)) return;
		setPending(value);
		void props.onCommit(value).then((isSaved) => {
			if (!isSaved) setPending(undefined);
		});
	}
	return (
		<NumberInput
			label={`Seconds on screen for ${props.title}`}
			labelHidden
			min={TV_LIMITS.durationMin}
			max={TV_LIMITS.durationMax}
			clampValueOnBlur={false}
			value={shown()}
			invalid={problem() !== null}
			errorText={problem() ?? undefined}
			onValueChange={(details) => {
				setDraft(details.value);
				setProblem(null);
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") commit();
			}}
			onFocusChange={(details) => {
				if (!details.focused) commit();
			}}
		/>
	);
}

/** The grip a row is dragged by. Only the grip starts a drag, so the
 *  duration field, the switch and the buttons in the row stay usable. */
function DragHandle(props: {
	title: string;
	activators: Record<string, (event: never) => void>;
}): JSX.Element {
	return (
		// The activators sit on a wrapper: IconButton's tooltip puts its own
		// pointer handlers on the button and would replace them there.
		<span class={styles.grip} {...props.activators}>
			<IconButton tooltipLabel={`Drag ${props.title} to reorder`}>
				{ICONS.reorder}
			</IconButton>
		</span>
	);
}

/** Move up and down for every slide; edit and delete only for the board's own. */
function RowButtons(props: {
	slide: Slide;
	isFirst: boolean;
	isLast: boolean;
	actions: SlideActions;
	onEdit: (slide: Slide) => void;
}): JSX.Element {
	return (
		<>
			<IconButton
				tooltipLabel={`Move ${props.slide.title} up`}
				disabled={props.isFirst}
				disabledReason="Already first"
				onClick={() => {
					void props.actions.move(props.slide._id, "up");
				}}
			>
				{ICONS.up}
			</IconButton>
			<IconButton
				tooltipLabel={`Move ${props.slide.title} down`}
				disabled={props.isLast}
				disabledReason="Already last"
				onClick={() => {
					void props.actions.move(props.slide._id, "down");
				}}
			>
				{ICONS.down}
			</IconButton>
			<Show when={!props.slide.fromEvent}>
				<IconButton
					tooltipLabel={`Edit ${props.slide.title}`}
					onClick={() => {
						props.onEdit(props.slide);
					}}
				>
					{ICONS.edit}
				</IconButton>
				<IconButton
					tooltipLabel={`Delete ${props.slide.title}`}
					onClick={() => props.actions.remove(props.slide)}
				>
					{ICONS.delete}
				</IconButton>
			</Show>
		</>
	);
}

/** One slide's row. It reads its slide live by id, so a refetch updates it
 *  in place and keeps what is being typed. An event's slide is the event's:
 *  only its delay and its place in the order are the board's to change. */
function SlideRow(props: {
	slide: Slide;
	isFirst: boolean;
	isLast: boolean;
	actions: SlideActions;
	onEdit: (slide: Slide) => void;
}): JSX.Element {
	// eslint-disable-next-line solid/reactivity -- solid-dnd takes a stable id at creation time; rows are keyed by _id
	const sortable = createSortable(props.slide._id);
	// A row at rest carries no transform, so it does not clip a tooltip or the
	// Select popup; the offset exists only while the list is being sorted.
	function isMoved(): boolean {
		return sortable.transform.x !== 0 || sortable.transform.y !== 0;
	}
	return (
		<li
			ref={sortable.ref}
			class={styles.row}
			classList={{ [styles.dragging]: sortable.isActiveDraggable }}
			style={{
				"--drag-x": isMoved()
					? `${String(sortable.transform.x)}px`
					: undefined,
				"--drag-y": isMoved()
					? `${String(sortable.transform.y)}px`
					: undefined,
			}}
		>
			<DragHandle
				title={props.slide.title}
				activators={sortable.dragActivators}
			/>
			<span class={styles.title}>{props.slide.title}</span>
			<Badge>{props.slide.kind === "html" ? "HTML" : "Image"}</Badge>
			<Show when={props.slide.isMissing}>
				<Badge>File missing</Badge>
			</Show>
			<Show when={props.slide.fromEvent}>
				<Badge>Auto-generated</Badge>
				<span class={styles.eventNote}>
					{`From event ${props.slide.eventName ?? "(deleted)"}`}
				</span>
			</Show>
			<DurationField
				seconds={props.slide.durationSec}
				title={props.slide.title}
				onCommit={(seconds) =>
					props.actions.setDuration(props.slide._id, seconds)
				}
			/>
			<Show when={!props.slide.fromEvent}>
				<Switch
					label="Shown"
					checked={props.slide.enabled}
					onCheckedChange={(details) => {
						void props.actions.setEnabled(
							props.slide._id,
							details.checked
						);
					}}
				/>
			</Show>
			<RowButtons
				slide={props.slide}
				isFirst={props.isFirst}
				isLast={props.isLast}
				actions={props.actions}
				onEdit={props.onEdit}
			/>
		</li>
	);
}

/** The slides as a list sorted by dragging a row's grip. A drop shows the new
 *  order at once and saves it; if the server refuses, the rows go back. */
function SortableSlideList(props: {
	rows: Slide[];
	showOrder: (ids: string[]) => void;
	reset: () => void;
	actions: SlideActions;
	onEdit: (slide: Slide) => void;
}): JSX.Element {
	function onDragEnd({ draggable, droppable }: DragEvent): void {
		if (!droppable) return;
		const current = props.rows.map((row) => row._id);
		const next = resolveReorder(
			current,
			String(draggable.id),
			String(droppable.id)
		);
		if (next === current) return;
		props.showOrder(next);
		void props.actions.reorder(next).then((isSaved) => {
			if (!isSaved) props.reset();
		});
	}
	return (
		<DragDropProvider
			onDragEnd={onDragEnd}
			collisionDetector={closestCenter}
		>
			<DragDropSensors>
				<SortableProvider ids={props.rows.map((row) => row._id)}>
					<ul class={styles.list}>
						<For each={props.rows}>
							{(row, index) => (
								<SlideRow
									slide={row}
									isFirst={index() === 0}
									isLast={index() === props.rows.length - 1}
									actions={props.actions}
									onEdit={props.onEdit}
								/>
							)}
						</For>
					</ul>
				</SortableProvider>
			</DragDropSensors>
		</DragDropProvider>
	);
}

/** Transition choice, Preview and Add slide. */
function TvToolbar(props: {
	transition: TransitionValue;
	canPreview: boolean;
	canEdit: boolean;
	/** The legacy list is not moved yet: there is nothing to preview either. */
	isMigrating: boolean;
	onTransition: (transition: TransitionValue) => void;
	onPreview: () => void;
	onAdd: () => void;
}): JSX.Element {
	return (
		<div class={styles.toolbar}>
			<Select.Root
				label="Transition"
				value={[props.transition]}
				onValueChange={(details) => {
					const [chosen] = details.value;
					if (isTransition(chosen)) props.onTransition(chosen);
				}}
			>
				<For each={TRANSITIONS}>
					{(option) => (
						<Select.Option value={option.value}>
							{option.label}
						</Select.Option>
					)}
				</For>
			</Select.Root>
			<Button
				variant="secondary"
				disabled={!props.canPreview}
				disabledReason={
					props.isMigrating
						? TV_MIGRATING_MESSAGE
						: "Show at least one slide to preview"
				}
				onClick={props.onPreview}
			>
				Preview
			</Button>
			<Button
				disabled={!props.canEdit}
				disabledReason={TV_MIGRATING_MESSAGE}
				onClick={props.onAdd}
			>
				Add slide
			</Button>
		</div>
	);
}

/** A store reconciled by id: a refetch hands over new row objects, and a
 *  `<For>` over them would rebuild every row (and drop a half-typed
 *  duration). Here each row keeps its identity and updates in place. */
function createSlideRows(source: Accessor<Slide[] | undefined>): {
	rows: Slide[];
	/** Shows `ids` as the order at once (a drop), until the next refetch. */
	showOrder: (ids: string[]) => void;
	/** Goes back to the server's order (a drop it refused). */
	reset: () => void;
} {
	const [rows, setRows] = createStore<Slide[]>([]);
	createComputed(() => {
		setRows(reconcile(source() ?? [], { key: "_id" }));
	});
	return {
		rows,
		showOrder: (ids) => {
			const byId = new Map(rows.map((row) => [row._id, row]));
			const ordered = ids.flatMap((id) => byId.get(id) ?? []);
			// Same ids, same objects: reconcile moves the rows, `<For>` keeps them.
			setRows(reconcile(ordered, { key: "_id" }));
		},
		reset: () => {
			setRows(reconcile(source() ?? [], { key: "_id" }));
		},
	};
}

/**
 * The board's TV console: the slides in show order (add, edit, reorder,
 * enable, delete), how slides change, a preview of what the TV shows, and the
 * connected TVs. Mounted by the Space page only while its tab is open.
 */
export function TvTab(): JSX.Element {
	const slides = useQuery(api.tvContent.listConfigSlides, {});
	const config = useQuery(api.tv.getConfig, {});
	const pack = useQuery(api.tvContent.getPackState, {});
	const actions = createSlideActions();
	const [previewing, setPreviewing] = createSignal(false);
	const selection = createEntitySelection<Slide>({
		// An event's slide is the event's to change: a link to one is a dead link.
		rows: () => slides.data()?.filter((slide) => !slide.fromEvent),
		param: "slide",
	});
	const { rows, showOrder, reset } = createSlideRows(slides.data);
	function isMigrating(): boolean {
		return pack.data()?.isAwaitingMigration === true;
	}

	return (
		<div class={styles.tab}>
			<TvToolbar
				canEdit={!isMigrating()}
				isMigrating={isMigrating()}
				transition={config.data()?.transition ?? "fade"}
				canPreview={rows.some((row) => row.enabled)}
				onTransition={(transition) => {
					void actions.setTransition(transition);
				}}
				onPreview={() => {
					setPreviewing(true);
				}}
				onAdd={() => {
					selection.openCreate();
				}}
			/>
			<InlineError message={actions.error()} />
			<PackActions state={pack.data} />
			<Show when={isMigrating()}>
				<EmptyState
					title="Moving the TV list"
					description={TV_MIGRATING_MESSAGE}
				/>
			</Show>
			<Show
				when={rows.length > 0}
				fallback={
					<Show when={slides.data() !== undefined && !isMigrating()}>
						<EmptyState
							title="No slides yet"
							description="Add an image or HTML slide to show on the TV."
						/>
					</Show>
				}
			>
				<SortableSlideList
					rows={rows}
					showOrder={showOrder}
					reset={reset}
					actions={actions}
					onEdit={selection.openRow}
				/>
			</Show>
			<ConfigXmlEditor state={pack.data} />
			<DevicesCard />
			<SlideSheet
				open={selection.open()}
				prebuild={selection.prebuild()}
				onOpenChange={(isOpen) => {
					if (!isOpen) selection.close();
				}}
				slideId={selection.shownId()}
			/>
			<TvPreview open={previewing()} onOpenChange={setPreviewing} />
		</div>
	);
}

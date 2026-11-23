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
import { useMutation } from "convex-solidjs";
import {
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
import type { Id } from "../../../../convex/_generated/dataModel";
import { TV_LIMITS } from "../../../../convex/lib/tv/constants.ts";
import { call } from "../../../lib/call.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { createActionError } from "../../../shared/createActionError.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { createEntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";

import { DevicesCard } from "./DevicesCard.tsx";
import { durationProblem } from "./durationProblem.ts";
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
	const updateSlide = useMutation(api.tv.updateSlide);
	const moveSlide = useMutation(api.tv.moveSlide);
	const deleteSlide = useMutation(api.tv.deleteSlide);
	const setTransition = useMutation(api.tv.setTransition);
	const confirm = useConfirm();
	const { error, trackResult } = createActionError();

	return {
		error,
		setEnabled: async (
			id: Id<"tvSlides">,
			isEnabled: boolean
		): Promise<void> => {
			await trackResult(
				call(
					updateSlide.mutateAsync({ id, enabled: isEnabled }),
					FAILED
				)
			);
		},
		setDuration: async (
			id: Id<"tvSlides">,
			durationSec: number
		): Promise<boolean> => {
			const result = await trackResult(
				call(updateSlide.mutateAsync({ id, durationSec }), FAILED)
			);
			return result.isOk();
		},
		move: async (
			id: Id<"tvSlides">,
			direction: "up" | "down"
		): Promise<void> => {
			await trackResult(
				call(moveSlide.mutateAsync({ id, direction }), FAILED)
			);
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

/** One slide's row. It reads its slide live by id, so a refetch updates it
 *  in place and keeps what is being typed. */
function SlideRow(props: {
	slide: Slide;
	isFirst: boolean;
	isLast: boolean;
	actions: SlideActions;
	onEdit: (slide: Slide) => void;
}): JSX.Element {
	return (
		<li class={styles.row}>
			<span class={styles.title}>{props.slide.title}</span>
			<Badge>{props.slide.kind === "html" ? "HTML" : "Image"}</Badge>
			<DurationField
				seconds={props.slide.durationSec}
				title={props.slide.title}
				onCommit={(seconds) =>
					props.actions.setDuration(props.slide._id, seconds)
				}
			/>
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
		</li>
	);
}

/** Transition choice, Preview and Add slide. */
function TvToolbar(props: {
	transition: TransitionValue;
	canPreview: boolean;
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
				disabledReason="Show at least one slide to preview"
				onClick={props.onPreview}
			>
				Preview
			</Button>
			<Button onClick={props.onAdd}>Add slide</Button>
		</div>
	);
}

/**
 * The board's TV console: the slides in show order (add, edit, reorder,
 * enable, delete), how slides change, a preview of what the TV shows, and the
 * connected TVs. Mounted by the Space page only while its tab is open.
 */
export function TvTab(): JSX.Element {
	const slides = useQuery(api.tv.listSlides, {});
	const config = useQuery(api.tv.getConfig, {});
	const actions = createSlideActions();
	const [previewing, setPreviewing] = createSignal(false);
	const selection = createEntitySelection<Slide>({
		rows: slides.data,
		param: "slide",
	});
	// A store reconciled by id: a refetch hands over new row objects, and a
	// `<For>` over them would rebuild every row (and drop a half-typed
	// duration). Here each row keeps its identity and updates in place.
	const [rows, setRows] = createStore<Slide[]>([]);
	createComputed(() => {
		setRows(reconcile(slides.data() ?? [], { key: "_id" }));
	});
	function hasEnabled(): boolean {
		return rows.some((row) => row.enabled);
	}

	return (
		<div class={styles.tab}>
			<TvToolbar
				transition={config.data()?.transition ?? "fade"}
				canPreview={hasEnabled()}
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
			<Show
				when={rows.length > 0}
				fallback={
					<Show when={slides.data() !== undefined}>
						<EmptyState
							title="No slides yet"
							description="Add an image or HTML slide to show on the TV."
						/>
					</Show>
				}
			>
				<ul class={styles.list}>
					<For each={rows}>
						{(row, index) => (
							<SlideRow
								slide={row}
								isFirst={index() === 0}
								isLast={index() === rows.length - 1}
								actions={actions}
								onEdit={selection.openRow}
							/>
						)}
					</For>
				</ul>
			</Show>
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

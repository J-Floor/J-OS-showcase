import {
	Accordion,
	Avatar,
	Button,
	DatePicker,
	Drawer,
	EditableText,
	Icon,
	Input,
	PropertyRow,
	TimePicker,
} from "@j-os/design-system";
import { useMutation, useQuery } from "convex-solidjs";
import { For, Show, createEffect, createSignal, on } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
	SITE_TIMEZONE,
	type ZonedValue,
	composeZoned,
	formatZoned,
	zonedDate,
	zonedTime,
} from "../../../convex/lib/time.ts";
import { NAME_MAX } from "../../../convex/lib/validate.ts";
import { Can, useAbility } from "../../lib/ability.tsx";
import { useConfirm } from "../../shared/confirm.tsx";
import { EntityQrBlock } from "../../shared/entity/EntityQr.tsx";
import { ICONS } from "../../shared/icons.ts";
import { EditToggle } from "../community/drawers/EditToggle.tsx";

import { eventsEntity } from "./entity.ts";
import styles from "./EventDrawer.module.scss";

/** The zoned IXDTF source for an event's start/end. Required on the schema (the
 *  prod backfill populated every row and `createEvent` always writes both), so
 *  these are plain field reads — named for the call sites that compose/display
 *  them below. */
function startLocal(event: Doc<"events">): string {
	return event.startsAtLocal;
}
function endLocal(event: Doc<"events">): string {
	return event.endsAtLocal;
}

/**
 * Placeholder field layout passed to `Drawer.Body`'s `skeleton` while
 * `loading` is true — an open row whose data hasn't arrived yet. Shaped like
 * the loaded accordion (labelled rows under a "Details" section) so the
 * measured shimmer has leaves matching that shape; literal "placeholder"
 * text, never real or create-form copy.
 */
function EventFieldsPlaceholder() {
	return (
		<Accordion.Root multiple defaultValue={["details"]}>
			<Accordion.Item value="details">
				<Accordion.ItemTitle>Details</Accordion.ItemTitle>
				<Accordion.ItemContent>
					<div class={styles.section}>
						<PropertyRow icon={ICONS.name} label="Name">
							<span>placeholder</span>
						</PropertyRow>
						<PropertyRow icon={ICONS.start} label="Starts">
							<span>placeholder</span>
						</PropertyRow>
						<PropertyRow icon={ICONS.end} label="Ends">
							<span>placeholder</span>
						</PropertyRow>
					</div>
				</Accordion.ItemContent>
			</Accordion.Item>
		</Accordion.Root>
	);
}

/**
 * One drawer for creating and viewing/editing an event, styled like the
 * community person drawer: an accordion of `PropertyRow`s, a padlock
 * `EditToggle` in the header (fields autosave — no Save button), and the
 * board-only visitor QR + attendee list.
 *
 * Create mode (`event === undefined && !loading`) is reached only from the
 * page's `create`-gated button. Loading mode (`loading`, `event` still
 * undefined) shows the `Drawer.Title`/`Drawer.Body` skeleton
 * ({@link EventFieldsPlaceholder}) instead — the drawer is open for a real
 * row whose data hasn't arrived yet, and must not be mistaken for create.
 * Detail mode shows name + dates to any member; the visitor
 * QR/copy/download, the attendee list, editing and delete are all
 * `manage`/`Events` (board/admin) only.
 */
export function EventDrawer(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	event?: Doc<"events">;
	/** True when the drawer is open for a real row (`selectedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `event` (which is undefined in both states). */
	loading?: boolean;
}) {
	const ability = useAbility();
	function canManage(): boolean {
		return ability().can("manage", "Events");
	}

	const createEvent = useMutation(api.events.createEvent);
	const updateEvent = useMutation(api.events.updateEvent);
	const deleteEvent = useMutation(api.events.deleteEvent);
	const confirm = useConfirm();

	const attendees = useQuery(
		api.events.listEventAttendees,
		() => ({ eventId: props.event?._id as Id<"events"> }),
		() => ({ enabled: props.event !== undefined && canManage() })
	);

	const [editing, setEditing] = createSignal(false);
	const [name, setName] = createSignal("");
	const [startsAt, setStartsAt] = createSignal<string | null>(null);
	const [endsAt, setEndsAt] = createSignal<string | null>(null);
	const [startTime, setStartTime] = createSignal("00:01");
	const [endTime, setEndTime] = createSignal("23:59");
	const [submitting, setSubmitting] = createSignal(false);
	// Controlled + onValueChange so the sections actually collapse (matches
	// community's PersonDetail). A bare `value` with no setter pins them open.
	const [openSections, setOpenSections] = createSignal([
		"details",
		"visitor",
		"attendees",
	]);

	// Fresh create form + locked fields on a drawer OPEN or a switch to a
	// different event — keyed on `open` + the event id, NOT the event object, so
	// a live-query refetch after an autosaved edit doesn't re-lock the fields
	// mid-edit.
	createEffect(
		on(
			() => [props.open, props.event?._id] as const,
			([open]) => {
				if (!open) return;
				setEditing(false);
				if (props.event === undefined) {
					setName("");
					setStartsAt(null);
					setEndsAt(null);
					setStartTime("00:01");
					setEndTime("23:59");
				}
			}
		)
	);

	/**
	 * Composes the create form's date + time signals into Zurich-zoned
	 * instants, or `null` while either date is unset. Reads the signals
	 * directly (not memoised) so callers stay reactive when called from a
	 * tracked scope, matching the previous `dateTimeToMs`-per-call style.
	 */
	function composedRange(): { start: ZonedValue; end: ZonedValue } | null {
		const sd = startsAt();
		const ed = endsAt();
		if (sd === null || ed === null) return null;
		return {
			start: composeZoned(sd, startTime(), SITE_TIMEZONE),
			end: composeZoned(ed, endTime(), SITE_TIMEZONE),
		};
	}

	function canSubmit(): boolean {
		if (name().trim() === "") return false;
		const range = composedRange();
		return range !== null && range.start.utc <= range.end.utc;
	}

	/**
	 * The create button's disabled explanation. `canSubmit` above returns
	 * false both when name/dates are missing AND when a fully-specified
	 * start/end is inverted (start after end) — those need distinct copy, or
	 * the missing-fields message reads as false once both dates are set.
	 */
	function disabledReason(): string {
		if (name().trim() === "") return "Add a name and both dates first";
		const range = composedRange();
		if (range === null) return "Add a name and both dates first";
		if (range.start.utc > range.end.utc)
			return "The start must be on or before the end.";
		return "Add a name and both dates first";
	}

	async function submit(): Promise<void> {
		const range = composedRange();
		if (
			name().trim() === "" ||
			range === null ||
			range.start.utc > range.end.utc ||
			submitting()
		)
			return;
		setSubmitting(true);
		try {
			await createEvent.mutateAsync({
				name: name().trim(),
				startsAtLocal: range.start.local,
				endsAtLocal: range.end.local,
			});
			props.onOpenChange(false);
		} finally {
			setSubmitting(false);
		}
	}

	function onSubmit(e: SubmitEvent): void {
		e.preventDefault();
		void submit();
	}

	async function remove(event: Doc<"events">): Promise<void> {
		const ok = await confirm({
			title: "Delete event?",
			message: "This removes the event and its attendance records.",
			confirmLabel: "Delete",
			tone: "danger",
		});
		if (!ok) return;
		await deleteEvent.mutateAsync({ eventId: event._id });
		props.onOpenChange(false);
	}

	return (
		<Drawer.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Drawer.Header>
				<Drawer.Title loading={props.loading}>
					{props.event ? props.event.name : "New event"}
				</Drawer.Title>
				<Drawer.HeaderActions>
					<Show
						when={
							!props.loading &&
							props.event !== undefined &&
							canManage()
						}
					>
						<EditToggle
							editing={editing()}
							enabled={props.open}
							onToggle={() => setEditing((e) => !e)}
						/>
					</Show>
					<Drawer.Close />
				</Drawer.HeaderActions>
			</Drawer.Header>

			<Drawer.Body
				loading={props.loading}
				skeleton={<EventFieldsPlaceholder />}
			>
				<Show
					when={props.event}
					fallback={
						<Can I="create" the="Events">
							<form
								id="event-create-form"
								class={styles.form}
								onSubmit={onSubmit}
							>
								<Input
									label="Name"
									maxLength={NAME_MAX}
									required
									value={name()}
									onInput={(e) => {
										setName(e.currentTarget.value);
									}}
								/>
								<div class={styles.fieldRow}>
									<DatePicker
										label="Starts"
										value={startsAt()}
										onValueChange={setStartsAt}
									/>
									<TimePicker
										label="Start time (Zurich)"
										value={startTime()}
										onValueChange={(v) => {
											setStartTime(v ?? "00:01");
										}}
									/>
								</div>
								<div class={styles.fieldRow}>
									<DatePicker
										label="Ends"
										value={endsAt()}
										onValueChange={setEndsAt}
									/>
									<TimePicker
										label="End time (Zurich)"
										value={endTime()}
										onValueChange={(v) => {
											setEndTime(v ?? "23:59");
										}}
									/>
								</div>
								<p class={styles.hint}>
									Times are Europe/Zurich (the space),
									wherever you're editing from.
								</p>
							</form>
						</Can>
					}
				>
					{(event) => (
						<Accordion.Root
							multiple
							value={openSections()}
							onValueChange={(details) => {
								setOpenSections(details.value);
							}}
						>
							<Accordion.Item value="details">
								<Accordion.ItemTitle>
									Details
								</Accordion.ItemTitle>
								<Accordion.ItemContent>
									<div class={styles.section}>
										<PropertyRow
											icon={ICONS.name}
											label="Name"
										>
											<Show
												when={editing()}
												fallback={
													<span>{event().name}</span>
												}
											>
												<EditableText
													value={event().name}
													maxLength={NAME_MAX}
													onCommit={(v) => {
														void updateEvent.mutateAsync(
															{
																eventId:
																	event()._id,
																name: v,
															}
														);
													}}
												/>
											</Show>
										</PropertyRow>
										<PropertyRow
											icon={ICONS.start}
											label="Starts"
										>
											<Show
												when={editing()}
												fallback={
													<span>
														{formatZoned(
															startLocal(event())
														)}
													</span>
												}
											>
												<div class={styles.fieldRow}>
													<DatePicker
														value={zonedDate(
															startLocal(event())
														)}
														onValueChange={(
															iso
														) => {
															if (!iso) return;
															const composed =
																composeZoned(
																	iso,
																	zonedTime(
																		startLocal(
																			event()
																		)
																	),
																	SITE_TIMEZONE
																);
															if (
																composed.utc <=
																event().endsAt
															)
																void updateEvent.mutateAsync(
																	{
																		eventId:
																			event()
																				._id,
																		startsAtLocal:
																			composed.local,
																	}
																);
														}}
													/>
													<TimePicker
														label="Start time (Zurich)"
														value={zonedTime(
															startLocal(event())
														)}
														onValueChange={(
															time
														) => {
															if (!time) return;
															const composed =
																composeZoned(
																	zonedDate(
																		startLocal(
																			event()
																		)
																	),
																	time,
																	SITE_TIMEZONE
																);
															if (
																composed.utc <=
																event().endsAt
															)
																void updateEvent.mutateAsync(
																	{
																		eventId:
																			event()
																				._id,
																		startsAtLocal:
																			composed.local,
																	}
																);
														}}
													/>
												</div>
											</Show>
										</PropertyRow>
										<PropertyRow
											icon={ICONS.end}
											label="Ends"
										>
											<Show
												when={editing()}
												fallback={
													<span>
														{formatZoned(
															endLocal(event())
														)}
													</span>
												}
											>
												<div class={styles.fieldRow}>
													<DatePicker
														value={zonedDate(
															endLocal(event())
														)}
														onValueChange={(
															iso
														) => {
															if (!iso) return;
															const composed =
																composeZoned(
																	iso,
																	zonedTime(
																		endLocal(
																			event()
																		)
																	),
																	SITE_TIMEZONE
																);
															if (
																composed.utc >=
																event().startsAt
															)
																void updateEvent.mutateAsync(
																	{
																		eventId:
																			event()
																				._id,
																		endsAtLocal:
																			composed.local,
																	}
																);
														}}
													/>
													<TimePicker
														label="End time (Zurich)"
														value={zonedTime(
															endLocal(event())
														)}
														onValueChange={(
															time
														) => {
															if (!time) return;
															const composed =
																composeZoned(
																	zonedDate(
																		endLocal(
																			event()
																		)
																	),
																	time,
																	SITE_TIMEZONE
																);
															if (
																composed.utc >=
																event().startsAt
															)
																void updateEvent.mutateAsync(
																	{
																		eventId:
																			event()
																				._id,
																		endsAtLocal:
																			composed.local,
																	}
																);
														}}
													/>
												</div>
											</Show>
										</PropertyRow>
									</div>
								</Accordion.ItemContent>
							</Accordion.Item>

							<Show when={canManage()}>
								<Accordion.Item value="visitor">
									<Accordion.ItemTitle>
										QR &amp; link
									</Accordion.ItemTitle>
									<Accordion.ItemContent>
										<EntityQrBlock
											{...eventsEntity.qr!(event())}
										/>
									</Accordion.ItemContent>
								</Accordion.Item>

								<Accordion.Item value="attendees">
									<Accordion.ItemTitle
										subtitle={`${(attendees.data() ?? []).length}`}
									>
										Attendees
									</Accordion.ItemTitle>
									<Accordion.ItemContent>
										<div class={styles.section}>
											<Show
												when={
													(attendees.data() ?? [])
														.length > 0
												}
												fallback={
													<p class={styles.empty}>
														No one has registered
														yet.
													</p>
												}
											>
												<ul class={styles.attendees}>
													<For
														each={
															attendees.data() ??
															[]
														}
													>
														{(a) => (
															<li
																class={
																	styles.attendee
																}
															>
																<Avatar
																	name={
																		a.name
																	}
																/>
																<div
																	class={
																		styles.who
																	}
																>
																	<span
																		class={
																			styles.attendeeName
																		}
																	>
																		{a.name}
																	</span>
																	<span
																		class={
																			styles.attendeeEmail
																		}
																	>
																		{
																			a.email
																		}
																	</span>
																</div>
															</li>
														)}
													</For>
												</ul>
											</Show>
										</div>
									</Accordion.ItemContent>
								</Accordion.Item>
							</Show>
						</Accordion.Root>
					)}
				</Show>
			</Drawer.Body>

			<Show when={!props.loading}>
				<Show
					when={props.event === undefined}
					fallback={
						<Show when={canManage() && props.event} keyed>
							{(event) => (
								<Drawer.Footer>
									<Button
										variant="tertiary"
										onClick={() => remove(event)}
									>
										<Icon>{ICONS.delete}</Icon> Delete event
									</Button>
								</Drawer.Footer>
							)}
						</Show>
					}
				>
					<Can I="create" the="Events">
						<Drawer.Footer>
							<Button
								type="submit"
								form="event-create-form"
								disabled={!canSubmit()}
								disabledReason={disabledReason()}
								isLoading={submitting()}
							>
								Create
							</Button>
						</Drawer.Footer>
					</Can>
				</Show>
			</Show>
		</Drawer.Root>
	);
}

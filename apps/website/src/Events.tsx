import { For, Show } from "solid-js";

import {
	eventDate,
	eventGroups,
	events,
	eventState,
	eventTime,
	type HouseEvent,
} from "./content.ts";
import styles from "./Website.module.scss";
const MAX_ENTRANCE_ROWS = 3;
function EventRow(props: { event: HouseEvent; now: number; order?: number }) {
	function status() {
		return eventState(props.event, props.now);
	}
	function destination() {
		if (status() === "Registration open") return props.event.registration;
		return status() === "Past event" ? props.event.recap : undefined;
	}
	return (
		<li
			class={styles.eventRow}
			data-entrance={props.order === undefined ? undefined : "row"}
			data-order={props.order}
		>
			<div class={styles.eventDate}>
				<time dateTime={props.event.start}>
					{eventDate(props.event.start)}
				</time>
				<span>
					{eventTime(props.event.start)}–{eventTime(props.event.end)}
					<br />
					Zurich time
				</span>
			</div>
			<div>
				<p class={styles.label}>
					{props.event.format} ·{" "}
					{props.event.sample ? "Sample" : "Event"}
				</p>
				<h4>{props.event.title}</h4>
				<p>{props.event.description}</p>
				<p class={styles.eligibility}>{props.event.eligibility}</p>
			</div>
			<div class={styles.eventAction}>
				<span>{status()}</span>
				<Show when={destination()}>
					{(url) => (
						<a href={url()}>
							{status() === "Past event"
								? "Sample recap ↗"
								: "Sample registration ↗"}
						</a>
					)}
				</Show>
			</div>
		</li>
	);
}
export function Events(props: { now: number }) {
	function groups() {
		return eventGroups(events, props.now);
	}
	return (
		<section
			id="events"
			class={styles.section}
			aria-labelledby="events-title"
		>
			<div class={styles.sectionIntro} data-entrance="heading">
				<p class={styles.label}>Come into the conversation</p>
				<h2 id="events-title">
					Good things happen
					<br />
					when people gather.
				</h2>
				<p>
					Ideas shared in person. New perspectives. A reason to come
					back.
				</p>
			</div>
			<p class={styles.demoNotice}>
				Demo events · All listings below are samples, not scheduled
				gatherings. Registration and recap links lead to example.com.
			</p>
			<h3 class={styles.groupTitle}>Upcoming</h3>
			<Show
				when={groups().upcoming.length}
				fallback={
					<p>
						No upcoming events. Explore recent highlights or{" "}
						<a href="/contact">get in touch</a>.
					</p>
				}
			>
				<ul class={styles.eventList}>
					<For each={groups().upcoming}>
						{(event, index) => (
							<EventRow
								event={event}
								now={props.now}
								order={
									index() < MAX_ENTRANCE_ROWS
										? index()
										: undefined
								}
							/>
						)}
					</For>
				</ul>
			</Show>
			<h3 class={styles.groupTitle}>Recent highlights</h3>
			<ul class={styles.eventList}>
				<For each={groups().recent}>
					{(event) => <EventRow event={event} now={props.now} />}
				</For>
			</ul>
		</section>
	);
}

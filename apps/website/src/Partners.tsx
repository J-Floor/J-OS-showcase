import { For, Show } from "solid-js";

import styles from "./Partners.module.scss";
import {
	partnerGroups,
	partners,
	type Partner,
	type PartnerGroup,
} from "./partners.ts";

function Logo(props: { partner: Partner }) {
	return (
		<li
			class={styles.item}
			style={{
				"--logo-width": props.partner.opticalWidth,
				"--logo-height": props.partner.opticalHeight,
			}}
		>
			<a
				href={props.partner.url}
				aria-label={props.partner.name}
				title={props.partner.name}
			>
				<img
					src={`/assets/partners/${props.partner.file}`}
					alt={props.partner.name}
					width="180"
					height="72"
					loading="lazy"
				/>
				<Show when={props.partner.name === "Claude Builder Club"}>
					<span class={styles.caption}>{props.partner.name}</span>
				</Show>
			</a>
		</li>
	);
}

function Group(props: { group: PartnerGroup }) {
	function items() {
		return partners.filter((partner) => partner.group === props.group);
	}
	function label() {
		return partnerGroups.find((group) => group.id === props.group)!.label;
	}
	return (
		<section
			class={styles.group}
			data-group={props.group}
			aria-labelledby={`partners-${props.group}`}
		>
			<h4 id={`partners-${props.group}`} class={styles.groupTitle}>
				{label()}
			</h4>
			<ul class={styles.grid}>
				<For each={items()}>
					{(partner) => <Logo partner={partner} />}
				</For>
			</ul>
		</section>
	);
}

export function Partners() {
	return (
		<section
			id="partners"
			class={styles.section}
			aria-labelledby="partners-title"
		>
			<div class={styles.heading}>
				<div>
					<p class={styles.eyebrow}>The people behind the momentum</p>
					<h3 id="partners-title">Supported by a shared ambition.</h3>
				</div>
				<p>
					Sponsors, contributors, and event partners helping bring
					Zurich’s builders together.
				</p>
			</div>
			<div class={styles.groups}>
				<For each={partnerGroups}>
					{(group) => <Group group={group.id} />}
				</For>
			</div>
		</section>
	);
}

import { EmptyState, Highlight } from "@j-os/design-system";
import { For, Show, createMemo, type JSX } from "solid-js";

import { filterRules } from "./filterRules.ts";
import styles from "./HouseRules.module.scss";
import { RULES, isStrong, type RuleSegment } from "./rulesContent.ts";

/**
 * The house rules as cards, one per rule, grouped under their section. Shared
 * by the Space "Rules" tab and the onboarding rules step. The caller owns the
 * search box and passes its text in; matches are marked with `Highlight`.
 */
export function HouseRules(props: { query: string }): JSX.Element {
	// filterRules trims too (it stands alone); this copy feeds the highlight and empty state.
	function query(): string {
		return props.query.trim();
	}
	const sections = createMemo(() => filterRules(RULES, query()));
	return (
		<Show
			when={sections().length > 0}
			fallback={
				<EmptyState
					icon="search_off"
					title={`No rules match "${query()}"`}
				/>
			}
		>
			<div class={styles.sections}>
				<For each={sections()}>
					{(section) => (
						<section class={styles.section}>
							<h2 class={styles.heading}>
								<Highlight
									text={section.heading}
									query={query()}
								/>
							</h2>
							<ul role="list" class={styles.grid}>
								<For each={section.rules}>
									{(rule) => (
										<li class={styles.card}>
											<For each={rule}>
												{(segment) => (
													<Segment
														segment={segment}
														query={query()}
													/>
												)}
											</For>
										</li>
									)}
								</For>
							</ul>
						</section>
					)}
				</For>
			</div>
		</Show>
	);
}

function Segment(props: { segment: RuleSegment; query: string }): JSX.Element {
	function plain(): string {
		return isStrong(props.segment) ? "" : props.segment;
	}
	return (
		<Show
			when={isStrong(props.segment) && props.segment}
			fallback={<Highlight text={plain()} query={props.query} />}
		>
			{(bold) => (
				<strong>
					<Highlight text={bold().strong} query={props.query} />
				</strong>
			)}
		</Show>
	);
}

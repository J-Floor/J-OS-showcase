import { For, Match, Show, Switch } from "solid-js";

import { PRIVACY_META, PRIVACY_SECTIONS } from "./content.ts";
import styles from "./PrivacyPolicy.module.scss";

/**
 * Public, full-screen `/privacy` page (no app shell, no auth gate): anyone who
 * gives us data must be able to read it first (nDSG art. 19). Linked under the
 * public forms, in the emails they trigger, from the onboarding document step
 * and from the landing-page footer.
 */
export function PrivacyPolicy() {
	return (
		<main class={styles.main}>
			<article class={styles.doc}>
				<header class={styles.head}>
					<h1 class={styles.title}>Privacy policy</h1>
					<dl class={styles.meta}>
						<dt>Controller</dt>
						<dd>{PRIVACY_META.org}</dd>
						<dt>Governing law</dt>
						<dd>{PRIVACY_META.governingLaw}</dd>
						<dt>Last updated</dt>
						<dd>{PRIVACY_META.updated}</dd>
					</dl>
				</header>
				<For each={PRIVACY_SECTIONS}>
					{(section) => (
						<section class={styles.section}>
							<h2 class={styles.heading}>{section.heading}</h2>
							<For each={section.blocks}>
								{(block) => (
									<Switch>
										<Match
											when={
												block.kind === "list" && block
											}
										>
											{(list) => (
												<ul class={styles.list}>
													<For each={list().items}>
														{(item) => (
															<li>{item}</li>
														)}
													</For>
												</ul>
											)}
										</Match>
										<Match
											when={block.kind === "p" && block}
										>
											{(p) => (
												<p class={styles.para}>
													<Show when={p().lead}>
														<strong>
															{p().lead}
														</strong>{" "}
													</Show>
													{p().text}
												</p>
											)}
										</Match>
									</Switch>
								)}
							</For>
						</section>
					)}
				</For>
			</article>
		</main>
	);
}

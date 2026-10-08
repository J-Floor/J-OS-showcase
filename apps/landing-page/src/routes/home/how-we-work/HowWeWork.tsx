import { For } from "solid-js";

import styles from "./HowWeWork.module.scss";

type Principle = {
	eyebrow: string;
	title: string;
	paragraphs: [string, string];
};

const PRINCIPLES: Principle[] = [
	{
		eyebrow: "INTUITIVE",
		title: "Start With Action",
		paragraphs: [
			"You don’t wait for the perfect moment, you move. From day one, you’re surrounded by founders in motion.",
			"We don’t just welcome momentum, we reward it. The first step is showing up and building something.",
		],
	},
	{
		eyebrow: "SCALABLE",
		title: "Ship, Learn, Repeat",
		paragraphs: [
			"No pitch decks without products. No ideas without iterations. Everyone here is in motion.",
			"Whether you’re launching V1 or scaling V10, you’ll find builders who push you to stay honest and move faster.",
		],
	},
	{
		eyebrow: "STRATEGY",
		title: "Built Different, Together",
		paragraphs: [
			"This isn’t a passive Slack group. It’s a space designed to help you move with purpose.",
			"From quiet desk time to loud launch parties, everything we do is rooted in real work and shipping.",
		],
	},
];

/** "How we work" section: a mono heading pair over three principle cards
 * (eyebrow label, title, two short paragraphs each). */
export function HowWeWork() {
	return (
		<section class={styles.section}>
			<div class={styles.header}>
				<h2 class={styles.heading}>Built for the Ones Who Ship</h2>
				<p class={styles.subheading}>
					How We Work, Grow, and get Things Done
				</p>
			</div>
			<div class={styles.cards}>
				<For each={PRINCIPLES}>
					{(principle) => (
						<article class={styles.card}>
							<span class={styles.eyebrow}>
								{principle.eyebrow}
							</span>
							<h3 class={styles.title}>{principle.title}</h3>
							<p class={styles.body}>{principle.paragraphs[0]}</p>
							<p class={styles.body}>{principle.paragraphs[1]}</p>
						</article>
					)}
				</For>
			</div>
		</section>
	);
}

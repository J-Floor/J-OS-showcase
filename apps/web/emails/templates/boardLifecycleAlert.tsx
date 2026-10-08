import { Link, Heading } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	/** What the nightly check found, in one sentence. */
	headline: string;
	/**
	 * Placeholder for the per-person list; build.ts fills it from the `rows`
	 * list field (one escaped paragraph per person). Empty on the all-clear.
	 */
	rows: string;
	communityUrl: string;
	manageUrl: string;
	logoUrl: string;
};

/**
 * People whose lifecycle state disagrees with their data. The board opens the
 * list from here and goes straight to each person's drawer.
 */
export function Template({
	headline,
	rows,
	communityUrl,
	manageUrl,
	logoUrl,
}: Props) {
	return (
		<EmailLayout preview={headline} logoUrl={logoUrl} manageUrl={manageUrl}>
			<Heading style={styles.heading}>{headline}</Heading>
			<div style={styles.text}>{rows}</div>
			<Link href={communityUrl} style={styles.button}>
				Open the community page
			</Link>
		</EmailLayout>
	);
}

import { Heading, Link } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	heading: string;
	/** Placeholder for the item list; build.ts fills it from the `items`
	 *  list field (one escaped paragraph per notification). */
	items: string;
	appUrl: string;
	manageUrl: string;
	logoUrl: string;
};

/** One person's notifications since their last digest. */
export function Template({
	heading,
	items,
	appUrl,
	manageUrl,
	logoUrl,
}: Props) {
	return (
		<EmailLayout preview={heading} logoUrl={logoUrl} manageUrl={manageUrl}>
			<Heading style={styles.heading}>{heading}</Heading>
			<div style={styles.text}>{items}</div>
			<Link href={appUrl} style={styles.button}>
				Open J floor
			</Link>
		</EmailLayout>
	);
}

// apps/web/emails/EmailLayout.tsx
import {
	Body,
	Container,
	Head,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Text,
} from "jsx-email";
import type React from "react";

import { palette, styles } from "./theme.ts";

export type LayoutProps = {
	/** Inbox preview snippet (hidden in the body). */
	preview: string;
	/** Absolute logo URL — injected at runtime from SITE_URL. */
	logoUrl: string;
	/** Absolute "Manage notifications" link. Notification emails only:
	 *  transactional mail has nothing to opt out of. */
	manageUrl?: string;
	children: React.ReactNode;
};

/**
 * Shared email shell: light background, left-aligned ~480px column, PNG logo
 * header (links to the site), a muted footer. No media queries — identical on
 * every client.
 */
export function EmailLayout({
	preview,
	logoUrl,
	manageUrl,
	children,
}: LayoutProps) {
	return (
		<Html lang="en">
			<Head />
			<Preview>{preview}</Preview>
			<Body style={styles.body}>
				<Container style={styles.container}>
					<Section>
						<Img src={logoUrl} alt="J floor" style={styles.logo} />
					</Section>
					{children}
					<Hr style={styles.hr} />
					<Text style={styles.footer}>
						J floor ·{" "}
						<Link
							href="https://thejfloor.com"
							style={{ color: palette.fgMuted }}
						>
							thejfloor.com
						</Link>
						{manageUrl ? (
							<>
								{" "}
								·{" "}
								<Link
									href={manageUrl}
									style={{ color: palette.fgMuted }}
								>
									Manage notifications
								</Link>
							</>
						) : null}
					</Text>
				</Container>
			</Body>
		</Html>
	);
}

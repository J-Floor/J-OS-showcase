import { Accordion, PropertyRow } from "@j-os/design-system";

import { ICONS } from "../../../shared/icons.ts";

/**
 * Placeholder field layout passed to `Drawer.Body`'s `skeleton` while the
 * roster is still loading — a deep link can open the drawer before the
 * roster query has answered. Shaped like the loaded `PersonDetail` (its
 * Status/Info/Notes/History sections, with a handful of `PropertyRow`s
 * under Info) so the measured shimmer has leaves matching that shape;
 * literal "placeholder" text, never real profile data.
 */
export function PersonDetailPlaceholder() {
	return (
		<Accordion.Root
			multiple
			lazyMount
			defaultValue={["status", "info", "notes"]}
		>
			<Accordion.Item value="status">
				<Accordion.ItemTitle>Status</Accordion.ItemTitle>
				<Accordion.ItemContent>
					<PropertyRow icon={ICONS.info} label="Status">
						<span>placeholder</span>
					</PropertyRow>
				</Accordion.ItemContent>
			</Accordion.Item>
			<Accordion.Item value="info">
				<Accordion.ItemTitle>Info</Accordion.ItemTitle>
				<Accordion.ItemContent>
					<PropertyRow icon={ICONS.email} label="Email">
						<span>placeholder</span>
					</PropertyRow>
					<PropertyRow icon={ICONS.name} label="First name">
						<span>placeholder</span>
					</PropertyRow>
					<PropertyRow icon={ICONS.name} label="Last name">
						<span>placeholder</span>
					</PropertyRow>
					<PropertyRow icon={ICONS.venture} label="Venture">
						<span>placeholder</span>
					</PropertyRow>
					<PropertyRow icon={ICONS.host} label="Hosted by">
						<span>placeholder</span>
					</PropertyRow>
				</Accordion.ItemContent>
			</Accordion.Item>
			<Accordion.Item value="notes">
				<Accordion.ItemTitle>Notes</Accordion.ItemTitle>
				<Accordion.ItemContent>
					<span>placeholder</span>
				</Accordion.ItemContent>
			</Accordion.Item>
			<Accordion.Item value="history">
				<Accordion.ItemTitle>History</Accordion.ItemTitle>
				<Accordion.ItemContent>
					<span>placeholder</span>
				</Accordion.ItemContent>
			</Accordion.Item>
		</Accordion.Root>
	);
}

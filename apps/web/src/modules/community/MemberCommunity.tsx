import { Tabs } from "@j-os/design-system";

import { BoardContacts } from "./BoardContacts.tsx";
import { MyProfile } from "./MyProfile.tsx";

/**
 * The Community view for a non-board person (guest/member/core/staff): their
 * own editable profile, plus the read-only board-contacts directory. A single
 * fixed tab bar — the board console is a separate branch in {@link
 * CommunityPage}, so nothing here wraps a `Tabs.Trigger` in `<Can>` (which
 * apps/web/AGENTS.md forbids: it breaks Ark's sliding indicator).
 */
export function MemberCommunity() {
	return (
		<Tabs.Root defaultValue="profile">
			<Tabs.List>
				<Tabs.Trigger value="profile">My profile</Tabs.Trigger>
				<Tabs.Trigger value="contacts">Board contacts</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="profile">
				<MyProfile />
			</Tabs.Content>
			<Tabs.Content value="contacts">
				<BoardContacts />
			</Tabs.Content>
		</Tabs.Root>
	);
}

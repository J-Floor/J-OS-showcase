import { Button, SheetNav } from "@j-os/design-system";
import { useNavigate } from "@solidjs/router";
import { Show, type JSX } from "solid-js";

import type { SheetNavState } from "../../lib/createSheetNav.ts";

import { usePeek } from "./PeekContext.tsx";

/** Where the router is only needed: a sheet outside a peek has no use for it. */
function ViewInButton(props: { label: string; href: string }): JSX.Element {
	const navigate = useNavigate();
	return (
		<Button
			variant="tertiary"
			onClick={() => {
				navigate(props.href, { replace: true });
			}}
		>
			{props.label}
		</Button>
	);
}

/** A sheet header's way along: prev/next arrows on a page's own sheet, the
 *  link to the entity's page on a peek. */
export function EntitySheetNav(props: { nav?: SheetNavState }): JSX.Element {
	const peek = usePeek();
	return (
		<Show
			when={peek}
			fallback={
				<Show when={props.nav}>
					{(nav) => (
						<SheetNav
							onPrev={nav().onPrev}
							onNext={nav().onNext}
							hasPrev={nav().hasPrev()}
							hasNext={nav().hasNext()}
						/>
					)}
				</Show>
			}
		>
			{(context) => (
				<ViewInButton
					label={context().viewIn.label}
					href={context().viewIn.href}
				/>
			)}
		</Show>
	);
}

import { createSignal } from "solid-js";

import { Button, Drawer, PropertyRow } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

/** Placeholder markup shaped like the demo's loaded body, for the "custom
 *  skeleton" preset — mirrors how a real drawer (e.g. `TaskDrawer`) shapes
 *  its own `Drawer.Body` `skeleton`. */
function CustomSkeletonPlaceholder() {
	return (
		<>
			<PropertyRow icon="badge" label="Name">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon="notes" label="Notes">
				<span>placeholder</span>
			</PropertyRow>
		</>
	);
}

function DrawerDemo(props: {
	title: string;
	body: string;
	withFooter: boolean;
	loading: boolean;
	customSkeleton: boolean;
}) {
	const [open, setOpen] = createSignal(false);
	return (
		<>
			<Button
				onClick={() => {
					setOpen(true);
				}}
			>
				Open drawer
			</Button>
			<Drawer.Root open={open()} onOpenChange={setOpen}>
				<Drawer.Header>
					<Drawer.Title loading={props.loading}>
						{props.title}
					</Drawer.Title>
					<Drawer.HeaderActions>
						<Drawer.Close />
					</Drawer.HeaderActions>
				</Drawer.Header>
				<Drawer.Body
					loading={props.loading}
					skeleton={
						props.customSkeleton ? (
							<CustomSkeletonPlaceholder />
						) : undefined
					}
				>
					<p>{props.body}</p>
				</Drawer.Body>
				{props.withFooter ? (
					<Drawer.Footer>
						<Button
							onClick={() => {
								setOpen(false);
							}}
						>
							Save
						</Button>
					</Drawer.Footer>
				) : null}
			</Drawer.Root>
		</>
	);
}

export default {
	title: "Drawer",
	render: (p) => (
		<DrawerDemo
			title={p.title}
			body={p.body}
			withFooter={p.withFooter}
			loading={p.loading}
			customSkeleton={p.customSkeleton}
		/>
	),
	controls: {
		title: { type: "text", default: "Edit member" },
		body: {
			type: "text",
			default: "Drawer body content lives here.",
		},
		withFooter: { type: "boolean", default: true },
		loading: { type: "boolean", default: false },
		customSkeleton: { type: "boolean", default: false },
	},
	presets: {
		"custom skeleton": { loading: true, customSkeleton: true },
	},
} satisfies Demo;

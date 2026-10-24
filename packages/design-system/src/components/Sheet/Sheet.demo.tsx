import { createSignal, Show } from "solid-js";

import { Button, Sheet, PropertyRow } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

/** Placeholder markup shaped like the demo's loaded body, for the "custom
 *  skeleton" preset: what a real sheet puts in its `Sheet.Skeleton`. */
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

function SheetDemo(props: {
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
				Open sheet
			</Button>
			<Sheet.Root open={open()} onOpenChange={setOpen}>
				<Sheet.Header>
					<Sheet.Title loading={props.loading}>
						{props.title}
					</Sheet.Title>
					<Sheet.HeaderActions>
						<Sheet.Close />
					</Sheet.HeaderActions>
				</Sheet.Header>
				<Show when={props.customSkeleton}>
					<Sheet.Skeleton>
						<CustomSkeletonPlaceholder />
					</Sheet.Skeleton>
				</Show>
				<Sheet.Body loading={props.loading}>
					<p>{props.body}</p>
				</Sheet.Body>
				{props.withFooter ? (
					<Sheet.Footer>
						<Button
							onClick={() => {
								setOpen(false);
							}}
						>
							Save
						</Button>
					</Sheet.Footer>
				) : null}
			</Sheet.Root>
		</>
	);
}

export default {
	title: "Sheet",
	render: (p) => (
		<SheetDemo
			title={p.title}
			body={p.body}
			withFooter={p.withFooter}
			loading={p.loading}
			customSkeleton={p.customSkeleton}
		/>
	),
	controls: {
		title: { type: "text", default: "Edit item" },
		body: {
			type: "text",
			default: "Sheet body content lives here.",
		},
		withFooter: { type: "boolean", default: true },
		loading: { type: "boolean", default: false },
		customSkeleton: { type: "boolean", default: false },
	},
	presets: {
		"custom skeleton": { loading: true, customSkeleton: true },
	},
} satisfies Demo;

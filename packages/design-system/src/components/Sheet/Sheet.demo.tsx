import { createSignal, Show } from "solid-js";

import {
	Button,
	Input,
	Sheet,
	PropertyRow,
	useSaveTracker,
} from "@j-os/design-system";

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

const TYPING_PAUSE_MS = 600;
const FAKE_WRITE_MS = 500;

/** A field that saves as you type, through a fake write that fails while
 *  `fails` is on. It reports to the sheet's save tracker. */
function AutosaveField(props: { fails: boolean }) {
	const field = useSaveTracker()?.track("notes");
	let pause: ReturnType<typeof setTimeout> | undefined;
	function send(): void {
		const write = new Promise<void>((resolve, reject) => {
			setTimeout(() => {
				if (props.fails) reject(new Error("The demo write failed."));
				else resolve();
			}, FAKE_WRITE_MS);
		});
		field?.settle(write, send);
	}
	return (
		<Input
			label="Notes (saves as you type)"
			onInput={() => {
				field?.pending();
				clearTimeout(pause);
				pause = setTimeout(send, TYPING_PAUSE_MS);
			}}
		/>
	);
}

function SheetDemo(props: {
	title: string;
	body: string;
	withFooter: boolean;
	loading: boolean;
	customSkeleton: boolean;
	mode: string;
	failSaves: boolean;
}) {
	const [open, setOpen] = createSignal(false);
	const [prebuild, setPrebuild] = createSignal(false);
	const [draft, setDraft] = createSignal("");
	return (
		<>
			<Button
				// Pointing at the button hints the open: the sheet builds ahead.
				onPointerEnter={() => {
					setPrebuild(true);
				}}
				onClick={() => {
					setDraft("");
					setOpen(true);
				}}
			>
				Open sheet
			</Button>
			<Sheet.Root
				open={open()}
				onOpenChange={setOpen}
				prebuild={prebuild()}
				// A create sheet asks before a typed draft is thrown away.
				confirmClose={() => props.mode === "create" && draft() !== ""}
				discardLabel="new item"
			>
				<Sheet.Header>
					<Sheet.Title loading={props.loading}>
						{props.title}
					</Sheet.Title>
					<Sheet.HeaderActions>
						<Show when={props.mode === "autosave"}>
							<Sheet.SaveStatus />
						</Show>
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
					<Show when={props.mode === "autosave"}>
						<AutosaveField fails={props.failSaves} />
					</Show>
					<Show when={props.mode === "create"}>
						<Input
							label="Name (closing with text asks first)"
							value={draft()}
							onInput={(event) => {
								setDraft(event.currentTarget.value);
							}}
						/>
					</Show>
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
			mode={p.mode}
			failSaves={p.failSaves}
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
		mode: {
			type: "select",
			options: ["plain", "autosave", "create"],
			default: "plain",
		},
		failSaves: { type: "boolean", default: false },
	},
	presets: {
		"custom skeleton": { loading: true, customSkeleton: true },
		autosave: { mode: "autosave", withFooter: false },
		"autosave, failing": {
			mode: "autosave",
			withFooter: false,
			failSaves: true,
		},
		"create (asks before discarding)": {
			mode: "create",
			title: "New item",
		},
	},
} satisfies Demo;

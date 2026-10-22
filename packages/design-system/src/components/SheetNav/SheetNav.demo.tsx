import { createSignal } from "solid-js";

import { Button, Sheet, SheetNav } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

const ITEMS = [
	"Ada Lovelace",
	"Alan Turing",
	"Grace Hopper",
	"Edsger Dijkstra",
];

function SheetNavDemo() {
	const [open, setOpen] = createSignal(false);
	const [index, setIndex] = createSignal(0);
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
					<Sheet.Title>{ITEMS[index()]}</Sheet.Title>
					<Sheet.HeaderActions>
						<SheetNav
							onPrev={() => {
								setIndex((i) => i - 1);
							}}
							onNext={() => {
								setIndex((i) => i + 1);
							}}
							hasPrev={index() > 0}
							hasNext={index() < ITEMS.length - 1}
						/>
						<Sheet.Close />
					</Sheet.HeaderActions>
				</Sheet.Header>
				<Sheet.Body>
					<p>
						Viewing item {index() + 1} of {ITEMS.length}. Use the
						up/down arrows in the header to navigate.
					</p>
				</Sheet.Body>
			</Sheet.Root>
		</>
	);
}

export default {
	title: "SheetNav",
	render: () => <SheetNavDemo />,
	controls: {},
} satisfies Demo;

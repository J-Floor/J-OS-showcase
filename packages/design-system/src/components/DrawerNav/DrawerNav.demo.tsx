import { createSignal } from "solid-js";

import { Button, Drawer, DrawerNav } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

const ITEMS = [
	"Ada Lovelace",
	"Alan Turing",
	"Grace Hopper",
	"Edsger Dijkstra",
];

function DrawerNavDemo() {
	const [open, setOpen] = createSignal(false);
	const [index, setIndex] = createSignal(0);
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
					<Drawer.Title>{ITEMS[index()]}</Drawer.Title>
					<Drawer.HeaderActions>
						<DrawerNav
							onPrev={() => {
								setIndex((i) => i - 1);
							}}
							onNext={() => {
								setIndex((i) => i + 1);
							}}
							hasPrev={index() > 0}
							hasNext={index() < ITEMS.length - 1}
						/>
						<Drawer.Close />
					</Drawer.HeaderActions>
				</Drawer.Header>
				<Drawer.Body>
					<p>
						Viewing item {index() + 1} of {ITEMS.length}. Use the
						up/down arrows in the header to navigate.
					</p>
				</Drawer.Body>
			</Drawer.Root>
		</>
	);
}

export default {
	title: "DrawerNav",
	render: () => <DrawerNavDemo />,
	controls: {},
} satisfies Demo;

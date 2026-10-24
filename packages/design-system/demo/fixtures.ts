/** Sample options shared by the option-list demos (Select, Combobox). */
export const FRAMEWORKS: readonly {
	value: string;
	name: string;
	note: string;
	disabled?: boolean;
}[] = [
	{ value: "solid", name: "Solid", note: "Fine-grained signals" },
	{ value: "react", name: "React", note: "Virtual DOM" },
	{ value: "vue", name: "Vue", note: "Reactive proxies" },
	{ value: "svelte", name: "Svelte", note: "Compiled away" },
];

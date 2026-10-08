export {};

declare module "solid-js" {
	namespace JSX {
		interface Directives {
			// solid-dnd directive bindings — suppresses TS6133 and TS2322 for use:draggable / use:droppable
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- solid-dnd directive accepts any binding value
			draggable: any;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- solid-dnd directive accepts any binding value
			droppable: any;
		}
	}
}

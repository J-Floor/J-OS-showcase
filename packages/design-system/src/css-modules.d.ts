// Ambient typings for CSS Modules consumed by the design-system source.
// apps/web gets these via `vite/client`; the package types them locally so
// `tsc --noEmit` resolves `*.module.css` imports without depending on Vite.
declare module "*.module.css" {
	const classes: { readonly [key: string]: string };
	export default classes;
}

declare module "*.module.scss" {
	const classes: { readonly [key: string]: string };
	export default classes;
}

// Side-effect imports of plain (non-module) stylesheets.
declare module "*.scss";
declare module "*.css";

declare module "subset-font" {
	export default function subsetFont(
		font: Buffer,
		text: string,
		options?: {
			targetFormat?: "sfnt" | "woff" | "woff2" | "truetype";
			noLayoutClosure?: boolean;
			keepFeatures?: string[];
		}
	): Promise<Buffer>;
}

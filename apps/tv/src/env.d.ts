/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_TV_API_URL: string;
	readonly VITE_TV_APP_URL: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

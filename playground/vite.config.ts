import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Vite config for the playground app; aliases `py-ast` to the sibling library's source. */
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"py-ast": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
		},
	},
	server: {
		fs: {
			allow: [".."],
		},
	},
});

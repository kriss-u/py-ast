import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import sitemap from "vite-plugin-sitemap";

const SITE_URL = "https://pyast.nepcodex.com";

/** Vite config for the playground app; aliases `py-ast` to the sibling library's source. */
export default defineConfig({
	plugins: [
		react(),
		sitemap({
			hostname: SITE_URL,
			robots: [{ userAgent: "*", allow: "/" }],
			changefreq: "weekly",
			priority: 1,
			readable: true,
		}),
	],
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

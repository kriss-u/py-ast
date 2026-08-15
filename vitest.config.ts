import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["tests/**/*.test.ts"],
		exclude: ["node_modules", "dist"],
		testTimeout: 10000,
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["tests/**", "src/**/*.test.ts"],
			reporter: ["text", "lcov", "html"],
			thresholds: {
				100: true,
			},
		},
	},
});

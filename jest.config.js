export default {
	preset: "ts-jest",
	testEnvironment: "node",
	extensionsToTreatAsEsm: [".ts"],
	moduleNameMapper: {
		"^(\\.{1,2}/.*)\\.js$": "$1",
	},
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				useESM: true,
			},
		],
	},
	testMatch: ["**/tests/**/*.test.ts"],
	testPathIgnorePatterns: ["/node_modules/", "/dist/"],
	collectCoverageFrom: ["src/**/*.ts", "!tests/**", "!src/**/*.test.ts"],
	coverageReporters: ["text", "lcov", "html"],
	testTimeout: 10000, // 10 seconds for complex parsing tests
	verbose: true,
};

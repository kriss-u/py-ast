module.exports = {
	parser: "@typescript-eslint/parser",
	plugins: ["@typescript-eslint"],
	extends: ["eslint:recommended", "@typescript-eslint/recommended"],
	env: {
		node: true,
		es2020: true,
		jest: true,
	},
	parserOptions: {
		ecmaVersion: 2020,
		sourceType: "module",
	},
	rules: {
		"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
		"@typescript-eslint/explicit-function-return-type": "off",
		"@typescript-eslint/explicit-module-boundary-types": "off",
		"@typescript-eslint/no-explicit-any": "off",
		"@typescript-eslint/no-non-null-assertion": "off",
	},
	ignorePatterns: ["dist/", "node_modules/", "*.js"],
};

import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import esbuild from "rollup-plugin-esbuild";
import dts from "rollup-plugin-dts";

const external = (id) =>
	!id.startsWith(".") && !id.startsWith("/") && !id.startsWith("src/");

export default [
	// ES Modules build
	{
		input: "src/index.ts",
		output: {
			file: "dist/index.esm.js",
			format: "es",
			sourcemap: true,
		},
		external,
		plugins: [
			resolve(),
			commonjs(),
			esbuild({
				tsconfig: "./tsconfig.json",
				sourceMap: true,
			}),
		],
	},
	// CommonJS build
	{
		input: "src/index.ts",
		output: {
			file: "dist/index.js",
			format: "cjs",
			sourcemap: true,
		},
		external,
		plugins: [
			resolve(),
			commonjs(),
			esbuild({
				tsconfig: "./tsconfig.json",
				sourceMap: true,
			}),
		],
	},
	// TypeScript declarations
	{
		input: "src/index.ts",
		output: {
			file: "dist/index.d.ts",
			format: "es",
		},
		external,
		plugins: [dts()],
	},
];

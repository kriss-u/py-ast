#!/usr/bin/env node

/**
 * Python to AST JSON Converter
 * Converts Python source files to JSON AST format
 */

import { promises as fs } from "fs";
import { parse } from "../dist/index.esm.js";

async function convertToJSON(inputFile, outputFile, options = {}) {
	try {
		// Read the Python source file
		const source = await fs.readFile(inputFile, "utf-8");
		console.log(`📁 Reading: ${inputFile}`);

		// Parse to AST
		const startTime = Date.now();
		const ast = parse(source, { filename: inputFile });
		const parseTime = Date.now() - startTime;

		console.log(`✅ Parsed in ${parseTime}ms`);
		console.log(`📊 Root node: ${ast.nodeType}`);

		// Convert to JSON
		const jsonOutput = options.compact
			? JSON.stringify(ast)
			: JSON.stringify(ast, null, 2);

		// Write JSON file
		await fs.writeFile(outputFile, jsonOutput, "utf-8");

		console.log(`💾 JSON saved to: ${outputFile}`);
		console.log(`📄 File size: ${jsonOutput.length} characters`);
		console.log(`🎨 Format: ${options.compact ? "Compact" : "Pretty-printed"}`);

		return {
			inputFile,
			outputFile,
			parseTime,
			jsonSize: jsonOutput.length,
			nodeType: ast.nodeType,
		};
	} catch (error) {
		console.error(`❌ Error converting ${inputFile}: ${error.message}`);
		throw error;
	}
}

function showHelp() {
	console.log(`
🐍 Python to AST JSON Converter

Usage:
  node py2json.mjs <input.py> [output.json] [options]

Arguments:
  input.py     - Python source file to convert
  output.json  - Output JSON file (optional, defaults to input.py.json)

Options:
  --compact    - Generate compact JSON (no formatting)
  --help, -h   - Show this help

Examples:
  node py2json.mjs script.py
  node py2json.mjs script.py ast.json
  node py2json.mjs script.py script.json --compact

The generated JSON contains the complete Abstract Syntax Tree
structure compatible with Python's ast module.
`);
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		showHelp();
		process.exit(0);
	}

	const inputFile = args[0];
	const outputFile = args[1] || `${inputFile}.json`;
	const compact = args.includes("--compact");

	if (!inputFile.endsWith(".py")) {
		console.error("❌ Input file must be a Python file (.py extension)");
		process.exit(1);
	}

	try {
		console.log("🐍 Python to AST JSON Converter");
		console.log("=".repeat(40));

		const result = await convertToJSON(inputFile, outputFile, { compact });

		console.log("\n✅ Conversion completed successfully!");
		console.log("📋 Summary:");
		console.log(`  Input: ${result.inputFile}`);
		console.log(`  Output: ${result.outputFile}`);
		console.log(`  Parse time: ${result.parseTime}ms`);
		console.log(`  JSON size: ${result.jsonSize} chars`);
		console.log(`  Root node: ${result.nodeType}`);
	} catch (error) {
		console.error("\n❌ Conversion failed");
		process.exit(1);
	}
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

export { convertToJSON };

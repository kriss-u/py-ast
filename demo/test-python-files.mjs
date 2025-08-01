#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parse } from "../dist/index.esm.js";

/**
 * Test all Python files in the demo/python-files directory
 * This ensures our parser can handle real-world Python code
 */

const PYTHON_FILES_DIR = path.join(process.cwd(), "demo", "python-files");
const results = [];

console.log("🐍 Python Files Parser Test");
console.log("=".repeat(50));

try {
	const files = fs
		.readdirSync(PYTHON_FILES_DIR)
		.filter((f) => f.endsWith(".py"));

	if (files.length === 0) {
		console.log("❌ No Python files found in demo/python-files/");
		process.exit(1);
	}

	console.log(`📁 Found ${files.length} Python files to test\n`);

	for (const file of files) {
		const filePath = path.join(PYTHON_FILES_DIR, file);

		try {
			console.log(`🔍 Testing ${file}...`);
			const source = fs.readFileSync(filePath, "utf8");

			// Parse the file
			const start = performance.now();
			const ast = parse(source);
			const end = performance.now();
			const parseTime = Math.round(end - start);

			// Count nodes
			const nodeCount = countNodes(ast);

			console.log(`✅ ${file}: ${nodeCount} nodes (${parseTime}ms)`);

			results.push({
				file,
				success: true,
				nodeCount,
				parseTime,
				lines: source.split("\n").length,
			});
		} catch (error) {
			console.log(`❌ ${file}: FAILED`);
			console.log(`   Error: ${error.message}`);

			results.push({
				file,
				success: false,
				error: error.message,
			});
		}
	}

	// Summary
	console.log("\n📊 Test Summary");
	console.log("-".repeat(40));

	const successful = results.filter((r) => r.success);
	const failed = results.filter((r) => !r.success);

	console.log(`✅ Successful: ${successful.length}`);
	console.log(`❌ Failed: ${failed.length}`);
	console.log(
		`📈 Success rate: ${((successful.length / results.length) * 100).toFixed(1)}%`,
	);

	if (successful.length > 0) {
		const totalNodes = successful.reduce((sum, r) => sum + r.nodeCount, 0);
		const totalTime = successful.reduce((sum, r) => sum + r.parseTime, 0);
		const totalLines = successful.reduce((sum, r) => sum + r.lines, 0);

		console.log(`\n📈 Performance Summary:`);
		console.log(`   Total nodes parsed: ${totalNodes}`);
		console.log(`   Total lines parsed: ${totalLines}`);
		console.log(`   Total parse time: ${totalTime}ms`);
		console.log(`   Average: ${(totalNodes / totalTime).toFixed(1)} nodes/ms`);
	}

	if (failed.length > 0) {
		console.log(`\n❌ Failed Files:`);
		failed.forEach((r) => {
			console.log(`   ${r.file}: ${r.error}`);
		});
		process.exit(1);
	}
} catch (error) {
	console.error("❌ Test runner error:", error.message);
	process.exit(1);
}

/**
 * Recursively count all nodes in the AST
 */
function countNodes(node) {
	if (!node || typeof node !== "object") {
		return 0;
	}

	let count = 1; // Count this node

	for (const [key, value] of Object.entries(node)) {
		if (key === "nodeType" || key === "lineno" || key === "col_offset") {
			continue; // Skip metadata
		}

		if (Array.isArray(value)) {
			count += value.reduce((sum, item) => sum + countNodes(item), 0);
		} else if (value && typeof value === "object") {
			count += countNodes(value);
		}
	}

	return count;
}

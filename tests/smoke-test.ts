import { parseCode } from "./test-helpers.js";

/**
 * Run a quick smoke test to ensure the parser works with basic constructs
 */
function runSmokeTest() {
	console.log("🧪 Running Python AST Parser Smoke Test...");

	const testCases = [
		{ name: "Simple assignment", code: "x = 1" },
		{ name: "Function definition", code: "def func(): pass" },
		{ name: "Class definition", code: "class A: pass" },
		{ name: "If statement", code: "if True: pass" },
		{ name: "For loop", code: "for x in []: pass" },
		{ name: "List comprehension", code: "[x for x in items]" },
		{ name: "Function call", code: "func(1, 2, a=3)" },
		{ name: "Binary operation", code: "a + b * c" },
		{ name: "Import statement", code: "import os" },
		{ name: "From import", code: "from typing import List" },
	];

	let passed = 0;
	let failed = 0;

	testCases.forEach(({ name, code }) => {
		try {
			const ast = parseCode(code);
			if (ast.nodeType === "Module" && ast.body.length > 0) {
				console.log(`✅ ${name}`);
				passed++;
			} else {
				console.log(`❌ ${name} - Invalid AST structure`);
				failed++;
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.log(`❌ ${name} - Error: ${errorMessage}`);
			failed++;
		}
	});

	console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

	if (failed === 0) {
		console.log("🎉 All smoke tests passed!");
	} else {
		console.log("⚠️  Some smoke tests failed. Check the parser implementation.");
	}

	return failed === 0;
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	runSmokeTest();
}

export { runSmokeTest };

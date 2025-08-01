#!/usr/bin/env node

/**
 * JSON Output Examples
 * Demonstrates different ways to get JSON output from the Python AST parser
 */

import { parse, walk } from "../dist/index.esm.js";

console.log("🐍 Python AST JSON Output Examples");
console.log("=".repeat(50));

// Example Python code
const pythonCode = `
def fibonacci(n):
    """Calculate fibonacci number recursively."""
    if n <= 1:
        return n
    else:
        return fibonacci(n-1) + fibonacci(n-2)

# Test the function
result = fibonacci(10)
print(f"Fibonacci(10) = {result}")
`;

console.log("📄 Python Code:");
console.log("-".repeat(30));
console.log(pythonCode);

try {
	// Parse the code
	console.log("\n🔍 Parsing...");
	const ast = parse(pythonCode);
	console.log(`✅ Parsed successfully: ${ast.nodeType}`);

	// Method 1: Basic JSON.stringify
	console.log("\n📋 Method 1: Basic JSON Output");
	console.log("-".repeat(40));
	const basicJSON = JSON.stringify(ast);
	console.log(`Compact JSON (${basicJSON.length} chars):`);
	console.log(basicJSON.slice(0, 200) + "...");

	// Method 2: Pretty-printed JSON
	console.log("\n📋 Method 2: Pretty-printed JSON");
	console.log("-".repeat(40));
	const prettyJSON = JSON.stringify(ast, null, 2);
	console.log(`Pretty JSON (${prettyJSON.length} chars):`);
	console.log(prettyJSON.split("\n").slice(0, 20).join("\n") + "\n...");

	// Method 3: Filtered JSON (only specific node types)
	console.log("\n📋 Method 3: Filtered JSON (Functions only)");
	console.log("-".repeat(40));

	const functions = [];
	for (const node of walk(ast)) {
		if (node.nodeType === "FunctionDef") {
			functions.push({
				name: node.name,
				lineno: node.lineno,
				args: node.args.args.map((arg) => arg.arg),
				docstring:
					node.body[0]?.nodeType === "Expr" &&
					node.body[0].value?.nodeType === "Constant" &&
					typeof node.body[0].value.value === "string"
						? node.body[0].value.value
						: null,
			});
		}
	}

	console.log("Functions extracted:");
	console.log(JSON.stringify(functions, null, 2));

	// Method 4: Custom replacer function
	console.log("\n📋 Method 4: Custom Replacer (Hide positions)");
	console.log("-".repeat(40));

	const customReplacer = (key, value) => {
		// Hide line/column position info for cleaner output
		if (
			["lineno", "col_offset", "end_lineno", "end_col_offset"].includes(key)
		) {
			return undefined;
		}
		return value;
	};

	const cleanJSON = JSON.stringify(ast, customReplacer, 2);
	console.log(`Clean JSON (${cleanJSON.length} chars, positions removed):`);
	console.log(cleanJSON.split("\n").slice(0, 15).join("\n") + "\n...");

	// Method 5: Node type statistics as JSON
	console.log("\n📋 Method 5: Node Statistics as JSON");
	console.log("-".repeat(40));

	const nodeStats = new Map();
	for (const node of walk(ast)) {
		nodeStats.set(node.nodeType, (nodeStats.get(node.nodeType) || 0) + 1);
	}

	const statsJSON = JSON.stringify(Object.fromEntries(nodeStats), null, 2);
	console.log("Node type distribution:");
	console.log(statsJSON);

	// Method 6: Simplified AST structure
	console.log("\n📋 Method 6: Simplified AST Structure");
	console.log("-".repeat(40));

	function simplifyNode(node, maxDepth = 3, currentDepth = 0) {
		if (currentDepth >= maxDepth) {
			return `${node.nodeType}`;
		}

		const simplified = { nodeType: node.nodeType };

		// Add key properties based on node type
		if (node.nodeType === "FunctionDef") {
			simplified.name = node.name;
			simplified.args = node.args.args.length;
		} else if (node.nodeType === "ClassDef") {
			simplified.name = node.name;
		} else if (node.nodeType === "Name") {
			simplified.id = node.id;
		} else if (node.nodeType === "Constant") {
			simplified.value = node.value;
		}

		// Recursively simplify children
		for (const [key, value] of Object.entries(node)) {
			if (key === "nodeType") continue;

			if (Array.isArray(value)) {
				if (
					value.length > 0 &&
					value[0] &&
					typeof value[0] === "object" &&
					value[0].nodeType
				) {
					simplified[key] = value.map((item) =>
						simplifyNode(item, maxDepth, currentDepth + 1),
					);
				} else if (key !== "lineno" && key !== "col_offset") {
					simplified[key] = value;
				}
			} else if (value && typeof value === "object" && value.nodeType) {
				simplified[key] = simplifyNode(value, maxDepth, currentDepth + 1);
			} else if (
				!["lineno", "col_offset", "end_lineno", "end_col_offset"].includes(key)
			) {
				simplified[key] = value;
			}
		}

		return simplified;
	}

	const simplifiedAST = simplifyNode(ast);
	const simplifiedJSON = JSON.stringify(simplifiedAST, null, 2);
	console.log(`Simplified AST (${simplifiedJSON.length} chars):`);
	console.log(simplifiedJSON);

	console.log("\n✅ All JSON output methods demonstrated!");
	console.log("\n💡 Tips:");
	console.log("- Use compact JSON for minimal file size");
	console.log("- Use pretty-printed JSON for human readability");
	console.log("- Use custom replacers to filter out unwanted data");
	console.log("- Simplify the AST structure for easier analysis");
	console.log("- Extract specific node types for focused analysis");
} catch (error) {
	console.error(`❌ Error: ${error.message}`);
}

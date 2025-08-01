#!/usr/bin/env node

/**
 * Interactive AST Explorer
 * Allows interactive exploration of Python AST parsing
 */

import { promises as fs } from "node:fs";
import { createInterface } from "node:readline";
import {
	getDocstring,
	iterChildNodes,
	iterFields,
	parse,
	unparse,
	walk,
} from "../dist/index.esm.js";

class InteractiveExplorer {
	constructor() {
		this.rl = createInterface({
			input: process.stdin,
			output: process.stdout,
			prompt: "py-ast> ",
		});

		this.currentAST = null;
		this.history = [];
		this.setupCommands();
	}

	setupCommands() {
		this.commands = {
			help: this.showHelp.bind(this),
			h: this.showHelp.bind(this),
			parse: this.parseCode.bind(this),
			p: this.parseCode.bind(this),
			load: this.loadFile.bind(this),
			l: this.loadFile.bind(this),
			show: this.showAST.bind(this),
			s: this.showAST.bind(this),
			walk: this.walkAST.bind(this),
			w: this.walkAST.bind(this),
			find: this.findNodes.bind(this),
			f: this.findNodes.bind(this),
			stats: this.showStats.bind(this),
			unparse: this.unparseAST.bind(this),
			u: this.unparseAST.bind(this),
			json: this.showJSON.bind(this),
			j: this.showJSON.bind(this),
			save: this.saveJSON.bind(this),
			fields: this.showFields.bind(this),
			children: this.showChildren.bind(this),
			docstring: this.showDocstring.bind(this),
			d: this.showDocstring.bind(this),
			examples: this.showExamples.bind(this),
			e: this.showExamples.bind(this),
			clear: this.clearAST.bind(this),
			history: this.showHistory.bind(this),
			exit: this.exit.bind(this),
			quit: this.exit.bind(this),
			q: this.exit.bind(this),
		};
	}

	start() {
		console.log("🐍 Python AST Interactive Explorer");
		console.log('Type "help" or "h" for available commands');
		console.log('Type "examples" or "e" to see example Python code snippets');
		console.log("-".repeat(60));

		this.rl.prompt();

		this.rl.on("line", (input) => {
			this.processCommand(input.trim());
			this.rl.prompt();
		});

		this.rl.on("close", () => {
			console.log("\n👋 Goodbye!");
			process.exit(0);
		});
	}

	processCommand(input) {
		if (!input) return;

		this.history.push(input);

		const parts = input.split(" ");
		const command = parts[0].toLowerCase();
		const args = parts.slice(1);

		if (command in this.commands) {
			try {
				this.commands[command](args);
			} catch (error) {
				console.log(`❌ Error executing command: ${error.message}`);
			}
		} else {
			// Try to parse as Python code
			this.parseCode([input]);
		}
	}

	showHelp() {
		console.log("\n📚 Available Commands:");
		console.log("=".repeat(40));
		console.log("🔧 Parsing:");
		console.log("  parse <code>     (p) - Parse Python code");
		console.log("  load <file>      (l) - Load and parse Python file");
		console.log("  examples         (e) - Show example code snippets");
		console.log("");
		console.log("🔍 Exploring:");
		console.log("  show [depth]     (s) - Show AST structure");
		console.log("  walk [limit]     (w) - Walk through all nodes");
		console.log("  find <nodeType>  (f) - Find nodes of specific type");
		console.log("  stats                - Show AST statistics");
		console.log("");
		console.log("📊 Analysis:");
		console.log("  fields               - Show fields of root node");
		console.log("  children             - Show child nodes");
		console.log("  docstring        (d) - Extract docstring");
		console.log("  unparse          (u) - Convert AST back to code");
		console.log("  json             (j) - Output AST as JSON");
		console.log("  save <file>          - Save AST as JSON to file");
		console.log("");
		console.log("🛠️  Utility:");
		console.log("  clear                - Clear current AST");
		console.log("  history              - Show command history");
		console.log("  help             (h) - Show this help");
		console.log("  exit/quit        (q) - Exit explorer");
		console.log("");
		console.log("💡 You can also directly type Python code to parse it!");
	}

	parseCode(args) {
		const code = args.join(" ");
		if (!code) {
			console.log("❌ Please provide Python code to parse");
			console.log("Example: parse x = 42");
			return;
		}

		try {
			const start = Date.now();
			this.currentAST = parse(code);
			const time = Date.now() - start;

			console.log(`✅ Parsed successfully in ${time}ms`);
			console.log(`📊 Root node: ${this.currentAST.nodeType}`);

			// Quick stats
			let nodeCount = 0;
			for (const _node of walk(this.currentAST)) {
				nodeCount++;
			}
			console.log(`🌳 Total nodes: ${nodeCount}`);
		} catch (error) {
			console.log(`❌ Parse error: ${error.message}`);
		}
	}

	async loadFile(args) {
		const filename = args[0];
		if (!filename) {
			console.log("❌ Please provide a filename");
			console.log("Example: load my_script.py");
			return;
		}

		try {
			const code = await fs.readFile(filename, "utf-8");
			console.log(`📁 Loading file: ${filename}`);

			const start = Date.now();
			this.currentAST = parse(code, { filename });
			const time = Date.now() - start;

			console.log(`✅ Parsed successfully in ${time}ms`);
			console.log(`📊 Root node: ${this.currentAST.nodeType}`);

			// Show file stats
			const lines = code.split("\n").length;
			let nodeCount = 0;
			for (const _node of walk(this.currentAST)) {
				nodeCount++;
			}

			console.log(`📄 File: ${lines} lines, ${code.length} characters`);
			console.log(`🌳 AST: ${nodeCount} nodes`);
		} catch (error) {
			console.log(`❌ Error loading file: ${error.message}`);
		}
	}

	showAST(args) {
		if (!this.currentAST) {
			console.log("❌ No AST loaded. Parse some code first.");
			return;
		}

		const maxDepth = parseInt(args[0]) || 3;
		console.log(`🌳 AST Structure (depth: ${maxDepth}):`);
		console.log("-".repeat(40));

		this.printNode(this.currentAST, 0, maxDepth);
	}

	printNode(node, depth, maxDepth) {
		if (depth > maxDepth) return;

		const indent = "  ".repeat(depth);
		const location = node.lineno ? ` (line ${node.lineno})` : "";
		console.log(`${indent}${node.nodeType}${location}`);

		for (const child of iterChildNodes(node)) {
			this.printNode(child, depth + 1, maxDepth);
		}
	}

	walkAST(args) {
		if (!this.currentAST) {
			console.log("❌ No AST loaded. Parse some code first.");
			return;
		}

		const limit = parseInt(args[0]) || 20;
		console.log(`🚶 Walking AST (showing first ${limit} nodes):`);
		console.log("-".repeat(40));

		let count = 0;
		for (const node of walk(this.currentAST)) {
			if (count >= limit) break;

			const location = node.lineno ? ` (line ${node.lineno})` : "";
			console.log(`${count + 1}. ${node.nodeType}${location}`);
			count++;
		}

		if (count >= limit) {
			console.log(`... (showing first ${limit} nodes only)`);
		}
	}

	findNodes(args) {
		if (!this.currentAST) {
			console.log("❌ No AST loaded. Parse some code first.");
			return;
		}

		const nodeType = args[0];
		if (!nodeType) {
			console.log("❌ Please specify a node type to find");
			console.log("Example: find FunctionDef");
			return;
		}

		console.log(`🔍 Finding nodes of type: ${nodeType}`);
		console.log("-".repeat(40));

		const found = [];
		for (const node of walk(this.currentAST)) {
			if (node.nodeType === nodeType) {
				found.push(node);
			}
		}

		if (found.length === 0) {
			console.log(`No nodes of type ${nodeType} found`);
			return;
		}

		found.forEach((node, index) => {
			const location = node.lineno ? ` (line ${node.lineno})` : "";
			let details = "";

			// Add specific details based on node type
			if (nodeType === "FunctionDef" || nodeType === "AsyncFunctionDef") {
				details = ` - ${node.name}`;
			} else if (nodeType === "ClassDef") {
				details = ` - ${node.name}`;
			} else if (nodeType === "Name") {
				details = ` - ${node.id}`;
			} else if (nodeType === "Constant") {
				details = ` - ${JSON.stringify(node.value)}`;
			}

			console.log(`${index + 1}. ${nodeType}${location}${details}`);
		});

		console.log(`\n📊 Found ${found.length} nodes`);
	}

	showStats() {
		if (!this.currentAST) {
			console.log("❌ No AST loaded. Parse some code first.");
			return;
		}

		console.log("📊 AST Statistics:");
		console.log("-".repeat(40));

		const stats = new Map();
		let totalNodes = 0;
		let maxDepth = 0;
		let currentDepth = 0;

		// Custom walk with depth tracking
		const walkWithDepth = function* (node, depth = 0) {
			currentDepth = Math.max(currentDepth, depth);
			yield { node, depth };
			for (const child of iterChildNodes(node)) {
				yield* walkWithDepth(child, depth + 1);
			}
		};

		for (const { node, depth } of walkWithDepth(this.currentAST)) {
			totalNodes++;
			maxDepth = Math.max(maxDepth, depth);
			stats.set(node.nodeType, (stats.get(node.nodeType) || 0) + 1);
		}

		console.log(`Total nodes: ${totalNodes}`);
		console.log(`Maximum depth: ${maxDepth}`);
		console.log(`Unique node types: ${stats.size}`);
		console.log("");

		console.log("Node type distribution:");
		Array.from(stats.entries())
			.sort((a, b) => b[1] - a[1])
			.forEach(([type, count]) => {
				const percentage = ((count / totalNodes) * 100).toFixed(1);
				console.log(`  ${type}: ${count} (${percentage}%)`);
			});
	}

	unparseAST() {
		if (!this.currentAST) {
			console.log("❌ No AST loaded. Parse some code first.");
			return;
		}

		try {
			const code = unparse(this.currentAST);
			console.log("🔄 Unparsed code:");
			console.log("-".repeat(40));
			console.log(code);
		} catch (error) {
			console.log(`❌ Unparse error: ${error.message}`);
		}
	}

	showJSON(args) {
		if (!this.currentAST) {
			console.log("❌ No AST loaded. Parse some code first.");
			return;
		}

		const pretty = !args.includes("--compact");
		const maxDepth = args.find((arg) => arg.startsWith("--depth="));
		const depth = maxDepth ? parseInt(maxDepth.split("=")[1]) : undefined;

		try {
			let jsonOutput;

			if (depth !== undefined) {
				// Create a limited depth copy of the AST
				const limitedAST = this.limitDepth(this.currentAST, depth);
				jsonOutput = pretty
					? JSON.stringify(limitedAST, null, 2)
					: JSON.stringify(limitedAST);
			} else {
				jsonOutput = pretty
					? JSON.stringify(this.currentAST, null, 2)
					: JSON.stringify(this.currentAST);
			}

			console.log("📄 AST JSON Output:");
			console.log("-".repeat(40));

			if (jsonOutput.length > 10000 && !args.includes("--full")) {
				console.log(jsonOutput.slice(0, 10000));
				console.log(
					'\n... (output truncated, use "json --full" for complete output)',
				);
				console.log(`Total length: ${jsonOutput.length} characters`);
			} else {
				console.log(jsonOutput);
			}

			console.log("\n💡 Options:");
			console.log("  json --compact     - Compact JSON (no formatting)");
			console.log("  json --full        - Show full output (no truncation)");
			console.log("  json --depth=N     - Limit depth to N levels");
		} catch (error) {
			console.log(`❌ JSON serialization error: ${error.message}`);
		}
	}

	limitDepth(obj, maxDepth, currentDepth = 0) {
		if (currentDepth >= maxDepth) {
			if (obj && typeof obj === "object") {
				if (Array.isArray(obj)) {
					return `[Array(${obj.length})]`;
				} else if (obj.nodeType) {
					return `{${obj.nodeType}}`;
				} else {
					return "{...}";
				}
			}
			return obj;
		}

		if (Array.isArray(obj)) {
			return obj.map((item) =>
				this.limitDepth(item, maxDepth, currentDepth + 1),
			);
		} else if (obj && typeof obj === "object") {
			const limited = {};
			for (const [key, value] of Object.entries(obj)) {
				limited[key] = this.limitDepth(value, maxDepth, currentDepth + 1);
			}
			return limited;
		}

		return obj;
	}

	async saveJSON(args) {
		if (!this.currentAST) {
			console.log("❌ No AST loaded. Parse some code first.");
			return;
		}

		const filename = args[0];
		if (!filename) {
			console.log("❌ Please provide a filename");
			console.log("Example: save ast_output.json");
			return;
		}

		const pretty = !args.includes("--compact");

		try {
			const jsonOutput = pretty
				? JSON.stringify(this.currentAST, null, 2)
				: JSON.stringify(this.currentAST);

			await fs.writeFile(filename, jsonOutput, "utf-8");

			console.log(`✅ AST saved to ${filename}`);
			console.log(`📄 File size: ${jsonOutput.length} characters`);
			console.log(`🎨 Format: ${pretty ? "Pretty-printed" : "Compact"}`);
		} catch (error) {
			console.log(`❌ Error saving file: ${error.message}`);
		}
	}

	showFields() {
		if (!this.currentAST) {
			console.log("❌ No AST loaded. Parse some code first.");
			return;
		}

		console.log("🔍 Root node fields:");
		console.log("-".repeat(40));

		for (const [name, value] of iterFields(this.currentAST)) {
			let valueDesc;
			if (Array.isArray(value)) {
				valueDesc = `Array(${value.length})`;
			} else if (value && typeof value === "object" && value.nodeType) {
				valueDesc = value.nodeType;
			} else {
				valueDesc = JSON.stringify(value);
				if (valueDesc.length > 50) {
					valueDesc = `${valueDesc.slice(0, 47)}...`;
				}
			}
			console.log(`  ${name}: ${valueDesc}`);
		}
	}

	showChildren() {
		if (!this.currentAST) {
			console.log("❌ No AST loaded. Parse some code first.");
			return;
		}

		console.log("👶 Direct child nodes:");
		console.log("-".repeat(40));

		let count = 0;
		for (const child of iterChildNodes(this.currentAST)) {
			const location = child.lineno ? ` (line ${child.lineno})` : "";
			console.log(`${count + 1}. ${child.nodeType}${location}`);
			count++;
		}

		if (count === 0) {
			console.log("No child nodes found");
		} else {
			console.log(`\nTotal: ${count} child nodes`);
		}
	}

	showDocstring() {
		if (!this.currentAST) {
			console.log("❌ No AST loaded. Parse some code first.");
			return;
		}

		const docstring = getDocstring(this.currentAST);
		if (docstring) {
			console.log("📝 Module docstring:");
			console.log("-".repeat(40));
			console.log(docstring);
		} else {
			console.log("No module docstring found");
		}
	}

	showExamples() {
		console.log("\n💡 Example Python Code Snippets:");
		console.log("-".repeat(40));
		console.log("Try parsing these examples:");
		console.log("");

		const examples = [
			{ name: "Simple assignment", code: "x = 42" },
			{
				name: "Function definition",
				code: 'def greet(name):\n    return f"Hello, {name}!"',
			},
			{
				name: "Class definition",
				code: "class Person:\n    def __init__(self, name):\n        self.name = name",
			},
			{
				name: "List comprehension",
				code: "[x**2 for x in range(10) if x % 2 == 0]",
			},
			{
				name: "Dictionary",
				code: '{"name": "Alice", "age": 30, "city": "NY"}',
			},
			{
				name: "If statement",
				code: 'if x > 0:\n    print("positive")\nelse:\n    print("not positive")',
			},
			{ name: "For loop", code: "for item in items:\n    print(item)" },
			{
				name: "Try-except",
				code: "try:\n    result = risky_operation()\nexcept ValueError:\n    result = default_value",
			},
			{ name: "Lambda function", code: "square = lambda x: x**2" },
			{
				name: "Decorator",
				code: "@property\ndef name(self):\n    return self._name",
			},
		];

		examples.forEach((example, index) => {
			console.log(`${index + 1}. ${example.name}:`);
			console.log(`   ${example.code.replace(/\n/g, "\\n")}`);
		});

		console.log("\nUse: parse <code> or just type the code directly");
	}

	clearAST() {
		this.currentAST = null;
		console.log("🧹 AST cleared");
	}

	showHistory() {
		console.log("\n📚 Command History:");
		console.log("-".repeat(40));

		if (this.history.length === 0) {
			console.log("No commands in history");
			return;
		}

		this.history.forEach((command, index) => {
			console.log(`${index + 1}. ${command}`);
		});
	}

	exit() {
		console.log("\n👋 Goodbye!");
		process.exit(0);
	}
}

// Start the interactive explorer
if (import.meta.url === `file://${process.argv[1]}`) {
	const explorer = new InteractiveExplorer();
	explorer.start();
}

export { InteractiveExplorer };

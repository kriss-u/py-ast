import { describe, expect, it } from "vitest";
import { parseCode } from "./test-helpers.js";
import { NodeTransformer, NodeVisitor, walk } from "../src/visitor.js";
import type { ASTNodeUnion, Name } from "../src/types.js";

describe("walk", () => {
	it("yields the root node first", () => {
		const tree = parseCode("x = 1\n");
		const nodes = Array.from(walk(tree));
		expect(nodes[0]).toBe(tree);
	});

	it("yields every descendant node in pre-order", () => {
		const tree = parseCode("x = 1 + 2\n");
		const types = Array.from(walk(tree)).map((n) => n.nodeType);
		expect(types).toEqual([
			"Module",
			"Assign",
			"Name",
			"Load",
			"BinOp",
			"Constant",
			"Add",
			"Constant",
		]);
	});

	it("walks nested statements (function bodies)", () => {
		const tree = parseCode("def f():\n    return 1\n");
		const types = Array.from(walk(tree)).map((n) => n.nodeType);
		expect(types).toContain("FunctionDef");
		expect(types).toContain("Return");
		expect(types).toContain("Arguments");
	});

	it("handles nodes with no children", () => {
		const node: ASTNodeUnion = { nodeType: "Pass", lineno: 1, col_offset: 0 } as any;
		const nodes = Array.from(walk(node));
		expect(nodes).toEqual([node]);
	});
});

describe("NodeVisitor", () => {
	it("dispatches to a matching visit<NodeType> method", () => {
		class NameCollector extends NodeVisitor {
			names: string[] = [];
			visitName(node: Name) {
				this.names.push(node.id);
			}
		}

		const tree = parseCode("x = y + z\n");
		const collector = new NameCollector();
		collector.visit(tree);
		// visit(tree) dispatches on Module (no visitModule method), falling back to
		// genericVisit, which recurses down through Assign/BinOp until it reaches
		// each Name node and dispatches to visitName.
		expect(collector.names.sort()).toEqual(["x", "y", "z"]);
	});

	it("recurses via genericVisit when no visit<NodeType> method matches", () => {
		class NameCollector extends NodeVisitor {
			names: string[] = [];
			visitName(node: Name) {
				this.names.push(node.id);
			}
		}
		const tree = parseCode("x = y + z\n");
		const collector = new NameCollector();
		// genericVisit walks into Assign -> targets/value, reaching all Names.
		collector.genericVisit(tree.body[0]);
		expect(collector.names.sort()).toEqual(["x", "y", "z"]);
	});

	it("supports the visit_<NodeType> underscore naming convention", () => {
		class NameCollector extends NodeVisitor {
			names: string[] = [];
			// biome-ignore lint/style/useNamingConvention: mirrors Python's ast.NodeVisitor convention
			visit_Name(node: Name) {
				this.names.push(node.id);
			}
		}
		const tree = parseCode("x = 1\n");
		const collector = new NameCollector();
		collector.genericVisit(tree.body[0]);
		expect(collector.names).toEqual(["x"]);
	});

	it("falls back to genericVisit for unhandled node types", () => {
		class CountingVisitor extends NodeVisitor {
			count = 0;
			genericVisit(node: ASTNodeUnion) {
				this.count++;
				super.genericVisit(node);
			}
		}
		const tree = parseCode("x = 1\n");
		const visitor = new CountingVisitor();
		visitor.visit(tree);
		expect(visitor.count).toBeGreaterThan(0);
	});
});

describe("NodeTransformer", () => {
	it("clones and transforms children via genericVisit by default", () => {
		const tree = parseCode("x = 1\n");
		const transformer = new NodeTransformer();
		const result = transformer.visit(tree) as ASTNodeUnion;
		expect(result).not.toBe(tree);
		expect(result.nodeType).toBe("Module");
	});

	it("replaces nodes matching a visit<NodeType> method", () => {
		class ConstantDoubler extends NodeTransformer {
			visitConstant(node: any) {
				if (typeof node.value === "number") {
					return { ...node, value: node.value * 2 };
				}
				return node;
			}
		}
		const tree = parseCode("x = 21\n");
		const result = new ConstantDoubler().visit(tree) as any;
		expect(result.body[0].value.value).toBe(42);
	});

	it("drops nodes when a visitor returns null", () => {
		class PassRemover extends NodeTransformer {
			visitPass() {
				return null;
			}
		}
		const tree = parseCode("x = 1\npass\ny = 2\n");
		const result = new PassRemover().visit(tree) as any;
		expect(result.body).toHaveLength(2);
		expect(result.body.map((s: any) => s.nodeType)).toEqual(["Assign", "Assign"]);
	});

	it("splices in an array when a visitor returns multiple nodes", () => {
		class StatementDuplicator extends NodeTransformer {
			visitPass(node: any) {
				return [node, { ...node }];
			}
		}
		const tree = parseCode("pass\n");
		const result = new StatementDuplicator().visit(tree) as any;
		expect(result.body).toHaveLength(2);
	});

	it("leaves non-node array items untouched", () => {
		const tree = parseCode("def f(a, b): pass\n");
		const transformer = new NodeTransformer();
		const result = transformer.visit(tree) as any;
		const fn = result.body[0];
		expect(fn.name).toBe("f");
	});

	it("leaves primitive array items (e.g. Global names) untouched", () => {
		const tree = parseCode("global x, y\n");
		const result = new NodeTransformer().visit(tree) as any;
		expect(result.body[0].names).toEqual(["x", "y"]);
	});

	it("leaves nodes without children unchanged in shape", () => {
		const tree = parseCode("pass\n");
		const result = new NodeTransformer().visit(tree) as any;
		expect(result.body[0].nodeType).toBe("Pass");
	});
});

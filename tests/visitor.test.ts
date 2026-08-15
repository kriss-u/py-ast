import { describe, expect, it } from "vitest";
import type {
	ASTNodeUnion,
	Assign,
	Constant,
	FunctionDef,
	Global,
	Module,
	Name,
	Pass,
} from "../src/types.js";
import { NodeTransformer, NodeVisitor, walk } from "../src/visitor.js";
import { parseCode } from "./test-helpers.js";

/**
 * Source for a `Global` statement whose `names` field is an array of plain
 * strings rather than AST nodes, used to verify that both `walk` and
 * `NodeVisitor` skip non-node items inside array fields instead of choking
 * on them.
 */
const GLOBAL_STMT_SOURCE = "def f():\n    global x, y\n";

function parseGlobalStmt(): Global {
	const tree = parseCode(GLOBAL_STMT_SOURCE);
	const fn = tree.body[0] as FunctionDef;
	const globalStmt = fn.body[0];
	expect(globalStmt.nodeType).toBe("Global");
	return globalStmt as Global;
}

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
			"Store",
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
		const node: ASTNodeUnion = {
			nodeType: "Pass",
			lineno: 1,
			col_offset: 0,
		};
		const nodes = Array.from(walk(node));
		expect(nodes).toEqual([node]);
	});

	it("skips non-node items inside array fields", () => {
		const globalStmt = parseGlobalStmt();
		const types = Array.from(walk(globalStmt)).map((n) => n.nodeType);
		expect(types).toEqual(["Global"]);
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
			visit_Name(node: Name) {
				this.names.push(node.id);
			}
		}
		const tree = parseCode("x = 1\n");
		const collector = new NameCollector();
		collector.genericVisit(tree.body[0]);
		expect(collector.names).toEqual(["x"]);
	});

	it("skips non-node items inside array fields during genericVisit", () => {
		class CountingVisitor extends NodeVisitor {
			visited: string[] = [];
			genericVisit(node: ASTNodeUnion) {
				this.visited.push(node.nodeType);
				super.genericVisit(node);
			}
		}
		const globalStmt = parseGlobalStmt();
		const visitor = new CountingVisitor();
		visitor.visit(globalStmt);
		expect(visitor.visited).toEqual(["Global"]);
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
			visitConstant(node: Constant) {
				if (typeof node.value === "number") {
					return { ...node, value: node.value * 2 };
				}
				return node;
			}
		}
		const tree = parseCode("x = 21\n");
		const result = new ConstantDoubler().visit(tree) as Module;
		const assign = result.body[0] as Assign;
		expect((assign.value as Constant).value).toBe(42);
	});

	it("drops nodes when a visitor returns null", () => {
		class PassRemover extends NodeTransformer {
			visitPass() {
				return null;
			}
		}
		const tree = parseCode("x = 1\npass\ny = 2\n");
		const result = new PassRemover().visit(tree) as Module;
		expect(result.body).toHaveLength(2);
		expect(result.body.map((s) => s.nodeType)).toEqual(["Assign", "Assign"]);
	});

	it("splices in an array when a visitor returns multiple nodes", () => {
		class StatementDuplicator extends NodeTransformer {
			visitPass(node: Pass) {
				return [node, { ...node }];
			}
		}
		const tree = parseCode("pass\n");
		const result = new StatementDuplicator().visit(tree) as Module;
		expect(result.body).toHaveLength(2);
	});

	it("leaves non-node array items untouched", () => {
		const tree = parseCode("def f(a, b): pass\n");
		const transformer = new NodeTransformer();
		const result = transformer.visit(tree) as Module;
		const fn = result.body[0] as FunctionDef;
		expect(fn.name).toBe("f");
	});

	it("leaves primitive array items (e.g. Global names) untouched", () => {
		const tree = parseCode("global x, y\n");
		const result = new NodeTransformer().visit(tree) as Module;
		expect((result.body[0] as Global).names).toEqual(["x", "y"]);
	});

	it("leaves nodes without children unchanged in shape", () => {
		const tree = parseCode("pass\n");
		const result = new NodeTransformer().visit(tree) as Module;
		expect(result.body[0].nodeType).toBe("Pass");
	});
});

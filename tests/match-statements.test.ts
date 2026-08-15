import { describe, expect, test } from "vitest";
import type { StmtNode } from "../src/types.js";
import {
	assertNodeType,
	parseCode,
	parseExpression,
	parseStatement,
} from "./test-helpers.js";

describe("Match Statement Structure", () => {
	test("simple match statement", () => {
		const stmt = parseStatement(`match value:
    case 1:
        pass
    case 2:
        pass`);
		assertNodeType(stmt, "Match");
		expect(stmt.subject.nodeType).toBe("Name");
		expect(stmt.cases).toHaveLength(2);
	});

	test("match with comments between statement and cases (regression test)", () => {
		// This tests the fix for indentation parsing errors when comments appear
		// between the match statement header and the case statements
		const stmt = parseStatement(`match data:
    # This is a comment
    case {
        'type': 'A'
    }:
        print("A")`);
		assertNodeType(stmt, "Match");
		expect(stmt.cases).toHaveLength(1);
		expect(stmt.cases[0].pattern.nodeType).toBe("MatchMapping");
	});

	test("reject invalid one-line match statements", () => {
		expect(() => {
			parseCode("match x: case 1:");
		}).toThrow();
	});

	test("accept valid multi-line match statements", () => {
		const code = `
match x:
    case 1:
        return "one"
`;
		const ast = parseCode(code);
		const matchStmt = ast.body[0];
		assertNodeType(matchStmt, "Match");
		expect(matchStmt.cases).toHaveLength(1);
	});

	test("match statement missing case throws", () => {
		expect(() => parseCode("match x:\n    y = 1\n")).toThrow(/Expected 'case'/);
	});

	test("blank line right after the match block's indent", () => {
		const stmt = parseStatement("match x:\n\n    case 1:\n        pass\n");
		expect(stmt.nodeType).toBe("Match");
	});

	test("blank (whitespace-only) line between case clauses", () => {
		const stmt = parseStatement(
			"match x:\n    case 1:\n        pass\n    \n    case 2:\n        pass\n",
		);
		expect(stmt.nodeType).toBe("Match");
	});

	test("blank line between one-line case clauses", () => {
		const stmt = parseStatement(
			"match x:\n    case 1: pass\n\n    case 2: pass\n",
		);
		expect(stmt.nodeType).toBe("Match");
	});
});

describe("Literal Patterns", () => {
	test("literal true/false/none/string patterns", () => {
		const code = [
			"match x:",
			"    case True:",
			"        pass",
			"    case False:",
			"        pass",
			"    case None:",
			"        pass",
			"    case 'hi':",
			"        pass",
		].join("\n");
		const stmt = parseStatement(`${code}\n`);
		expect(stmt.nodeType).toBe("Match");
	});

	test.each([
		["None", null],
		["True", true],
		["False", false],
	])(
		"'case %s:' produces MatchSingleton, not MatchValue(Constant)",
		(literal, expectedValue) => {
			// Verified against CPython 3.13: `case None/True/False:` produces
			// `MatchSingleton(value=...)`, checked with `is`, not
			// `MatchValue(value=Constant(...))`, which is checked with `==`.
			const ast = parseCode(`match x:\n    case ${literal}:\n        pass\n`);
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchSingleton",
				value: expectedValue,
			});
		},
	);

	test("a negative-number literal pattern parses as MatchValue(UnaryOp(USub, ...))", () => {
		const ast = parseCode("match x:\n    case -1:\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchValue",
			value: {
				nodeType: "UnaryOp",
				op: { nodeType: "USub" },
				operand: { nodeType: "Constant", value: 1 },
			},
		});
	});

	test("a complex-number literal pattern parses as MatchValue(BinOp(...))", () => {
		const ast = parseCode("match x:\n    case -1+2j:\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchValue",
			value: {
				nodeType: "BinOp",
				left: {
					nodeType: "UnaryOp",
					op: { nodeType: "USub" },
					operand: { nodeType: "Constant", value: 1 },
				},
				op: { nodeType: "Add" },
			},
		});
	});

	test("a complex-number literal pattern with '-' parses as MatchValue(BinOp(..., Sub, ...))", () => {
		const ast = parseCode("match x:\n    case 1-2j:\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchValue",
			value: {
				nodeType: "BinOp",
				left: { nodeType: "Constant", value: 1 },
				op: { nodeType: "Sub" },
			},
		});
	});

	test("a non-imaginary right-hand side in a complex pattern is rejected", () => {
		// Verified against CPython 3.13: `ast.parse('match x:\n case 1+2:\n  pass')`
		// raises `SyntaxError: imaginary number required in complex literal`.
		expect(() => parseCode("match x:\n    case 1+2:\n        pass\n")).toThrow(
			/imaginary number required in complex literal/,
		);
	});

	test("an unrecognized pattern token throws instead of silently matching as a wildcard", () => {
		// The parser's previous unconditional-fallback design silently
		// accepted any unrecognized pattern token as a wildcard `_` pattern;
		// it now throws instead. `-True` isn't valid pattern syntax in
		// CPython either (`signed_number` only allows `-` before a numeric
		// literal, not before `True`/`False`/`None`).
		expect(() =>
			parseCode("match x:\n    case -True:\n        pass\n"),
		).toThrow(/invalid syntax/);
	});
});

describe("Capture and Wildcard Patterns", () => {
	test("match with wildcard", () => {
		const stmt = parseStatement(`match value:
    case 1:
        pass
    case _:
        pass`);
		assertNodeType(stmt, "Match");
		expect(stmt.cases).toHaveLength(2);
	});

	test("a bare wildcard 'case _:' produces MatchAs with no pattern and no name", () => {
		// Verified against CPython 3.13: `ast.parse('match x:\n case _:\n  pass')`
		// produces `MatchAs(pattern=None, name=None)`, not `name="_"`.
		const ast = parseCode("match x:\n    case _:\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchAs",
			pattern: undefined,
			name: undefined,
		});
	});

	test("a capture pattern can itself be re-bound with 'as'", () => {
		// Verified against CPython 3.13: `ast.parse('match x:\n case y as z:\n  pass')`
		// produces `MatchAs(pattern=MatchAs(name='y'), name='z')`.
		const ast = parseCode("match x:\n    case y as z:\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchAs",
			pattern: { nodeType: "MatchAs", name: "y" },
			name: "z",
		});
	});

	test("'as _' is rejected (CPython: cannot use '_' as a target)", () => {
		expect(() =>
			parseCode("match x:\n    case 1 as _:\n        pass\n"),
		).toThrow(/cannot use '_' as a target/);
	});

	test("`_` can't start a dotted value pattern", () => {
		// Verified against CPython 3.13: `ast.parse('match x:\n case _.attr:\n  pass')`
		// raises `SyntaxError: invalid syntax`.
		expect(() =>
			parseCode("match x:\n    case _.attr:\n        pass\n"),
		).toThrow(/invalid syntax/);
	});

	test("`_` can't be used as a class pattern name", () => {
		// Verified against CPython 3.13: `ast.parse('match x:\n case _():\n  pass')`
		// raises `SyntaxError: invalid syntax`.
		expect(() =>
			parseCode("match x:\n    case _():\n        pass\n"),
		).toThrow();
	});
});

describe("Value Patterns (dotted names)", () => {
	test("a dotted name is a MatchValue(Attribute), not a capture pattern", () => {
		// Verified against CPython 3.13: `ast.parse('match x:\n case Color.RED:\n  pass')`
		// produces `MatchValue(value=Attribute(...))`, not a `MatchAs` capture.
		const ast = parseCode("match x:\n    case Color.RED:\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchValue",
			value: {
				nodeType: "Attribute",
				value: { nodeType: "Name", id: "Color" },
				attr: "RED",
			},
		});
	});

	test("a multiply-dotted name chains Attribute nodes", () => {
		const ast = parseCode("match x:\n    case a.b.c:\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchValue",
			value: {
				nodeType: "Attribute",
				attr: "c",
				value: {
					nodeType: "Attribute",
					attr: "b",
					value: { nodeType: "Name", id: "a" },
				},
			},
		});
	});
});

describe("Sequence Patterns", () => {
	test("list pattern", () => {
		const stmt = parseStatement("match x:\n    case [1, 2]:\n        pass\n");
		expect(stmt.nodeType).toBe("Match");
	});

	test("empty list pattern", () => {
		const stmt = parseStatement("match x:\n    case []:\n        pass\n");
		expect(stmt.nodeType).toBe("Match");
	});

	test("tuple pattern", () => {
		const stmt = parseStatement("match x:\n    case (1, 2):\n        pass\n");
		expect(stmt.nodeType).toBe("Match");
	});

	test("empty tuple pattern", () => {
		const stmt = parseStatement("match x:\n    case ():\n        pass\n");
		expect(stmt.nodeType).toBe("Match");
	});

	test("star pattern inside sequence", () => {
		const stmt = parseStatement(
			"match x:\n    case [1, *rest]:\n        pass\n",
		);
		expect(stmt.nodeType).toBe("Match");
	});

	test("bare star pattern with no name", () => {
		const stmt = parseStatement("match x:\n    case [*_]:\n        pass\n");
		expect(stmt.nodeType).toBe("Match");
	});

	test("trailing comma in list and tuple patterns", () => {
		const stmt = parseStatement(
			"match x:\n    case [1, 2,]:\n        pass\n    case (1, 2,):\n        pass\n",
		);
		expect(stmt.nodeType).toBe("Match");
	});

	test("a single parenthesized pattern with no trailing comma is a grouping, not a sequence", () => {
		// Verified against CPython 3.13: `ast.parse('match x:\n case (1):\n  pass')`
		// produces `MatchValue(value=Constant(value=1))`, the same as `case 1:`.
		const ast = parseCode("match x:\n    case (1):\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchValue",
			value: { value: 1 },
		});
	});

	test("a single parenthesized pattern with a trailing comma is a one-element sequence", () => {
		const ast = parseCode("match x:\n    case (1,):\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchSequence",
			patterns: [{ nodeType: "MatchValue", value: { value: 1 } }],
		});
	});

	test("'as' works on an element nested inside a sequence pattern", () => {
		const ast = parseCode("match x:\n    case [1 as a, 2]:\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchSequence",
			patterns: [
				{
					nodeType: "MatchAs",
					pattern: { nodeType: "MatchValue", value: { value: 1 } },
					name: "a",
				},
				{ nodeType: "MatchValue", value: { value: 2 } },
			],
		});
	});
});

describe("Mapping Patterns", () => {
	test("simple dictionary pattern", () => {
		const code = `
match data:
    case {'name': str(name)}:
        return name
`;
		const ast = parseCode(code);
		const matchStmt = ast.body[0];
		assertNodeType(matchStmt, "Match");

		const caseStmt = matchStmt.cases[0];
		assertNodeType(caseStmt.pattern, "MatchMapping");
		expect(caseStmt.pattern.keys).toHaveLength(1);
		expect(caseStmt.pattern.patterns).toHaveLength(1);
	});

	test("complex dictionary pattern with multiple keys", () => {
		const code = `
match data:
    case {'type': 'user', 'name': str(name), 'age': int(age)}:
        return f'{name} is {age} years old'
`;
		const ast = parseCode(code);
		const matchStmt = ast.body[0];
		assertNodeType(matchStmt, "Match");

		const caseStmt = matchStmt.cases[0];
		assertNodeType(caseStmt.pattern, "MatchMapping");
		expect(caseStmt.pattern.keys).toHaveLength(3);
		expect(caseStmt.pattern.patterns).toHaveLength(3);
	});

	test("dictionary pattern with rest capture", () => {
		const code = `
match data:
    case {'type': 'admin', **rest}:
        return rest
`;
		const ast = parseCode(code);
		const matchStmt = ast.body[0];
		assertNodeType(matchStmt, "Match");

		const caseStmt = matchStmt.cases[0];
		assertNodeType(caseStmt.pattern, "MatchMapping");
		expect(caseStmt.pattern.rest).toBe("rest");
	});

	test("mapping pattern with rest", () => {
		const stmt = parseStatement(
			"match x:\n    case {'a': 1, **rest}:\n        pass\n",
		);
		expect(stmt.nodeType).toBe("Match");
	});
});

describe("Class Patterns", () => {
	test("class pattern with arguments", () => {
		const code = `
match value:
    case str(name):
        return f'String: {name}'
`;
		const ast = parseCode(code);
		const matchStmt = ast.body[0];
		assertNodeType(matchStmt, "Match");

		const caseStmt = matchStmt.cases[0];
		assertNodeType(caseStmt.pattern, "MatchClass");
		expect(caseStmt.pattern.patterns).toHaveLength(1);
	});

	test("class pattern with multiple arguments", () => {
		const code = `
match point:
    case Point(int(x), int(y)):
        return f'Point at ({x}, {y})'
`;
		const ast = parseCode(code);
		const matchStmt = ast.body[0];
		assertNodeType(matchStmt, "Match");

		const caseStmt = matchStmt.cases[0];
		assertNodeType(caseStmt.pattern, "MatchClass");
		expect(caseStmt.pattern.patterns).toHaveLength(2);
	});

	test("class pattern with keyword arguments", () => {
		const code = `
match point:
    case Point(x=int(x_val), y=int(y_val)):
        return f'Point at x={x_val}, y={y_val}'
`;
		const ast = parseCode(code);
		const matchStmt = ast.body[0];
		assertNodeType(matchStmt, "Match");

		const caseStmt = matchStmt.cases[0];
		assertNodeType(caseStmt.pattern, "MatchClass");
		expect(caseStmt.pattern.kwd_attrs).toHaveLength(2);
		expect(caseStmt.pattern.kwd_patterns).toHaveLength(2);
	});

	test("class pattern with mixed positional and keyword arguments", () => {
		const code = `
match data:
    case Person(str(name), age=int(age)):
        return f'{name} is {age} years old'
`;
		const ast = parseCode(code);
		const matchStmt = ast.body[0];
		assertNodeType(matchStmt, "Match");

		const caseStmt = matchStmt.cases[0];
		assertNodeType(caseStmt.pattern, "MatchClass");
		expect(caseStmt.pattern.patterns).toHaveLength(1);
		expect(caseStmt.pattern.kwd_attrs).toHaveLength(1);
		expect(caseStmt.pattern.kwd_patterns).toHaveLength(1);
	});

	test("a class pattern with positional and keyword sub-patterns", () => {
		const ast = parseCode("match x:\n    case Point(1, y=2):\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchClass",
			cls: { nodeType: "Name", id: "Point" },
			patterns: [{ nodeType: "MatchValue", value: { value: 1 } }],
			kwd_attrs: ["y"],
			kwd_patterns: [{ nodeType: "MatchValue", value: { value: 2 } }],
		});
	});

	test("a dotted class pattern parses cls as an Attribute chain", () => {
		// Verified against CPython 3.13: `ast.parse('match x:\n case mod.Point(x=1):\n  pass')`.
		const ast = parseCode("match x:\n    case mod.Point(x=1):\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchClass",
			cls: {
				nodeType: "Attribute",
				value: { nodeType: "Name", id: "mod" },
				attr: "Point",
			},
		});
	});
});

describe("Or Patterns", () => {
	test("dotted value patterns can be combined with '|'", () => {
		const ast = parseCode(
			"match x:\n    case Color.RED | Color.BLUE:\n        pass\n",
		);
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern.nodeType).toBe("MatchOr");
	});

	test("'as' binds a name to a value pattern", () => {
		const ast = parseCode("match x:\n    case 1 as y:\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchAs",
			pattern: { nodeType: "MatchValue", value: { value: 1 } },
			name: "y",
		});
	});

	test("'as' binds a name to the whole '|' alternation, not just the last alternative", () => {
		const ast = parseCode("match x:\n    case 1 | 2 as y:\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchAs",
			pattern: { nodeType: "MatchOr" },
			name: "y",
		});
	});

	test("'as' works after a parenthesized alternation", () => {
		const ast = parseCode("match x:\n    case (1 | 2) as y:\n        pass\n");
		const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
		expect(matchStmt.cases[0].pattern).toMatchObject({
			nodeType: "MatchAs",
			pattern: { nodeType: "MatchOr" },
			name: "y",
		});
	});
});

describe("Guards", () => {
	test("match with pattern and guard", () => {
		const stmt = parseStatement(`match value:
    case x if x > 0:
        pass`);
		assertNodeType(stmt, "Match");
		expect(stmt.cases[0].guard?.nodeType).toBe("Compare");
	});

	test("dictionary pattern with guard", () => {
		const code = `
match data:
    case {'type': 'user', 'name': str(name), 'age': int(age)} if age >= 18:
        return f'Adult: {name}'
`;
		const ast = parseCode(code);
		const matchStmt = ast.body[0];
		assertNodeType(matchStmt, "Match");

		const caseStmt = matchStmt.cases[0];
		assertNodeType(caseStmt.pattern, "MatchMapping");
		expect(caseStmt.guard).toBeTruthy();
		if (!caseStmt.guard) {
			throw new Error("expected guard to be defined");
		}
		assertNodeType(caseStmt.guard, "Compare");
	});
});

describe("match/case/type as soft keywords", () => {
	// Verified against CPython 3.13: `match`, `case`, and `type` are soft
	// keywords, valid as ordinary identifiers everywhere outside the
	// specific syntax they introduce.
	test("match as a plain assignment target", () => {
		const stmt = parseStatement("match = 5\n");
		expect(stmt.nodeType).toBe("Assign");
	});

	test("match as a function name", () => {
		const stmt = parseStatement("def match():\n    pass\n");
		expect(stmt.nodeType).toBe("FunctionDef");
		expect((stmt as { name: string }).name).toBe("match");
	});

	test("match as an attribute name (re.match)", () => {
		const expr = parseExpression("re.match(pattern, s)");
		expect(expr.nodeType).toBe("Call");
	});

	test("case as a plain assignment target", () => {
		const stmt = parseStatement("case = 3\n");
		expect(stmt.nodeType).toBe("Assign");
	});

	test("match used as both the statement keyword and the subject name", () => {
		const stmt = parseStatement("match match:\n    case case:\n        pass\n");
		expect(stmt.nodeType).toBe("Match");
	});

	test("match followed by a subscript target is an annotated assignment, not a match statement", () => {
		// `match[0]: int = 1` parses as `AnnAssign` in CPython: the
		// match_stmt alternative fails (no NEWLINE after the header) and
		// backtracks entirely, same as this parser's speculative attempt.
		const stmt = parseStatement("match[0]: int = 1\n");
		expect(stmt.nodeType).toBe("AnnAssign");
	});

	test("match header with an invalid body still reports the real match-statement error", () => {
		// Once `match <expr> :` is followed by NEWLINE, CPython commits to
		// match_stmt; a missing `case` clause is a hard error, not a
		// backtrack into a different (also invalid) interpretation.
		expect(() => parseCode("match x:\n    y = 1\n")).toThrow(/Expected 'case'/);
	});

	test("type as a plain assignment target", () => {
		const stmt = parseStatement("type = 5\n");
		expect(stmt.nodeType).toBe("Assign");
	});

	test("type as a call", () => {
		const expr = parseExpression("type(x)");
		expect(expr.nodeType).toBe("Call");
	});

	test("type alias statement still parses", () => {
		const stmt = parseStatement("type X = int\n");
		expect(stmt.nodeType).toBe("TypeAlias");
	});

	test("type alias statement with type params still parses", () => {
		const stmt = parseStatement("type X[T] = list[T]\n");
		expect(stmt.nodeType).toBe("TypeAlias");
		expect((stmt as { type_params: unknown[] }).type_params).toHaveLength(1);
	});

	test("match subject with no colon backtracks and reports invalid syntax", () => {
		// Exercises tryParseMatchStmt's "not a match statement" backtrack
		// when a colon never follows the subject expression.
		expect(() => parseCode("match x\n")).toThrow(/invalid syntax/);
	});

	test("type NAME with no '=' backtracks and reports invalid syntax", () => {
		// Exercises the type-alias attempt's "not a type alias" backtrack
		// when '=' never follows the name (and optional type params).
		expect(() => parseCode("type X\n")).toThrow(/invalid syntax/);
	});
});

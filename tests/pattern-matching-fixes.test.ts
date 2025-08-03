import { parse, unparse } from "../src/index.js";
import type { StmtNode } from "../src/types.js";

function assertNodeType<T extends { nodeType: string }>(
	node: any,
	expectedType: string,
): asserts node is T {
	expect(node.nodeType).toBe(expectedType);
}

describe("Pattern Matching Fixes", () => {
	describe("Dictionary/Mapping Patterns", () => {
		test("simple dictionary pattern", () => {
			const code = `
match data:
    case {'name': str(name)}:
        return name
`;
			const ast = parse(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchMapping");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchMapping" }>;
			expect(pattern.keys).toHaveLength(1);
			expect(pattern.patterns).toHaveLength(1);
		});

		test("complex dictionary pattern with multiple keys", () => {
			const code = `
match data:
    case {'type': 'user', 'name': str(name), 'age': int(age)}:
        return f'{name} is {age} years old'
`;
			const ast = parse(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchMapping");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchMapping" }>;
			expect(pattern.keys).toHaveLength(3);
			expect(pattern.patterns).toHaveLength(3);
		});

		test("dictionary pattern with guard", () => {
			const code = `
match data:
    case {'type': 'user', 'name': str(name), 'age': int(age)} if age >= 18:
        return f'Adult: {name}'
`;
			const ast = parse(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchMapping");
			expect(caseStmt.guard).toBeTruthy();
			assertNodeType(caseStmt.guard!, "Compare");
		});

		test("dictionary pattern with rest capture", () => {
			const code = `
match data:
    case {'type': 'admin', **rest}:
        return rest
`;
			const ast = parse(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchMapping");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchMapping" }>;
			expect(pattern.rest).toBe("rest");
		});
	});

	describe("Class Pattern Fixes", () => {
		test("class pattern with arguments", () => {
			const code = `
match value:
    case str(name):
        return f'String: {name}'
`;
			const ast = parse(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchClass");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchClass" }>;
			expect(pattern.patterns).toHaveLength(1);
		});

		test("class pattern with multiple arguments", () => {
			const code = `
match point:
    case Point(int(x), int(y)):
        return f'Point at ({x}, {y})'
`;
			const ast = parse(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchClass");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchClass" }>;
			expect(pattern.patterns).toHaveLength(2);
		});

		test("class pattern with keyword arguments", () => {
			const code = `
match point:
    case Point(x=int(x_val), y=int(y_val)):
        return f'Point at x={x_val}, y={y_val}'
`;
			const ast = parse(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchClass");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchClass" }>;
			expect(pattern.kwd_attrs).toHaveLength(2);
			expect(pattern.kwd_patterns).toHaveLength(2);
		});

		test("class pattern with mixed positional and keyword arguments", () => {
			const code = `
match data:
    case Person(str(name), age=int(age)):
        return f'{name} is {age} years old'
`;
			const ast = parse(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchClass");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchClass" }>;
			expect(pattern.patterns).toHaveLength(1);
			expect(pattern.kwd_attrs).toHaveLength(1);
			expect(pattern.kwd_patterns).toHaveLength(1);
		});
	});

	describe("TryStar (except*) Fixes", () => {
		test("simple except* syntax", () => {
			const code = `
try:
    risky_operation()
except* ValueError as e:
    handle_error(e)
`;
			const ast = parse(code);
			const tryStmt = ast.body[0];
			assertNodeType(tryStmt, "TryStar");
			expect((tryStmt as Extract<StmtNode, { nodeType: "TryStar" }>).handlers).toHaveLength(1);
		});

		test("multiple except* handlers", () => {
			const code = `
try:
    risky_operation()
except* ValueError as e:
    handle_value_error(e)
except* TypeError as e:
    handle_type_error(e)
`;
			const ast = parse(code);
			const tryStmt = ast.body[0];
			assertNodeType(tryStmt, "TryStar");
			expect((tryStmt as Extract<StmtNode, { nodeType: "TryStar" }>).handlers).toHaveLength(2);
		});

		test("except* with finally", () => {
			const code = `
try:
    risky_operation()
except* ValueError as e:
    handle_error(e)
finally:
    cleanup()
`;
			const ast = parse(code);
			const tryStmt = ast.body[0];
			assertNodeType(tryStmt, "TryStar");
			expect((tryStmt as Extract<StmtNode, { nodeType: "TryStar" }>).handlers).toHaveLength(1);
			expect((tryStmt as Extract<StmtNode, { nodeType: "TryStar" }>).finalbody).toHaveLength(1);
		});
	});

	describe("Complex Pattern Combinations", () => {
		test("nested patterns with multiple constructs", () => {
			const code = `
match data:
    case {'users': [{'name': str(name), 'age': int(age)}]}:
        return f'Adult users: {name}'
    case {'type': 'admin', **config}:
        return f'Admin config: {config}'
    case [str(item)]:
        return 'String item'
    case _:
        return 'Unknown pattern'
`;
			const ast = parse(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			expect((matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases).toHaveLength(4);
		});
	});
});

describe("Unparser Indentation Fixes", () => {
	describe("Match Statement Indentation", () => {
		test("simple match statement indentation", () => {
			const code = `
match data:
    case {'name': str(name)}:
        return f'String: {name}'
`;
			const ast = parse(code);
			const unparsed = unparse(ast);
			
			// Check that case statements are properly indented
			expect(unparsed).toContain("    case {'name': str(name)}:");
			// Check that case body is properly indented
			expect(unparsed).toContain('        return f"String: {name}"');
		});

		test("multiple case statements indentation", () => {
			const code = `
match value:
    case str(name):
        return f'String: {name}'
    case int(num):
        return f'Number: {num}'
    case _:
        return 'Unknown'
`;
			const ast = parse(code);
			const unparsed = unparse(ast);
			
			const lines = unparsed.split('\n');
			const caseLines = lines.filter(line => line.trim().startsWith('case '));
			const bodyLines = lines.filter(line => line.trim().startsWith('return '));
			
			// All case statements should be indented by 4 spaces
			for (const line of caseLines) {
				expect(line).toMatch(/^    case /);
			}
			
			// All return statements should be indented by 8 spaces
			for (const line of bodyLines) {
				expect(line).toMatch(/^        return /);
			}
		});

		test("nested match statements indentation", () => {
			const code = `
def process_data(data):
    match data:
        case {'type': 'nested'}:
            match data['value']:
                case int(num):
                    return num * 2
                case str(text):
                    return text.upper()
        case _:
            return None
`;
			const ast = parse(code);
			const unparsed = unparse(ast);
			
			// Check outer match indentation
			expect(unparsed).toContain("    match data:");
			expect(unparsed).toContain("        case {'type': \"nested\"}:");
			
			// Check inner match indentation
			expect(unparsed).toContain("            match data['value']:");
			expect(unparsed).toContain("                case int(num):");
			expect(unparsed).toContain("                    return num * 2");
		});
	});

	describe("TryStar Unparser Fixes", () => {
		test("except* syntax in unparsed output", () => {
			const code = `
try:
    risky_operation()
except* ValueError as e:
    handle_error(e)
`;
			const ast = parse(code);
			const unparsed = unparse(ast);
			
			// Should contain except* not except
			expect(unparsed).toContain("except* ValueError as e:");
			expect(unparsed).not.toContain("except ValueError as e:");
		});

		test("multiple except* handlers in unparsed output", () => {
			const code = `
try:
    risky_operation()
except* ValueError as e:
    handle_value_error(e)
except* TypeError as e:
    handle_type_error(e)
`;
			const ast = parse(code);
			const unparsed = unparse(ast);
			
			// Should contain both except* handlers
			expect(unparsed).toContain("except* ValueError as e:");
			expect(unparsed).toContain("except* TypeError as e:");
			
			// Count occurrences to ensure both are present
			const exceptStarCount = (unparsed.match(/except\*/g) || []).length;
			expect(exceptStarCount).toBe(2);
		});
	});

	describe("Round-trip Testing", () => {
		test("complex pattern matching round-trip", () => {
			const originalCode = `
try:
    result = await process_user_data(data)
    match result:
        case {'type': 'user', 'name': str(name), 'age': int(age)} if age >= 18:
            create_adult_user(name, age)
        case {'type': 'admin', **rest}:
            create_admin_user(rest)
        case _:
            handle_unknown_result(result)
except* ValueError as e:
    handle_value_error(e)
except* TypeError as e:
    handle_type_error(e)
finally:
    cleanup_resources()
`;
			
			// Parse, unparse, and parse again
			const ast1 = parse(originalCode);
			const unparsed = unparse(ast1);
			const ast2 = parse(unparsed);
			
			// The second parse should succeed
			expect(ast2).toBeTruthy();
			expect(ast2.body).toHaveLength(1);
			
			// Check that key features are preserved
			expect(unparsed).toContain("except* ValueError");
			expect(unparsed).toContain("except* TypeError");
			expect(unparsed).toContain("case {'type': \"user\"");
			expect(unparsed).toContain("if age >= 18:");
			expect(unparsed).toContain("**rest");
		});

		test("dictionary patterns round-trip", () => {
			const patterns = [
				"match x:\n    case {'a': 1}:\n        pass",
				"match x:\n    case {'a': str(name)}:\n        pass",
				"match x:\n    case {'a': 1, 'b': str(name)}:\n        pass",
				"match x:\n    case {'type': 'user', **rest}:\n        pass",
			];
			
			for (const pattern of patterns) {
				const ast1 = parse(pattern);
				const unparsed = unparse(ast1);
				const ast2 = parse(unparsed);
				
				expect(ast2).toBeTruthy();
				expect(ast2.body).toHaveLength(1);
			}
		});

		test("class patterns round-trip", () => {
			const patterns = [
				"match x:\n    case str(name):\n        pass",
				"match x:\n    case Point(int(x), int(y)):\n        pass",
				"match x:\n    case Person(name=str(n), age=int(a)):\n        pass",
				"match x:\n    case Data(str(name), age=int(a)):\n        pass",
			];
			
			for (const pattern of patterns) {
				const ast1 = parse(pattern);
				const unparsed = unparse(ast1);
				const ast2 = parse(unparsed);
				
				expect(ast2).toBeTruthy();
				expect(ast2.body).toHaveLength(1);
			}
		});
	});
});

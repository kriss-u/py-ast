import { parse } from "../src/index.js";
import { assertNodeType } from "./test-helpers.js";

function parseStatement(code: string) {
	const ast = parse(code);
	return ast.body[0];
}

describe("Metaclass and Pattern Matching Fixes", () => {
	describe("Metaclass Syntax in Class Definitions", () => {
		test("simple metaclass", () => {
			const stmt = parseStatement(`class DatabaseConnection(metaclass=SingletonMeta):
    pass`);
			assertNodeType(stmt, "ClassDef");
			expect(stmt.name).toBe("DatabaseConnection");
			expect(stmt.bases).toHaveLength(0);
			expect(stmt.keywords).toHaveLength(1);
			expect(stmt.keywords[0].arg).toBe("metaclass");
			expect(stmt.keywords[0].value.nodeType).toBe("Name");
			expect((stmt.keywords[0].value as any).id).toBe("SingletonMeta");
		});

		test("class with base class and metaclass", () => {
			const stmt = parseStatement(`class MyClass(BaseClass, metaclass=MyMeta):
    pass`);
			assertNodeType(stmt, "ClassDef");
			expect(stmt.name).toBe("MyClass");
			expect(stmt.bases).toHaveLength(1);
			expect(stmt.bases[0].nodeType).toBe("Name");
			expect((stmt.bases[0] as any).id).toBe("BaseClass");
			expect(stmt.keywords).toHaveLength(1);
			expect(stmt.keywords[0].arg).toBe("metaclass");
			expect((stmt.keywords[0].value as any).id).toBe("MyMeta");
		});

		test("class with multiple bases and keyword arguments", () => {
			const stmt = parseStatement(`class Complex(Base1, Base2, metaclass=Meta, foo=bar, baz=42):
    pass`);
			assertNodeType(stmt, "ClassDef");
			expect(stmt.name).toBe("Complex");
			expect(stmt.bases).toHaveLength(2);
			expect((stmt.bases[0] as any).id).toBe("Base1");
			expect((stmt.bases[1] as any).id).toBe("Base2");
			expect(stmt.keywords).toHaveLength(3);
			
			// Check metaclass keyword
			const metaclassKw = stmt.keywords.find(kw => kw.arg === "metaclass");
			expect(metaclassKw).toBeDefined();
			expect((metaclassKw!.value as any).id).toBe("Meta");
			
			// Check foo keyword
			const fooKw = stmt.keywords.find(kw => kw.arg === "foo");
			expect(fooKw).toBeDefined();
			expect((fooKw!.value as any).id).toBe("bar");
			
			// Check baz keyword
			const bazKw = stmt.keywords.find(kw => kw.arg === "baz");
			expect(bazKw).toBeDefined();
			expect((bazKw!.value as any).value).toBe(42);
		});

		test("class with only keyword arguments (no bases)", () => {
			const stmt = parseStatement(`class MyClass(metaclass=SingletonMeta, abstract=True):
    pass`);
			assertNodeType(stmt, "ClassDef");
			expect(stmt.name).toBe("MyClass");
			expect(stmt.bases).toHaveLength(0);
			expect(stmt.keywords).toHaveLength(2);
		});
	});

	describe("Pattern Matching with Class Constructors", () => {
		test("int() pattern matching", () => {
			const stmt = parseStatement(`match value:
    case int():
        pass`);
			assertNodeType(stmt, "Match");
			expect(stmt.cases).toHaveLength(1);
			expect(stmt.cases[0].pattern.nodeType).toBe("MatchClass");
			expect((stmt.cases[0].pattern as any).cls.nodeType).toBe("Name");
			expect((stmt.cases[0].pattern as any).cls.id).toBe("int");
			expect((stmt.cases[0].pattern as any).patterns).toHaveLength(0);
		});

		test("int() pattern with guard", () => {
			const stmt = parseStatement(`match value:
    case int() if value > 0:
        pass`);
			assertNodeType(stmt, "Match");
			expect(stmt.cases[0].pattern.nodeType).toBe("MatchClass");
			expect((stmt.cases[0].pattern as any).cls.id).toBe("int");
			expect(stmt.cases[0].guard).toBeDefined();
			expect(stmt.cases[0].guard!.nodeType).toBe("Compare");
		});

		test("multiple class patterns", () => {
			const stmt = parseStatement(`match value:
    case int():
        pass
    case str():
        pass
    case list():
        pass`);
			assertNodeType(stmt, "Match");
			expect(stmt.cases).toHaveLength(3);
			
			expect(stmt.cases[0].pattern.nodeType).toBe("MatchClass");
			expect((stmt.cases[0].pattern as any).cls.id).toBe("int");
			
			expect(stmt.cases[1].pattern.nodeType).toBe("MatchClass");
			expect((stmt.cases[1].pattern as any).cls.id).toBe("str");
			
			expect(stmt.cases[2].pattern.nodeType).toBe("MatchClass");
			expect((stmt.cases[2].pattern as any).cls.id).toBe("list");
		});

		test("complex pattern matching with guards", () => {
			const stmt = parseStatement(`match value:
    case int() if value > 0:
        return "positive"
    case int() if value < 0:
        return "negative"
    case int():
        return "zero"
    case str() if len(value) > 0:
        return "non-empty string"
    case _:
        return "unknown"`);
			assertNodeType(stmt, "Match");
			expect(stmt.cases).toHaveLength(5);
			
			// Test first case (positive int)
			expect(stmt.cases[0].pattern.nodeType).toBe("MatchClass");
			expect((stmt.cases[0].pattern as any).cls.id).toBe("int");
			expect(stmt.cases[0].guard).toBeDefined();
			
			// Test second case (negative int)
			expect(stmt.cases[1].pattern.nodeType).toBe("MatchClass");
			expect((stmt.cases[1].pattern as any).cls.id).toBe("int");
			expect(stmt.cases[1].guard).toBeDefined();
			
			// Test third case (zero)
			expect(stmt.cases[2].pattern.nodeType).toBe("MatchClass");
			expect((stmt.cases[2].pattern as any).cls.id).toBe("int");
			expect(stmt.cases[2].guard).toBeUndefined();
			
			// Test fourth case (str with guard)
			expect(stmt.cases[3].pattern.nodeType).toBe("MatchClass");
			expect((stmt.cases[3].pattern as any).cls.id).toBe("str");
			expect(stmt.cases[3].guard).toBeDefined();
			
			// Test wildcard case
			expect(stmt.cases[4].pattern.nodeType).toBe("MatchAs");
			expect((stmt.cases[4].pattern as any).name).toBe("_");
		});

		test("mixed pattern types", () => {
			const stmt = parseStatement(`match value:
    case 42:
        pass
    case int():
        pass
    case "hello":
        pass
    case str():
        pass
    case []:
        pass
    case [1, 2]:
        pass
    case x:
        pass`);
			assertNodeType(stmt, "Match");
			expect(stmt.cases).toHaveLength(7);
			
			// Literal pattern
			expect(stmt.cases[0].pattern.nodeType).toBe("MatchValue");
			
			// Class pattern  
			expect(stmt.cases[1].pattern.nodeType).toBe("MatchClass");
			expect((stmt.cases[1].pattern as any).cls.id).toBe("int");
			
			// String literal pattern
			expect(stmt.cases[2].pattern.nodeType).toBe("MatchValue");
			
			// Class pattern
			expect(stmt.cases[3].pattern.nodeType).toBe("MatchClass");
			expect((stmt.cases[3].pattern as any).cls.id).toBe("str");
			
			// Empty list pattern
			expect(stmt.cases[4].pattern.nodeType).toBe("MatchSequence");
			expect((stmt.cases[4].pattern as any).patterns).toHaveLength(0);
			
			// List pattern with elements
			expect(stmt.cases[5].pattern.nodeType).toBe("MatchSequence");
			expect((stmt.cases[5].pattern as any).patterns).toHaveLength(2);
			
			// Variable binding pattern
			expect(stmt.cases[6].pattern.nodeType).toBe("MatchAs");
			expect((stmt.cases[6].pattern as any).name).toBe("x");
		});
	});
});

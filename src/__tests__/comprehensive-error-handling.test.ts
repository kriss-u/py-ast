import { parse } from "../parser.js";
import { assertNodeType } from "./test-helpers.js";

describe("Error Handling and Edge Cases", () => {
  describe("Syntax Errors", () => {
    test("unclosed string", () => {
      expect(() => parse('"unclosed string')).toThrow(
        /Unterminated string literal/
      );
    });

    test("unclosed triple string", () => {
      expect(() => parse('"""unclosed triple')).toThrow(
        /Unterminated triple-quoted string literal/
      );
    });

    test("unmatched parentheses", () => {
      expect(() => parse("(1 + 2")).toThrow();
    });

    test("unmatched brackets", () => {
      expect(() => parse("[1, 2, 3")).toThrow();
    });

    test("unmatched braces", () => {
      expect(() => parse("{1, 2, 3")).toThrow();
    });

    test("invalid operator", () => {
      expect(() => parse("x @@ y")).toThrow();
    });

    test("invalid operator combinations should fail", () => {
      // Python accepts ++ and -- as consecutive unary/binary operators
      expect(() => parse("x ++ y")).not.toThrow(); // x + (+y)
      expect(() => parse("x -- y")).not.toThrow(); // x - (-y)
      expect(() => parse("x +++ y")).not.toThrow(); // x + (+(+y))

      // But starred expressions should only be valid in specific contexts
      expect(() => parse("x +* y")).toThrow();
      expect(() => parse("x -* y")).toThrow();
    });

    test("invalid assignment target should fail", () => {
      // In Python, literals cannot be assignment targets
      expect(() => parse("1 = x")).toThrow();
      expect(() => parse('"hello" = x')).toThrow();
      expect(() => parse("(1 + 2) = x")).toThrow();
    });
  });

  describe("Indentation Errors", () => {
    test("missing indentation after colon", () => {
      expect(() => parse("if True:\nprint('hello')")).toThrow(
        /Expected indented block/
      );
    });

    test("inconsistent indentation", () => {
      expect(() => parse("if True:\n    x = 1\n  y = 2")).toThrow();
    });

    test("unexpected indentation should fail", () => {
      // Python requires consistent indentation
      expect(() => parse("x = 1\n    y = 2")).toThrow(); // unexpected indent
      expect(() => parse("if True:\n    pass\n        x = 1")).toThrow(); // inconsistent indent
    });

    test("missing dedent should fail", () => {
      // Python requires proper block closure
      expect(() =>
        parse("def func():\n    x = 1\n    y = 2\n        z = 3")
      ).toThrow();
    });
  });

  describe("Invalid Keywords", () => {
    test("invalid def syntax", () => {
      expect(() => parse("def")).toThrow();
    });

    test("invalid class syntax", () => {
      expect(() => parse("class")).toThrow();
    });

    test("invalid if syntax", () => {
      expect(() => parse("if")).toThrow();
    });

    test("invalid for syntax", () => {
      expect(() => parse("for")).toThrow();
    });

    test("invalid while syntax", () => {
      expect(() => parse("while")).toThrow();
    });

    test("invalid try syntax", () => {
      expect(() => parse("try")).toThrow();
    });
  });

  describe("Invalid Expressions", () => {
    test("empty expression", () => {
      // Empty parentheses () is actually valid in Python (empty tuple)
      const ast = parse("()");
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      expect(stmt.value.nodeType).toBe("Tuple");
    });

    test("trailing comma in function call", () => {
      // This should be valid in Python
      expect(() => parse("func(1, 2,)")).not.toThrow();
    });

    test("invalid generator expression", () => {
      expect(() => parse("(x for)")).toThrow();
    });

    test("invalid comprehension", () => {
      expect(() => parse("[x for]")).toThrow();
    });

    test("invalid lambda", () => {
      expect(() => parse("lambda")).toThrow();
    });
  });

  describe("Edge Cases - Valid but Unusual", () => {
    test("empty module", () => {
      const ast = parse("");
      expect(ast.nodeType).toBe("Module");
      expect(ast.body).toHaveLength(0);
    });

    test("only comments", () => {
      const ast = parse("# This is a comment\n# Another comment");
      expect(ast.nodeType).toBe("Module");
      expect(ast.body).toHaveLength(0);
    });

    test("only whitespace", () => {
      const ast = parse("   \n  \n   ");
      expect(ast.nodeType).toBe("Module");
      expect(ast.body).toHaveLength(0);
    });

    test("very long identifier", () => {
      const longName = "a" + "b".repeat(1000);
      const ast = parse(`${longName} = 1`);
      const stmt = ast.body[0];
      assertNodeType(stmt, "Assign");
      assertNodeType(stmt.targets[0], "Name");
      expect(stmt.targets[0].id).toBe(longName);
    });

    test("deeply nested expressions", () => {
      const nested = "(".repeat(100) + "1" + ")".repeat(100);
      const ast = parse(nested);
      expect(ast.nodeType).toBe("Module");
    });

    test("many chained method calls", () => {
      const chained = "obj" + ".method()".repeat(50);
      const ast = parse(chained);
      expect(ast.nodeType).toBe("Module");
    });
  });

  describe("Unicode and Special Characters", () => {
    test("unicode identifiers", () => {
      const ast = parse("π = 3.14159");
      const stmt = ast.body[0];
      assertNodeType(stmt, "Assign");
      assertNodeType(stmt.targets[0], "Name");
      expect(stmt.targets[0].id).toBe("π");
    });

    test("unicode strings", () => {
      const ast = parse('"Hello 世界"');
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      assertNodeType(stmt.value, "Constant");
      expect(stmt.value.value).toBe("Hello 世界");
    });

    test("emoji identifiers should fail", () => {
      // Python identifiers must follow specific Unicode rules
      // Most emoji are not valid Python identifiers
      expect(() => parse("🐍 = 'python'")).toThrow(/Unexpected character/);
      expect(() => parse("x🔥 = 1")).toThrow(/Unexpected character/);
    });

    test("non-ASCII string literals", () => {
      const ast = parse("'café'");
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      assertNodeType(stmt.value, "Constant");
      expect(stmt.value.value).toBe("café");
    });
  });

  describe("Number Edge Cases", () => {
    test("very large integer", () => {
      const largeNum = "1" + "0".repeat(100);
      const ast = parse(largeNum);
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      expect(stmt.value.nodeType).toBe("Constant");
    });

    test("scientific notation", () => {
      const ast = parse("1.23e-45");
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      assertNodeType(stmt.value, "Constant");
      expect(typeof stmt.value.value).toBe("number");
    });

    test("hexadecimal numbers", () => {
      const ast = parse("0xDEADBEEF");
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      expect(stmt.value.nodeType).toBe("Constant");
    });

    test("binary numbers", () => {
      const ast = parse("0b101010");
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      expect(stmt.value.nodeType).toBe("Constant");
    });

    test("octal numbers", () => {
      const ast = parse("0o777");
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      expect(stmt.value.nodeType).toBe("Constant");
    });
  });

  describe("String Edge Cases", () => {
    test("empty string", () => {
      const ast = parse('""');
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      assertNodeType(stmt.value, "Constant");
      expect(stmt.value.value).toBe("");
    });

    test("string with escape sequences", () => {
      const ast = parse('"\\n\\t\\r\\\\"');
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      assertNodeType(stmt.value, "Constant");
      expect(stmt.value.value).toBe("\n\t\r\\");
    });

    test("raw string", () => {
      const ast = parse('r"\\n\\t"');
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      assertNodeType(stmt.value, "Constant");
      expect(stmt.value.value).toBe("\\n\\t");
    });

    test("triple quoted string", () => {
      const ast = parse('"""This is a\nmulti-line\nstring"""');
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      assertNodeType(stmt.value, "Constant");
      expect(stmt.value.value).toBe("This is a\nmulti-line\nstring");
    });

    test("mixed quotes", () => {
      const ast = parse("'He said \"Hello\"'");
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      assertNodeType(stmt.value, "Constant");
      expect(stmt.value.value).toBe('He said "Hello"');
    });
  });

  describe("Complex Nested Structures", () => {
    test("nested function definitions", () => {
      const code = `
def outer():
    def inner():
        def deepest():
            return 42
        return deepest()
    return inner()
      `;
      const ast = parse(code);
      expect(ast.body[0].nodeType).toBe("FunctionDef");
    });

    test("nested class definitions", () => {
      const code = `
class Outer:
    class Inner:
        class Deepest:
            pass
      `;
      const ast = parse(code);
      expect(ast.body[0].nodeType).toBe("ClassDef");
    });

    test("complex comprehension nesting", () => {
      const code = "[[y for y in x] for x in matrix if x]";
      const ast = parse(code);
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      expect(stmt.value.nodeType).toBe("ListComp");
    });
  });

  describe("Operator Precedence Edge Cases", () => {
    test("mixed arithmetic and boolean", () => {
      const ast = parse("x + y and z * w");
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      expect(stmt.value.nodeType).toBe("BoolOp");
    });

    test("comparison chaining", () => {
      const ast = parse("1 < x < 10 <= y == z");
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      expect(stmt.value.nodeType).toBe("Compare");
    });

    test("power operator precedence", () => {
      const ast = parse("-2 ** 2");
      // Should be -(2**2) = -4, not (-2)**2 = 4
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      expect(stmt.value.nodeType).toBe("UnaryOp");
    });

    test("ternary operator precedence", () => {
      const ast = parse("x if y else z if w else v");
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      expect(stmt.value.nodeType).toBe("IfExp");
    });
  });

  describe("Function and Class Edge Cases", () => {
    test("function with all parameter types", () => {
      const code = "def func(a, b=1, *args, c, d=2, **kwargs): pass";
      const ast = parse(code);
      expect(ast.body[0].nodeType).toBe("FunctionDef");
    });

    test("async function", () => {
      const code = "async def func(): await something()";
      const ast = parse(code);
      expect(ast.body[0].nodeType).toBe("AsyncFunctionDef");
    });

    test("multiple decorators", () => {
      const code = `
@decorator1
@decorator2(arg)
@decorator3.method
def func(): pass
      `;
      const ast = parse(code);
      const stmt = ast.body[0];
      assertNodeType(stmt, "FunctionDef");
      expect(stmt.decorator_list).toHaveLength(3);
    });

    test("class with multiple inheritance", () => {
      const code = "class Child(Parent1, Parent2, mixin.Mixin): pass";
      const ast = parse(code);
      const stmt = ast.body[0];
      assertNodeType(stmt, "ClassDef");
      expect(stmt.bases).toHaveLength(3);
    });
  });

  describe("Advanced Python Features", () => {
    test("match statement", () => {
      const code = `
match value:
    case 1:
        print("one")
    case 2 | 3:
        print("two or three")
    case _:
        print("other")
      `;
      const ast = parse(code);
      expect(ast.body[0].nodeType).toBe("Match");
    });

    test("type alias", () => {
      const code = "type Vector = list[float]";
      const ast = parse(code);
      expect(ast.body[0].nodeType).toBe("TypeAlias");
    });

    test("f-string with complex expressions", () => {
      const code = 'f"Result: {func(x, y=z.attr):.2f}"';
      const ast = parse(code);
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      expect(stmt.value.nodeType).toBe("JoinedStr");
    });

    test("walrus operator", () => {
      const code = "if (n := len(items)) > 10: print(n)";
      const ast = parse(code);
      const stmt = ast.body[0];
      assertNodeType(stmt, "If");
      expect(stmt.test.nodeType).toBe("Compare");
    });

    test("except* syntax (exception groups)", () => {
      const code = `
try:
    risky_operation()
except* ValueError as e:
    handle_value_error(e)
except* TypeError as e:
    handle_type_error(e)
      `;
      const ast = parse(code);
      const stmt = ast.body[0];
      assertNodeType(stmt, "TryStar");
      expect(stmt.handlers).toHaveLength(2);
      expect(stmt.handlers[0].type?.nodeType).toBe("Name");
    });

    test("mixed except and except* should fail", () => {
      const code = `
try:
    pass
except ValueError:
    pass
except* TypeError:
    pass
      `;
      expect(() => parse(code)).toThrow(
        /cannot have both 'except' and 'except\*'/
      );
    });
  });

  describe("Performance and Stress Tests", () => {
    test("large list literal", () => {
      const items = Array.from({ length: 1000 }, (_, i) => i).join(", ");
      const code = `[${items}]`;
      const ast = parse(code);
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      assertNodeType(stmt.value, "List");
      expect(stmt.value.elts).toHaveLength(1000);
    });

    test("deeply nested function calls", () => {
      const nested = "f(" + "g(".repeat(50) + "1" + ")".repeat(50) + ")";
      const ast = parse(nested);
      expect(ast.nodeType).toBe("Module");
    });

    test("very long string", () => {
      const longString = '"' + "a".repeat(10000) + '"';
      const ast = parse(longString);
      const stmt = ast.body[0];
      assertNodeType(stmt, "Expr");
      assertNodeType(stmt.value, "Constant");
      expect(stmt.value.value).toHaveLength(10000);
    });
  });
});

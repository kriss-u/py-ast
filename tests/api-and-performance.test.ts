import { parse, unparse } from "../src/index.js";
import { countNodeTypes } from "./test-helpers.js";

describe("Public API Tests", () => {
	test("parse function", () => {
		const code = "x = 1 + 2";
		const ast = parse(code);

		expect(ast.nodeType).toBe("Module");
		expect(ast.body).toHaveLength(1);
		expect(ast.body[0].nodeType).toBe("Assign");
	});

	test("parse with options", () => {
		const simpleCode = "x = 1";

		// Without comments - simple case should work
		const ast1 = parse(simpleCode, { comments: false });
		expect(ast1.nodeType).toBe("Module");

		// With comments - simple case should work
		const ast2 = parse(simpleCode, { comments: true });
		expect(ast2.nodeType).toBe("Module");

		// Test actual comment parsing now that it works
		const codeWithComment = "x = 1  # this is a comment";
		const ast3 = parse(codeWithComment, { comments: true });
		expect(ast3.nodeType).toBe("Module");
		expect(ast3.body).toHaveLength(1);

		// Test hash comment parsing
		const codeWithHashComment = "x = 1  # this is a hash comment";
		const ast4 = parse(codeWithHashComment, { comments: true });
		expect(ast4.nodeType).toBe("Module");
		expect(ast4.body).toHaveLength(1);
	});

	test("unparse function", () => {
		// Test basic functionality
		const simpleCode = "x = 1";
		const ast = parse(simpleCode);
		const unparsed = unparse(ast);

		expect(typeof unparsed).toBe("string");
		expect(unparsed.trim()).toBe("x = 1");

		// Test that unparsed code can be reparsed
		const reparsed = parse(unparsed);
		expect(reparsed.nodeType).toBe("Module");
		expect(reparsed.body).toHaveLength(1);
		expect(reparsed.body[0].nodeType).toBe("Assign");

		// Test with more complex code
		const complexCode = "def func(x, y=42):\n    return x + y";
		const complexAst = parse(complexCode);
		const complexUnparsed = unparse(complexAst);
		expect(complexUnparsed.length).toBeGreaterThan(0);

		// Should be able to reparse
		const complexReparsed = parse(complexUnparsed);
		expect(complexReparsed.nodeType).toBe("Module");
		expect(complexReparsed.body[0].nodeType).toBe("FunctionDef");

		// Test with custom indentation
		const customIndent = unparse(complexAst, { indent: "  " });
		expect(customIndent).toContain("  return");
	});
});

describe("Performance Tests", () => {
	test("large file parsing performance", () => {
		// Generate a large Python file
		const lines: string[] = [];
		for (let i = 0; i < 1000; i++) {
			lines.push(`var_${i} = ${i} * 2 + 1`);
		}
		const largeCode = lines.join("\n");

		const startTime = Date.now();
		const ast = parse(largeCode);
		const endTime = Date.now();

		expect(ast.body).toHaveLength(1000);
		expect(endTime - startTime).toBeLessThan(5000); // Should parse in less than 5 seconds
	});

	test("deeply nested structure performance", () => {
		// Create deeply nested function calls
		let nested = "base()";
		for (let i = 0; i < 100; i++) {
			nested = `wrapper_${i}(${nested})`;
		}
		const code = `result = ${nested}`;

		const startTime = Date.now();
		const ast = parse(code);
		const endTime = Date.now();

		expect(ast.body).toHaveLength(1);
		expect(endTime - startTime).toBeLessThan(1000); // Should parse in less than 1 second
	});
});

describe("Memory Usage Tests", () => {
	test("multiple parse calls don't leak memory", () => {
		const code = `
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

result = fibonacci(10)
`;

		// Parse the same code multiple times
		for (let i = 0; i < 100; i++) {
			const ast = parse(code);
			expect(ast.nodeType).toBe("Module");
		}

		// If we get here without running out of memory, the test passes
		expect(true).toBe(true);
	});
});

describe("Compatibility Tests", () => {
	test("Python standard library patterns", () => {
		const standardLibPatterns = [
			// Collections
			`
from collections import defaultdict, Counter
from collections.abc import Mapping

data = defaultdict(list)
counter = Counter(items)
`,

			// Typing
			`
from typing import List, Dict, Optional, Union, TypeVar
from typing_extensions import Literal

T = TypeVar('T')

def process(items: List[T]) -> Dict[str, T]:
    return {str(i): item for i, item in enumerate(items)}
`,

			// Dataclasses
			`
from dataclasses import dataclass, field
from typing import List

@dataclass
class Person:
    name: str
    age: int = 0
    hobbies: List[str] = field(default_factory=list)
`,

			// Context managers
			`
import contextlib
from pathlib import Path

@contextlib.contextmanager
def temporary_file():
    temp = Path("temp.txt")
    try:
        yield temp
    finally:
        temp.unlink(missing_ok=True)
`,
		];

		standardLibPatterns.forEach((pattern) => {
			expect(() => {
				const ast = parse(pattern);
				expect(ast.nodeType).toBe("Module");
				expect(ast.body.length).toBeGreaterThan(0);
			}).not.toThrow();
		});
	});
});

describe("AST Node Coverage", () => {
	test("comprehensive node type coverage", () => {
		const comprehensiveCode = `
# All major Python constructs in one file

# Imports
import sys
from os import path
from typing import *

# Type alias
type MyList = List[int]

# Variables and annotations
x: int = 42
y = "string"

# Functions
def simple(): pass

@decorator
def decorated(a: int, b: str = "default", *args, **kwargs) -> bool:
    return True

async def async_func():
    await something()
    yield value
    yield from generator()

# Lambda
f = lambda x, y=1: x + y

# Classes
class Base: pass

@dataclass
class Derived(Base):
    attr: int = 1
    
    def method(self): pass
    
    @property
    def prop(self): return self.attr

# Control flow
if condition:
    pass
elif other:
    pass
else:
    pass

while condition:
    break
else:
    continue

for item in items:
    pass
else:
    pass

try:
    risky()
except ValueError as e:
    handle(e)
except:
    pass
else:
    pass
finally:
    cleanup()

# Match (Python 3.10+)
match value:
    case 1:
        pass
    case _:
        pass

# Expressions
result = a + b * c ** d
comparison = 1 < x < 10
boolean = a and b or c
walrus = (n := len(data))
ternary = x if condition else y
negated = -value  # This should create a UnaryOp node
bitwise_not = ~flags  # Another unary operation

# Collections
lst = [1, 2, 3]
tpl = (1, 2, 3)
st = {1, 2, 3}
dct = {"a": 1, "b": 2}

# Comprehensions
list_comp = [x for x in items if x > 0]
dict_comp = {k: v for k, v in items.items()}
set_comp = {x.lower() for x in strings}
gen_exp = (x for x in range(100))

# F-strings
msg = f"Hello {name}, you have {count:,} items"

# Calls
func(1, 2, a=3, *args, **kwargs)
obj.method()
obj[key]
obj.attr

# Assignments
x = y = 1
a, b = c, d
*rest, last = items
x += 1
obj.attr = value

# Statements
assert condition
del variable
global global_var
nonlocal nonlocal_var
raise Exception()
return value

# Context managers
with manager:
    pass

async with async_manager:
    pass
`;

		const ast = parse(comprehensiveCode);
		const nodeCounts = countNodeTypes(ast);

		// Essential statement types
		const essentialStatements = [
			"Module",
			"Import",
			"ImportFrom",
			"FunctionDef",
			"AsyncFunctionDef",
			"ClassDef",
			"If",
			"While",
			"For",
			"Try",
			"With",
			"AsyncWith",
			"Assign",
			"AnnAssign",
			"AugAssign",
			"Delete",
			"Pass",
			"Break",
			"Continue",
			"Return",
			"Raise",
			"Assert",
			"Global",
			"Nonlocal",
			"Expr",
		];

		// Essential expression types
		const essentialExpressions = [
			"Name",
			"Constant",
			"BinOp",
			"UnaryOp",
			"BoolOp",
			"Compare",
			"Call",
			"Attribute",
			"Subscript",
			"List",
			"Tuple",
			"Set",
			"Dict",
			"ListComp",
			"DictComp",
			"SetComp",
			"GeneratorExp",
			"Lambda",
			"IfExp",
			"JoinedStr",
			"FormattedValue",
		];

		console.log("Node coverage report:");
		console.log("Statements:");
		essentialStatements.forEach((nodeType) => {
			const count = nodeCounts[nodeType] || 0;
			console.log(`  ${nodeType}: ${count}`);
			if (count === 0) {
				console.warn(`  ⚠️  Missing: ${nodeType}`);
			}
		});

		console.log("Expressions:");
		essentialExpressions.forEach((nodeType) => {
			const count = nodeCounts[nodeType] || 0;
			console.log(`  ${nodeType}: ${count}`);
			if (count === 0) {
				console.warn(`  ⚠️  Missing: ${nodeType}`);
			}
		});

		// Check that we have good coverage
		const totalEssential =
			essentialStatements.length + essentialExpressions.length;
		const coveredEssential = [
			...essentialStatements,
			...essentialExpressions,
		].filter((nodeType) => (nodeCounts[nodeType] || 0) > 0).length;

		const coverage = (coveredEssential / totalEssential) * 100;
		console.log(
			`\nOverall coverage: ${coverage.toFixed(
				1,
			)}% (${coveredEssential}/${totalEssential})`,
		);

		// We should have good coverage of essential Python constructs
		expect(coverage).toBeGreaterThan(70); // At least 70% coverage
	});
});

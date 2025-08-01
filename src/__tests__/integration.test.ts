import { countNodeTypes, parseCode, testRoundtrip } from "./test-helpers.js";

describe("Parser Integration Tests", () => {
	test("comprehensive Python syntax coverage", () => {
		const code = `
# Module docstring
"""This is a comprehensive test of Python syntax"""

# Imports
import os
import sys as system
from typing import List, Dict, Optional
from .relative import something

# Type aliases (Python 3.12+)
type StringList = List[str]

# Global variables
global_var: int = 42
CONSTANT = "hello"

# Function definitions
def simple_func():
    pass

@decorator
def decorated_func(x: int, y: str = "default") -> bool:
    return x > 0

async def async_func(*args, **kwargs):
    await some_async_call()
    yield from async_generator()

# Class definition
@dataclass
class MyClass(BaseClass):
    attr: int = 1
    
    def method(self, param):
        self.attr = param
    
    @property
    def prop(self):
        return self.attr

# Control flow
if condition:
    for item in iterable:
        if item % 2 == 0:
            continue
        try:
            result = process(item)
        except ValueError as e:
            print(f"Error: {e}")
        except:
            raise
        else:
            results.append(result)
        finally:
            cleanup()
    else:
        print("Loop completed")
elif other_condition:
    while True:
        break
else:
    pass

# Match statement (Python 3.10+)
match value:
    case 1 | 2 | 3:
        print("small")
    case x if x > 100:
        print("large")
    case _:
        print("other")

# Comprehensions
list_comp = [x**2 for x in range(10) if x % 2 == 0]
dict_comp = {k: v for k, v in items.items()}
set_comp = {item.lower() for item in strings}
gen_exp = (x for x in range(1000000))

# Complex expressions
result = (lambda x: x**2 if x > 0 else -x**2)(value)
walrus = (n := len(data)) > 0
chained = 0 < x < 10 < y < 100

# F-strings
message = f"Hello {name}, you have {count:,} items"
debug = f"Value is {value!r} with type {type(value).__name__}"

# Context managers
with open("file.txt") as f, suppress(ValueError):
    data = f.read()

async with async_context() as ctx:
    await ctx.process()

# Assignments
a, b = 1, 2
*rest, last = [1, 2, 3, 4, 5]
x += 1
obj.attr[key] = value

# Advanced features
assert condition, "This should be true"
del unwanted_var
global global_ref
nonlocal nonlocal_ref

# Exception handling
try:
    risky_operation()
except* ExceptionGroup as eg:
    for error in eg.exceptions:
        handle_error(error)
`;

		const ast = parseCode(code);

		// Verify we parsed successfully
		expect(ast.nodeType).toBe("Module");
		expect(ast.body.length).toBeGreaterThan(20);

		// Count different node types to ensure comprehensive coverage
		const counts = countNodeTypes(ast);

		// Check for presence of major statement types
		expect(counts["Import"]).toBeGreaterThan(0);
		expect(counts["ImportFrom"]).toBeGreaterThan(0);
		expect(counts["FunctionDef"]).toBeGreaterThan(0);
		expect(counts["AsyncFunctionDef"]).toBeGreaterThan(0);
		expect(counts["ClassDef"]).toBeGreaterThan(0);
		expect(counts["If"]).toBeGreaterThan(0);
		expect(counts["For"]).toBeGreaterThan(0);
		expect(counts["While"]).toBeGreaterThan(0);
		expect(counts["Try"]).toBeGreaterThan(0);
		expect(counts["With"]).toBeGreaterThan(0);
		expect(counts["AsyncWith"]).toBeGreaterThan(0);

		// Check for expression types
		expect(counts["BinOp"]).toBeGreaterThan(0);
		expect(counts["Compare"]).toBeGreaterThan(0);
		expect(counts["Call"]).toBeGreaterThan(0);
		expect(counts["ListComp"]).toBeGreaterThan(0);
		expect(counts["DictComp"]).toBeGreaterThan(0);
		expect(counts["SetComp"]).toBeGreaterThan(0);
		expect(counts["GeneratorExp"]).toBeGreaterThan(0);
		expect(counts["Lambda"]).toBeGreaterThan(0);
		expect(counts["IfExp"]).toBeGreaterThan(0);

		console.log("Node type distribution:", counts);
	});

	test("real-world Python file patterns", () => {
		const realWorldExamples = [
			// Data class example
			`
@dataclass
class Person:
    name: str
    age: int = 0
    
    def __post_init__(self):
        if self.age < 0:
            raise ValueError("Age cannot be negative")
    
    def greet(self) -> str:
        return f"Hello, I'm {self.name} and I'm {self.age} years old"
`,

			// Async generator example
			`
async def fetch_data(urls: List[str]) -> AsyncIterator[Dict[str, Any]]:
    async with aiohttp.ClientSession() as session:
        for url in urls:
            try:
                async with session.get(url) as response:
                    data = await response.json()
                    yield {"url": url, "data": data, "status": response.status}
            except aiohttp.ClientError as e:
                yield {"url": url, "error": str(e), "status": None}
`,

			// Context manager example
			`
class DatabaseConnection:
    def __init__(self, connection_string: str):
        self.connection_string = connection_string
        self.connection = None
    
    def __enter__(self):
        self.connection = create_connection(self.connection_string)
        return self.connection
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.connection:
            self.connection.close()
        return False
`,

			// Complex list comprehension
			`
def process_data(matrix: List[List[int]]) -> Dict[str, List[int]]:
    return {
        "positives": [
            value 
            for row in matrix 
            for value in row 
            if value > 0
        ],
        "evens": [
            value 
            for row in matrix 
            for value in row 
            if value % 2 == 0
        ],
        "squares": [
            value ** 2 
            for row in matrix 
            for value in row 
            if value != 0
        ]
    }
`,
		];

		realWorldExamples.forEach((code) => {
			expect(() => {
				const ast = parseCode(code);
				expect(ast.nodeType).toBe("Module");
				expect(ast.body.length).toBeGreaterThan(0);
			}).not.toThrow();
		});
	});

	test("edge cases and error recovery", () => {
		// Test empty module
		const emptyAst = parseCode("");
		expect(emptyAst.nodeType).toBe("Module");
		expect(emptyAst.body).toHaveLength(0);

		// Test single statement
		const singleAst = parseCode("x = 1");
		expect(singleAst.body).toHaveLength(1);

		// Test only comments and whitespace
		const commentAst = parseCode(`
# This is a comment
# Another comment

# Final comment
`);
		expect(commentAst.nodeType).toBe("Module");
	});

	test("roundtrip compatibility sample", () => {
		// Test that parsing and unparsing preserves semantic structure
		const testCases = [
			"x = 1",
			"x += 42",
			"x: int = 1",
			"del x",
			"pass",
			"break",
			"continue",
			"return",
			"return 42",
			"import os",
			"import sys, os",
			"import numpy as np",
			"from os import path",
			"from . import module",
			"global x",
			"nonlocal y",
			"raise ValueError()",
			"assert x > 0",
			"if x: pass",
			"if x:\n    y = 1\nelse:\n    y = 2",
			"while x > 0:\n    x -= 1",
			"for i in range(10):\n    print(i)",
			"async for item in items:\n    await process(item)",
			"def func(): pass",
			"def func(x, y=1): return x + y",
			"async def func(): return await value",
			"class A: pass",
			"class Child(Parent): pass",
			"try:\n    risky()\nexcept:\n    pass",
			"try:\n    risky()\nexcept ValueError as e:\n    print(e)",
			"with open('file') as f:\n    content = f.read()",
			"async with resource() as r:\n    await r.process()",
			"x + y",
			"x and y or z",
			"not condition",
			"a < b < c",
			"x if condition else y",
			"lambda x: x * 2",
			"func(x, y=42)",
			"obj.attr",
			"arr[0]",
			"arr[1:5:2]",
			"await func()",
			"yield 42",
			"yield from generator",
			"x := 42",
			"[]",
			"[1, 2, 3]",
			"(1, 2, 3)",
			"(42,)",
			"{}",
			"{'a': 1, 'b': 2}",
			"{1, 2, 3}",
			"[x for x in items]",
			"[x for x in items if x > 0]",
			"{x for x in items}",
			"{k: v for k, v in items.items()}",
			"(x for x in items)",
			"f'Hello, {name}!'",
			"None",
			"True",
			"False",
			"42",
			"'hello'",
		];

		testCases.forEach((code) => {
			expect(() => testRoundtrip(code)).not.toThrow();
		});
	});

	test("Python version specific features", () => {
		// Python 3.8+ features
		const walrusCode = "if (n := len(items)) > 0: print(n)";
		expect(() => parseCode(walrusCode)).not.toThrow();

		// Python 3.10+ features (match statement)
		const matchCode = `
match x:
    case 1:
        pass
    case _:
        pass
`;
		expect(() => parseCode(matchCode)).not.toThrow();
	});

	test("stress test with deeply nested structures", () => {
		// Generate deeply nested structure
		let nestedIf = "x = 1";
		for (let i = 0; i < 10; i++) {
			nestedIf = `if condition${i}:\n    ${nestedIf.replace(/\n/g, "\n    ")}`;
		}

		expect(() => parseCode(nestedIf)).not.toThrow();

		// Deeply nested expressions
		let nestedExpr = "1";
		for (let i = 0; i < 20; i++) {
			nestedExpr = `(${nestedExpr} + ${i})`;
		}
		const exprCode = `result = ${nestedExpr}`;

		expect(() => parseCode(exprCode)).not.toThrow();
	});
});

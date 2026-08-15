import { describe, expect, test } from "vitest";
import { COMPREHENSIVE_SOURCE } from "./fixtures/index.js";
import { countNodeTypes, parseCode, testRoundtrip } from "./test-helpers.js";

const ESSENTIAL_STATEMENTS = [
	"Import",
	"ImportFrom",
	"FunctionDef",
	"AsyncFunctionDef",
	"ClassDef",
	"If",
	"For",
	"While",
	"Try",
	"TryStar",
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
	"TypeAlias",
	"Match",
];

const ESSENTIAL_EXPRESSIONS = [
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
	"NamedExpr",
];

const REAL_WORLD_PATTERNS: Array<{ name: string; code: string }> = [
	{
		name: "dataclass with __post_init__ validation and an f-string method",
		code: `
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
	},
	{
		name: "async generator with per-item error handling",
		code: `
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
	},
	{
		name: "context manager protocol (__enter__/__exit__)",
		code: `
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
	},
	{
		name: "complex list comprehensions building a dict of lists",
		code: `
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
	},
	{
		name: "collections module imports and usage",
		code: `
from collections import defaultdict, Counter
from collections.abc import Mapping

data = defaultdict(list)
counter = Counter(items)
`,
	},
	{
		name: "typing generics and a TypeVar-parameterized function",
		code: `
from typing import List, Dict, Optional, Union, TypeVar
from typing_extensions import Literal

T = TypeVar('T')

def process(items: List[T]) -> Dict[str, T]:
    return {str(i): item for i, item in enumerate(items)}
`,
	},
	{
		name: "dataclass with a mutable-default field factory",
		code: `
from dataclasses import dataclass, field
from typing import List

@dataclass
class Person:
    name: str
    age: int = 0
    hobbies: List[str] = field(default_factory=list)
`,
	},
	{
		name: "contextlib.contextmanager decorator",
		code: `
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
	},
];

const ROUNDTRIP_SAMPLE = [
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

const VERSION_SPECIFIC_FEATURES: Array<{ name: string; code: string }> = [
	{
		name: "walrus operator (Python 3.8+)",
		code: "if (n := len(items)) > 0: print(n)",
	},
	{
		name: "match statement (Python 3.10+)",
		code: `
match x:
    case 1:
        pass
    case _:
        pass
`,
	},
];

describe("Parser Integration Tests", () => {
	test("comprehensive Python syntax coverage", () => {
		const ast = parseCode(COMPREHENSIVE_SOURCE);

		expect(ast.nodeType).toBe("Module");
		expect(ast.body.length).toBeGreaterThan(20);

		const counts = countNodeTypes(ast);

		for (const nodeType of ESSENTIAL_STATEMENTS) {
			expect(
				counts[nodeType],
				`expected at least one ${nodeType}`,
			).toBeGreaterThan(0);
		}

		for (const nodeType of ESSENTIAL_EXPRESSIONS) {
			expect(
				counts[nodeType],
				`expected at least one ${nodeType}`,
			).toBeGreaterThan(0);
		}
	});

	test.each(REAL_WORLD_PATTERNS)("real-world pattern: $name", ({ code }) => {
		const ast = parseCode(code);
		expect(ast.nodeType).toBe("Module");
		expect(ast.body.length).toBeGreaterThan(0);
	});

	test("edge cases and error recovery", () => {
		const emptyAst = parseCode("");
		expect(emptyAst.nodeType).toBe("Module");
		expect(emptyAst.body).toHaveLength(0);

		const singleAst = parseCode("x = 1");
		expect(singleAst.body).toHaveLength(1);

		const commentAst = parseCode(`
# This is a comment
# Another comment

# Final comment
`);
		expect(commentAst.nodeType).toBe("Module");
	});

	test.each(ROUNDTRIP_SAMPLE.map((code) => ({ code })))(
		"round-trips: $code",
		({ code }) => {
			testRoundtrip(code);
		},
	);

	test.each(VERSION_SPECIFIC_FEATURES)("$name", ({ code }) => {
		expect(() => parseCode(code)).not.toThrow();
	});
});

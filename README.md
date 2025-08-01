# Python AST Parser for TypeScript

A comprehensive TypeScript-based Python source code parser that generates Abstract Syntax Trees (AST) following the Python ASDL grammar specification. This library provides complete parsing, unparsing, and AST traversal infrastructure similar to ESPrima for JavaScript, with bidirectional Python code ↔ AST conversion.

## Features

- 🔍 **Complete Python lexical analysis** - Tokenizes Python source code with full syntax support
- 🌳 **AST generation** - Creates comprehensive Abstract Syntax Trees based on Python ASDL grammar
- � **Code generation** - Convert AST back to Python source code with `unparse()`
- �🚶 **AST traversal** - Walk and visit all nodes in the syntax tree
- 📄 **JSON serialization** - Export ASTs to JSON format for analysis or storage
- 🔧 **TypeScript types** - Full type definitions for all AST nodes
- ⚡ **ESPrima-style API** - Familiar interface for JavaScript developers
- 🐍 **Python-compatible** - Follows Python's official AST structure

## Installation

```bash
npm install python-ast-parser
```

## Quick Start

```typescript
import {
  parse,
  parsePython,
  unparse,
  walk,
  NodeVisitor,
} from "python-ast-parser";

// Parse Python source code - that's it! No mode selection needed.
const pythonCode = `
def fibonacci(n):
    if n <= 1:
        return n
    else:
        return fibonacci(n-1) + fibonacci(n-2)

result = fibonacci(10)
`;

// Generate AST - handles any Python code (expressions, statements, modules)
const ast = parse(pythonCode);
console.log(ast.nodeType); // "Module"

// Convert AST back to Python source code
const regeneratedCode = unparse(ast);
console.log(regeneratedCode);
// Output: Properly formatted Python code equivalent to the original

// Alternative: use the more explicit function name
const ast2 = parsePython(pythonCode, { filename: "fib.py" });

// Optional configuration
const astWithComments = parse(pythonCode, {
  type_comments: true,
  filename: "fibonacci.py",
});

// Walk all nodes
for (const node of walk(ast)) {
  console.log(node.nodeType);
}

// Custom visitor
class FunctionVisitor extends NodeVisitor {
  functions: string[] = [];

  visitFunctionDef(node: any) {
    this.functions.push(node.name);
    this.genericVisit(node);
  }
}

const visitor = new FunctionVisitor();
visitor.visit(ast);
console.log(visitor.functions); // ["fibonacci"]
```

## API Reference

### Core Functions

#### `parse(source, options?)`

Parses Python source code and returns an AST. Handles any Python code - expressions, statements, modules, classes, functions, etc.

**Parameters:**

- `source` (string): The Python source code to parse
- `options` (ParseOptions, optional): Parsing options

**ParseOptions:**

- `filename` (string): Source filename for error reporting (default: `'<unknown>'`)
- `type_comments` (boolean): Include type comments in AST (default: `false`)
- `feature_version` (number): Python feature version

**Returns:** `Module` - The root AST node containing all parsed statements

```typescript
// Basic usage - handles any Python code
const ast = parse("x = 42");
const ast2 = parse("def func(): return 42");
const ast3 = parse("class MyClass: pass");

// With options
const ast = parse("x + y", {
  filename: "my_script.py",
  type_comments: true,
});
```

#### `parseFile(filename, options?)`

**Note:** Placeholder function. Read file content first and use `parse()`.

#### `literalEval(source)`

Safely evaluates Python literal expressions by parsing and evaluating constant values.

```typescript
console.log(literalEval("42")); // 42
console.log(literalEval('"hello"')); // "hello"
console.log(literalEval("[1, 2, 3]")); // [1, 2, 3]
console.log(literalEval('{"key": "value"}')); // {key: "value"}
```

#### `unparse(node, options?)`

Converts an AST node back to Python source code. This is the reverse operation of `parse()`.

**Parameters:**

- `node` (ASTNodeUnion): The AST node to convert back to source code
- `options` (object, optional): Unparsing options
  - `indent` (string): Indentation string (default: `"    "` - 4 spaces)

**Returns:** `string` - The generated Python source code

```typescript
import { parse, unparse } from "python-ast-parser";

// Basic roundtrip: parse then unparse
const originalCode = "def greet(name):\n    return f'Hello, {name}!'";
const ast = parse(originalCode);
const generatedCode = unparse(ast);

console.log(generatedCode);
// Output: def greet(name):
//     return f"Hello, {name}!"

// Perfect roundtrip for simple expressions
const simpleCode = "x = 42";
const simpleAst = parse(simpleCode);
console.log(unparse(simpleAst) === simpleCode); // true

// Custom indentation
const ast2 = parse("if True:\n    pass");
const twoSpaceCode = unparse(ast2, { indent: "  " });
console.log(twoSpaceCode);
// Output: if True:
//   pass

// Works with all Python constructs
const complexCode = `
class Calculator:
    def add(self, a, b):
        return a + b
    
    async def process(self, items):
        results = [await self.compute(x) for x in items if x > 0]
        return results
`;

const complexAst = parse(complexCode);
const regenerated = unparse(complexAst);
// regenerated contains valid Python code equivalent to the original
```

#### `walk(node)`

Recursively walks all nodes in an AST tree.

```typescript
for (const node of walk(ast)) {
  console.log(`${node.nodeType} at line ${node.lineno}`);
}
```

### Convenience Functions

#### `parsePython(source, options?)`

Alternative name for `parse()` that makes the intent clearer.

```typescript
import { parsePython } from "python-ast-parser";

const ast = parsePython("x = 42", { filename: "script.py" });
```

#### `parseModule(source, filename?)`

Legacy convenience function for parsing with just a filename.

```typescript
import { parseModule } from "python-ast-parser";

const ast = parseModule("def hello(): pass", "hello.py");
```

### Lexer

#### `Lexer`

Low-level tokenizer for Python source code.

```typescript
import { Lexer, TokenType } from "python-ast-parser";

const lexer = new Lexer("x = 42 + 3.14");
const tokens = lexer.tokenize();

tokens.forEach((token) => {
  console.log(`${token.type}: ${token.value}`);
});
// Output:
// NAME: x
// EQUAL: =
// NUMBER: 42
// PLUS: +
// NUMBER: 3.14
// EOF:
```

### Visitors

#### `NodeVisitor`

Base class for creating custom AST visitors.

```typescript
class CountVisitor extends NodeVisitor {
  counts = new Map<string, number>();

  visitFunctionDef(node: any) {
    this.increment("functions");
    this.genericVisit(node);
  }

  visitClassDef(node: any) {
    this.increment("classes");
    this.genericVisit(node);
  }

  private increment(key: string) {
    this.counts.set(key, (this.counts.get(key) || 0) + 1);
  }
}
```

#### `NodeTransformer`

Visitor that can modify AST nodes during traversal.

```typescript
class RenameTransformer extends NodeTransformer {
  visitName(node: any) {
    if (node.id === "old_name") {
      return { ...node, id: "new_name" };
    }
    return node;
  }
}
```

## Node Types

The library provides TypeScript interfaces for all Python AST nodes based on the ASDL grammar:

- **Module nodes**: `Module`, `Interactive`, `Expression`, `FunctionType`
- **Statement nodes**: `FunctionDef`, `ClassDef`, `If`, `For`, `While`, `With`, etc.
- **Expression nodes**: `BinOp`, `Call`, `Attribute`, `Subscript`, `List`, `Dict`, etc.
- **Supporting types**: `Arguments`, `Keyword`, `Alias`, etc.

## Usage Examples

### Parse and Analyze Python Code

```typescript
import { parse, walk, NodeVisitor } from "python-ast-parser";

const code = `
class Calculator:
    def add(self, a, b):
        return a + b
    
    def multiply(self, a, b):
        return a * b

calc = Calculator()
result = calc.add(5, 3)
`;

const ast = parse(code);

// Count different node types
const nodeCounts = new Map<string, number>();
for (const node of walk(ast)) {
  const count = nodeCounts.get(node.nodeType) || 0;
  nodeCounts.set(node.nodeType, count + 1);
}

console.log("Node distribution:", Object.fromEntries(nodeCounts));
```

### Find Function Definitions

```typescript
class FunctionFinder extends NodeVisitor {
  functions: string[] = [];

  visitFunctionDef(node: any) {
    this.functions.push(node.name);
    this.genericVisit(node);
  }

  visitAsyncFunctionDef(node: any) {
    this.functions.push(node.name);
    this.genericVisit(node);
  }
}

const code = `
def sync_function():
    pass

async def async_function():
    pass
`;

const ast = parse(code);
const finder = new FunctionFinder();
finder.visit(ast);
console.log(finder.functions); // ['sync_function', 'async_function']
```

### Code Generation and Transformation

```typescript
import { parse, unparse, NodeTransformer } from "python-ast-parser";

// Parse, modify, and regenerate Python code
const originalCode = `
def process_data(items):
    results = []
    for item in items:
        if item > 0:
            results.append(item * 2)
    return results
`;

const ast = parse(originalCode);

// Transform the AST - rename variables
class VariableRenamer extends NodeTransformer {
  visitName(node: any) {
    if (node.id === "item") {
      return { ...node, id: "element" };
    }
    if (node.id === "results") {
      return { ...node, id: "output" };
    }
    return node;
  }
}

const transformer = new VariableRenamer();
const transformedAst = transformer.visit(ast);

// Generate new Python code
const newCode = unparse(transformedAst);
console.log(newCode);
// Output: Function with renamed variables (item -> element, results -> output)

// Perfect roundtrip for unmodified code
const simpleCode = "x = [i**2 for i in range(10) if i % 2 == 0]";
const roundtripCode = unparse(parse(simpleCode));
console.log(simpleCode === roundtripCode); // true - perfect roundtrip
```

## Test Results

```bash
=== Testing Python AST Parser ===

1. Testing Lexer:
Tokens: NAME(x) EQUAL(=) NUMBER(42) PLUS(+) NUMBER(3.14) EOF()

2. Testing Parser:
✓ Parsed successfully!
AST Type: Module
Statements: 4

3. Testing AST Walking:
Total nodes: 19
Node types: Module, Assign, Name, Load, Constant, Expr, BinOp, Add

4. Testing JSON serialization:
✓ JSON serialization successful
JSON length: 1818 characters

=== Test Complete ===
```

## Supported Python Features

### Parsing & Code Generation Support

- ✅ **Functions and Classes** - Function/class definitions with decorators
- ✅ **Control Flow** - if/elif/else, for/while loops, try/except
- ✅ **Expressions** - All binary/unary operations, comparisons, calls
- ✅ **Literals** - Numbers, strings, lists, dicts, sets, tuples
- ✅ **Comprehensions** - List/dict/set comprehensions and generators
- ✅ **Async/Await** - Async functions, async for, async with
- ✅ **Context Managers** - with statements
- ✅ **Import Statements** - import and from...import
- ✅ **Exception Handling** - try/except/finally

**Code Generation**: All parsed constructs can be converted back to Python source code using `unparse()`. The unparser produces clean, readable Python code that maintains semantic equivalence with the original.

## Design Principles

This library is designed to be **independent** from Python's built-in `ast` module while following the same ASDL grammar specification:

1. **TypeScript-native** - Built for TypeScript/JavaScript environments
2. **Bidirectional** - Parse Python to AST and unparse AST back to Python
3. **JSON serializable** - All nodes can be directly serialized to JSON
4. **ESPrima-style API** - Familiar interface for web developers
5. **Custom AST format** - Optimized for JavaScript object handling
6. **No Python runtime required** - Runs entirely in Node.js/browser

## Development

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run tests
npm test
```

## License

MIT License

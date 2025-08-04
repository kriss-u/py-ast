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
npm install py-ast
```

## Quick Start

### Basic Parsing and Code Generation

```typescript
import {
  parse,
  parsePython,
  unparse,
  walk,
  NodeVisitor,
  NodeTransformer,
  literalEval,
  dump,
} from "py-ast";

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
```

### Parsing Different Python Constructs

```typescript
import { parse, unparse } from "py-ast";

// 1. Simple expressions
const expr = parse("x + y * 2");
console.log(expr.nodeType); // "Module"
console.log(unparse(expr)); // "x + y * 2"

// 2. Function definitions
const funcCode = `
def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"
`;
const funcAst = parse(funcCode);
console.log(unparse(funcAst));

// 3. Class definitions with methods
const classCode = `
class Calculator:
    def __init__(self, precision=2):
        self.precision = precision
    
    def add(self, a, b):
        return round(a + b, self.precision)
    
    @staticmethod
    def multiply(x, y):
        return x * y
`;
const classAst = parse(classCode);
console.log(unparse(classAst));

// 4. Complex expressions with comprehensions
const complexExpr = parse(`
result = [x**2 for x in range(10) if x % 2 == 0]
data = {key: value for key, value in items.items() if value > 0}
`);
console.log(unparse(complexExpr));

// 5. Async/await patterns
const asyncCode = `
async def fetch_data(urls):
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_url(session, url) for url in urls]
        return await asyncio.gather(*tasks)
`;
const asyncAst = parse(asyncCode);
console.log(unparse(asyncAst));
```

### Working with Parse Options

```typescript
import { parse, parsePython } from "py-ast";

// Basic parsing with filename for better error reporting
const ast1 = parse(pythonCode, { filename: "fibonacci.py" });

// Enable comment parsing to include hash comments in AST
const codeWithComments = `
# This is a header comment
def process_data(items):
    """This is a docstring, not a comment"""
    # This is an inline comment
    return [x * 2 for x in items]  # Another comment
`;
const astWithComments = parse(codeWithComments, {
  comments: true,
  filename: "commented_code.py",
});

// Comments are now available in the AST
console.log(astWithComments.comments?.length); // Number of hash comments found
astWithComments.comments?.forEach(comment => {
  console.log(`Line ${comment.lineno}: ${comment.value}`);
});

// Alternative explicit function name
const ast2 = parsePython(pythonCode, { filename: "fib.py" });
```

### AST Traversal and Analysis

```typescript
import { parse, walk, NodeVisitor } from "py-ast";

const code = `
class DataProcessor:
    def __init__(self, config):
        self.config = config
    
    def process_file(self, filename):
        with open(filename, 'r') as f:
            data = f.read()
        return self.transform_data(data)
    
    def transform_data(self, data):
        if self.config.uppercase:
            return data.upper()
        return data.lower()

processor = DataProcessor({'uppercase': True})
result = processor.process_file('input.txt')
`;

const ast = parse(code);

// 1. Walk all nodes in the AST
console.log("=== Walking all nodes ===");
for (const node of walk(ast)) {
  console.log(`${node.nodeType} at line ${node.lineno || 'unknown'}`);
}

// 2. Custom visitor to analyze code structure
class CodeAnalyzer extends NodeVisitor {
  functions: string[] = [];
  classes: string[] = [];
  variables: string[] = [];
  imports: string[] = [];

  visitFunctionDef(node: any) {
    this.functions.push(node.name);
    this.genericVisit(node); // Continue visiting child nodes
  }

  visitClassDef(node: any) {
    this.classes.push(node.name);
    this.genericVisit(node);
  }

  visitAssign(node: any) {
    // Extract variable names from assignments
    for (const target of node.targets) {
      if (target.nodeType === "Name") {
        this.variables.push(target.id);
      }
    }
    this.genericVisit(node);
  }

  visitImport(node: any) {
    for (const alias of node.names) {
      this.imports.push(alias.name);
    }
    this.genericVisit(node);
  }

  visitImportFrom(node: any) {
    const module = node.module || '';
    for (const alias of node.names) {
      this.imports.push(`${module}.${alias.name}`);
    }
    this.genericVisit(node);
  }
}

const analyzer = new CodeAnalyzer();
analyzer.visit(ast);

console.log("=== Code Analysis Results ===");
console.log("Functions:", analyzer.functions);
console.log("Classes:", analyzer.classes);
console.log("Variables:", analyzer.variables);
console.log("Imports:", analyzer.imports);
```

### Safe Literal Evaluation

```typescript
import { literalEval } from "py-ast";

// Safely evaluate Python literals
console.log(literalEval("42"));              // 42
console.log(literalEval('"hello world"'));   // "hello world"
console.log(literalEval("[1, 2, 3, 4]"));    // [1, 2, 3, 4]
console.log(literalEval('{"a": 1, "b": 2}')); // {a: 1, b: 2}
console.log(literalEval("(1, 2, 3)"));       // [1, 2, 3] (tuple as array)
console.log(literalEval("{1, 2, 3}"));       // [1, 2, 3] (set as array)
console.log(literalEval("True"));            // true
console.log(literalEval("None"));            // null

// Complex nested structures
const complexLiteral = `{
    "config": {
        "debug": True,
        "max_items": 100,
        "allowed_types": ["string", "number", "boolean"]
    },
    "data": [1, 2.5, "test", None]
}`;
console.log(literalEval(complexLiteral));
```

### Code Transformation and Generation

```typescript
import { parse, unparse, NodeTransformer } from "py-ast";

const originalCode = `
def calculate_total(items, tax_rate):
    subtotal = sum(item.price for item in items)
    tax = subtotal * tax_rate
    total = subtotal + tax
    return total

def process_order(order):
    total = calculate_total(order.items, 0.08)
    if total > 100:
        total *= 0.9  # 10% discount for orders over $100
    return total
`;

const ast = parse(originalCode);

// Transform the AST - rename functions and variables
class CodeRefactorer extends NodeTransformer {
  visitFunctionDef(node: any) {
    // Rename functions with a prefix
    if (node.name === "calculate_total") {
      return { ...node, name: "compute_order_total" };
    }
    if (node.name === "process_order") {
      return { ...node, name: "handle_order_processing" };
    }
    return this.genericVisit(node);
  }

  visitName(node: any) {
    // Rename variables
    const renames = {
      "subtotal": "base_amount",
      "tax_rate": "tax_percentage",
      "total": "final_amount"
    };
    
    if (renames[node.id]) {
      return { ...node, id: renames[node.id] };
    }
    return node;
  }

  visitCall(node: any) {
    // Update function calls to match renamed functions
    if (node.func.nodeType === "Name" && node.func.id === "calculate_total") {
      return {
        ...node,
        func: { ...node.func, id: "compute_order_total" }
      };
    }
    return this.genericVisit(node);
  }
}

const transformer = new CodeRefactorer();
const transformedAst = transformer.visit(ast);

// Generate the refactored code
const refactoredCode = unparse(transformedAst);
console.log("=== Refactored Code ===");
console.log(refactoredCode);

// Custom indentation
const compactCode = unparse(transformedAst, { indent: "  " });
console.log("=== Compact Version ===");
console.log(compactCode);
```

### Advanced Usage: JSON Serialization and Analysis

```typescript
import { parse, walk, dump, getDocstring, NodeVisitor } from "py-ast";

const pythonCode = `
import asyncio
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class User:
    """Represents a user in the system."""
    id: int
    name: str
    email: Optional[str] = None

class UserService:
    """Service for managing users."""
    def __init__(self, database_url: str):
        self.db_url = database_url
        self.users: List[User] = []
    
    async def fetch_user(self, user_id: int) -> Optional[User]:
        """Fetch a user by ID from the database."""
        # Simulate async database call
        await asyncio.sleep(0.1)
        return next((u for u in self.users if u.id == user_id), None)
    
    def add_user(self, user: User) -> None:
        """Add a new user to the service."""
        self.users.append(user)

# Usage
service = UserService("postgresql://localhost/mydb")
user = User(1, "John Doe", "john@example.com")
service.add_user(user)
`;

const ast = parse(pythonCode, { comments: true });

// Serialize AST to JSON for analysis or storage
const astJson = JSON.stringify(ast, null, 2);
console.log("AST JSON size:", astJson.length, "characters");

// Use dump for readable AST representation
console.log("=== AST Structure (first class) ===");
const firstClass = ast.body.find(node => node.nodeType === "ClassDef");
console.log(dump(firstClass, { indent: 2, annotateFields: true }));

// Extract docstrings
console.log("=== Docstrings ===");
for (const node of walk(ast)) {
  if (node.nodeType === "ClassDef" || node.nodeType === "FunctionDef") {
    const docstring = getDocstring(node);
    if (docstring) {
      console.log(`${node.nodeType} ${node.name}: "${docstring}"`);
    }
  }
}

// Analyze AST structure
const nodeStats = new Map<string, number>();
for (const node of walk(ast)) {
  const count = nodeStats.get(node.nodeType) || 0;
  nodeStats.set(node.nodeType, count + 1);
}

console.log("=== AST Node Statistics ===");
console.log(Object.fromEntries(
  Array.from(nodeStats.entries()).sort((a, b) => b[1] - a[1])
));

// Extract specific information
class ImportAnalyzer extends NodeVisitor {
  imports: Array<{type: string, module: string, names: string[]}> = [];

  visitImport(node: any) {
    this.imports.push({
      type: 'import',
      module: '',
      names: node.names.map((alias: any) => alias.name)
    });
  }

  visitImportFrom(node: any) {
    this.imports.push({
      type: 'from_import',
      module: node.module || '',
      names: node.names.map((alias: any) => alias.name)
    });
  }
}

const importAnalyzer = new ImportAnalyzer();
importAnalyzer.visit(ast);
console.log("=== Import Analysis ===");
console.log(importAnalyzer.imports);
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
- `comments` (boolean): Include hash comments (`# comment`) in AST (default: `false`)
- `feature_version` (number): Python feature version

**Note:** Triple-quoted strings (`"""text"""`) are parsed as regular string literals, not comments. Only hash comments (`# comment`) are treated as comments when `comments: true` is enabled.

**Returns:** `Module` - The root AST node containing all parsed statements

```typescript
// Basic usage - handles any Python code
const ast = parse("x = 42");
const ast2 = parse("def func(): return 42");
const ast3 = parse("class MyClass: pass");

// With options
const ast = parse("x + y", {
  filename: "my_script.py",
  comments: true,
});
```

#### `dump(node, options?)`

Converts an AST node to a formatted string representation for debugging and analysis.

**Parameters:**

- `node` (ASTNodeUnion): The AST node to dump
- `options` (object, optional): Formatting options
  - `annotateFields` (boolean): Show field names (default: `true`)
  - `includeAttributes` (boolean): Include line/column info (default: `false`)
  - `indent` (string | number): Indentation for pretty printing (default: `null`)
  - `showEmpty` (boolean): Show empty arrays/null values (default: `false`)

**Returns:** `string` - A formatted string representation of the AST

```typescript
import { parse, dump } from "py-ast";

const code = "def hello(name): return f'Hello, {name}!'";
const ast = parse(code);

// Basic dump
console.log(dump(ast));
// Output: Module(body=[FunctionDef(name='hello', args=Arguments(args=[Arg(arg='name')]), body=[Return(value=JoinedStr(values=[Constant(value='Hello, '), FormattedValue(value=Name(id='name')), Constant(value='!')]))])])

// Pretty printed with indentation
console.log(dump(ast, { indent: 2 }));
// Output: Module(
//   body=[
//     FunctionDef(
//       name='hello',
//       args=Arguments(
//         args=[
//           Arg(arg='name')
//         ]
//       ),
//       body=[
//         Return(
//           value=JoinedStr(
//             values=[
//               Constant(value='Hello, '),
//               FormattedValue(value=Name(id='name')),
//               Constant(value='!')
//             ]
//           )
//         )
//       ]
//     )
//   ]
// )

// Include location information
console.log(dump(ast, { includeAttributes: true }));
// Shows line numbers and column offsets

// Show all fields including empty ones
console.log(dump(ast, { showEmpty: true }));
// Shows decorator_list=[], returns=null, etc.
```

#### `toSource(node, indent?)`

Alternative name for `unparse()` with slightly different parameter order.

```typescript
import { parse, toSource } from "py-ast";

const ast = parse("x = 42");
const code = toSource(ast, "  "); // 2-space indentation
console.log(code); // "x = 42"
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
import { parse, unparse } from "py-ast";

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

**Quote Style Preservation:**

The unparser automatically preserves the original quote styles used in string literals when parsing with comments enabled:

```typescript
const codeWithMixedQuotes = `
name = 'John'
message = "Hello, world!"
multiline = '''This is
a multiline string'''
`;

const ast = parse(codeWithMixedQuotes, { comments: true });
const unparsed = unparse(ast);
console.log(unparsed);
// Output preserves original quote styles:
// name = 'John'
// message = "Hello, world!"  
// multiline = '''This is
// a multiline string'''
```

### Utility Functions

#### `walk(node)`

Recursively walks all nodes in an AST tree, yielding each node in depth-first order.

```typescript
import { parse, walk } from "py-ast";

const ast = parse("x = [i**2 for i in range(10)]");

for (const node of walk(ast)) {
  console.log(`${node.nodeType} at line ${node.lineno || 'unknown'}`);
}
// Output:
// Module at line 1
// Assign at line 1
// Name at line 1
// Load at line unknown
// ListComp at line 1
// BinOp at line 1
// Name at line 1
// Load at line unknown
// Constant at line 1
// Pow at line unknown
// Comprehension at line 1
// Name at line 1
// Store at line unknown
// Call at line 1
// Name at line 1
// Load at line unknown
// Constant at line 1
```

#### `getDocstring(node)`

Extracts the docstring from a function, class, or module node.

```typescript
import { parse, getDocstring } from "py-ast";

const code = `
def example_function():
    """This is a docstring for the function."""
    return 42

class ExampleClass:
    """This is a class docstring."""
    pass
`;

const ast = parse(code);
const funcNode = ast.body[0]; // FunctionDef
const classNode = ast.body[1]; // ClassDef

console.log(getDocstring(funcNode)); // "This is a docstring for the function."
console.log(getDocstring(classNode)); // "This is a class docstring."
```

#### `iterChildNodes(node)`

Iterates over the direct child nodes of an AST node.

```typescript
import { parse, iterChildNodes } from "py-ast";

const ast = parse("x = y + z");
const assignNode = ast.body[0]; // Assign node

for (const child of iterChildNodes(assignNode)) {
  console.log(child.nodeType);
}
// Output: Name, BinOp
```

#### `iterFields(node)`

Iterates over the fields of an AST node, yielding [fieldName, fieldValue] pairs.

```typescript
import { parse, iterFields } from "py-ast";

const ast = parse("x = 42");
const assignNode = ast.body[0];

for (const [fieldName, fieldValue] of iterFields(assignNode)) {
  console.log(`${fieldName}: ${fieldValue}`);
}
// Output: targets: [object Object], value: [object Object], lineno: 1, etc.
```

#### `isASTNode(obj)`

Type guard function to check if an object is an AST node.

```typescript
import { parse, isASTNode } from "py-ast";

const ast = parse("x = 42");
console.log(isASTNode(ast)); // true
console.log(isASTNode({})); // false
console.log(isASTNode("string")); // false
```

### Convenience Functions

#### `parsePython(source, options?)`

Alternative name for `parse()` that makes the intent clearer.

```typescript
import { parsePython } from "py-ast";

const ast = parsePython("x = 42", { filename: "script.py" });
```

#### `parseModule(source, filename?)`

Legacy convenience function for parsing with just a filename.

```typescript
import { parseModule } from "py-ast";

const ast = parseModule("def hello(): pass", "hello.py");
```

#### `ast`

Utility object containing helper functions (similar to Python's ast module).

```typescript
import { ast } from "py-ast";

// Access utility functions through the ast object
// (specific functions depend on implementation)
```

#### `getSourceSegment(source, node, padded?)`

Extracts the source code segment for a given AST node.

```typescript
import { parse, getSourceSegment } from "py-ast";

const source = "def hello(name):\n    return f'Hello, {name}!'";
const ast = parse(source);
const funcNode = ast.body[0];

const segment = getSourceSegment(source, funcNode);
console.log(segment); // "def hello(name):\n    return f'Hello, {name}!'"
```

### Lexer

#### `Lexer`

Low-level tokenizer for Python source code.

```typescript
import { Lexer, TokenType } from "py-ast";

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
import { parse, walk, NodeVisitor } from "py-ast";

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
import { parse, unparse, NodeTransformer } from "py-ast";

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

Based on the latest demo run, the parser successfully handles:

```bash
🐍 Python AST Parser Demo - v1.9.0
============================================================

📊 Files analyzed: 7 complex Python files
⏱️  Total parse time: 23ms (average: 3.29ms per file)
🌳 Total AST nodes: 7,081 nodes processed
🔧 Total functions: 130 functions parsed
🏗️  Total classes: 25 classes parsed

✅ Successfully tested features:
  • Advanced async/await patterns
  • Decorators and decorator parameters  
  • Complex comprehensions and generators
  • Exception handling (try/except/finally)
  • Context managers (with statements)
  • Type annotations and generics
  • Multiple inheritance and mixins
  • Property decorators (@property, @setter)
  • Import variations (absolute, relative, aliased)
  • F-strings with complex expressions

📈 Performance benchmarks:
  • Simple expressions: ~0.01ms average
  • Medium complexity: ~0.06ms average  
  • Complex files: ~0.50ms average
  • Perfect roundtrip: unparse(parse(code)) === code ✅

🔄 Bidirectional conversion:
  ✓ Parse → AST successful for all test cases
  ✓ AST → Python code regeneration successful
  ✓ Comments preserved when enabled
  ✓ Quote styles preserved
  ✓ Indentation correctly handled
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

# Run tests in watch mode
npm run test:watch

# Format and lint code
npm run format
npm run lint:fix

# Type checking
npm run type-check

# Run demo examples
npm run demo
npm run demo:test
npm run demo:interactive

# Development with hot reload
npm run dev
```

### Running Examples

The library includes comprehensive demo files:

```bash
# Run all demos
npm run demo:all

# Interactive Python→AST conversion
npm run demo:interactive

# JSON export examples  
npm run demo:json

# Convert Python files to JSON
npm run py2json path/to/file.py
```

## License

MIT License

## AI Usage

Most part of this project is built using Claude Sonnet 4 in Github Copilot. However, a comprehensive verification and testing of both the code and the features.

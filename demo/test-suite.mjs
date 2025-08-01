/**
 * Comprehensive AST Testing Suite
 * Tests various aspects of the Python AST parser
 */

import { 
  parse, 
  walk, 
  NodeVisitor, 
  unparse,
  getDocstring,
  iterFields,
  iterChildNodes 
} from '../dist/index.esm.js';

/**
 * Test basic parsing functionality
 */
function testBasicParsing() {
  console.log('\n🔍 Testing Basic Parsing');
  console.log('-'.repeat(40));

  const testCases = [
    // Expressions
    { name: 'Number', code: '42' },
    { name: 'String', code: '"hello"' },
    { name: 'Variable', code: 'x' },
    { name: 'Binary Op', code: 'x + y' },
    { name: 'Function Call', code: 'func(a, b)' },
    { name: 'List', code: '[1, 2, 3]' },
    { name: 'Dict', code: '{"a": 1, "b": 2}' },
    { name: 'Tuple', code: '(1, 2, 3)' },
    { name: 'Set', code: '{1, 2, 3}' },
    
    // Statements
    { name: 'Assignment', code: 'x = 42' },
    { name: 'If Statement', code: 'if x > 0:\n    print("positive")' },
    { name: 'For Loop', code: 'for i in range(10):\n    print(i)' },
    { name: 'While Loop', code: 'while True:\n    break' },
    { name: 'Function Def', code: 'def func():\n    pass' },
    { name: 'Class Def', code: 'class MyClass:\n    pass' },
    { name: 'Try-Except', code: 'try:\n    x = 1\nexcept:\n    pass' },
    { name: 'With Statement', code: 'with open("file") as f:\n    data = f.read()' },
    
    // Advanced constructs
    { name: 'List Comprehension', code: '[x for x in range(10)]' },
    { name: 'Dict Comprehension', code: '{x: x*2 for x in range(5)}' },
    { name: 'Generator Expression', code: '(x for x in range(10))' },
    { name: 'Lambda', code: 'lambda x: x * 2' },
    { name: 'Decorator', code: '@decorator\ndef func():\n    pass' },
    { name: 'Async Function', code: 'async def func():\n    await something()' },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      const ast = parse(testCase.code);
      console.log(`✅ ${testCase.name}: ${ast.nodeType}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${testCase.name}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

/**
 * Test complex Python constructs
 */
function testComplexConstructs() {
  console.log('\n🧩 Testing Complex Constructs');
  console.log('-'.repeat(40));

  const complexCode = `
# Complex Python code with various constructs
from typing import List, Dict, Optional
import asyncio

@dataclass
class Person:
    name: str
    age: int = 0
    
    def __post_init__(self):
        if self.age < 0:
            raise ValueError("Age cannot be negative")
    
    @property
    def is_adult(self) -> bool:
        return self.age >= 18
    
    async def fetch_data(self) -> Dict[str, Any]:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"/users/{self.name}") as response:
                return await response.json()

class PersonManager:
    def __init__(self):
        self.people: List[Person] = []
        self._cache = {}
    
    def add_person(self, person: Person) -> None:
        if not isinstance(person, Person):
            raise TypeError("Expected Person instance")
        self.people.append(person)
    
    def find_adults(self) -> List[Person]:
        return [p for p in self.people if p.is_adult]
    
    def get_stats(self) -> Dict[str, Any]:
        ages = [p.age for p in self.people]
        return {
            "total": len(self.people),
            "adults": len(self.find_adults()),
            "avg_age": sum(ages) / len(ages) if ages else 0,
            "age_groups": {
                "children": len([a for a in ages if a < 18]),
                "adults": len([a for a in ages if 18 <= a < 65]),
                "seniors": len([a for a in ages if a >= 65])
            }
        }

async def process_people(manager: PersonManager) -> None:
    tasks = []
    for person in manager.people:
        if person.is_adult:
            task = asyncio.create_task(person.fetch_data())
            tasks.append(task)
    
    if tasks:
        try:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    print(f"Error for person {i}: {result}")
                else:
                    print(f"Data for person {i}: {result}")
        except Exception as e:
            print(f"Batch processing failed: {e}")

def main():
    manager = PersonManager()
    
    # Add some people
    people_data = [
        ("Alice", 30),
        ("Bob", 17),
        ("Charlie", 70),
        ("Diana", 25)
    ]
    
    for name, age in people_data:
        try:
            person = Person(name, age)
            manager.add_person(person)
        except ValueError as e:
            print(f"Invalid person data for {name}: {e}")
    
    # Get statistics
    stats = manager.get_stats()
    print(f"Statistics: {stats}")
    
    # Process async data
    asyncio.run(process_people(manager))

if __name__ == "__main__":
    main()
`;

  try {
    const ast = parse(complexCode);
    console.log(`✅ Successfully parsed complex code`);
    console.log(`📊 Root node: ${ast.nodeType}`);
    
    // Count nodes by type
    const nodeCounts = new Map();
    for (const node of walk(ast)) {
      nodeCounts.set(node.nodeType, (nodeCounts.get(node.nodeType) || 0) + 1);
    }
    
    console.log('\n🔢 Node type distribution:');
    Array.from(nodeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    
    return true;
  } catch (error) {
    console.log(`❌ Failed to parse complex code: ${error.message}`);
    return false;
  }
}

/**
 * Test visitor pattern functionality
 */
function testVisitorPattern() {
  console.log('\n👁️  Testing Visitor Pattern');
  console.log('-'.repeat(40));

  const code = `
def fibonacci(n):
    if n <= 1:
        return n
    else:
        return fibonacci(n-1) + fibonacci(n-2)

class Calculator:
    def add(self, a, b):
        return a + b
    
    def multiply(self, a, b):
        return a * b

x = 10
y = 20
result = fibonacci(x) + Calculator().add(y, 5)
`;

  class TestVisitor extends NodeVisitor {
    constructor() {
      super();
      this.functions = [];
      this.classes = [];
      this.variables = [];
      this.functionCalls = [];
    }

    visitFunctionDef(node) {
      this.functions.push({
        name: node.name,
        args: node.args.args.length,
        lineno: node.lineno
      });
      this.genericVisit(node);
    }

    visitClassDef(node) {
      this.classes.push({
        name: node.name,
        lineno: node.lineno
      });
      this.genericVisit(node);
    }

    visitName(node) {
      if (node.ctx && node.ctx.nodeType === 'Store') {
        this.variables.push({
          name: node.id,
          lineno: node.lineno
        });
      }
      this.genericVisit(node);
    }

    visitCall(node) {
      if (node.func.nodeType === 'Name') {
        this.functionCalls.push({
          name: node.func.id,
          args: node.args.length,
          lineno: node.lineno
        });
      } else if (node.func.nodeType === 'Attribute') {
        this.functionCalls.push({
          name: node.func.attr,
          object: node.func.value.nodeType,
          args: node.args.length,
          lineno: node.lineno
        });
      }
      this.genericVisit(node);
    }
  }

  try {
    const ast = parse(code);
    const visitor = new TestVisitor();
    visitor.visit(ast);

    console.log('✅ Visitor pattern works');
    console.log(`🔧 Functions found: ${visitor.functions.length}`);
    visitor.functions.forEach(func => {
      console.log(`  - ${func.name}(${func.args} args) at line ${func.lineno}`);
    });

    console.log(`🏗️  Classes found: ${visitor.classes.length}`);
    visitor.classes.forEach(cls => {
      console.log(`  - ${cls.name} at line ${cls.lineno}`);
    });

    console.log(`📞 Function calls: ${visitor.functionCalls.length}`);
    visitor.functionCalls.forEach(call => {
      const objStr = call.object ? `${call.object}.` : '';
      console.log(`  - ${objStr}${call.name}(${call.args} args) at line ${call.lineno}`);
    });

    console.log(`📦 Variables: ${visitor.variables.length}`);
    visitor.variables.forEach(variable => {
      console.log(`  - ${variable.name} at line ${variable.lineno}`);
    });

    return true;
  } catch (error) {
    console.log(`❌ Visitor test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test AST utility functions
 */
function testUtilities() {
  console.log('\n🛠️  Testing Utility Functions');
  console.log('-'.repeat(40));

  const code = `
"""
This is a module docstring.
It describes what the module does.
"""

def example_function():
    """This function does something."""
    return 42

class ExampleClass:
    """This is a class docstring."""
    
    def method(self):
        """Method docstring."""
        pass
`;

  try {
    const ast = parse(code);
    console.log('✅ Parsed code for utility testing');

    // Test getDocstring
    const moduleDocstring = getDocstring(ast);
    console.log(`📝 Module docstring: "${moduleDocstring?.slice(0, 50)}..."`);

    // Test walk function
    let nodeCount = 0;
    for (const node of walk(ast)) {
      nodeCount++;
      if (nodeCount > 5) break; // Just test first few nodes
    }
    console.log(`🚶 Walk function works, counted ${nodeCount} nodes`);

    // Test iterFields
    console.log('🔍 Root node fields:');
    let fieldCount = 0;
    for (const [name, value] of iterFields(ast)) {
      fieldCount++;
      const valueType = Array.isArray(value) ? `Array(${value.length})` : typeof value;
      console.log(`  ${name}: ${valueType}`);
      if (fieldCount > 5) break; // Limit output
    }

    // Test iterChildNodes
    console.log('👶 Child nodes:');
    let childCount = 0;
    for (const child of iterChildNodes(ast)) {
      childCount++;
      console.log(`  ${child.nodeType}`);
      if (childCount > 5) break; // Limit output
    }

    return true;
  } catch (error) {
    console.log(`❌ Utility test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test error handling and edge cases
 */
function testErrorHandling() {
  console.log('\n⚠️  Testing Error Handling');
  console.log('-'.repeat(40));

  const invalidCodes = [
    { name: 'Syntax Error', code: 'def func(\n    pass' },
    { name: 'Indentation Error', code: 'if True:\nprint("no indent")' },
    { name: 'Incomplete Code', code: 'def func():' },
    { name: 'Invalid Operator', code: 'x === y' },
    { name: 'Unmatched Parentheses', code: '(1 + 2' },
    { name: 'Invalid String', code: '"unclosed string' },
  ];

  let errorsHandled = 0;
  let unexpectedSuccesses = 0;

  for (const testCase of invalidCodes) {
    try {
      const ast = parse(testCase.code);
      console.log(`⚠️  ${testCase.name}: Unexpectedly succeeded (${ast.nodeType})`);
      unexpectedSuccesses++;
    } catch (error) {
      console.log(`✅ ${testCase.name}: Correctly caught error`);
      errorsHandled++;
    }
  }

  console.log(`\n📊 Error handling: ${errorsHandled} errors caught, ${unexpectedSuccesses} unexpected successes`);
  return { errorsHandled, unexpectedSuccesses };
}

/**
 * Test performance with different code sizes
 */
function testPerformance() {
  console.log('\n⚡ Testing Performance');
  console.log('-'.repeat(40));

  // Generate code of different sizes
  const generateCode = (size) => {
    const lines = [];
    for (let i = 0; i < size; i++) {
      lines.push(`x${i} = ${i} + ${i * 2}`);
    }
    return lines.join('\n');
  };

  const sizes = [10, 50, 100, 200];
  
  sizes.forEach(size => {
    const code = generateCode(size);
    const start = Date.now();
    
    try {
      const ast = parse(code);
      const end = Date.now();
      const time = end - start;
      
      let nodeCount = 0;
      for (const node of walk(ast)) {
        nodeCount++;
      }
      
      console.log(`📏 ${size} lines: ${time}ms, ${nodeCount} nodes (${(nodeCount/time).toFixed(1)} nodes/ms)`);
    } catch (error) {
      console.log(`❌ ${size} lines: Parse failed - ${error.message}`);
    }
  });
}

/**
 * Main test runner
 */
function runTests() {
  console.log('🧪 Python AST Parser Test Suite');
  console.log('='.repeat(50));

  const results = {
    basic: testBasicParsing(),
    complex: testComplexConstructs(),
    visitor: testVisitorPattern(),
    utilities: testUtilities(),
    errors: testErrorHandling(),
  };

  testPerformance();

  // Summary
  console.log('\n📋 Test Summary');
  console.log('='.repeat(50));
  
  let totalPassed = 0;
  let totalFailed = 0;

  if (results.basic) {
    totalPassed += results.basic.passed;
    totalFailed += results.basic.failed;
  }

  const otherTests = [results.complex, results.visitor, results.utilities].filter(Boolean);
  totalPassed += otherTests.length;

  if (results.errors) {
    console.log(`⚠️  Error handling: ${results.errors.errorsHandled} errors properly caught`);
  }

  console.log(`✅ Tests passed: ${totalPassed}`);
  console.log(`❌ Tests failed: ${totalFailed}`);
  console.log(`📊 Success rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

  return {
    passed: totalPassed,
    failed: totalFailed,
    successRate: (totalPassed / (totalPassed + totalFailed)) * 100
  };
}

// Export for use as module
export { runTests };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

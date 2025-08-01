#!/usr/bin/env node

/**
 * AST Demo Runner
 * Demonstrates the Python AST parser capabilities
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parse,
  parsePython,
  walk,
  NodeVisitor,
  NodeTransformer,
  unparse,
  getDocstring,
  iterFields,
  iterChildNodes,
  isASTNode,
  ast
} from '../dist/index.esm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Custom visitor to collect statistics about the AST
 */
class ASTStatsVisitor extends NodeVisitor {
  constructor() {
    super();
    this.stats = {
      nodeTypes: new Map(),
      functionDefs: [],
      classDefs: [],
      imports: [],
      totalNodes: 0,
      maxDepth: 0
    };
    this.currentDepth = 0;
  }

  visit(node) {
    this.stats.totalNodes++;
    this.currentDepth++;
    this.stats.maxDepth = Math.max(this.stats.maxDepth, this.currentDepth);

    // Count node types
    const nodeType = node.nodeType;
    this.stats.nodeTypes.set(nodeType, (this.stats.nodeTypes.get(nodeType) || 0) + 1);

    // Collect specific information
    if (nodeType === 'FunctionDef' || nodeType === 'AsyncFunctionDef') {
      this.stats.functionDefs.push({
        name: node.name,
        lineno: node.lineno,
        type: nodeType,
        args: node.args.args.length,
        hasDefaults: node.args.defaults.length > 0,
        hasVararg: !!node.args.vararg,
        hasKwarg: !!node.args.kwarg,
        hasDecorators: node.decorator_list.length > 0,
        hasAnnotations: !!node.returns || node.args.args.some(arg => arg.annotation)
      });
    }

    if (nodeType === 'ClassDef') {
      this.stats.classDefs.push({
        name: node.name,
        lineno: node.lineno,
        bases: node.bases.length,
        methods: node.body.filter(stmt => 
          stmt.nodeType === 'FunctionDef' || stmt.nodeType === 'AsyncFunctionDef'
        ).length,
        hasDecorators: node.decorator_list.length > 0
      });
    }

    if (nodeType === 'Import' || nodeType === 'ImportFrom') {
      this.stats.imports.push({
        type: nodeType,
        module: nodeType === 'ImportFrom' ? node.module : null,
        names: node.names.map(alias => ({
          name: alias.name,
          asname: alias.asname
        })),
        lineno: node.lineno
      });
    }

    this.genericVisit(node);
    this.currentDepth--;
  }

  getReport() {
    const nodeTypesArray = Array.from(this.stats.nodeTypes.entries())
      .sort((a, b) => b[1] - a[1]);

    return {
      summary: {
        totalNodes: this.stats.totalNodes,
        uniqueNodeTypes: this.stats.nodeTypes.size,
        maxDepth: this.stats.maxDepth,
        functions: this.stats.functionDefs.length,
        classes: this.stats.classDefs.length,
        imports: this.stats.imports.length
      },
      nodeTypes: Object.fromEntries(nodeTypesArray),
      functions: this.stats.functionDefs,
      classes: this.stats.classDefs,
      imports: this.stats.imports
    };
  }
}

/**
 * Transformer that adds line number comments to function definitions
 */
class LineNumberTransformer extends NodeTransformer {
  visitFunctionDef(node) {
    // Add a comment about the line number (this is just for demo)
    const transformedNode = this.genericVisit(node);
    
    // In a real transformer, you might modify the AST structure
    // For this demo, we'll just return the node as-is
    return transformedNode;
  }
}

/**
 * Parse a Python file and generate detailed analysis
 */
async function analyzeFile(filePath) {
  try {
    console.log(`\n📁 Analyzing: ${filePath}`);
    console.log('='.repeat(60));

    // Read the file
    const source = await fs.readFile(filePath, 'utf-8');
    
    // Parse the AST
    const startTime = Date.now();
    const astTree = parse(source, { 
      filename: filePath,
      type_comments: true 
    });
    const parseTime = Date.now() - startTime;

    console.log(`⏱️  Parsing time: ${parseTime}ms`);
    console.log(`📊 Root node type: ${astTree.nodeType}`);
    
    // Get module docstring if available
    const docstring = getDocstring(astTree);
    if (docstring) {
      console.log(`📝 Module docstring: "${docstring.slice(0, 100)}${docstring.length > 100 ? '...' : ''}"`);
    }

    // Collect statistics
    const visitor = new ASTStatsVisitor();
    visitor.visit(astTree);
    const stats = visitor.getReport();

    console.log('\n📈 AST Statistics:');
    console.log('  Total nodes:', stats.summary.totalNodes);
    console.log('  Unique node types:', stats.summary.uniqueNodeTypes);
    console.log('  Maximum depth:', stats.summary.maxDepth);
    console.log('  Functions:', stats.summary.functions);
    console.log('  Classes:', stats.summary.classes);
    console.log('  Imports:', stats.summary.imports);

    // Show top node types
    console.log('\n🔢 Most common node types:');
    const topNodeTypes = Object.entries(stats.nodeTypes).slice(0, 10);
    topNodeTypes.forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    // Show functions
    if (stats.functions.length > 0) {
      console.log('\n🔧 Functions found:');
      stats.functions.forEach(func => {
        const features = [];
        if (func.hasDefaults) features.push('defaults');
        if (func.hasVararg) features.push('*args');
        if (func.hasKwarg) features.push('**kwargs');
        if (func.hasDecorators) features.push('decorated');
        if (func.hasAnnotations) features.push('annotated');
        if (func.type === 'AsyncFunctionDef') features.push('async');
        
        const featuresStr = features.length > 0 ? ` (${features.join(', ')})` : '';
        console.log(`  Line ${func.lineno}: ${func.name}(${func.args} args)${featuresStr}`);
      });
    }

    // Show classes
    if (stats.classes.length > 0) {
      console.log('\n🏗️  Classes found:');
      stats.classes.forEach(cls => {
        const features = [];
        if (cls.bases > 0) features.push(`${cls.bases} bases`);
        if (cls.methods > 0) features.push(`${cls.methods} methods`);
        if (cls.hasDecorators) features.push('decorated');
        
        const featuresStr = features.length > 0 ? ` (${features.join(', ')})` : '';
        console.log(`  Line ${cls.lineno}: ${cls.name}${featuresStr}`);
      });
    }

    // Show imports
    if (stats.imports.length > 0) {
      console.log('\n📦 Imports found:');
      stats.imports.forEach(imp => {
        if (imp.type === 'ImportFrom') {
          const names = imp.names.map(n => n.asname ? `${n.name} as ${n.asname}` : n.name).join(', ');
          console.log(`  Line ${imp.lineno}: from ${imp.module || '?'} import ${names}`);
        } else {
          const names = imp.names.map(n => n.asname ? `${n.name} as ${n.asname}` : n.name).join(', ');
          console.log(`  Line ${imp.lineno}: import ${names}`);
        }
      });
    }

    // Demonstrate AST traversal
    console.log('\n🚶 Walking AST (first 10 nodes):');
    let nodeCount = 0;
    for (const node of walk(astTree)) {
      if (nodeCount >= 10) break;
      const location = node.lineno ? ` (line ${node.lineno})` : '';
      console.log(`  ${node.nodeType}${location}`);
      nodeCount++;
    }

    // Demonstrate field iteration
    console.log('\n🔍 Root node fields:');
    for (const [fieldName, value] of iterFields(astTree)) {
      if (Array.isArray(value)) {
        console.log(`  ${fieldName}: Array(${value.length})`);
      } else if (isASTNode(value)) {
        console.log(`  ${fieldName}: ${value.nodeType}`);
      } else {
        console.log(`  ${fieldName}: ${typeof value}`);
      }
    }

    // Try to unparse (if implemented)
    try {
      console.log('\n🔄 Testing unparse functionality...');
      const unparsed = unparse(astTree);
      console.log(`✅ Successfully unparsed ${unparsed.length} characters`);
      
      // Show first few lines of unparsed code
      const lines = unparsed.split('\n').slice(0, 5);
      console.log('📄 First few lines of unparsed code:');
      lines.forEach((line, i) => {
        console.log(`  ${i + 1}: ${line}`);
      });
    } catch (error) {
      console.log(`❌ Unparse failed: ${error.message}`);
    }

    // Show JSON structure for small ASTs
    try {
      const jsonStr = JSON.stringify(astTree, null, 2);
      if (jsonStr.length < 5000) {
        console.log('\n📄 AST JSON Structure (truncated):');
        console.log(jsonStr.slice(0, 1000));
        if (jsonStr.length > 1000) {
          console.log('... (truncated for readability)');
        }
        console.log(`\n💾 Full JSON size: ${jsonStr.length} characters`);
      } else {
        console.log(`\n💾 AST JSON size: ${jsonStr.length} characters (too large to display)`);
      }
    } catch (error) {
      console.log(`❌ JSON serialization failed: ${error.message}`);
    }

    return {
      filename: filePath,
      parseTime,
      stats,
      astTree
    };

  } catch (error) {
    console.error(`❌ Error analyzing ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Test specific Python code snippets
 */
async function testSnippets() {
  console.log('\n🧪 Testing specific Python snippets');
  console.log('='.repeat(60));

  const snippets = [
    {
      name: 'Simple Expression',
      code: 'x = 42 + 3 * 5'
    },
    {
      name: 'Function with Annotations',
      code: `def greet(name: str) -> str:
    return f"Hello, {name}!"`
    },
    {
      name: 'Class Definition',
      code: `class Person:
    def __init__(self, name: str):
        self.name = name
    
    def greet(self) -> str:
        return f"Hi, I'm {self.name}"`
    },
    {
      name: 'List Comprehension',
      code: 'squares = [x**2 for x in range(10) if x % 2 == 0]'
    },
    {
      name: 'Async Function',
      code: `async def fetch_data():
    await asyncio.sleep(1)
    return "data"`
    },
    {
      name: 'Decorator',
      code: `@property
def name(self):
    return self._name`
    },
    {
      name: 'Try-Except',
      code: `try:
    result = risky_operation()
except ValueError as e:
    print(f"Error: {e}")
finally:
    cleanup()`
    },
    {
      name: 'Context Manager',
      code: `with open('file.txt') as f:
    content = f.read()`
    }
  ];

  for (const snippet of snippets) {
    try {
      console.log(`\n🔬 Testing: ${snippet.name}`);
      console.log('-'.repeat(30));
      
      const ast = parse(snippet.code);
      console.log(`✅ Parsed successfully: ${ast.nodeType}`);
      
      // Count nodes
      let nodeCount = 0;
      for (const node of walk(ast)) {
        nodeCount++;
      }
      console.log(`📊 Total nodes: ${nodeCount}`);
      
      // Show structure
      console.log('🌳 AST Structure:');
      const visitor = new ASTStatsVisitor();
      visitor.visit(ast);
      const stats = visitor.getReport();
      
      Object.entries(stats.nodeTypes).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
      
    } catch (error) {
      console.error(`❌ Failed to parse "${snippet.name}": ${error.message}`);
    }
  }
}

/**
 * Performance test with increasingly complex code
 */
async function performanceTest() {
  console.log('\n⚡ Performance Testing');
  console.log('='.repeat(60));

  const testCases = [
    {
      name: 'Simple',
      code: 'x = 1'
    },
    {
      name: 'Medium',
      code: `
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

for i in range(10):
    print(fibonacci(i))
`
    },
    {
      name: 'Complex',
      code: `
import asyncio
from typing import Dict, List, Optional

class DataProcessor:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.results = []
    
    async def process_batch(self, items: List[Dict]) -> List[Dict]:
        tasks = [self.process_item(item) for item in items]
        return await asyncio.gather(*tasks)
    
    async def process_item(self, item: Dict) -> Dict:
        # Complex processing logic
        result = {}
        for key, value in item.items():
            if isinstance(value, str):
                result[key] = value.upper()
            elif isinstance(value, (int, float)):
                result[key] = value * 2
            else:
                result[key] = str(value)
        return result

@dataclass
class Config:
    batch_size: int = 100
    timeout: float = 30.0
    retries: int = 3

async def main():
    config = Config()
    processor = DataProcessor(asdict(config))
    
    data = [{"id": i, "value": f"item_{i}"} for i in range(1000)]
    batches = [data[i:i+config.batch_size] for i in range(0, len(data), config.batch_size)]
    
    results = []
    for batch in batches:
        try:
            batch_results = await processor.process_batch(batch)
            results.extend(batch_results)
        except Exception as e:
            print(f"Batch failed: {e}")
    
    return results

if __name__ == "__main__":
    asyncio.run(main())
`
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n🔬 Testing: ${testCase.name}`);
    
    const iterations = testCase.name === 'Complex' ? 10 : 100;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      try {
        const ast = parse(testCase.code);
        const end = Date.now();
        times.push(end - start);
      } catch (error) {
        console.error(`❌ Parse failed: ${error.message}`);
        break;
      }
    }
    
    if (times.length > 0) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      
      console.log(`  Average: ${avg.toFixed(2)}ms`);
      console.log(`  Min: ${min}ms, Max: ${max}ms`);
      console.log(`  Iterations: ${times.length}`);
    }
  }
}

/**
 * Main demo runner
 */
async function main() {
  console.log('🐍 Python AST Parser Demo');
  console.log('='.repeat(60));
  
  const pythonFilesDir = join(__dirname, 'python-files');
  
  try {
    // Get all Python files
    const files = await fs.readdir(pythonFilesDir);
    const pythonFiles = files
      .filter(file => file.endsWith('.py'))
      .map(file => join(pythonFilesDir, file));
    
    console.log(`Found ${pythonFiles.length} Python files to analyze:`);
    pythonFiles.forEach(file => {
      console.log(`  📄 ${file.split('/').pop()}`);
    });
    
    // Analyze each file
    const results = [];
    for (const file of pythonFiles) {
      const result = await analyzeFile(file);
      if (result) {
        results.push(result);
      }
    }
    
    // Summary
    if (results.length > 0) {
      console.log('\n📋 Summary Report');
      console.log('='.repeat(60));
      
      const totalParseTime = results.reduce((sum, r) => sum + r.parseTime, 0);
      const totalNodes = results.reduce((sum, r) => sum + r.stats.summary.totalNodes, 0);
      const totalFunctions = results.reduce((sum, r) => sum + r.stats.summary.functions, 0);
      const totalClasses = results.reduce((sum, r) => sum + r.stats.summary.classes, 0);
      
      console.log(`📊 Files analyzed: ${results.length}`);
      console.log(`⏱️  Total parse time: ${totalParseTime}ms`);
      console.log(`🌳 Total AST nodes: ${totalNodes}`);
      console.log(`🔧 Total functions: ${totalFunctions}`);
      console.log(`🏗️  Total classes: ${totalClasses}`);
      console.log(`⚡ Average parse time: ${(totalParseTime / results.length).toFixed(2)}ms`);
      console.log(`📈 Average nodes per file: ${Math.round(totalNodes / results.length)}`);
    }
    
    // Run additional tests
    await testSnippets();
    await performanceTest();
    
    console.log('\n✅ Demo completed successfully!');
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// Export for use as a module
export {
  analyzeFile,
  testSnippets,
  performanceTest,
  ASTStatsVisitor,
  LineNumberTransformer
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

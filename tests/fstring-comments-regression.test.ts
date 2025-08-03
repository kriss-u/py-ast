import { describe, expect, test } from '@jest/globals';
import { parse } from '../src/index.js';

describe('F-strings with Comments Regression Test', () => {
	test('f-strings in list with inline comments should parse correctly', () => {
		const code = `
def format_examples():
    formatted = [
        f"Expression: 2 + 3 = {2 + 3}",  # Debug format alternative
        f"Dict access: {test_dict['key']}",
    ]
    return formatted
`;

		// This should not throw when comments are enabled
		expect(() => {
			parse(code, { comments: true });
		}).not.toThrow();

		const ast = parse(code, { comments: true });
		expect(ast.nodeType).toBe('Module');
		expect(ast.body).toHaveLength(1);
		
		// Check that the function contains the list with f-strings
		const funcDef = ast.body[0] as any;
		expect(funcDef.nodeType).toBe('FunctionDef');
		expect(funcDef.name).toBe('format_examples');
	});

	test('main regression: f-strings in list with inline comments', () => {
		// This is the exact pattern that was failing in the original issue
		const code = `formatted = [
    f"Expression: 2 + 3 = {2 + 3}",  # Debug format alternative
    f"Dict access: {test_dict['key']}",
]`;

		expect(() => {
			parse(code, { comments: true });
		}).not.toThrow();

		const ast = parse(code, { comments: true });
		expect(ast.nodeType).toBe('Module');
		
		// Should contain one assignment statement
		const assign = ast.body[0] as any;
		expect(assign.nodeType).toBe('Assign');
		expect(assign.value.nodeType).toBe('List');
		expect(assign.value.elts).toHaveLength(2);
		
		// Both elements should be JoinedStr (f-strings)
		expect(assign.value.elts[0].nodeType).toBe('JoinedStr');
		expect(assign.value.elts[1].nodeType).toBe('JoinedStr');
	});
});

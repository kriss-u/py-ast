/**
 * AST Visitor Implementation
 * Provides visitor pattern for traversing Python AST nodes
 */

import type { ASTNodeUnion } from "./types.js";

/**
 * Generic visitor that can traverse any AST node
 */
export function walk(node: ASTNodeUnion): Generator<ASTNodeUnion> {
	function* walkNode(current: ASTNodeUnion): Generator<ASTNodeUnion> {
		yield current;

		// Visit all child nodes
		for (const [key, value] of Object.entries(current)) {
			if (key === "nodeType") continue;

			if (Array.isArray(value)) {
				for (const item of value) {
					if (item && typeof item === "object" && "nodeType" in item) {
						yield* walkNode(item as ASTNodeUnion);
					}
				}
			} else if (value && typeof value === "object" && "nodeType" in value) {
				yield* walkNode(value as ASTNodeUnion);
			}
		}
	}

	return walkNode(node);
}

/**
 * Base visitor class for traversing AST nodes
 */
export class NodeVisitor {
	/**
	 * Visit a node - dispatches to specific visit method
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Visitor pattern requires dynamic return types
	visit(node: ASTNodeUnion): any {
		const methodName = `visit${node.nodeType}`;
		const methodNameUnderscore = `visit_${node.nodeType}`;

		const method =
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic method lookup requires any
			(this as any)[methodName] || (this as any)[methodNameUnderscore];

		if (method && typeof method === "function") {
			return method.call(this, node);
		} else {
			return this.genericVisit(node);
		}
	}

	/**
	 * Called if no explicit visitor function exists for a node
	 */
	genericVisit(node: ASTNodeUnion): void {
		for (const [key, value] of Object.entries(node)) {
			if (key === "nodeType") continue;

			if (Array.isArray(value)) {
				for (const item of value) {
					if (item && typeof item === "object" && "nodeType" in item) {
						this.visit(item as ASTNodeUnion);
					}
				}
			} else if (value && typeof value === "object" && "nodeType" in value) {
				this.visit(value as ASTNodeUnion);
			}
		}
	}
}

/**
 * Visitor that can transform AST nodes
 */
export class NodeTransformer extends NodeVisitor {
	/**
	 * Called if no explicit visitor function exists for a node
	 */
	genericVisit(node: ASTNodeUnion): ASTNodeUnion {
		// biome-ignore lint/suspicious/noExplicitAny: Generic node cloning requires any for dynamic properties
		const newNode = { ...node } as any;

		for (const [key, value] of Object.entries(node)) {
			if (key === "nodeType") continue;

			if (Array.isArray(value)) {
				// biome-ignore lint/suspicious/noExplicitAny: Array can contain various AST node types
				const newArray: any[] = [];
				for (const item of value) {
					if (item && typeof item === "object" && "nodeType" in item) {
						const result = this.visit(item as ASTNodeUnion);
						if (result !== null && result !== undefined) {
							if (Array.isArray(result)) {
								newArray.push(...result);
							} else {
								newArray.push(result);
							}
						}
					} else {
						newArray.push(item);
					}
				}
				newNode[key] = newArray;
			} else if (value && typeof value === "object" && "nodeType" in value) {
				const result = this.visit(value as ASTNodeUnion);
				newNode[key] = result;
			}
		}

		return newNode;
	}
}

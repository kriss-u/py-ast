/**
 * AST Visitor Implementation
 * Provides visitor pattern for traversing Python AST nodes
 */

import type { ASTNodeUnion } from "./types.js";

/**
 * Recursively walks an AST node and all of its descendants, yielding each
 * node in pre-order (a node is yielded before its children).
 *
 * Child nodes are discovered generically by inspecting each own property of
 * the current node: array properties are scanned for elements that look like
 * AST nodes (objects with a `nodeType` property), and object properties are
 * recursed into directly if they look like an AST node. The `nodeType`
 * property itself is skipped.
 *
 * @param node - The root AST node to start walking from.
 * @returns A generator that lazily yields `node` and every descendant node,
 * in pre-order.
 * @example
 * ```ts
 * for (const node of walk(moduleNode)) {
 *   console.log(node.nodeType);
 * }
 * ```
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
 * Base class for writing tree-walking visitors over an AST, mirroring
 * Python's `ast.NodeVisitor`.
 *
 * Subclasses define `visit<NodeType>` (or `visit_<NodeType>`) methods for
 * the node types they care about, e.g. `visitFunctionDef` for `FunctionDef`
 * nodes. Any node type without a matching method falls back to
 * {@link NodeVisitor.genericVisit}, which simply recurses into the node's
 * children without doing anything else. Visitor methods are responsible for
 * calling {@link NodeVisitor.visit} (or `genericVisit`) themselves if they
 * want traversal to continue into a node's children.
 *
 * @example
 * ```ts
 * class NameCollector extends NodeVisitor {
 *   names: string[] = [];
 *
 *   visitName(node: Name) {
 *     this.names.push(node.id);
 *   }
 * }
 *
 * const collector = new NameCollector();
 * collector.visit(moduleNode);
 * ```
 */
export class NodeVisitor {
	/**
	 * Dispatches a node to its specific `visit<NodeType>`/`visit_<NodeType>`
	 * method if one is defined on the instance, falling back to
	 * {@link NodeVisitor.genericVisit} otherwise.
	 *
	 * @param node - The AST node to visit.
	 * @returns Whatever the matched visitor method (or `genericVisit`)
	 * returns; the base implementation imposes no fixed return type since
	 * subclasses may return arbitrary values from their visit methods.
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
	 * Default visit behavior used when a subclass has not defined a
	 * `visit<NodeType>`/`visit_<NodeType>` method for `node`'s type: it
	 * recurses into each child node (found by scanning own properties for
	 * arrays/objects that look like AST nodes) by calling
	 * {@link NodeVisitor.visit} on them, without collecting or returning any
	 * results.
	 *
	 * @param node - The AST node whose children should be visited.
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
 * A {@link NodeVisitor} subclass that can rewrite an AST while walking it,
 * mirroring Python's `ast.NodeTransformer`.
 *
 * Like `NodeVisitor`, subclasses define `visit<NodeType>`/`visit_<NodeType>`
 * methods for the node types they want to transform. A visitor method should
 * return: the (possibly modified) node to replace the original with, an
 * array of nodes to splice in its place, or `null`/`undefined` to drop the
 * node entirely. Node types without a matching method fall back to
 * {@link NodeTransformer.genericVisit}, which shallow-clones the node and
 * recursively transforms its children, leaving nodes without children
 * unchanged.
 *
 * @example
 * ```ts
 * class ConstantFolder extends NodeTransformer {
 *   visitBinOp(node: BinOp) {
 *     return this.genericVisit(node);
 *   }
 * }
 *
 * const transformed = new ConstantFolder().visit(moduleNode);
 * ```
 */
export class NodeTransformer extends NodeVisitor {
	/**
	 * Default transform behavior used when a subclass has not defined a
	 * `visit<NodeType>`/`visit_<NodeType>` method for `node`'s type: it
	 * shallow-clones `node` and replaces each child (found by scanning own
	 * properties for arrays/objects that look like AST nodes) with the
	 * result of visiting it via {@link NodeVisitor.visit}. Array children
	 * whose visited result is itself an array are spliced in flattened;
	 * `null`/`undefined` results are dropped from arrays.
	 *
	 * @param node - The AST node to clone and transform.
	 * @returns A new node of the same shape as `node` with its children
	 * replaced by their transformed results.
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

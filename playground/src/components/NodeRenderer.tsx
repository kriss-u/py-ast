import type { ASTNodeUnion } from "py-ast";
import { isASTNode } from "py-ast";

/** A single labeled child of a container, ready to render recursively. */
interface Entry {
	key: string;
	label: string | null;
	value: unknown;
}

export interface NodeRendererProps {
	label: string | null;
	value: unknown;
	depth: number;
	expanded: Set<unknown>;
	onToggle: (key: unknown) => void;
	activeNode: ASTNodeUnion | null;
	onHoverEnter?: (node: ASTNodeUnion) => void;
	onHoverLeave?: (node: ASTNodeUnion) => void;
	registerRef: (key: unknown, el: HTMLDivElement | null) => void;
}

/** No-op ref registration, used to keep record-keeping-only subtrees out of the scroll-target map. */
function noopRegisterRef() {}

/**
 * `Module.comments` duplicates the same `Comment` node objects that already
 * appear in their real position within `body`/`inlineComment` — it exists
 * purely for convenient enumeration. Rendering it via the normal recursive
 * props would let it steal the shared object's DOM ref (since it renders
 * after `body`) and win future scroll/highlight targeting. Field name is
 * unique to `Module`, so a plain key check is enough to detect it.
 */
const RECORD_KEEPING_ONLY_FIELD = "comments";

/** Renders a leaf (primitive) value with type-based syntax coloring. */
function Leaf({ value }: { value: unknown }) {
	if (value === null || value === undefined) {
		return <span className="tok-null">None</span>;
	}
	if (typeof value === "string") {
		return <span className="tok-string">{JSON.stringify(value)}</span>;
	}
	if (typeof value === "boolean") {
		return <span className="tok-boolean">{value ? "True" : "False"}</span>;
	}
	if (typeof value === "number" || typeof value === "bigint") {
		return <span className="tok-number">{String(value)}</span>;
	}
	return <span className="tok-string">{String(value)}</span>;
}

/**
 * A fixed-width placeholder matching {@link Container}'s fold disclosure
 * marker, so a leaf row's label lines up under a foldable sibling's label at
 * the same depth — without it, leaf rows (which have nothing to fold) would
 * start one column to the left, and the whole tree would visually jump left
 * and right as you fold/unfold different branches.
 */
function DisclosureSpacer() {
	return <span className="node-disclosure" aria-hidden="true" />;
}

/**
 * `ast.dump`-style collapsible tree renderer.
 */
export function NodeRenderer(props: NodeRendererProps) {
	const { label, value, depth } = props;

	if (Array.isArray(value)) {
		return (
			<Container
				{...props}
				headerText={label}
				bracketOpen="["
				bracketClose="]"
				isEmpty={value.length === 0}
				entries={value.map(
					(item, index): Entry => ({
						key: String(index),
						label: `[${index}]`,
						value: item,
					}),
				)}
			/>
		);
	}

	if (isASTNode(value)) {
		// Dump every own key from the parsed node (including `nodeType` and the
		// location attributes), not just the semantic AST fields, so the raw
		// parser output is fully inspectable.
		const fields = Object.entries(value);
		return (
			<Container
				{...props}
				headerText={label}
				typeName={value.nodeType}
				bracketOpen="{"
				bracketClose="}"
				isEmpty={fields.length === 0}
				entries={fields.map(([name, fieldValue]): Entry => ({ key: name, label: name, value: fieldValue }))}
				node={value}
			/>
		);
	}

	if (value !== null && typeof value === "object") {
		const objectEntries = Object.entries(value);
		return (
			<Container
				{...props}
				headerText={label}
				bracketOpen="{"
				bracketClose="}"
				isEmpty={objectEntries.length === 0}
				entries={objectEntries.map(([name, v]): Entry => ({ key: name, label: name, value: v }))}
			/>
		);
	}

	return (
		<div className="node-row node-leaf" style={{ paddingLeft: depth * 14 }}>
			<DisclosureSpacer />
			{label !== null && <span className="node-label">{label}: </span>}
			<Leaf value={value} />
		</div>
	);
}

interface ContainerProps extends NodeRendererProps {
	headerText: string | null;
	typeName?: string;
	bracketOpen: string;
	bracketClose: string;
	isEmpty: boolean;
	entries: readonly Entry[];
	node?: ASTNodeUnion;
}

/** Renders a foldable object/array/AST-node header plus its children when expanded. */
function Container(props: ContainerProps) {
	const {
		headerText,
		typeName,
		bracketOpen,
		bracketClose,
		isEmpty,
		entries,
		node,
		depth,
		expanded,
		onToggle,
		activeNode,
		onHoverEnter,
		onHoverLeave,
		registerRef,
	} = props;

	const isOpen = expanded.has(props.value);
	const isActive = node !== undefined && node === activeNode;
	const isInteractive = node !== undefined;
	const closesInline = isEmpty || !isOpen;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: hover is used only to drive a non-essential editor-highlight affordance
		<div
			ref={(el) => registerRef(props.value, el)}
			className={`node-branch${isActive ? " node-block-active" : ""}`}
			onMouseEnter={() => isInteractive && node && onHoverEnter?.(node)}
			onMouseLeave={() => isInteractive && node && onHoverLeave?.(node)}
		>
			<div
				className={`node-row node-header${isInteractive ? " node-interactive" : ""}${!isEmpty ? " node-foldable" : ""}`}
				style={{ paddingLeft: depth * 14 }}
				onClick={() => {
					if (!isEmpty) {
						onToggle(props.value);
					}
				}}
			>
				{isEmpty ? (
					<DisclosureSpacer />
				) : (
					<span className="node-disclosure">{isOpen ? "−" : "+"}</span>
				)}
				{headerText !== null && <span className="node-label">{headerText}: </span>}
				{typeName && <span className="tok-nodetype">{typeName} </span>}
				<span className="node-bracket">{bracketOpen}</span>
				{!isOpen && !isEmpty && <span className="node-ellipsis">…</span>}
				{closesInline && <span className="node-bracket">{bracketClose}</span>}
			</div>
			{isOpen && !isEmpty && (
				<div className="node-children">
					{entries.map((entry) => {
						const isRecordKeepingOnly = entry.key === RECORD_KEEPING_ONLY_FIELD;
						return (
							<NodeRenderer
								key={entry.key}
								label={entry.label}
								value={entry.value}
								depth={depth + 1}
								expanded={expanded}
								onToggle={onToggle}
								activeNode={isRecordKeepingOnly ? null : activeNode}
								onHoverEnter={isRecordKeepingOnly ? undefined : onHoverEnter}
								onHoverLeave={isRecordKeepingOnly ? undefined : onHoverLeave}
								registerRef={isRecordKeepingOnly ? noopRegisterRef : registerRef}
							/>
						);
					})}
					<div className="node-row node-close" style={{ paddingLeft: depth * 14 }}>
						<span className="node-bracket">{bracketClose}</span>
					</div>
				</div>
			)}
		</div>
	);
}

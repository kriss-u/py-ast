import { python } from "@codemirror/lang-python";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { memo, useEffect, useMemo, useRef } from "react";
import type { Theme } from "../components/ThemeToggle";
import type { SourcePosition, SourceRange } from "../lib/types";

const setHighlight = StateEffect.define<SourceRange | null>();

const highlightMark = Decoration.mark({ class: "cm-py-ast-highlight" });

const highlightField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, transaction) {
		let next = decorations.map(transaction.changes);
		for (const effect of transaction.effects) {
			if (effect.is(setHighlight)) {
				const range = effect.value;
				if (!range) {
					next = Decoration.none;
					continue;
				}
				const from = positionToOffset(transaction.state.doc, range.startLine, range.startColumn);
				const to = positionToOffset(transaction.state.doc, range.endLine, range.endColumn);
				next = from < to ? Decoration.set([highlightMark.range(from, to)]) : Decoration.none;
			}
		}
		return next;
	},
	provide: (field) => EditorView.decorations.from(field),
});

/** Converts a 1-indexed line / 0-indexed column position to a document offset, clamped to bounds. */
function positionToOffset(doc: EditorView["state"]["doc"], line: number, column: number): number {
	const clampedLine = Math.min(Math.max(line, 1), doc.lines);
	const lineInfo = doc.line(clampedLine);
	return Math.min(lineInfo.from + column, lineInfo.to);
}

export interface EditorProps {
	source: string;
	theme: Theme;
	onSourceChange: (source: string) => void;
	onCursorMove: (position: SourcePosition) => void;
	highlightRange: SourceRange | null;
}

/**
 * Python source editor (CodeMirror). Reports cursor movement upward and
 * renders a highlight decoration for `highlightRange` set by the tree/JSON views.
 *
 * Memoized so that state changes elsewhere in the app (tree/JSON fold
 * toggles, tab switches, Flow layout tweaks) don't re-render — and thus
 * don't touch — this pane at all.
 */
function EditorImpl({ source, theme, onSourceChange, onCursorMove, highlightRange }: EditorProps) {
	const editorRef = useRef<ReactCodeMirrorRef>(null);

	// `extensions` must be a stable array: react-codemirror reconfigures the
	// whole CodeMirror view whenever this reference changes, which — if it
	// were recreated on every render, as happens on every keystroke — causes
	// visible jitter (scroll/cursor resets) instead of a normal incremental
	// update.
	const extensions = useMemo(() => [python(), highlightField], []);

	useEffect(() => {
		const view = editorRef.current?.view;
		if (!view) {
			return;
		}
		view.dispatch({ effects: setHighlight.of(highlightRange) });
		if (highlightRange) {
			const from = positionToOffset(view.state.doc, highlightRange.startLine, highlightRange.startColumn);
			view.dispatch({ effects: EditorView.scrollIntoView(from, { y: "center" }) });
		}
	}, [highlightRange]);

	return (
		<CodeMirror
			ref={editorRef}
			value={source}
			theme={theme}
			height="100%"
			style={{ height: "100%" }}
			extensions={extensions}
			onChange={onSourceChange}
			onUpdate={(update) => {
				if (!update.docChanged && !update.selectionSet) {
					return;
				}
				const { from } = update.state.selection.main;
				const line = update.state.doc.lineAt(from);
				onCursorMove({ line: line.number, column: from - line.from });
			}}
		/>
	);
}

export const Editor = memo(EditorImpl);

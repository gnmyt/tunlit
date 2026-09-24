import "./styles.sass";
import { useEffect, useRef, useState } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Copy, WandSparkles, WrapText } from "lucide-react";
import { useToast } from "@/common/contexts/toast.js";
import { copyToClipboard } from "@/common/utils/clipboard.js";
import { formatBytes } from "@/common/utils/formatUtils.js";
import { extensionFor, format, formattable } from "./languages.js";
import { theme } from "./theme.js";

const base = [
    lineNumbers(), foldGutter(), highlightActiveLine(), highlightActiveLineGutter(), highlightSpecialChars(), drawSelection(),
    rectangularSelection(), crosshairCursor(), history(), bracketMatching(), closeBrackets(), indentOnInput(), highlightSelectionMatches(),
    EditorState.tabSize.of(2),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
    ...theme,
];

const position = state => {
    const line = state.doc.lineAt(state.selection.main.head);
    return { line: line.number, column: state.selection.main.head - line.from + 1 };
};

const CodeEditor = ({ value, onChange, language, label, readOnly = false, maxHeight = "24rem" }) => {
    const { sendToast } = useToast();
    const host = useRef(null);
    const view = useRef(null);
    const languageSlot = useRef(new Compartment());
    const editableSlot = useRef(new Compartment());
    const wrapSlot = useRef(new Compartment());
    const emit = useRef(onChange);
    const shortcut = useRef(null);
    const initial = useRef({ value, language, readOnly });
    const [formatting, setFormatting] = useState(false);
    const [wrap, setWrap] = useState(true);
    const [cursor, setCursor] = useState({ line: 1, column: 1 });
    const [stats, setStats] = useState({ lines: 1, size: 0 });

    useEffect(() => { emit.current = onChange; }, [onChange]);

    useEffect(() => {
        const { value, language, readOnly } = initial.current;
        const editor = new EditorView({
            parent: host.current,
            state: EditorState.create({
                doc: value,
                extensions: [
                    ...base,
                    languageSlot.current.of(extensionFor(language)),
                    editableSlot.current.of([EditorView.editable.of(!readOnly), EditorState.readOnly.of(readOnly)]),
                    wrapSlot.current.of(EditorView.lineWrapping),
                    keymap.of([{ key: "Shift-Alt-f", run: () => { shortcut.current(); return true; } }]),
                    EditorView.updateListener.of(update => {
                        if (update.docChanged) {
                            emit.current?.(update.state.doc.toString());
                            setStats({ lines: update.state.doc.lines, size: new TextEncoder().encode(update.state.doc.toString()).length });
                        }
                        if (update.selectionSet || update.docChanged) setCursor(position(update.state));
                    }),
                ],
            }),
        });
        view.current = editor;
        setStats({ lines: editor.state.doc.lines, size: new TextEncoder().encode(value).length });
        return () => editor.destroy();
    }, []);

    useEffect(() => {
        view.current.dispatch({ effects: wrapSlot.current.reconfigure(wrap ? EditorView.lineWrapping : []) });
    }, [wrap]);

    useEffect(() => {
        view.current.dispatch({ effects: languageSlot.current.reconfigure(extensionFor(language)) });
    }, [language]);

    useEffect(() => {
        view.current.dispatch({ effects: editableSlot.current.reconfigure([EditorView.editable.of(!readOnly), EditorState.readOnly.of(readOnly)]) });
    }, [readOnly]);

    useEffect(() => {
        const current = view.current.state.doc.toString();
        if (value !== current) view.current.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }, [value]);

    const prettify = async () => {
        if (!formattable(language)) return;
        setFormatting(true);
        try {
            const pretty = await format(view.current.state.doc.toString(), language);
            view.current.dispatch({ changes: { from: 0, to: view.current.state.doc.length, insert: pretty } });
        } catch (error) {
            sendToast("Error", error.message.split("\n")[0]);
        } finally {
            setFormatting(false);
        }
    };

    useEffect(() => { shortcut.current = prettify; });

    return (
        <div className={`code-editor${readOnly ? " readonly" : ""}`}>
            <div className="code-editor-bar">
                {label && <span className="code-editor-label">{label}</span>}
                <span className="code-editor-language">{language}</span>
                <span className="code-editor-spacer" />
                <button type="button" className={wrap ? "active" : ""} onClick={() => setWrap(!wrap)} title="Wrap lines" aria-label="Wrap lines"><WrapText /></button>
                <button type="button" onClick={() => copyToClipboard(view.current.state.doc.toString()).then(() => sendToast("Success", "Copied"))} title="Copy" aria-label="Copy"><Copy /></button>
                {formattable(language) && (
                    <button type="button" onClick={prettify} disabled={formatting} title="Format (Shift+Alt+F)"><WandSparkles />Format</button>
                )}
            </div>
            <div className="code-editor-host" ref={host} style={{ "--editor-max-height": maxHeight }} />
            <div className="code-editor-status">
                <span>Ln {cursor.line}, Col {cursor.column}</span>
                <span>{stats.lines} {stats.lines === 1 ? "line" : "lines"} · {formatBytes(stats.size)}</span>
            </div>
        </div>
    );
};

export default CodeEditor;

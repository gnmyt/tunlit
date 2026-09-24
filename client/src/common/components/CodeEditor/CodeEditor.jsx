import "./styles.sass";
import { useEffect, useRef, useState } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { WandSparkles } from "lucide-react";
import { useToast } from "@/common/contexts/toast.js";
import { extensionFor, format, formattable } from "./languages.js";
import { theme } from "./theme.js";

const base = [
    lineNumbers(), foldGutter(), highlightActiveLine(), highlightActiveLineGutter(), highlightSpecialChars(), drawSelection(),
    rectangularSelection(), crosshairCursor(), history(), bracketMatching(), closeBrackets(), indentOnInput(), highlightSelectionMatches(),
    EditorView.lineWrapping, EditorState.tabSize.of(2),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
    ...theme,
];

const CodeEditor = ({ value, onChange, language, label, readOnly = false, maxHeight = "24rem" }) => {
    const { sendToast } = useToast();
    const host = useRef(null);
    const view = useRef(null);
    const languageSlot = useRef(new Compartment());
    const editableSlot = useRef(new Compartment());
    const emit = useRef(onChange);
    const initial = useRef({ value, language, readOnly });
    const [formatting, setFormatting] = useState(false);

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
                    EditorView.updateListener.of(update => { if (update.docChanged) emit.current?.(update.state.doc.toString()); }),
                ],
            }),
        });
        view.current = editor;
        return () => editor.destroy();
    }, []);

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

    return (
        <div className={`code-editor${readOnly ? " readonly" : ""}`}>
            <div className="code-editor-bar">
                {label && <span className="code-editor-label">{label}</span>}
                <span className="code-editor-language">{language}</span>
                {formattable(language) && (
                    <button type="button" onClick={prettify} disabled={formatting} title="Format"><WandSparkles />Format</button>
                )}
            </div>
            <div className="code-editor-host" ref={host} style={{ "--editor-max-height": maxHeight }} />
        </div>
    );
};

export default CodeEditor;

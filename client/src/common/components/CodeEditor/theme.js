import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const lineTint = "rgba(255, 255, 255, 0.03)";
const selection = "rgba(20, 184, 166, 0.3)";

const editorTheme = EditorView.theme({
    "&": { color: "var(--text)", backgroundColor: "var(--surface)", fontSize: "0.75rem" },
    ".cm-content": { fontFamily: mono, padding: "0.5rem 0", caretColor: "var(--text)" },
    ".cm-scroller": { fontFamily: mono, lineHeight: "1.6" },
    ".cm-gutters": { backgroundColor: "var(--surface)", color: "var(--muted)", border: "none", paddingLeft: "0.25rem" },
    ".cm-lineNumbers .cm-gutterElement": { minWidth: "2.25rem", padding: "0 0.5rem 0 0" },
    ".cm-activeLine": { backgroundColor: lineTint },
    ".cm-activeLineGutter": { backgroundColor: lineTint, color: "var(--subtext)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text)" },
    ".cm-selectionBackground": { backgroundColor: selection },
    ".cm-selectionMatch": { backgroundColor: "var(--primary-tint)" },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "var(--primary-tint)", outline: "1px solid var(--primary-deep)" },
    ".cm-nonmatchingBracket": { color: "var(--error)" },
    ".cm-panels": { backgroundColor: "var(--surface-raised)", color: "var(--text)", borderColor: "var(--border)" },
    ".cm-panels input, .cm-panels button": { fontFamily: "inherit", color: "var(--text)", backgroundColor: "var(--background)", border: "1px solid var(--border)", borderRadius: "0.375rem", backgroundImage: "none" },
    ".cm-searchMatch": { backgroundColor: "var(--warning-tint)", outline: "1px solid var(--warning)" },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--warning-tint)" },
    ".cm-tooltip": { backgroundColor: "var(--surface-raised)", border: "1px solid var(--border-strong)", color: "var(--text)" },
    "&.cm-focused": { outline: "none" },
}, { dark: true });

const highlight = HighlightStyle.define([
    { tag: [tags.comment, tags.documentMeta, tags.processingInstruction], color: "var(--muted)", fontStyle: "italic" },
    { tag: [tags.punctuation, tags.bracket, tags.separator, tags.angleBracket], color: "var(--muted)" },
    { tag: [tags.propertyName, tags.tagName, tags.attributeName, tags.definition(tags.variableName)], color: "var(--primary-bright)" },
    { tag: [tags.string, tags.attributeValue, tags.special(tags.string), tags.character], color: "var(--success)" },
    { tag: [tags.number, tags.bool, tags.unit, tags.color, tags.constant(tags.name)], color: "var(--warning)" },
    { tag: [tags.null, tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword, tags.atom, tags.self], color: "var(--error)" },
    { tag: [tags.operator, tags.url, tags.escape, tags.regexp], color: "var(--subtext)" },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.className, tags.typeName, tags.namespace], color: "var(--primary-hover)" },
    { tag: [tags.invalid], color: "var(--error)", textDecoration: "underline" },
]);

export const theme = [editorTheme, syntaxHighlighting(highlight)];

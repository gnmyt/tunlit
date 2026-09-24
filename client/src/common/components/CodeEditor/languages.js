import { StreamLanguage } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { xml } from "@codemirror/lang-xml";

const headers = () => StreamLanguage.define({
    token(stream) {
        if (stream.sol() && stream.match(/^[^:\s]+(?=:)/)) return "propertyName";
        if (stream.match(/^:\s*/)) return "punctuation";
        stream.skipToEnd();
        return "string";
    },
});

const LANGUAGES = { json, html, css, javascript, xml, headers };

export const extensionFor = language => (LANGUAGES[language] ? LANGUAGES[language]() : []);

const PARSERS = { html: "html", css: "css", javascript: "babel", xml: "xml" };

const pluginsFor = async language => {
    switch (language) {
        case "html": return Promise.all([import("prettier/plugins/html"), import("prettier/plugins/postcss"), import("prettier/plugins/babel"), import("prettier/plugins/estree")]);
        case "css": return Promise.all([import("prettier/plugins/postcss")]);
        case "javascript": return Promise.all([import("prettier/plugins/babel"), import("prettier/plugins/estree")]);
        case "xml": return Promise.all([import("@prettier/plugin-xml")]);
    }
};

export const formattable = language => language === "json" || language in PARSERS;

export const format = async (text, language) => {
    if (language === "json") return JSON.stringify(JSON.parse(text), null, 2);
    const [{ format: run }, plugins] = await Promise.all([import("prettier/standalone"), pluginsFor(language)]);
    return run(text, { parser: PARSERS[language], plugins: plugins.map(plugin => plugin.default), printWidth: 100, ...(language === "xml" ? { xmlWhitespaceSensitivity: "ignore" } : {}) });
};

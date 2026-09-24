import { lazy, Suspense } from "react";
import Loading from "@/common/components/Loading";

const Editor = lazy(() => import("./CodeEditor.jsx"));


const CodeEditor = props => (
    <Suspense fallback={<div className="code-editor-loading"><Loading /></div>}>
        <Editor {...props} />
    </Suspense>
);

export default CodeEditor;

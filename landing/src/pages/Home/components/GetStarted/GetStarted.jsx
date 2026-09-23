import "./styles.sass";
import { ArrowRight, BookOpen } from "lucide-react";
import Button from "@/common/components/Button";
import CodeBlock from "@/common/components/CodeBlock";
import { DOCS_URL } from "@/common/utils/links.js";

const DOCKER = `docker run -d \\
  --name tunlit \\
  --restart always \\
  -p 127.0.0.1:8080:8080 \\
  -v tunlit-data:/app/data \\
  -e TUNLIT_BASE_DOMAIN=tunlit.example.com \\
  -e TUNLIT_PUBLIC_URL=https://tunlit.example.com \\
  -e TUNLIT_TRUST_PROXY=true \\
  germannewsmaker/tunlit:latest`;

export const GetStarted = () => (
    <section className="section container">
        <div className="get-started">
            <div className="get-started-text">
                <h2>Up in a minute.</h2>
                <p>One container for the server, one package for the CLI. The setup wizard in the browser takes care of the rest.</p>
                <div className="get-started-actions">
                    <Button text="Install" icon={ArrowRight} to="/install" />
                    <Button text="Documentation" icon={BookOpen} href={DOCS_URL} type="ghost" />
                </div>
            </div>
            <CodeBlock title="Terminal" code={DOCKER} />
        </div>
    </section>
);

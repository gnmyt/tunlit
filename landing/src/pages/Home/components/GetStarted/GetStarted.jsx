import "./styles.sass";
import { ArrowRight, Download } from "lucide-react";
import Button from "@/common/components/Button";
import CodeBlock from "@/common/components/CodeBlock";

const DOCKER = `docker run -d \\
  --name tunlit \\
  --restart always \\
  --network host \\
  -v tunlit-data:/app/data \\
  germannewsmaker/tunlit:latest`;

export const GetStarted = () => (
    <section className="section container">
        <div className="get-started">
            <div className="get-started-text">
                <h2>Up in a minute.</h2>
                <p>One container for the server, one package for the CLI. The setup wizard in the browser takes care of the rest.</p>
                <div className="get-started-actions">
                    <Button text="Set up a server" icon={ArrowRight} to="/setup" />
                    <Button text="Downloads" icon={Download} to="/downloads" type="secondary" />
                </div>
            </div>
            <CodeBlock title="Terminal" code={DOCKER} />
        </div>
    </section>
);

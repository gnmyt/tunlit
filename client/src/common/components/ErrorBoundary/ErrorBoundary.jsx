import { Component } from "react";
import { useRouteError } from "react-router-dom";
import "./styles.sass";
import { CircleAlert } from "lucide-react";

const ErrorDisplay = ({ message, is404 }) => (
    <div className="error-page">
        <CircleAlert />
        <h1>{is404 ? "Page not found" : "Something went wrong"}</h1>
        {!is404 && message && <p>{message}</p>}
        <div className="error-actions">
            {!is404 && <button type="button" onClick={() => window.location.reload()}>Reload</button>}
            <button type="button" onClick={() => (window.location.href = "/@tunlit/")}>Go to dashboard</button>
        </div>
    </div>
);

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    render() {
        if (this.state.error) return <ErrorDisplay message={this.state.error.message} />;
        return this.props.children;
    }
}

const RouteErrorPage = () => {
    const error = useRouteError();
    return <ErrorDisplay message={error?.message || error?.statusText} is404={error?.status === 404} />;
};

export { ErrorBoundary, RouteErrorPage };

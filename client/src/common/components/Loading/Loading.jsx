import { memo } from "react";
import "./styles.sass";

export const Loading = memo(() => {
    return (
        <div className="loading">
            <span className="loading-spinner" />
        </div>
    );
});

Loading.displayName = "Loading";

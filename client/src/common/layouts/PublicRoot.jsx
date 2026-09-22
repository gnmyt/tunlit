import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Suspense } from "react";
import { UserProvider } from "@/common/contexts/UserContext.jsx";
import { useUser } from "@/common/contexts/user.js";
import { ToastProvider } from "@/common/contexts/ToastContext.jsx";
import Loading from "@/common/components/Loading";
import { ErrorBoundary } from "@/common/components/ErrorBoundary";
import PublicShell from "./PublicShell.jsx";

const PublicContent = () => {
    const { loaded, setupRequired } = useUser();
    const { pathname } = useLocation();

    if (!loaded) return <Loading />;
    if (setupRequired && pathname !== "/setup") return <Navigate to="/setup" replace />;

    return (
        <PublicShell>
            <Suspense fallback={<Loading />}>
                <Outlet />
            </Suspense>
        </PublicShell>
    );
};

const PublicRoot = () => (
    <ErrorBoundary>
        <ToastProvider>
            <UserProvider>
                <PublicContent />
            </UserProvider>
        </ToastProvider>
    </ErrorBoundary>
);

export default PublicRoot;

import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import { UserProvider } from "@/common/contexts/UserContext.jsx";
import { useUser } from "@/common/contexts/user.js";
import { ToastProvider } from "@/common/contexts/ToastContext.jsx";
import Loading from "@/common/components/Loading";
import { ErrorBoundary } from "@/common/components/ErrorBoundary";
import PublicShell from "./PublicShell.jsx";

const PublicContent = () => {
    const { loaded } = useUser();

    if (!loaded) return <Loading />;

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

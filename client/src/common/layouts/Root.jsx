import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Suspense } from "react";
import { UserProvider } from "@/common/contexts/UserContext.jsx";
import { useUser } from "@/common/contexts/user.js";
import { ToastProvider } from "@/common/contexts/ToastContext.jsx";
import Loading from "@/common/components/Loading";
import { ErrorBoundary } from "@/common/components/ErrorBoundary";
import TopNav from "@/common/components/TopNav";
import Footer from "@/common/components/Footer";

const AppContent = () => {
    const { loaded, user, setupRequired } = useUser();
    const location = useLocation();

    if (!loaded) return <Loading />;
    if (setupRequired) return <Navigate to="/setup" replace />;
    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

    return (
        <div className="app-wrapper">
            <TopNav />
            <main className="main-content">
                <Suspense fallback={<Loading />}>
                    <Outlet />
                </Suspense>
            </main>
            <Footer />
        </div>
    );
};

const Root = () => (
    <ErrorBoundary>
        <ToastProvider>
            <UserProvider>
                <AppContent />
            </UserProvider>
        </ToastProvider>
    </ErrorBoundary>
);

export default Root;

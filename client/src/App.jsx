import "@fontsource/plus-jakarta-sans/300.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import "@/common/styles/main.sass";
import { lazy, Suspense } from "react";
import Root from "@/common/layouts/Root.jsx";
import PublicRoot from "@/common/layouts/PublicRoot.jsx";
import { ErrorBoundary, RouteErrorPage } from "@/common/components/ErrorBoundary";
import PublicShell from "@/common/layouts/PublicShell.jsx";
import Loading from "@/common/components/Loading";

const Tunnels = lazy(() => import("@/pages/Tunnels"));
const TunnelDetail = lazy(() => import("@/pages/TunnelDetail"));
const Settings = lazy(() => import("@/pages/Settings"));
const SettingsServer = lazy(() => import("@/pages/Settings/pages/Server"));
const SettingsForwarding = lazy(() => import("@/pages/Settings/pages/Forwarding"));
const SettingsHttps = lazy(() => import("@/pages/Settings/pages/Https"));
const SettingsDevices = lazy(() => import("@/pages/Settings/pages/Devices"));
const SettingsAccount = lazy(() => import("@/pages/Settings/pages/Account"));
const SettingsAccounts = lazy(() => import("@/pages/Settings/pages/Accounts"));
const SettingsProviders = lazy(() => import("@/pages/Settings/pages/Providers"));
const Setup = lazy(() => import("@/pages/Setup"));
const Login = lazy(() => import("@/pages/Login"));
const Select = lazy(() => import("@/pages/Select"));
const Status = lazy(() => import("@/pages/Status"));
const Handoff = lazy(() => import("@/pages/Handoff"));
const Connect = lazy(() => import("@/pages/Connect"));

export const BASE_PATH = "/@tunlit";
export const GITHUB_URL = "https://github.com/gnmyt/tunlit";
export const DOCS_URL = "https://docs.tunlit.dev";
export const AUTHOR_URL = "https://gnm.dev";

const App = () => {
    const bootState = typeof window !== "undefined" ? window.__tunlit__ : null;
    if (bootState) {
        return (
            <ErrorBoundary>
                <PublicShell>
                    <Suspense fallback={<Loading />}>
                        <Status {...bootState} />
                    </Suspense>
                </PublicShell>
            </ErrorBoundary>
        );
    }

    const router = createBrowserRouter([
        {
            path: "/",
            element: <Root />,
            errorElement: <RouteErrorPage />,
            children: [
                { path: "/", element: <Navigate to="/tunnels" replace /> },
                { path: "/tunnels", element: <Tunnels /> },
                { path: "/tunnels/:id", element: <TunnelDetail /> },
                {
                    path: "/settings", element: <Settings />, children: [
                        { path: "server", element: <SettingsServer /> },
                        { path: "forwarding", element: <SettingsForwarding /> },
                        { path: "https", element: <SettingsHttps /> },
                        { path: "devices", element: <SettingsDevices /> },
                        { path: "accounts", element: <SettingsAccounts /> },
                        { path: "providers", element: <SettingsProviders /> },
                        { path: "account", element: <SettingsAccount /> },
                    ],
                },
            ],
        },
        {
            path: "/",
            element: <PublicRoot />,
            errorElement: <RouteErrorPage />,
            children: [
                { path: "/setup", element: <Setup /> },
                { path: "/login", element: <Login /> },
                { path: "/select", element: <Select /> },
                { path: "/reattach", element: <Status kind="reattach" /> },
                { path: "/handoff", element: <Handoff /> },
                { path: "/connect/:code", element: <Connect /> },
            ],
        },
    ], { basename: BASE_PATH });

    return <RouterProvider router={router} />;
};

export default App;

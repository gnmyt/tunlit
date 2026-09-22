import "./styles.sass";
import { Suspense } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { KeyRound, Laptop, Lock, Server, UserRound, Users, Waypoints } from "lucide-react";
import Loading from "@/common/components/Loading";
import { useUser } from "@/common/contexts/user.js";

const TABS = [
    { to: "server", label: "Server", icon: Server, adminOnly: true },
    { to: "forwarding", label: "Forwarding", icon: Waypoints, adminOnly: true },
    { to: "https", label: "HTTPS", icon: Lock, adminOnly: true },
    { to: "accounts", label: "Accounts", icon: Users, adminOnly: true },
    { to: "providers", label: "Providers", icon: KeyRound, adminOnly: true },
    { to: "devices", label: "Devices", icon: Laptop },
    { to: "account", label: "Account", icon: UserRound },
];

export const Settings = () => {
    const { user } = useUser();
    const { pathname } = useLocation();
    const tabs = TABS.filter(tab => !tab.adminOnly || user?.role === "admin");

    if (pathname.replace(/\/$/, "").endsWith("/settings")) return <Navigate to={tabs[0].to} replace />;

    return (
        <div className="page settings">
            <div className="page-title">
                <h1>Settings</h1>
            </div>

            <div className="settings-layout">
                <nav className="settings-nav">
                    {tabs.map(({ to, label, icon: Glyph }) => (
                        <NavLink key={to} to={to}
                                 className={({ isActive }) => `settings-nav-item${isActive ? " active" : ""}`}>
                            <Glyph size={15} />{label}
                        </NavLink>
                    ))}
                </nav>
                <div className="settings-content">
                    <Suspense fallback={<Loading />}>
                        <Outlet />
                    </Suspense>
                </div>
            </div>
        </div>
    );
};

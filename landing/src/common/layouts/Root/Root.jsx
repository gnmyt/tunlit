import "./styles.sass";
import { Outlet } from "react-router-dom";
import Navigation from "@/common/components/Navigation";
import Footer from "@/common/components/Footer";

export const Root = () => (
    <div className="app-root">
        <Navigation />
        <main className="main-content">
            <Outlet />
        </main>
        <Footer />
    </div>
);

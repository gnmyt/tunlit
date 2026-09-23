import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, ScrollRestoration } from "react-router-dom";
import "@/common/styles/fonts.sass";
import "@/common/styles/default.sass";
import Root from "@/common/layouts/Root";
import Home from "@/pages/Home";
import Install from "@/pages/Install";
import NotFound from "@/pages/NotFound";

const router = createBrowserRouter([
    {
        path: "/",
        element: <><ScrollRestoration /><Root /></>,
        errorElement: <NotFound />,
        children: [
            { index: true, element: <Home /> },
            { path: "install", element: <Install /> },
        ],
    },
]);

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>,
);

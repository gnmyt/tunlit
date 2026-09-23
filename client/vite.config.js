import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";

export default defineConfig({
    base: "/@tunlit/",
    plugins: [react()],
    css: {
        preprocessorOptions: {
            sass: {
                api: "modern"
            }
        }
    },
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "src"),
        }
    },
    server: {
        proxy: {
            "/@tunlit/api": {
                target: "http://localhost:8080",
                ws: true
            }
        }
    }
});

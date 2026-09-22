import "./styles.sass";
import { Heart } from "lucide-react";
import { AUTHOR_URL } from "@/App.jsx";

export const Footer = () => (
    <footer className="app-footer">
        Made with <Heart size={12} fill="currentColor" /> by{" "}
        <a href={AUTHOR_URL} target="_blank" rel="noreferrer">GNM</a>
    </footer>
);

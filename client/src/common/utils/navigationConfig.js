import { Settings, Waypoints } from "lucide-react";

export const getNavigation = () => [
    { title: "Tunnels", key: "tunnels", path: "/tunnels", icon: Waypoints },
    { title: "Settings", key: "settings", path: "/settings", icon: Settings },
];

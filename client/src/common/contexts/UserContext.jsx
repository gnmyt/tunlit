import { useCallback, useEffect, useState } from "react";
import { UserContext } from "./user.js";
import { getRequest, postRequest } from "@/common/utils/RequestUtil.js";

export const UserProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [setupRequired, setSetupRequired] = useState(false);
    const [serverInfo, setServerInfo] = useState(null);
    const [loaded, setLoaded] = useState(false);

    const checkSetup = useCallback(async () => {
        const status = await getRequest("setup/status");
        setSetupRequired(status.setupRequired);
        return status;
    }, []);

    const login = useCallback(async () => {
        try {
            setUser(await getRequest("auth/me"));
            return true;
        } catch {
            setUser(null);
            return false;
        }
    }, []);

    const logout = async () => {
        try {
            await postRequest("auth/logout");
        } catch { /* the session may already be gone */ }
        setUser(null);
    };

    useEffect(() => {
        Promise.all([checkSetup(), login(), getRequest("info").then(setServerInfo).catch(() => null)])
            .catch(console.error)
            .finally(() => setLoaded(true));
    }, [checkSetup, login]);

    return (
        <UserContext.Provider value={{ user, setUser, setupRequired, setSetupRequired, serverInfo, loaded, login, logout, checkSetup }}>
            {children}
        </UserContext.Provider>
    );
};

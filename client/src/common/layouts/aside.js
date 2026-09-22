import { createContext, useContext } from "react";

export const AsideContext = createContext(null);

export const usePublicAside = () => useContext(AsideContext) || (() => {});

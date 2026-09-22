import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { deleteRequest, getRequest, postRequest } from "@/common/utils/RequestUtil.js";

export const passkeysSupported = () => typeof window !== "undefined" && !!window.PublicKeyCredential;

export const listPasskeys = async () => (await getRequest("auth/passkeys")).passkeys;

export const addPasskey = async name => {
    const options = await postRequest("auth/passkeys/options");
    const response = await startRegistration({ optionsJSON: options });
    return postRequest("auth/passkeys", { response, name });
};

export const removePasskey = id => deleteRequest(`auth/passkeys/${id}`);

export const signInWithPasskey = async username => {
    const options = await postRequest("auth/passkey/options", { username });
    const response = await startAuthentication({ optionsJSON: options });
    return postRequest("auth/passkey/verify", { response });
};

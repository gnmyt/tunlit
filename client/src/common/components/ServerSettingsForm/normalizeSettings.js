export const normalizeSettings = values => ({
    baseDomain: values.baseDomain.trim(),
    publicUrl: values.publicUrl.trim(),
    httpMode: values.httpMode,
    tlsMode: values.tlsMode || "proxy",
    gracePeriod: Number(values.gracePeriod),
    trustProxy: values.tlsMode === "acme" ? false : !!values.trustProxy,
});

export const languageFor = type => {
    if (/json/i.test(type)) return "json";
    if (/html/i.test(type)) return "html";
    if (/xml|svg/i.test(type)) return "xml";
    if (/css/i.test(type)) return "css";
    if (/javascript|ecmascript/i.test(type)) return "javascript";
    return "text";
};

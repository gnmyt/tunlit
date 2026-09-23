import { useEffect, useRef } from "react";

const AUTOFILL_ANIMATION = "field-autofill";

export const formValues = form => Object.fromEntries(new FormData(form).entries());

export const useAutofill = (formRef, apply) => {
    const latest = useRef(apply);
    useEffect(() => { latest.current = apply; });

    useEffect(() => {
        const form = formRef.current;
        if (!form) return;

        const sync = () => {
            const filled = {};
            for (const element of form.elements) if (element.name && element.value) filled[element.name] = element.value;
            if (Object.keys(filled).length) latest.current(filled);
        };

        const onAnimation = event => {
            if (event.animationName === AUTOFILL_ANIMATION) sync();
        };

        sync();
        const timer = setTimeout(sync, 250);
        form.addEventListener("animationstart", onAnimation, true);

        return () => {
            clearTimeout(timer);
            form.removeEventListener("animationstart", onAnimation, true);
        };
    }, [formRef]);
};

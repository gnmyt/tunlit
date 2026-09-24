import "./styles.sass";
import { useEffect, useRef, useState } from "react";

const demos = [
    {
        key: "analyze-requests",
        title: "Read the traffic",
        text: "Filter by method, status or country, open a request, read the body and see who sent it.",
    },
    {
        key: "intercept-requests",
        title: "Intercept a request",
        text: "Set a breakpoint, hold the request, change it in the editor and let it through.",
    },
    {
        key: "set-access-rules",
        title: "Set access rules",
        text: "Password, allowed countries, blocked Tor exits. Applied live, synced to the CLI.",
    },
];

export const Demos = () => {
    const [active, setActive] = useState(0);
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);
    const video = useRef(null);
    const section = useRef(null);
    const demo = demos[active];

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => setVisible(entry.intersectionRatio >= 0.4), { threshold: [0, 0.4] });
        observer.observe(section.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (visible) video.current.play();
        else video.current.pause();
    }, [visible, active]);

    const select = index => {
        setActive(index);
        setProgress(0);
    };

    return (
        <section className="section container demos" ref={section}>
            <div className="section-head">
                <h2>Watch it work.</h2>
                <p>Three things you do in the web UI while a tunnel is open.</p>
            </div>
            <div className="demos-layout">
                <div className="demo-tabs" role="tablist">
                    {demos.map((item, index) => (
                        <button key={item.key} type="button" role="tab" aria-selected={index === active}
                                className={`demo-tab${index === active ? " active" : ""}`} onClick={() => select(index)}>
                            <span className="demo-tab-index">0{index + 1}</span>
                            <span className="demo-tab-body">
                                <strong>{item.title}</strong>
                                <span>{item.text}</span>
                            </span>
                            <span className="demo-tab-progress"><span style={{ transform: `scaleX(${index === active ? progress : 0})` }} /></span>
                        </button>
                    ))}
                </div>
                <video key={demo.key} ref={video} className="demo-video" src={`/assets/video/${demo.key}.webm`} poster={`/assets/video/${demo.key}.jpg`}
                       muted playsInline preload="metadata"
                       onTimeUpdate={event => setProgress(event.target.currentTime / event.target.duration)}
                       onEnded={() => select((active + 1) % demos.length)} />
            </div>
        </section>
    );
};

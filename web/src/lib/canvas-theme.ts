export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f5faff",
            dot: "rgba(10,132,255,.26)",
            line: "rgba(10,132,255,.10)",
            selectionStroke: "#0a84ff",
            selectionFill: "rgba(10,132,255,.08)",
        },
        node: {
            label: "#536d88",
            fill: "#eaf4ff",
            panel: "#ffffff",
            stroke: "#d7e7f7",
            activeStroke: "#0a84ff",
            placeholder: "#86a2bd",
            text: "#0b1724",
            muted: "#536d88",
            faint: "#9bb2c8",
        },
        toolbar: {
            panel: "rgba(255,255,255,.92)",
            border: "#d7e7f7",
            item: "#536d88",
            itemHover: "#eaf4ff",
            activeBg: "#e3f1ff",
            activeText: "#073b8e",
        },
    },
    dark: {
        canvas: {
            background: "#061320",
            dot: "rgba(82,181,255,.24)",
            line: "rgba(82,181,255,.10)",
            selectionStroke: "#52b5ff",
            selectionFill: "rgba(82,181,255,.12)",
        },
        node: {
            label: "#b7cce1",
            fill: "#10273d",
            panel: "#0b1724",
            stroke: "#243b53",
            activeStroke: "#52b5ff",
            placeholder: "#7f9ab5",
            text: "#eaf5ff",
            muted: "#9eb6cf",
            faint: "#617d99",
        },
        toolbar: {
            panel: "rgba(11,23,36,.92)",
            border: "#243b53",
            item: "#b7cce1",
            itemHover: "#10273d",
            activeBg: "rgba(82,181,255,.16)",
            activeText: "#e7f6ff",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];

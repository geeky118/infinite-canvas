"use client";

import type { AiConfig } from "@/stores/use-config-store";

export type ImageWorkbenchPreset = {
    prompt: string;
    context?: string;
    imageModel?: string;
    quality?: AiConfig["quality"];
    size?: AiConfig["size"];
    count?: AiConfig["count"];
};

const IMAGE_WORKBENCH_PRESET_KEY = "infinite-canvas:image_workbench_preset";

export function saveImageWorkbenchPreset(preset: ImageWorkbenchPreset) {
    if (typeof window === "undefined") return false;
    try {
        window.sessionStorage.setItem(IMAGE_WORKBENCH_PRESET_KEY, JSON.stringify(preset));
        return true;
    } catch {
        return false;
    }
}

export function readImageWorkbenchPreset() {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.sessionStorage.getItem(IMAGE_WORKBENCH_PRESET_KEY);
        window.sessionStorage.removeItem(IMAGE_WORKBENCH_PRESET_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<ImageWorkbenchPreset>;
        return typeof parsed.prompt === "string" && parsed.prompt.trim() ? parsed : null;
    } catch {
        return null;
    }
}

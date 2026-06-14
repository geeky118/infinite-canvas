"use client";

export const promptFallbackImage = "/brand/creator-hero.png";

export function promptImageUrl(url: string) {
    if (!url) return promptFallbackImage;
    if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("/")) return url;
    if (!/^https?:\/\//i.test(url)) return url;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
        return `/image-proxy?url=${encodeURIComponent(parsed.href)}`;
    } catch {
        return url;
    }
}

export function usePromptFallbackImage(event: { currentTarget: HTMLImageElement }) {
    if (event.currentTarget.dataset.fallbackApplied === "true") return;
    event.currentTarget.dataset.fallbackApplied = "true";
    event.currentTarget.src = promptFallbackImage;
}

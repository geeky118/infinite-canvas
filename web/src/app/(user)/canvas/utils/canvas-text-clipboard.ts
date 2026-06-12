"use client";

import type { ClipboardEvent, CSSProperties } from "react";

export const canvasTextSelectionStyle = {
    userSelect: "text",
    WebkitUserSelect: "text",
} satisfies CSSProperties;

export function copySelectedTextFromTextControl<T extends HTMLInputElement | HTMLTextAreaElement>(event: ClipboardEvent<T>) {
    event.stopPropagation();
    const target = event.currentTarget;
    const start = Math.min(target.selectionStart ?? 0, target.selectionEnd ?? 0);
    const end = Math.max(target.selectionStart ?? 0, target.selectionEnd ?? 0);
    const selectedText = target.value.slice(start, end);
    if (!selectedText) return;
    event.clipboardData.setData("text/plain", selectedText);
    event.preventDefault();
}

export function copySelectedTextFromContentEditable(event: ClipboardEvent<HTMLElement>, root: HTMLElement | null) {
    event.stopPropagation();
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const focus = selection?.focusNode;
    const selectedText = selection?.toString() || "";
    if (!root || !anchor || !focus || !root.contains(anchor) || !root.contains(focus) || !selectedText) return;
    event.clipboardData.setData("text/plain", selectedText);
    event.preventDefault();
}

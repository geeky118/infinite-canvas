import type { ReferenceImage } from "@/types/image";

export function imageReferenceLabel(index: number) {
    return `图片${index + 1}`;
}

export function buildImageReferencePromptText(prompt: string, references: ReferenceImage[]) {
    const text = prompt.trim();
    if (!references.length) return text;
    const labels = references.map((_, index) => imageReferenceLabel(index));
    const payload = parsePromptJson(text);
    if (payload) {
        return JSON.stringify(
            {
                ...payload,
                reference_instruction: `参考图片编号：${labels.join("、")}。请按这些编号理解提示词中的图片引用。`,
                references: labels.map((label, index) => ({ label, index: index + 1, type: "image" })),
            },
            null,
            2,
        );
    }
    return `参考图片编号：${labels.join("、")}。请按这些编号理解提示词中的图片引用。\n\n${text}`;
}

function parsePromptJson(value: string): Record<string, unknown> | null {
    try {
        const payload = JSON.parse(value.trim());
        return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

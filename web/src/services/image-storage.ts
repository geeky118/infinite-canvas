"use client";

import localforage from "localforage";

import { nanoid } from "nanoid";
import { readImageMeta } from "@/lib/image-utils";
import { uploadCanvasImage } from "@/services/api/media";

export type UploadedImage = {
    url: string;
    storageKey: string;
    remoteUrl?: string;
    remoteKey?: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const objectUrls = new Map<string, string>();
const REMOTE_IMAGE_FETCH_RETRIES = 5;
const REMOTE_IMAGE_FETCH_RETRY_DELAY_MS = 1800;

export async function uploadImage(input: string | Blob): Promise<UploadedImage> {
    const fallbackRemoteUrl = typeof input === "string" && isRemoteHttpUrl(input) ? input : "";
    const shouldUploadRemote = typeof input === "string" && isBase64ImageDataUrl(input);
    let blob: Blob;
    try {
        blob = typeof input === "string" ? await fetchImageBlob(input) : input;
    } catch (error) {
        if (fallbackRemoteUrl) return createRemoteImageFallback(fallbackRemoteUrl);
        throw error;
    }
    const storageKey = `image:${nanoid()}`;
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    const meta = await readImageMeta(url);
    const remote = shouldUploadRemote ? await uploadImageRemote(blob).catch(() => null) : null;
    return { url, storageKey, remoteUrl: remote?.url || fallbackRemoteUrl || undefined, remoteKey: remote?.key, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type || remote?.mimeType || meta.mimeType };
}

export async function createRemoteImageFallback(url: string): Promise<UploadedImage> {
    const meta = await readImageMeta(url);
    return { url, storageKey: "", remoteUrl: url, width: meta.width || 1024, height: meta.height || 1024, bytes: 0, mimeType: meta.mimeType || "image/png" };
}

export function isRemoteHttpImageUrl(url: string) {
    return isRemoteHttpUrl(url);
}

export async function resolveImageUrl(storageKey?: string, fallback = "", remoteUrl = "") {
    if (!storageKey) return remoteUrl || fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) {
        const restored = await restoreRemoteImage(storageKey, remoteUrl || fallback);
        if (restored) return restored;
        return remoteUrl || fallback;
    }
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getImageBlob(storageKey: string) {
    return store.getItem<Blob>(storageKey);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string; remoteUrl?: string }) {
    const url = image.storageKey ? await resolveImageUrl(image.storageKey, image.dataUrl || image.url || "", image.remoteUrl || "") : image.dataUrl || image.remoteUrl || image.url || "";
    if (!url || url.startsWith("data:")) return url;
    return blobToDataUrl(await fetchImageBlob(url));
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await deleteStoredImages(unused);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
    });
}

async function fetchImageBlob(url: string) {
    const src = proxiedImageUrl(url);
    const retries = shouldRetryImageFetch(url, src) ? REMOTE_IMAGE_FETCH_RETRIES : 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            const response = await fetch(src, { cache: "no-store" });
            if (!response.ok) throw new Error(`图片读取失败：${response.status}`);
            const blob = await response.blob();
            if (!blob.size) throw new Error("图片读取失败：空文件");
            return blob;
        } catch (error) {
            lastError = error;
            if (attempt === retries) break;
            await delay(REMOTE_IMAGE_FETCH_RETRY_DELAY_MS * attempt);
        }
    }
    const reason = lastError instanceof Error ? lastError.message : "图片读取失败";
    throw new Error(isRemoteHttpUrl(url) ? `图片生成已完成，但读取结果图片失败：${reason}` : reason);
}

function proxiedImageUrl(url: string) {
    if (typeof window === "undefined") return url;
    if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("/")) return url;
    try {
        const parsed = new URL(url, window.location.href);
        if (parsed.origin === window.location.origin) return parsed.href;
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
        return `/image-proxy?url=${encodeURIComponent(parsed.href)}`;
    } catch {
        return url;
    }
}

function shouldRetryImageFetch(originalUrl: string, fetchUrl: string) {
    return isRemoteHttpUrl(originalUrl) || fetchUrl.startsWith("/image-proxy?");
}

function isRemoteHttpUrl(url: string) {
    try {
        const parsed = new URL(url, typeof window === "undefined" ? "http://localhost" : window.location.href);
        return (parsed.protocol === "http:" || parsed.protocol === "https:") && (typeof window === "undefined" || parsed.origin !== window.location.origin);
    } catch {
        return false;
    }
}

function isBase64ImageDataUrl(url: string) {
    return /^data:image\/[^;]+;base64,/i.test(url);
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadImageRemote(blob: Blob) {
    if (!blob.size) return null;
    return uploadCanvasImage(blob, `image-${Date.now()}.${imageExtension(blob.type)}`);
}

async function restoreRemoteImage(storageKey: string, url: string) {
    if (!url || !isRemoteHttpUrl(url)) return "";
    try {
        const blob = await fetchImageBlob(url);
        await store.setItem(storageKey, blob);
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.set(storageKey, objectUrl);
        return objectUrl;
    } catch {
        return "";
    }
}

function imageExtension(mimeType: string) {
    return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/bmp": "bmp", "image/heic": "heic", "image/heif": "heif" } as Record<string, string>)[mimeType] || "png";
}

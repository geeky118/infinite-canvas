import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const IMAGE_PROXY_TIMEOUT_MS = 120000;
const IMAGE_PROXY_MAX_BYTES = 25 * 1024 * 1024;

export async function GET(request: NextRequest) {
    const target = request.nextUrl.searchParams.get("url") || "";
    if (!target) return new Response("Missing url", { status: 400 });

    let url: URL;
    try {
        url = new URL(target);
    } catch {
        return new Response("Invalid url", { status: 400 });
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") return new Response("Unsupported image url", { status: 400 });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_PROXY_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            headers: {
                Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
            },
            redirect: "follow",
            signal: controller.signal,
        });
        if (!response.ok || !response.body) return new Response("Image fetch failed", { status: response.status || 502 });

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().startsWith("image/")) return new Response("Target is not an image", { status: 400 });

        const contentLength = Number(response.headers.get("content-length") || 0);
        if (contentLength > IMAGE_PROXY_MAX_BYTES) return new Response("Image is too large", { status: 413 });

        return new Response(response.body, {
            status: 200,
            headers: responseHeaders(contentType, response.headers.get("content-length")),
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return new Response("Image proxy timeout", { status: 504 });
        return new Response(error instanceof Error ? error.message : "Image proxy error", { status: 502 });
    } finally {
        clearTimeout(timer);
    }
}

function responseHeaders(contentType: string, contentLength?: string | null) {
    const result = new Headers();
    result.set("content-type", contentType);
    result.set("cache-control", "public, max-age=86400, immutable");
    if (contentLength) result.set("content-length", contentLength);
    return result;
}

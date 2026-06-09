import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL_PROXY_TIMEOUT_MS = 30000;

type ModelProxyRequest = {
    url?: string;
    apiKey?: string;
};

export async function POST(request: NextRequest) {
    let payload: ModelProxyRequest;
    try {
        payload = (await request.json()) as ModelProxyRequest;
    } catch {
        return Response.json({ error: { message: "Invalid request body" } }, { status: 400 });
    }

    const target = (payload.url || "").trim();
    const apiKey = (payload.apiKey || "").trim();
    if (!target) return Response.json({ error: { message: "Missing models url" } }, { status: 400 });
    if (!apiKey) return Response.json({ error: { message: "Missing API key" } }, { status: 400 });

    let url: URL;
    try {
        url = new URL(target);
    } catch {
        return Response.json({ error: { message: "Invalid models url" } }, { status: 400 });
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        return Response.json({ error: { message: "Unsupported models url" } }, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_PROXY_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            redirect: "follow",
            signal: controller.signal,
        });
        const text = await response.text();
        return new Response(text, {
            status: response.status,
            headers: responseHeaders(response.headers),
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            return Response.json({ error: { message: "Model proxy timeout" } }, { status: 504 });
        }
        return Response.json({ error: { message: error instanceof Error ? error.message : "Model proxy error" } }, { status: 502 });
    } finally {
        clearTimeout(timer);
    }
}

function responseHeaders(headers: Headers) {
    const result = new Headers();
    result.set("content-type", headers.get("content-type") || "application/json");
    result.set("cache-control", "no-store");
    return result;
}

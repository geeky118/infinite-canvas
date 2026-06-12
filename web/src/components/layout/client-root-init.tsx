"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { App } from "antd";

import { useCanvasStore, type CanvasProject } from "@/app/(user)/canvas/stores/use-canvas-store";
import { fetchUserData, saveUserData } from "@/services/api/user-data";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { normalizeLocalChannel, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type CloudCanvasPayload = {
    projects: CanvasProject[];
};

type CloudConfigPayload = {
    config: Partial<AiConfig>;
};

type CloudAssetsPayload = {
    assets: Asset[];
};

type CloudSaveTask = {
    timer: ReturnType<typeof setTimeout> | null;
    inFlight: boolean;
    pending: boolean;
    lastPayload: string;
};

const CLOUD_CANVAS_SAVE_DELAY_MS = 2000;
const CLOUD_CONFIG_SAVE_DELAY_MS = 1500;
const CLOUD_ASSETS_SAVE_DELAY_MS = 3000;

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const handledConfigParams = useRef(false);
    const cloudSyncReady = useRef({ canvas: false, config: false, assets: false });
    const pathname = usePathname();
    const token = useUserStore((state) => state.token);
    const userId = useUserStore((state) => state.user?.id || "");
    const hydrateUser = useUserStore((state) => state.hydrateUser);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const replaceConfig = useConfigStore((state) => state.replaceConfig);
    const replaceProjects = useCanvasStore((state) => state.replaceProjects);
    const setCanvasCloudHydrated = useCanvasStore((state) => state.setCloudHydrated);
    const replaceAssets = useAssetStore((state) => state.replaceAssets);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isLoginPage = pathname === "/login" || pathname === "/admin/login";

    useEffect(() => {
        void loadPublicSettings();
    }, [loadPublicSettings]);

    useEffect(() => {
        if (!isLoginPage) void hydrateUser();
    }, [hydrateUser, isLoginPage]);

    useEffect(() => {
        let cancelled = false;
        cloudSyncReady.current = { canvas: false, config: false, assets: false };
        setCanvasCloudHydrated(!token);
        if (!token || !userId) return;

        async function loadCloudData() {
            const [canvasResult, configResult, assetsResult] = await Promise.allSettled([fetchUserData<CloudCanvasPayload>(token, "canvas"), fetchUserData<CloudConfigPayload>(token, "ai-config"), fetchUserData<CloudAssetsPayload>(token, "assets")]);
            if (cancelled) return;

            if (canvasResult.status === "fulfilled" && Array.isArray(canvasResult.value.payload?.projects)) {
                replaceProjects(canvasResult.value.payload.projects);
            } else if (canvasResult.status === "fulfilled") {
                void saveUserData(token, "canvas", { projects: useCanvasStore.getState().projects });
            }
            cloudSyncReady.current.canvas = canvasResult.status === "fulfilled";
            setCanvasCloudHydrated(true);

            if (configResult.status === "fulfilled" && configResult.value.payload?.config) {
                replaceConfig(configResult.value.payload.config);
            } else if (configResult.status === "fulfilled") {
                const currentConfig = useConfigStore.getState().config;
                const initialConfig = { ...currentConfig, channelMode: "remote" as const };
                replaceConfig(initialConfig);
                void saveUserData(token, "ai-config", { config: initialConfig });
            }
            cloudSyncReady.current.config = configResult.status === "fulfilled";

            if (assetsResult.status === "fulfilled" && Array.isArray(assetsResult.value.payload?.assets)) {
                replaceAssets(assetsResult.value.payload.assets);
            } else if (assetsResult.status === "fulfilled") {
                void saveUserData(token, "assets", { assets: useAssetStore.getState().assets });
            }
            cloudSyncReady.current.assets = assetsResult.status === "fulfilled";
        }

        void loadCloudData();
        return () => {
            cancelled = true;
            cloudSyncReady.current = { canvas: false, config: false, assets: false };
            setCanvasCloudHydrated(false);
        };
    }, [replaceAssets, replaceConfig, replaceProjects, setCanvasCloudHydrated, token, userId]);

    useEffect(() => {
        if (!token || !userId) return;
        const canvasTask = createCloudSaveTask();
        const configTask = createCloudSaveTask();
        const assetsTask = createCloudSaveTask();
        const unsubscribeCanvas = useCanvasStore.subscribe((state, previous) => {
            if (!cloudSyncReady.current.canvas || state.projects === previous.projects) return;
            scheduleCloudSave(canvasTask, CLOUD_CANVAS_SAVE_DELAY_MS, () => ({ projects: useCanvasStore.getState().projects }), (payload) => saveUserData(token, "canvas", payload));
        });
        const unsubscribeConfig = useConfigStore.subscribe((state, previous) => {
            if (!cloudSyncReady.current.config || state.config === previous.config) return;
            scheduleCloudSave(configTask, CLOUD_CONFIG_SAVE_DELAY_MS, () => ({ config: useConfigStore.getState().config }), (payload) => saveUserData(token, "ai-config", payload));
        });
        const unsubscribeAssets = useAssetStore.subscribe((state, previous) => {
            if (!cloudSyncReady.current.assets || state.assets === previous.assets) return;
            scheduleCloudSave(assetsTask, CLOUD_ASSETS_SAVE_DELAY_MS, () => ({ assets: useAssetStore.getState().assets }), (payload) => saveUserData(token, "assets", payload));
        });
        const flushPendingSaves = () => {
            void flushCloudSaveNow(canvasTask, CLOUD_CANVAS_SAVE_DELAY_MS, () => ({ projects: useCanvasStore.getState().projects }), (payload) => saveUserData(token, "canvas", payload));
            void flushCloudSaveNow(configTask, CLOUD_CONFIG_SAVE_DELAY_MS, () => ({ config: useConfigStore.getState().config }), (payload) => saveUserData(token, "ai-config", payload));
            void flushCloudSaveNow(assetsTask, CLOUD_ASSETS_SAVE_DELAY_MS, () => ({ assets: useAssetStore.getState().assets }), (payload) => saveUserData(token, "assets", payload));
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") flushPendingSaves();
        };
        window.addEventListener("pagehide", flushPendingSaves);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            flushPendingSaves();
            window.removeEventListener("pagehide", flushPendingSaves);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            unsubscribeCanvas();
            unsubscribeConfig();
            unsubscribeAssets();
            clearCloudSaveTask(canvasTask);
            clearCloudSaveTask(configTask);
            clearCloudSaveTask(assetsTask);
        };
    }, [token, userId]);

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const baseUrl = searchParams.get("baseUrl") || searchParams.get("baseurl");
        const apiKey = searchParams.get("apiKey") || searchParams.get("apikey");
        if (!baseUrl && !apiKey) return;
        if (!publicSettings) return;
        handledConfigParams.current = true;
        searchParams.delete("baseUrl");
        searchParams.delete("baseurl");
        searchParams.delete("apiKey");
        searchParams.delete("apikey");
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
        if (!publicSettings.modelChannel.allowCustomChannel) {
            openConfigDialog(false);
            message.error("后台未允许用户自定义渠道，请联系管理员进行配置");
            return;
        }
        updateConfig("channelMode", "local");
        if (baseUrl) updateConfig("baseUrl", baseUrl);
        if (apiKey) updateConfig("apiKey", apiKey);
        updateConfig(
            "localChannels",
            [
                normalizeLocalChannel({
                    ...(config.localChannels[0] || {}),
                    id: config.localChannels[0]?.id || "openai",
                    name: config.localChannels[0]?.name || "OpenAI",
                    baseUrl: baseUrl || config.localChannels[0]?.baseUrl || config.baseUrl,
                    apiKey: apiKey || config.localChannels[0]?.apiKey || config.apiKey,
                }),
                ...config.localChannels.slice(1),
            ],
        );
        openConfigDialog(false);
    }, [config, message, openConfigDialog, publicSettings, updateConfig]);

    return <>{children}</>;
}

function createCloudSaveTask(): CloudSaveTask {
    return { timer: null, inFlight: false, pending: false, lastPayload: "" };
}

function clearCloudSaveTask(task: CloudSaveTask) {
    if (task.timer) clearTimeout(task.timer);
    task.timer = null;
    task.pending = false;
}

function scheduleCloudSave<T>(task: CloudSaveTask, delay: number, readPayload: () => T, save: (payload: T) => Promise<unknown>) {
    task.pending = true;
    if (task.timer) clearTimeout(task.timer);
    task.timer = setTimeout(() => {
        task.timer = null;
        void flushCloudSave(task, delay, readPayload, save);
    }, delay);
}

async function flushCloudSaveNow<T>(task: CloudSaveTask, delay: number, readPayload: () => T, save: (payload: T) => Promise<unknown>) {
    if (!task.pending) return;
    if (task.timer) clearTimeout(task.timer);
    task.timer = null;
    await flushCloudSave(task, delay, readPayload, save);
}

async function flushCloudSave<T>(task: CloudSaveTask, delay: number, readPayload: () => T, save: (payload: T) => Promise<unknown>) {
    if (task.inFlight) return;
    task.pending = false;
    const payload = readPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === task.lastPayload) return;
    task.inFlight = true;
    try {
        await save(payload);
        task.lastPayload = serialized;
    } catch {
        task.pending = true;
    } finally {
        task.inFlight = false;
    }
    if (task.pending) scheduleCloudSave(task, delay, readPayload, save);
}

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

            if (configResult.status === "fulfilled" && configResult.value.payload?.config) {
                replaceConfig(configResult.value.payload.config);
            } else if (configResult.status === "fulfilled") {
                void saveUserData(token, "ai-config", { config: useConfigStore.getState().config });
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
        };
    }, [replaceAssets, replaceConfig, replaceProjects, token, userId]);

    useEffect(() => {
        if (!token || !userId) return;
        let canvasTimer: ReturnType<typeof setTimeout> | null = null;
        let configTimer: ReturnType<typeof setTimeout> | null = null;
        let assetsTimer: ReturnType<typeof setTimeout> | null = null;
        const unsubscribeCanvas = useCanvasStore.subscribe((state, previous) => {
            if (!cloudSyncReady.current.canvas || state.projects === previous.projects) return;
            if (canvasTimer) clearTimeout(canvasTimer);
            canvasTimer = setTimeout(() => {
                void saveUserData(token, "canvas", { projects: useCanvasStore.getState().projects });
            }, 800);
        });
        const unsubscribeConfig = useConfigStore.subscribe((state, previous) => {
            if (!cloudSyncReady.current.config || state.config === previous.config) return;
            if (configTimer) clearTimeout(configTimer);
            configTimer = setTimeout(() => {
                void saveUserData(token, "ai-config", { config: useConfigStore.getState().config });
            }, 800);
        });
        const unsubscribeAssets = useAssetStore.subscribe((state, previous) => {
            if (!cloudSyncReady.current.assets || state.assets === previous.assets) return;
            if (assetsTimer) clearTimeout(assetsTimer);
            assetsTimer = setTimeout(() => {
                void saveUserData(token, "assets", { assets: useAssetStore.getState().assets });
            }, 800);
        });
        return () => {
            unsubscribeCanvas();
            unsubscribeConfig();
            unsubscribeAssets();
            if (canvasTimer) clearTimeout(canvasTimer);
            if (configTimer) clearTimeout(configTimer);
            if (assetsTimer) clearTimeout(assetsTimer);
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

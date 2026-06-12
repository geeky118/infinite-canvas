"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { apiGet } from "@/services/api/request";
import type { AdminPublicSettings } from "@/services/api/admin";

export type AiLocalChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    localChannels: AiLocalChannel[];
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    systemPrompt: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    quality: string;
    size: string;
    count: string;
    canvasImageCount: string;
};

export type WebdavSyncConfig = {
    proxyMode: "direct" | "nextjs";
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
export type ModelCapability = "image" | "video" | "text" | "audio";

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: "https://api.openai.com",
    apiKey: "",
    localChannels: readDefaultLocalChannels(),
    model: "gpt-image-2",
    imageModel: "gpt-image-2",
    videoModel: "grok-imagine-video",
    textModel: "gpt-5.5",
    audioModel: "gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    models: [],
    imageModels: [],
    videoModels: [],
    textModels: [],
    audioModels: [],
    quality: "auto",
    size: "1:1",
    count: "1",
    canvasImageCount: "3",
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    proxyMode: "direct",
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    publicSettings: AdminPublicSettings | null;
    isPublicSettingsLoading: boolean;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    replaceConfig: (config: Partial<AiConfig>) => void;
    loadPublicSettings: () => Promise<void>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

function resolveEffectiveConfig(config: AiConfig, modelChannel: AdminPublicSettings["modelChannel"] | null) {
    const channelMode = modelChannel?.allowCustomChannel ? config.channelMode : "remote";
    if (channelMode === "local" || !modelChannel) return resolveLocalEffectiveConfig({ ...config, channelMode });
    const models = modelChannel.availableModels;
    const textModels = filterModelsByCapability(models, "text");
    const imageModels = filterModelsByCapability(models, "image");
    const videoModels = filterModelsByCapability(models, "video");
    const audioModels = filterModelsByCapability(models, "audio");
    const fallbackTextModel = validDefault(modelChannel.defaultTextModel, textModels) || preferredModel(textModels, isTextModelName);
    const fallbackModel = validDefault(modelChannel.defaultModel, textModels) || fallbackTextModel;
    const fallbackImageModel = validDefault(modelChannel.defaultImageModel, imageModels) || preferredModel(imageModels, isImageModelName);
    const fallbackVideoModel = validDefault(modelChannel.defaultVideoModel, videoModels) || preferredModel(videoModels, isVideoModelName);
    const fallbackAudioModel = preferredModel(audioModels, isAudioModelName);
    return {
        ...config,
        channelMode,
        models,
        imageModels,
        videoModels,
        textModels,
        audioModels,
        model: textModels.includes(config.model) ? config.model : fallbackModel,
        imageModel: imageModels.includes(config.imageModel) ? config.imageModel : fallbackImageModel,
        videoModel: videoModels.includes(config.videoModel) ? config.videoModel : fallbackVideoModel,
        textModel: textModels.includes(config.textModel) ? config.textModel : fallbackTextModel || fallbackModel,
        audioModel: audioModels.includes(config.audioModel) ? config.audioModel : fallbackAudioModel,
        systemPrompt: modelChannel.systemPrompt,
    };
}

function validDefault(model: string, models: string[]) {
    return models.includes(model) ? model : "";
}

function preferredModel(models: string[], predicate: (model: string) => boolean) {
    return models.find(predicate) || "";
}

function isVideoModelName(model: string) {
    const value = model.toLowerCase();
    return value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("wan") || value.includes("hailuo");
}

function isImageModelName(model: string) {
    const value = model.toLowerCase();
    return !isVideoModelName(model) && !isAudioModelName(model) && (value.includes("grok-imagine") || value.includes("seedream") || value.includes("gpt-image") || value.includes("image") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("flux") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney"));
}

function isAudioModelName(model: string) {
    const value = model.toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function isTextModelName(model: string) {
    return !isImageModelName(model) && !isVideoModelName(model) && !isAudioModelName(model);
}

export function modelMatchesCapability(model: string, capability?: ModelCapability) {
    if (!capability) return true;
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return isTextModelName(model);
}

export function filterModelsByCapability(models: string[], capability?: ModelCapability) {
    return capability ? models.filter((model) => modelMatchesCapability(model, capability)) : models;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (config.channelMode === "local" && config.localChannels.length) {
        return Array.from(new Set(config.localChannels.flatMap((channel) => (capability ? channel[modelListKey(capability)] : channel.models)).filter(Boolean)));
    }
    if (!capability) return config.models;
    return config[modelListKey(capability)];
}

function resolveLocalEffectiveConfig(config: AiConfig) {
    const localChannels = normalizeLocalChannels(config);
    const models = Array.from(new Set(localChannels.flatMap((channel) => channel.models)));
    const imageModels = Array.from(new Set(localChannels.flatMap((channel) => channel.imageModels)));
    const videoModels = Array.from(new Set(localChannels.flatMap((channel) => channel.videoModels)));
    const textModels = Array.from(new Set(localChannels.flatMap((channel) => channel.textModels)));
    const audioModels = Array.from(new Set(localChannels.flatMap((channel) => channel.audioModels)));
    return {
        ...config,
        localChannels,
        models,
        imageModels,
        videoModels,
        textModels,
        audioModels,
        model: textModels.includes(config.model) ? config.model : config.model,
        imageModel: imageModels.includes(config.imageModel) ? config.imageModel : imageModels[0] || config.imageModel,
        videoModel: videoModels.includes(config.videoModel) ? config.videoModel : videoModels[0] || config.videoModel,
        textModel: textModels.includes(config.textModel) ? config.textModel : textModels[0] || config.textModel,
        audioModel: audioModels.includes(config.audioModel) ? config.audioModel : audioModels[0] || config.audioModel,
    };
}

export function selectableModelOptionsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (config.channelMode !== "local" || !config.localChannels.length) {
        return selectableModelsByCapability(config, capability).map((model) => ({ value: model, label: model }));
    }
    const seen = new Map<string, number>();
    for (const channel of config.localChannels) {
        const models = capability ? channel[modelListKey(capability)] : channel.models;
        for (const model of models) seen.set(model, (seen.get(model) || 0) + 1);
    }
    const emitted = new Set<string>();
    return config.localChannels.flatMap((channel) => {
        const models = capability ? channel[modelListKey(capability)] : channel.models;
        return models.flatMap((model) => {
            if (emitted.has(model)) return [];
            emitted.add(model);
            return [
                {
                    value: model,
                    label: seen.get(model)! > 1 ? `${model} · ${channel.name || "未命名渠道"}（优先）` : model,
                },
            ];
        });
    });
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function isAiConfigReady(config: AiConfig, model: string) {
    if (!model.trim()) return false;
    if (config.channelMode === "remote") return true;
    const requestConfig = resolveRequestConfig(config, model);
    return Boolean(requestConfig.baseUrl.trim() && requestConfig.apiKey.trim());
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            publicSettings: null,
            isPublicSettingsLoading: false,
            isConfigOpen: false,
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            replaceConfig: (config) => set({ config: normalizeConfig(config) }),
            loadPublicSettings: async () => {
                if (get().isPublicSettingsLoading) return;
                set({ isPublicSettingsLoading: true });
                try {
                    set({ publicSettings: await apiGet<AdminPublicSettings>("/api/settings") });
                } finally {
                    set({ isPublicSettingsLoading: false });
                }
            },
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false) => set({ isConfigOpen: true, shouldPromptContinue }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: normalizeConfig(persistedConfig),
                };
            },
        },
    ),
);

function normalizeConfig(source: Partial<AiConfig>) {
    const config = { ...defaultConfig, ...source };
    const localChannels = normalizeLocalChannels(config);
    return {
        ...config,
        channelMode: config.channelMode || "remote",
        localChannels,
        imageModel: config.imageModel || config.model,
        videoModel: config.videoModel || "grok-imagine-video",
        textModel: config.textModel || config.model,
        audioModel: config.audioModel || defaultConfig.audioModel,
        audioVoice: config.audioVoice || defaultConfig.audioVoice,
        audioFormat: config.audioFormat || defaultConfig.audioFormat,
        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: config.audioInstructions || "",
        videoSeconds: config.videoSeconds || "6",
        vquality: config.vquality || "720",
        videoGenerateAudio: config.videoGenerateAudio || "true",
        videoWatermark: config.videoWatermark || "false",
        canvasImageCount: config.canvasImageCount || "3",
        imageModels: Array.isArray(source.imageModels) ? normalizeModelList(config.imageModels) : filterModelsByCapability(config.models, "image"),
        videoModels: Array.isArray(source.videoModels) ? normalizeModelList(config.videoModels) : filterModelsByCapability(config.models, "video"),
        textModels: Array.isArray(source.textModels) ? normalizeModelList(config.textModels) : filterModelsByCapability(config.models, "text"),
        audioModels: Array.isArray(source.audioModels) ? normalizeModelList(config.audioModels) : filterModelsByCapability(config.models, "audio"),
    };
}

function normalizeModelList(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    const modelChannel = useConfigStore((state) => state.publicSettings?.modelChannel || null);
    return useMemo(() => resolveEffectiveConfig(config, modelChannel), [config, modelChannel]);
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

export function resolveRequestConfig(config: AiConfig, model?: string): AiConfig {
    if (config.channelMode === "remote") return model ? { ...config, model } : config;
    const selectedModel = (model || config.model).trim();
    const channels = normalizeLocalChannels(config).filter((channel) => channel.baseUrl.trim() && channel.apiKey.trim());
    const channel = channels.find((item) => channelHasModel(item, selectedModel)) || channels[0];
    if (!channel) return model ? { ...config, model } : config;
    return {
        ...config,
        model: selectedModel || config.model,
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
    };
}

export function normalizeLocalChannels(config: Partial<AiConfig>) {
    const channels = Array.isArray(config.localChannels) ? config.localChannels : [];
    const normalized = channels.map(normalizeLocalChannel).filter((channel) => channel.baseUrl || channel.apiKey || channel.models.length);
    const legacyBaseUrl = (config.baseUrl || "").trim();
    const legacyApiKey = (config.apiKey || "").trim();
    if (legacyBaseUrl || legacyApiKey) {
        const hasLegacy = normalized.some((channel) => channel.baseUrl === legacyBaseUrl && channel.apiKey === legacyApiKey);
        if (!hasLegacy) {
            normalized.unshift(
                normalizeLocalChannel({
                    id: "openai",
                    name: "OpenAI",
                    baseUrl: legacyBaseUrl || defaultConfig.baseUrl,
                    apiKey: legacyApiKey,
                    models: config.models || [],
                    imageModels: config.imageModels || [],
                    videoModels: config.videoModels || [],
                    textModels: config.textModels || [],
                    audioModels: config.audioModels || [],
                }),
            );
        }
    }
    for (const channel of readDefaultLocalChannels()) {
        if (!normalized.some((item) => item.id === channel.id || (item.baseUrl === channel.baseUrl && item.apiKey === channel.apiKey))) normalized.push(channel);
    }
    return normalized.length ? normalized : [normalizeLocalChannel({ id: "openai", name: "OpenAI", baseUrl: defaultConfig.baseUrl, apiKey: "", models: [], imageModels: [], videoModels: [], textModels: [], audioModels: [] })];
}

export function normalizeLocalChannel(channel: Partial<AiLocalChannel>): AiLocalChannel {
    const models = normalizeModelList(channel.models || []);
    const imageModels = normalizeModelList(channel.imageModels || []);
    const videoModels = normalizeModelList(channel.videoModels || []);
    const textModels = normalizeModelList(channel.textModels || []);
    const audioModels = normalizeModelList(channel.audioModels || []);
    return {
        id: channel.id || `channel-${Math.random().toString(36).slice(2, 10)}`,
        name: (channel.name || "本地渠道").trim(),
        baseUrl: (channel.baseUrl || "").trim(),
        apiKey: (channel.apiKey || "").trim(),
        models,
        imageModels: imageModels.length ? imageModels : filterModelsByCapability(models, "image"),
        videoModels: videoModels.length ? videoModels : filterModelsByCapability(models, "video"),
        textModels: textModels.length ? textModels : filterModelsByCapability(models, "text"),
        audioModels: audioModels.length ? audioModels : filterModelsByCapability(models, "audio"),
    };
}

function channelHasModel(channel: AiLocalChannel, model: string) {
    if (!model) return true;
    const aliases = modelAliases(model);
    return [channel.models, channel.imageModels, channel.videoModels, channel.textModels, channel.audioModels].some((models) => aliases.some((alias) => models.includes(alias)));
}

function modelAliases(model: string) {
    if (model === "grok-imagine-video" || model === "grok-imagine-1.0-video") {
        return ["grok-imagine-video", "grok-imagine-1.0-video"];
    }
    if (model === "grok-imagine-1.0" || model === "grok-imagine-1.0-fast" || model === "grok-imagine-1.0-edit") {
        return ["grok-imagine-1.0", "grok-imagine-1.0-fast", "grok-imagine-1.0-edit"];
    }
    return [model];
}

function readDefaultLocalChannels() {
    const raw = process.env.NEXT_PUBLIC_DEFAULT_LOCAL_CHANNELS || "";
    if (!raw) return [];
    try {
        const items = JSON.parse(raw) as Partial<AiLocalChannel>[];
        return Array.isArray(items) ? items.map(normalizeLocalChannel) : [];
    } catch {
        return [];
    }
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}

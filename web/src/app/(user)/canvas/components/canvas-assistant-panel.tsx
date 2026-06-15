"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, ArrowUp, History, LoaderCircle, MessageSquare, PanelRightClose, Plus, RotateCcw, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { Button, Modal, Tooltip } from "antd";
import { motion } from "motion/react";

import { ImageGenerationPending } from "@/components/image-generation-pending";
import { ModelPicker } from "@/components/model-picker";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { generationScheduler } from "@/lib/generation-scheduler";
import { nanoid } from "nanoid";
import { cn } from "@/lib/utils";
import { requestEdit, requestGeneration, requestImageQuestion, type ChatCompletionMessage } from "@/services/api/image";
import { imageToDataUrl, isRemoteHttpImageUrl, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import type { ReferenceImage } from "@/types/image";
import { DiaTextReveal } from "@/components/ui/dia-text-reveal";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasNodeType, type CanvasAssistantImage, type CanvasAssistantImageSlot, type CanvasAssistantMemory, type CanvasAssistantMessage, type CanvasAssistantReference, type CanvasAssistantSession, type CanvasNodeData } from "../types";
import { canvasTextSelectionStyle, copySelectedTextFromTextControl } from "../utils/canvas-text-clipboard";

type AssistantMode = "ask" | "image";
type AssistantIntentKind = "chat" | "image_analysis" | "image_generation" | "image_edit" | "image_split";
type AssistantIntent = {
    kind: AssistantIntentKind;
    mode: AssistantMode;
    useReferences: boolean;
    confidence: number;
    reason?: string;
};
const PANEL_MOTION_MS = 500;
const PANEL_MOTION_SECONDS = PANEL_MOTION_MS / 1000;
const CHAT_RECENT_MESSAGE_LIMIT = 12;
const SESSION_SYNC_DELAY_MS = 350;

type CanvasAssistantPanelProps = {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    sessions: CanvasAssistantSession[];
    activeSessionId: string | null;
    effectiveConfig: AiConfig;
    onSelectNodeIds: (ids: Set<string>) => void;
    onSessionsChange: (sessions: CanvasAssistantSession[], activeSessionId: string | null) => void;
    onInsertImage: (image: CanvasAssistantImage) => Promise<CanvasAssistantImage>;
    onInsertImages: (images: CanvasAssistantImage[]) => Promise<CanvasAssistantImage[]>;
    onPrepareImages: (slots: CanvasAssistantImageSlot[]) => CanvasAssistantImage[];
    onCompleteImages: (images: CanvasAssistantImage[], options?: { failedIds?: string[]; errorDetails?: string }) => Promise<CanvasAssistantImage[]>;
    onInsertText: (text: string) => void;
    onPasteImage: (file: File) => void;
    onCollapseStart: () => void;
    onCollapse: () => void;
};

export function CanvasAssistantPanel({ nodes, selectedNodeIds, sessions, activeSessionId, effectiveConfig, onSelectNodeIds, onSessionsChange, onInsertImage, onInsertImages, onPrepareImages, onCompleteImages, onInsertText, onPasteImage, onCollapseStart, onCollapse }: CanvasAssistantPanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const cleanupImages = useAssetStore((state) => state.cleanupImages);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const userRole = useUserStore((state) => state.user?.role);
    const isAdmin = userRole === "admin";
    const maxConcurrentRequests = useConfigStore((state) => state.publicSettings?.modelChannel.maxConcurrentRequests) || 3;
    const [width, setWidth] = useState(340);
    const [view, setView] = useState<"chat" | "active" | "archived">("chat");
    const [prompt, setPrompt] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [checkedChatIds, setCheckedChatIds] = useState<string[]>([]);
    const [deleteChatIds, setDeleteChatIds] = useState<string[]>([]);
    const [closing, setClosing] = useState(false);
    const [resizing, setResizing] = useState(false);
    const [removedReferenceIds, setRemovedReferenceIds] = useState<Set<string>>(new Set());
    const [localSessions, setLocalSessions] = useState<CanvasAssistantSession[]>(() => (sessions.length ? sessions : [createSession()]));
    const [localActiveSessionId, setLocalActiveSessionId] = useState<string | null>(activeSessionId);
    const lastSyncedSignatureRef = useRef("");

    useEffect(() => {
        if (!sessions.length) return;
        const signature = assistantSessionsSignature(sessions, activeSessionId);
        if (signature === lastSyncedSignatureRef.current) return;
        lastSyncedSignatureRef.current = signature;
        const visibleSession = sessions.find((session) => !session.archivedAt);
        setLocalSessions(sessions);
        setLocalActiveSessionId(activeSessionId && sessions.some((session) => session.id === activeSessionId && !session.archivedAt) ? activeSessionId : visibleSession?.id || sessions[0]?.id || null);
    }, [activeSessionId, sessions]);

    useEffect(() => {
        const signature = assistantSessionsSignature(localSessions, localActiveSessionId);
        if (signature === lastSyncedSignatureRef.current) return;
        const timer = window.setTimeout(() => {
            lastSyncedSignatureRef.current = signature;
            onSessionsChange(localSessions, localActiveSessionId);
        }, SESSION_SYNC_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [localActiveSessionId, localSessions, onSessionsChange]);

    const safeSessions = useMemo(() => (localSessions.length ? localSessions : [createSession()]), [localSessions]);
    const activeSessions = useMemo(() => safeSessions.filter((session) => !session.archivedAt), [safeSessions]);
    const archivedSessions = useMemo(() => safeSessions.filter((session) => session.archivedAt && session.messages.length > 0), [safeSessions]);
    const activeSession = useMemo(() => activeSessions.find((session) => session.id === localActiveSessionId) || activeSessions[0] || null, [activeSessions, localActiveSessionId]);
    const historySessions = activeSessions.filter((session) => session.messages.length > 0);
    const messages = activeSession?.messages || [];
    const selectedNodeKey = useMemo(() => Array.from(selectedNodeIds).sort().join(","), [selectedNodeIds]);
    const allSelectedReferences = useMemo(() => buildAssistantReferences(nodes, selectedNodeIds), [nodes, selectedNodeIds]);
    const selectedReferences = useMemo(() => allSelectedReferences.filter((item) => !removedReferenceIds.has(item.id)), [allSelectedReferences, removedReferenceIds]);
    const assistantConfig = useMemo(() => ({ ...effectiveConfig, count: effectiveConfig.canvasImageCount || effectiveConfig.count }), [effectiveConfig]);
    const iconButtonStyle = { color: theme.node.muted };

    useEffect(() => {
        setRemovedReferenceIds(new Set());
    }, [selectedNodeKey]);

    const updateSession = (sessionId: string, updater: (session: CanvasAssistantSession) => CanvasAssistantSession) => {
        setLocalSessions((prev) => prev.map((session) => (session.id === sessionId ? updater(session) : session)));
    };

    const appendMessage = (sessionId: string, message: CanvasAssistantMessage) => {
        updateSession(sessionId, (session) => ({
            ...session,
            title: session.messages.length ? session.title : message.text.slice(0, 18) || "新对话",
            messages: [...session.messages, message],
            updatedAt: new Date().toISOString(),
        }));
    };

    const updateMessage = (sessionId: string, messageId: string, patch: Partial<CanvasAssistantMessage>) => {
        updateSession(sessionId, (session) => ({
            ...session,
            messages: session.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
            updatedAt: new Date().toISOString(),
        }));
    };

    const startChatSession = () => {
        if (activeSession && activeSession.messages.length === 0) {
            setLocalActiveSessionId(activeSession.id);
            return;
        }
        const session = createSession();
        setLocalSessions((prev) => [session, ...prev]);
        setLocalActiveSessionId(session.id);
    };

    const archiveSessions = (ids: string[]) => {
        const now = new Date().toISOString();
        setLocalSessions((prev) => {
            const archived = prev.map((session) => (ids.includes(session.id) ? { ...session, archivedAt: now, updatedAt: now } : session));
            const visible = archived.filter((session) => !session.archivedAt);
            if (localActiveSessionId && ids.includes(localActiveSessionId)) {
                if (visible.length) setLocalActiveSessionId(visible[0].id);
                else {
                    const session = createSession();
                    setLocalActiveSessionId(session.id);
                    return [session, ...archived];
                }
            }
            return archived;
        });
        setCheckedChatIds((prev) => prev.filter((id) => !ids.includes(id)));
    };

    const restoreSessions = (ids: string[]) => {
        const now = new Date().toISOString();
        setLocalSessions((prev) => prev.map((session) => (ids.includes(session.id) ? { ...session, archivedAt: undefined, updatedAt: now } : session)));
        setLocalActiveSessionId(ids[0] || localActiveSessionId);
        setCheckedChatIds((prev) => prev.filter((id) => !ids.includes(id)));
    };

    const removeSessions = (ids: string[]) => {
        const next = safeSessions.filter((session) => !ids.includes(session.id));
        if (!next.length) {
            const session = createSession();
            setLocalSessions([session]);
            setLocalActiveSessionId(session.id);
        } else {
            setLocalSessions(next);
            setLocalActiveSessionId(localActiveSessionId && ids.includes(localActiveSessionId) ? next[0].id : localActiveSessionId);
        }
        cleanupImages({ sessions: next });
        setCheckedChatIds((prev) => prev.filter((id) => !ids.includes(id)));
    };

    const clearSessions = () => {
        const session = createSession();
        setLocalSessions([session]);
        setLocalActiveSessionId(session.id);
        setCheckedChatIds([]);
        cleanupImages({ sessions: [session] });
    };


    const executeImageTasks = async (sessionId: string, assistantId: string, text: string, history: CanvasAssistantMessage[], refs: CanvasAssistantReference[], requestConfig: AiConfig) => {
            updateMessage(sessionId, assistantId, { text: refs.some(hasImageReference) ? "正在读取参考图" : "正在准备图片任务", isLoading: true });
            const referenceImages: ReferenceImage[] = await Promise.all(
                refs.filter(hasImageReference).map(async (item) => ({ id: item.id, name: `${item.title}.png`, type: "image/png", dataUrl: await imageToDataUrl(item), storageKey: item.storageKey, remoteUrl: item.remoteUrl })),
            );
            const imagePrompt = resolveImagePrompt(text, history, refs);
            if (!imagePrompt) {
                updateMessage(sessionId, assistantId, { text: "没有找到上一条可用的提示词，请先生成或输入具体提示词。", isLoading: false });
                return;
            }
            const plan = shouldUseFastSingleImageEdit(text, refs)
                ? fallbackImageTaskPlan(imagePrompt, text, refs)
                : await buildImageTaskPlan(requestConfig, imagePrompt, text, refs, referenceImages);
            const isMultiTask = plan.strategy === "multi" || plan.tasks.length > 1;
            if (isMultiTask) {
                updateMessage(sessionId, assistantId, { text: `已识别为“${plan.intent}”，拆分为 ${plan.tasks.length} 个执行任务，正在并行生成`, isLoading: true });
                const generatedImages: GeneratedAssistantImage[] = [];
                const taskSlotRequests = plan.tasks.map((task) => {
                    const count = resolveTaskCount(task, 1);
                    return Array.from({ length: count }, (_, index) => ({
                            id: nanoid(),
                            prompt: task.prompt,
                            title: count > 1 ? `${task.title || "图片"} ${index + 1}` : task.title,
                        }));
                });
                const pendingImages = onPrepareImages(taskSlotRequests.flat());
                let slotOffset = 0;
                const taskSlots = taskSlotRequests.map((slots) => {
                    const taskImages = pendingImages.slice(slotOffset, slotOffset + slots.length);
                    slotOffset += slots.length;
                    return taskImages;
                });
                const failedTasks: string[] = [];
                const taskFn = async (task: (typeof plan.tasks)[number], index: number) => {
                    const taskConfig = { ...requestConfig, count: String(resolveTaskCount(task, 1)) };
                    const images = await requestTaskImagesWithRetry(taskConfig, task.prompt, selectTaskReferenceImages(task, referenceImages));
                    return { task, images: images.slice(0, resolveTaskCount(task, 1)).map((image, imageIndex) => ({ id: taskSlots[index]?.[imageIndex]?.id || image.id, dataUrl: image.dataUrl, prompt: task.prompt })) };
                };
                const taskResults = await Promise.allSettled(
                    plan.tasks.map((task, index) => generationScheduler.submit(() => taskFn(task, index), maxConcurrentRequests)),
                );
                const failedIds: string[] = [];
                taskResults.forEach((result, index) => {
                    const task = plan.tasks[index];
                    if (result.status === "fulfilled") generatedImages.push(...result.value.images);
                    else {
                        failedIds.push(...taskSlots[index].map((image) => image.id));
                        failedTasks.push(`${task?.title || `任务 ${index + 1}`}：${readErrorMessage(result.reason)}`);
                    }
                });
                await commitGeneratedImages(sessionId, assistantId, generatedImages, {
                    success: `已按任务拆分生成 ${generatedImages.length} 张图片`,
                    empty: failedTasks.length ? `图片任务执行失败：${failedTasks.slice(0, 3).join("；")}` : "图片任务没有返回结果",
                    warnings: failedTasks,
                    pendingImages,
                    failedIds: failedIds.filter(Boolean),
                });
                return;
            }

            const task = plan.tasks[0] || fallbackImageTask(imagePrompt, 0);
            updateMessage(sessionId, assistantId, { text: `已识别为“${plan.intent}”，由${task.role}执行`, isLoading: true });
            const singleCount = resolveTaskCount(task, readConfigCount(requestConfig.count));
            const singleTaskConfig = { ...requestConfig, count: String(singleCount) };
            const pendingImages = onPrepareImages(
                Array.from({ length: singleCount }, (_, index) => ({
                    id: nanoid(),
                    prompt: task.prompt,
                    title: singleCount > 1 ? `${task.title || "图片"} ${index + 1}` : task.title,
                })),
            );
            const images = await requestTaskImagesWithRetry(singleTaskConfig, task.prompt, selectTaskReferenceImages(task, referenceImages));
            await commitGeneratedImages(
                sessionId,
                assistantId,
                images.map((image, index) => ({ id: pendingImages[index]?.id || image.id, dataUrl: image.dataUrl, prompt: task.prompt })),
                { success: `生成了 ${images.length} 张图片`, empty: "接口没有返回图片", pendingImages },
            );
            return;
    };

    const sendMessage = async (text: string, nextMode: AssistantMode, history: CanvasAssistantMessage[], savedReferences?: CanvasAssistantReference[]) => {
        setIsRunning(true);
        const selectedRefs = resolveAssistantMessageReferences(text, savedReferences ?? selectedReferences, history, nodes);
        const initialMode = nextMode === "image" || shouldUseFastImageEditRoute(text, selectedRefs) ? "image" : "ask";
        const initialRefs = initialMode === "image" ? selectedRefs : selectedRefs.filter((item) => !hasImageReference(item));
        const initialConfig = { ...effectiveConfig, count: initialMode === "image" ? effectiveConfig.canvasImageCount || effectiveConfig.count : effectiveConfig.count, model: initialMode === "image" ? effectiveConfig.imageModel || effectiveConfig.model : effectiveConfig.textModel || effectiveConfig.model };
        if (!isAiConfigReady(initialConfig, initialConfig.model)) {
            if (isAdmin) openConfigDialog(true);
            setIsRunning(false);
            return;
        }

        const session = activeSession || createSession();
        if (!activeSession) {
            setLocalSessions([session]);
            setLocalActiveSessionId(session.id);
        }

        const userMessage: CanvasAssistantMessage = { id: nanoid(), role: "user", mode: initialMode, text, references: initialRefs };
        const assistantId = nanoid();
        appendMessage(session.id, userMessage);
        appendMessage(session.id, { id: assistantId, role: "assistant", mode: initialMode, text: initialMode === "image" ? "正在理解图片任务" : "正在回答", isLoading: true });
        setPrompt("");

        try {
            const routerConfig = { ...effectiveConfig, count: "1", model: effectiveConfig.textModel || effectiveConfig.model, systemPrompt: "" };
            let intent = shouldUseFastImageEditRoute(text, selectedRefs)
                ? ({ kind: "image_edit", mode: "image", useReferences: true, confidence: 0.82, reason: "本地规则识别为参考图编辑" } satisfies AssistantIntent)
                : await resolveAssistantIntent(text, nextMode, selectedRefs, history, routerConfig, isAiConfigReady(routerConfig, routerConfig.model));
            if (shouldForceReferenceImageEdit(text, selectedRefs, intent)) {
                intent = { ...intent, kind: "image_edit", mode: "image", useReferences: true, confidence: Math.max(intent.confidence, 0.78), reason: "当前输入是基于最近参考图的视觉调整" };
            }
            const routedMode = intent.kind === "image_analysis" ? "ask" : intent.mode;
            const refs = filterReferencesForIntent(text, intent, selectedRefs);
            const routedUserMessage: CanvasAssistantMessage = { ...userMessage, mode: routedMode, references: refs };
            const requestConfig = { ...effectiveConfig, count: routedMode === "image" ? effectiveConfig.canvasImageCount || effectiveConfig.count : effectiveConfig.count, model: routedMode === "image" ? effectiveConfig.imageModel || effectiveConfig.model : effectiveConfig.textModel || effectiveConfig.model };
            if (!isAiConfigReady(requestConfig, requestConfig.model)) {
                if (isAdmin) openConfigDialog(true);
                updateMessage(session.id, assistantId, { text: isAdmin ? "当前模型配置不可用，请先完成配置。" : "请先配置 API Key 后再使用", isLoading: false });
                return;
            }
            updateMessage(session.id, userMessage.id, { mode: routedUserMessage.mode, references: routedUserMessage.references });
            updateMessage(session.id, assistantId, { mode: routedMode, text: intent.kind === "image_split" ? "正在拆分图片任务" : intent.kind === "image_analysis" ? "正在分析图片" : routedMode === "image" ? "正在准备图片任务" : "正在回答", isLoading: true });

            if (routedMode === "image") {
                await executeImageTasks(session.id, assistantId, text, history, refs, requestConfig);
                return;
            }

            const answer = await requestImageQuestion(requestConfig, await buildChatMessages([...history.slice(-CHAT_RECENT_MESSAGE_LIMIT), routedUserMessage], session.memory), (streamed) => {
                updateMessage(session.id, assistantId, { text: streamed, isLoading: false });
            });
            updateMessage(session.id, assistantId, { text: answer, isLoading: false });
            if (shouldRememberTurn(routedUserMessage, answer)) {
                updateSession(session.id, (current) => ({ ...current, memory: buildFallbackMemory(current.memory, routedUserMessage, answer), updatedAt: new Date().toISOString() }));
                if (shouldCompressMemory(session.memory, routedUserMessage)) {
                    void updateSessionMemory(session.id, requestConfig, session.memory, [...history.slice(-CHAT_RECENT_MESSAGE_LIMIT), routedUserMessage], answer);
                }
            }
        } catch (error) {
            updateMessage(session.id, assistantId, { text: error instanceof Error ? error.message : "操作失败", isLoading: false });
        } finally {
            setIsRunning(false);
        }
    };

    const commitGeneratedImages = async (
        sessionId: string,
        assistantId: string,
        generatedImages: GeneratedAssistantImage[],
        options: { success: string; empty: string; warnings?: string[]; pendingImages?: CanvasAssistantImage[]; failedIds?: string[] },
    ) => {
        if (!generatedImages.length) {
            if (options.pendingImages?.length) await onCompleteImages([], { failedIds: options.pendingImages.map((image) => image.id), errorDetails: options.empty });
            updateMessage(sessionId, assistantId, { text: options.empty, isLoading: false });
            return;
        }

        const storedResults = await Promise.allSettled(
            generatedImages.map(async (image) => {
                const stored = await uploadImage(image.dataUrl);
                return { ...image, dataUrl: stored.url, storageKey: stored.storageKey || undefined, remoteUrl: stored.remoteUrl };
            }),
        );
        const assistantImages: CanvasAssistantImage[] = storedResults.map((result, index) =>
            result.status === "fulfilled"
                ? result.value
                : {
                      id: generatedImages[index].id,
                      dataUrl: generatedImages[index].dataUrl,
                      remoteUrl: isRemoteHttpImageUrl(generatedImages[index].dataUrl) ? generatedImages[index].dataUrl : undefined,
                      prompt: generatedImages[index].prompt,
                  },
        );
        const localSaveFailures = storedResults.filter((result) => result.status === "rejected").length;
        let insertedImages: CanvasAssistantImage[] = [];
        let insertFailure = "";
        try {
            const completedIds = new Set(assistantImages.map((image) => image.id));
            const missingIds = options.pendingImages?.map((image) => image.id).filter((id) => !completedIds.has(id)) || [];
            const failedIds = [...(options.failedIds || []), ...missingIds];
            insertedImages = options.pendingImages?.length ? await onCompleteImages(assistantImages, { failedIds, errorDetails: options.warnings?.[0] || "图片任务没有返回结果" }) : await onInsertImages(assistantImages);
        } catch (error) {
            insertFailure = readErrorMessage(error);
        }

        const insertedById = new Map(insertedImages.map((image) => [image.id, image]));
        const visibleImages = assistantImages.map((image) => insertedById.get(image.id) || image);
        const insertedCount = visibleImages.filter((image) => image.insertedNodeId).length;
        const warnings = [
            ...(options.warnings || []),
            ...(localSaveFailures ? [`${localSaveFailures} 张图片已返回，但本地保存暂未完成，可在消息中预览并重试添加`] : []),
            ...(insertFailure ? [`添加到画布失败：${insertFailure}`] : []),
        ];
        const text = `${options.success}，${insertedCount ? `已添加 ${insertedCount} 张到画布空白位置` : "暂时没有成功添加到画布"}${warnings.length ? `\n\n注意：${warnings.slice(0, 3).join("；")}` : ""}`;
        updateMessage(sessionId, assistantId, { text, images: visibleImages, isLoading: false });
    };

    const submit = async () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        await sendMessage(text, "ask", messages);
    };

    const retryMessage = (message: CanvasAssistantMessage) => {
        const index = messages.findIndex((item) => item.id === message.id);
        const userIndex = messages.slice(0, index).findLastIndex((item) => item.role === "user");
        const user = messages[userIndex];
        if (user) void sendMessage(user.text, "ask", messages.slice(0, userIndex), user.references);
    };

    const updateSessionMemory = async (sessionId: string, config: AiConfig, memory: CanvasAssistantMemory | string | undefined, recentMessages: CanvasAssistantMessage[], answer: string) => {
        try {
            const nextMemory = await summarizeSessionMemory(config, memory, recentMessages, answer);
            updateSession(sessionId, (session) => ({ ...session, memory: nextMemory, updatedAt: new Date().toISOString() }));
        } catch {
            // Keep the local fallback memory; memory refresh should not interrupt chat.
        }
    };

    const startResize = () => {
        const move = (event: MouseEvent) => setWidth(Math.min(560, Math.max(300, window.innerWidth - event.clientX)));
        const stop = () => {
            setResizing(false);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
        };
        setResizing(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", stop);
    };

    const collapse = () => {
        setClosing(true);
        onCollapseStart();
        window.setTimeout(onCollapse, PANEL_MOTION_MS);
    };

    return (
        <motion.div
            className="flex shrink-0"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: closing ? 0 : width + 1, opacity: closing ? 0 : 1 }}
            transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "clip", pointerEvents: closing ? "none" : undefined }}
        >
            <motion.aside
                className="relative flex shrink-0 flex-col border-l"
                initial={{ x: 48 }}
                animate={{ x: closing ? 28 : 0 }}
                transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{ width, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            >
                <button type="button" className="absolute inset-y-0 left-0 z-40 w-4 -translate-x-1/2 cursor-col-resize" onMouseDown={startResize} aria-label="调整右侧面板宽度" />
                <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="size-4" />
                        {view === "active" ? "当前对话" : view === "archived" ? "归档对话" : "画布助手"}
                    </div>
                    <div className="flex items-center gap-1">
                        {view === "active" ? (
                            <>
                                <Tooltip title="归档选中">
                                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Archive className="size-4" />} disabled={!checkedChatIds.length} onClick={() => archiveSessions(checkedChatIds)} />
                                </Tooltip>
                                <Tooltip title="删除选中">
                                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Trash2 className="size-4" />} disabled={!checkedChatIds.length} onClick={() => setDeleteChatIds(checkedChatIds)} />
                                </Tooltip>
                                <Tooltip title="删除全部">
                                    <Button
                                        type="text"
                                        shape="circle"
                                        className="!h-8 !w-8 !min-w-8"
                                        style={iconButtonStyle}
                                        icon={<X className="size-4" />}
                                        disabled={!historySessions.length}
                                        onClick={() => setDeleteChatIds(historySessions.map((session) => session.id))}
                                    />
                                </Tooltip>
                            </>
                        ) : null}
                        {view === "archived" ? (
                            <>
                                <Tooltip title="恢复选中">
                                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<ArchiveRestore className="size-4" />} disabled={!checkedChatIds.length} onClick={() => restoreSessions(checkedChatIds)} />
                                </Tooltip>
                                <Tooltip title="删除选中">
                                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Trash2 className="size-4" />} disabled={!checkedChatIds.length} onClick={() => setDeleteChatIds(checkedChatIds)} />
                                </Tooltip>
                            </>
                        ) : null}
                        <Tooltip title={view === "chat" ? "当前对话" : "返回对话"}>
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<History className="size-4" />} onClick={() => setView(view === "chat" ? "active" : "chat")} />
                        </Tooltip>
                        <Tooltip title="归档对话">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Archive className="size-4" />} disabled={!archivedSessions.length} onClick={() => setView("archived")} />
                        </Tooltip>
                        <Tooltip title="新对话">
                            <Button
                                type="text"
                                shape="circle"
                                className="!h-8 !w-8 !min-w-8"
                                style={iconButtonStyle}
                                icon={<Plus className="size-4" />}
                                onClick={() => {
                                    startChatSession();
                                    setView("chat");
                                }}
                            />
                        </Tooltip>
                        {isAdmin ? (
                            <Tooltip title="配置">
                                <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Settings2 className="size-4" />} aria-label="配置" onClick={() => openConfigDialog(false)} />
                            </Tooltip>
                        ) : null}
                        <Tooltip title="收起对话">
                            <Button type="text" className="!h-8 !rounded-full !px-2 text-xs" style={iconButtonStyle} icon={<PanelRightClose className="size-4" />} aria-label="收起画布助手" onClick={collapse}>
                                收起
                            </Button>
                        </Tooltip>
                    </div>
                </div>

                <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                    {view === "active" ? (
                        <AssistantHistory
                            sessions={historySessions}
                            activeSession={activeSession}
                            checkedIds={checkedChatIds.filter((id) => historySessions.some((session) => session.id === id))}
                            onToggleChecked={(id, checked) => setCheckedChatIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)))}
                            onOpen={(id) => {
                                setLocalActiveSessionId(id);
                                setView("chat");
                            }}
                            onDelete={(id) => setDeleteChatIds([id])}
                            onArchive={(id) => archiveSessions([id])}
                        />
                    ) : view === "archived" ? (
                        <AssistantHistory
                            sessions={archivedSessions}
                            activeSession={activeSession}
                            checkedIds={checkedChatIds.filter((id) => archivedSessions.some((session) => session.id === id))}
                            archived
                            onToggleChecked={(id, checked) => setCheckedChatIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)))}
                            onOpen={(id) => {
                                restoreSessions([id]);
                                setView("chat");
                            }}
                            onDelete={(id) => setDeleteChatIds([id])}
                            onRestore={(id) => restoreSessions([id])}
                        />
                    ) : messages.length ? (
                        <AssistantMessages messages={messages} onRetry={retryMessage} onInsertImage={onInsertImage} onInsertText={onInsertText} />
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center px-1 text-center">
                            <div className="relative font-serif text-4xl font-bold italic tracking-normal" style={{ color: theme.node.text }}>
                                <span>Infinite Canvas</span>
                                <DiaTextReveal className="absolute inset-0" colors={["#A97CF8", "#F38CB8", "#FDCC92"]} textColor="transparent" duration={1.8} startOnView={false} text="Infinite Canvas" />
                            </div>
                            <div className="mt-3 font-serif text-base italic tracking-wide opacity-60">One canvas, infinite ideas</div>
                        </div>
                    )}
                </div>

                {view === "chat" ? (
                    <AssistantComposer
                        prompt={prompt}
                        isRunning={isRunning}
                        references={selectedReferences}
                        config={assistantConfig}
                        onPromptChange={setPrompt}
                        onSubmit={submit}
                        onConfigChange={(key, value) => updateConfig(key === "count" ? "canvasImageCount" : key, value)}
                        onMissingConfig={() => { if (isAdmin) openConfigDialog(true); }}
                        onRemoveReference={(id) => {
                            setRemovedReferenceIds((prev) => new Set(prev).add(id));
                            if (selectedNodeIds.has(id)) onSelectNodeIds(new Set(Array.from(selectedNodeIds).filter((nodeId) => nodeId !== id)));
                        }}
                        onPasteImage={onPasteImage}
                        modelCosts={modelCosts}
                    />
                ) : null}

                <Modal
                    title="删除对话记录？"
                    open={deleteChatIds.length > 0}
                    centered
                    onCancel={() => setDeleteChatIds([])}
                    footer={
                        <>
                            <Button onClick={() => setDeleteChatIds([])}>取消</Button>
                            <Button
                                danger
                                type="primary"
                                onClick={() => {
                                    deleteChatIds.length === safeSessions.filter((session) => session.messages.length > 0).length ? clearSessions() : removeSessions(deleteChatIds);
                                    setDeleteChatIds([]);
                                }}
                            >
                                删除
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">将删除 {deleteChatIds.length} 条对话记录，此操作不可撤销。</p>
                </Modal>
            </motion.aside>
        </motion.div>
    );
}

function AssistantComposer({
    prompt,
    isRunning,
    references,
    config,
    onPromptChange,
    onSubmit,
    onConfigChange,
    onMissingConfig,
    onRemoveReference,
    onPasteImage,
    modelCosts,
}: {
    prompt: string;
    isRunning: boolean;
    references: CanvasAssistantReference[];
    config: AiConfig;
    onPromptChange: (prompt: string) => void;
    onSubmit: () => void;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig: () => void;
    onRemoveReference: (id: string) => void;
    onPasteImage: (file: File) => void;
    modelCosts?: { model: string; credits: number }[];
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: config.imageModel || config.model, count: config.count });
    const [textareaHeight, setTextareaHeight] = useState(80);
    const startComposerResize = useCallback(() => {
        const move = (event: MouseEvent) => {
            const composer = document.querySelector("[data-composer-box]") as HTMLElement | null;
            if (!composer) return;
            const rect = composer.getBoundingClientRect();
            setTextareaHeight(Math.min(320, Math.max(60, rect.bottom - event.clientY - 72)));
        };
        const stop = () => {
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
        };
        document.body.style.cursor = "row-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", stop);
    }, []);

    return (
        <div className="px-2 pb-2" data-composer-box="" onWheelCapture={(event) => event.stopPropagation()}>
            <div className="group/resize flex h-3 cursor-row-resize items-center justify-center" onMouseDown={startComposerResize}>
                <div className="h-1 w-8 rounded-full bg-current opacity-15 transition group-hover/resize:opacity-40" />
            </div>
            {references.length ? (
                <div className="thin-scrollbar mb-1.5 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1">
                    {references.map((item, index) => (
                        <AssistantReferenceChip key={item.id} item={item} label={assistantImageReferenceLabel(references, index)} onRemove={() => onRemoveReference(item.id)} />
                    ))}
                </div>
            ) : null}
            <div className="rounded-[28px] border px-3 pb-3 pt-3 shadow-lg" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke }}>
                <textarea
                    value={prompt}
                    onChange={(event) => onPromptChange(event.target.value)}
                    onCopy={copySelectedTextFromTextControl}
                    onPaste={(event) => {
                        const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
                        if (!file) return;
                        event.preventDefault();
                        onPasteImage(file);
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.shiftKey) return;
                        event.preventDefault();
                        void onSubmit();
                    }}
                    className="thin-scrollbar w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 outline-none select-text placeholder:text-stone-400"
                    style={{ height: textareaHeight, color: theme.node.text, caretColor: theme.node.activeStroke, ...canvasTextSelectionStyle }}
                    placeholder="输入问题、图片生成或修改要求"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="canvas-composer-tools flex min-w-0 flex-1 items-center gap-1">
                        <ModelPicker iconOnly className="canvas-composer-icon-only" config={config} value={config.imageModel || config.model} onChange={(model) => onConfigChange("imageModel", model)} capability="image" placeholder="图片模型" onMissingConfig={onMissingConfig} />
                        <CanvasImageSettingsPopover config={config} placement="topRight" getPopupContainer={() => document.body} buttonClassName="canvas-composer-settings canvas-composer-icon canvas-composer-icon-only !h-8 !w-8 !min-w-8 !rounded-full !px-0" onConfigChange={onConfigChange} onMissingConfig={onMissingConfig} />
                    </div>
                    <Button
                        type="primary"
                        className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                        disabled={isRunning || !prompt.trim()}
                        onClick={() => void onSubmit()}
                        aria-label="发送"
                    >
                        <span className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">
                                <CreditSymbol />
                                {credits.toLocaleString()}
                            </span>
                            {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                        </span>
                    </Button>
                </div>
            </div>
        </div>
    );
}

function SettingTitle({ children, color }: { children: string; color: string }) {
    return (
        <div className="text-xs font-medium" style={{ color }}>
            {children}
        </div>
    );
}

function qualityLabel(value: string) {
    return ({ auto: "自动", high: "高", medium: "中", low: "低" } as Record<string, string>)[value] || value;
}

function AssistantMessages({
    messages,
    onRetry,
    onInsertImage,
    onInsertText,
}: {
    messages: CanvasAssistantMessage[];
    onRetry: (message: CanvasAssistantMessage) => void;
    onInsertImage: (image: CanvasAssistantImage) => Promise<CanvasAssistantImage>;
    onInsertText: (text: string) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <>
            {messages.map((message) => (
                <div key={message.id} className={cn("flex flex-col gap-2", message.role === "user" ? "items-end" : "items-start")}>
                    <div
                        className="max-w-[88%] select-text whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6"
                        style={{ ...(message.role === "user" ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { background: theme.node.fill, color: theme.node.text }), ...canvasTextSelectionStyle }}
                    >
                        {message.role === "assistant" ? (
                            <div className="mb-1 flex items-center gap-1.5 text-xs opacity-60">
                                <MessageSquare className="size-3.5" />
                                回答
                            </div>
                        ) : null}
                        {message.text}
                    </div>
                    {message.references?.length ? <MessageReferences message={message} /> : null}
                    {message.isLoading ? <ImageGenerationPending compact label={message.mode === "image" ? "正在生成图片" : "正在回答"} className="w-[250px] rounded-2xl border" /> : null}
                    {message.role === "assistant" && !message.isLoading ? (
                        <div className="flex gap-1">
                            <Button shape="circle" size="small" style={{ borderColor: theme.node.stroke }} icon={<RotateCcw className="size-3.5" />} onClick={() => onRetry(message)} title="重试" />
                            {!message.images?.length ? <Button shape="circle" size="small" style={{ borderColor: theme.node.stroke }} icon={<Plus className="size-3.5" />} onClick={() => onInsertText(message.text)} title="插入画布" /> : null}
                        </div>
                    ) : null}
                    {message.images?.map((image) => (
                        <div key={image.id} className="w-[250px] overflow-hidden rounded-2xl border" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
                            <AssistantImagePreview image={image} className="aspect-square w-full object-cover" />
                            <Button
                                type="text"
                                className="!h-8 !w-full !rounded-none"
                                style={{ borderTop: `1px solid ${theme.node.stroke}`, color: theme.node.text }}
                                icon={<Plus className="size-3.5" />}
                                disabled={Boolean(image.insertedNodeId)}
                                onClick={() => void onInsertImage(image)}
                                title={image.insertedNodeId ? "已添加到画布" : "插入画布"}
                            >
                                {image.insertedNodeId ? "已添加" : null}
                            </Button>
                        </div>
                    ))}
                </div>
            ))}
        </>
    );
}

function AssistantHistory({
    sessions,
    activeSession,
    checkedIds,
    archived,
    onToggleChecked,
    onOpen,
    onDelete,
    onArchive,
    onRestore,
}: {
    sessions: CanvasAssistantSession[];
    activeSession: CanvasAssistantSession | null;
    checkedIds: string[];
    archived?: boolean;
    onToggleChecked: (id: string, checked: boolean) => void;
    onOpen: (id: string) => void;
    onDelete: (id: string) => void;
    onArchive?: (id: string) => void;
    onRestore?: (id: string) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="space-y-1">
            {sessions.map((session) => (
                <div key={session.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-black/5 dark:hover:bg-white/10" style={session.id === activeSession?.id ? { background: theme.node.fill } : undefined}>
                    <input type="checkbox" className="size-4 accent-stone-950" checked={checkedIds.includes(session.id)} onChange={(event) => onToggleChecked(session.id, event.target.checked)} />
                    <button type="button" className="min-w-0 flex-1 text-left text-sm" onClick={() => onOpen(session.id)}>
                        <span className="block truncate">{session.title}</span>
                        <span className="text-xs opacity-50">{session.messages.length} 条消息{session.memory ? ` · 记忆 ${readMemoryTurns(session.memory)}` : ""}</span>
                    </button>
                    {archived ? (
                        <Button type="text" shape="circle" size="small" className="opacity-0 transition group-hover:opacity-100" icon={<ArchiveRestore className="size-3.5" />} onClick={() => onRestore?.(session.id)} title="恢复" />
                    ) : (
                        <Button type="text" shape="circle" size="small" className="opacity-0 transition group-hover:opacity-100" icon={<Archive className="size-3.5" />} onClick={() => onArchive?.(session.id)} title="归档" />
                    )}
                    <Button type="text" shape="circle" size="small" className="opacity-0 transition group-hover:opacity-100" icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(session.id)} title="删除" />
                </div>
            ))}
        </div>
    );
}

function MessageReferences({ message }: { message: CanvasAssistantMessage }) {
    return (
        <div className={cn("flex max-w-[88%] flex-wrap gap-2", message.role === "user" ? "justify-end" : "justify-start")}>
            {message.references?.map((item, index, references) => (
                <AssistantReferenceChip key={item.id} item={item} label={assistantImageReferenceLabel(references, index)} />
            ))}
        </div>
    );
}

function AssistantReferenceChip({ item, label, onRemove }: { item: CanvasAssistantReference; label?: string; onRemove?: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const text = (item.text || item.title).replace(/\s+/g, " ").trim().slice(0, 1) || "文";
    return (
        <div className="group/chip relative inline-flex h-8 max-w-[150px] shrink-0 items-center gap-1.5 rounded-lg text-sm" style={{ color: theme.node.text }}>
            {hasImageReference(item) ? (
                <span className="relative block size-8 shrink-0">
                    <AssistantImagePreview image={item} className="size-8 rounded-lg object-cover" />
                    {label ? <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 py-0.5 text-[8px] font-medium leading-none text-white">{label}</span> : null}
                </span>
            ) : (
                <span className="grid size-8 place-items-center rounded-lg border text-sm font-medium" style={{ background: theme.node.panel, borderColor: theme.node.activeStroke }}>
                    {text}
                </span>
            )}
            {onRemove ? (
                <button
                    type="button"
                    className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border opacity-0 shadow-sm transition group-hover/chip:opacity-100"
                    style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke }}
                    onClick={onRemove}
                    aria-label="移除引用"
                >
                    <X className="size-3" />
                </button>
            ) : null}
        </div>
    );
}

function AssistantImagePreview({ image, className }: { image: { dataUrl?: string; storageKey?: string; remoteUrl?: string }; className?: string }) {
    const [src, setSrc] = useState(image.dataUrl || image.remoteUrl || "");
    useEffect(() => {
        let cancelled = false;
        if (!image.storageKey) {
            setSrc(image.dataUrl || image.remoteUrl || "");
            return;
        }
        void resolveImageUrl(image.storageKey, image.dataUrl || "", image.remoteUrl || "").then((url) => {
            if (!cancelled) setSrc(url);
        });
        return () => {
            cancelled = true;
        };
    }, [image.dataUrl, image.remoteUrl, image.storageKey]);
    return src ? <img src={src} alt="" className={className} loading="lazy" /> : <div className={cn("animate-pulse bg-black/10 dark:bg-white/10", className)} />;
}

function assistantImageReferenceLabel(references: CanvasAssistantReference[], index: number) {
    if (!hasImageReference(references[index])) return undefined;
    const imageIndex = references.slice(0, index + 1).filter(hasImageReference).length - 1;
    return imageIndex >= 0 ? imageReferenceLabel(imageIndex) : undefined;
}

function hasImageReference(item?: Pick<CanvasAssistantReference, "dataUrl" | "storageKey" | "remoteUrl">) {
    return Boolean(item?.dataUrl || item?.storageKey || item?.remoteUrl);
}

function nodeToReference(node: CanvasNodeData): CanvasAssistantReference | null {
    if (node.type === CanvasNodeType.Image && node.metadata?.content) {
        return { id: node.id, type: node.type, title: node.title, dataUrl: node.metadata.content, storageKey: node.metadata.storageKey, remoteUrl: node.metadata.remoteUrl };
    }
    if (node.type === CanvasNodeType.Text && node.metadata?.content) {
        return { id: node.id, type: node.type, title: node.title, text: node.metadata.content };
    }
    return null;
}

function buildAssistantReferences(nodes: CanvasNodeData[], selectedNodeIds: Set<string>) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return Array.from(selectedNodeIds)
        .map((id) => nodeById.get(id))
        .filter((node): node is CanvasNodeData => Boolean(node))
        .map(nodeToReference)
        .filter((item): item is CanvasAssistantReference => Boolean(item));
}

function resolveAssistantMessageReferences(text: string, references: CanvasAssistantReference[], history: CanvasAssistantMessage[], nodes: CanvasNodeData[]) {
    if (references.some(hasImageReference)) return references;
    if (!shouldCarryRecentImageReference(text)) return references;
    const recentReference = findRecentAssistantImageReference(history, nodes);
    return recentReference ? [recentReference, ...references.filter((item) => item.type !== CanvasNodeType.Image)] : references;
}

function findRecentAssistantImageReference(history: CanvasAssistantMessage[], nodes: CanvasNodeData[]) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const message = history[index];
        if (message.role !== "assistant" || message.isLoading || !message.images?.length) continue;
        for (let imageIndex = message.images.length - 1; imageIndex >= 0; imageIndex -= 1) {
            const image = message.images[imageIndex];
            const insertedNode = image.insertedNodeId ? nodeById.get(image.insertedNodeId) : undefined;
            const nodeReference = insertedNode ? nodeToReference(insertedNode) : null;
            if (nodeReference && hasImageReference(nodeReference)) return nodeReference;
            if (image.dataUrl || image.storageKey || image.remoteUrl) {
                return {
                    id: image.insertedNodeId || image.id,
                    type: CanvasNodeType.Image,
                    title: image.prompt?.slice(0, 32) || "上一张生成图",
                    dataUrl: image.dataUrl,
                    storageKey: image.storageKey,
                    remoteUrl: image.remoteUrl,
                };
            }
        }
    }
    return null;
}

function shouldCarryRecentImageReference(text: string) {
    const compactText = text.replace(/\s+/g, "");
    if (!compactText) return false;
    if (usesPreviousPrompt(compactText)) return false;
    return IMAGE_REFERENCE_POINTER_PATTERN.test(compactText) || IMAGE_EDIT_DIRECTIVE_PATTERN.test(compactText) || /(拉近|拉远|推近|推远|靠近|远一些|近一些|近一点|远一点|大一些|小一些|自然一些|更自然)/i.test(compactText);
}

function shouldForceReferenceImageEdit(text: string, references: CanvasAssistantReference[], intent: AssistantIntent) {
    if (!references.some(hasImageReference) || intent.kind === "image_analysis" || intent.kind === "image_split") return false;
    return hasImageEditIntent(text, references) || shouldCarryRecentImageReference(text);
}

function shouldUseFastImageEditRoute(text: string, references: CanvasAssistantReference[]) {
    return references.some(hasImageReference) && shouldUseFastSingleImageEdit(text, references);
}

function shouldUseFastSingleImageEdit(text: string, references: CanvasAssistantReference[]) {
    if (references.filter(hasImageReference).length !== 1) return false;
    if (IMAGE_ANALYSIS_ONLY_PATTERN.test(text.replace(/\s+/g, ""))) return false;
    if (isReferenceCompositionTask(text, references) || isPerReferenceImageTask(text, references) || isReferenceElementSplitTask(text, references) || wantsMultipleIndependentImages(text) || extractUiPageTasks(text).length > 1) return false;
    return hasImageEditIntent(text, references) || shouldCarryRecentImageReference(text);
}

const IMAGE_REFERENCE_POINTER_PATTERN = /(这张|这幅|这图|这个图|这张图|这几张|这些图|当前图|选中|参考图|参考图片|原图|图片\s*\d+|它|其)/i;
const IMAGE_EDIT_DIRECTIVE_PATTERN = /(改为|改成|修改|修图|编辑|重绘|重做|替换|换成|换为|换一个|调整|优化|变成|变为|去掉|删除|移除|增加|添加|补上|保留|保持|缩短|拉长|放大|缩小|扩图|裁剪|全身|半身|近景|远景|俯视|仰视|侧面|正面|背面|姿势|动作|表情|服装|衣服|裙摆|发型|背景|光线|色调|构图|比例|角度|景别|镜头|透视|edit|modify|change|replace|adjust|remove|add|pose|view|angle|full.?body|half.?body|top.?down|bird.?eye|outpaint|crop)/i;
const IMAGE_EDIT_IMPERATIVE_PATTERN = /(帮我|请|麻烦|把|将|让|给我|直接|重新|再).{0,18}(改|换|调|变|删|去|加|扩|裁|做|生成|出图)|(?:改|换|调|变|删|去|加|扩|裁|做成|生成|出图).{0,18}(一下|一点|一些|成|为|到|图|图片|效果)/i;
const IMAGE_ANALYSIS_ONLY_PATTERN = /(怎么|如何|为什么|能不能|可以吗|建议|评价|分析|看看|看一下|描述|说明|是什么|哪里|哪里不对|是否).{0,18}(吗|呢|？|\?|建议|问题|风格|特点|原因)?$/i;

async function resolveAssistantIntent(text: string, mode: AssistantMode, references: CanvasAssistantReference[], history: CanvasAssistantMessage[], config: AiConfig, canUseModelRouter: boolean): Promise<AssistantIntent> {
    const fallback = fallbackAssistantIntent(text, mode, references);
    if (!canUseModelRouter) return fallback;
    try {
        const response = await requestImageQuestion(config, [{ role: "user", content: buildAssistantIntentPrompt(text, references, history) }], () => undefined);
        return normalizeAssistantIntent(response, fallback, references);
    } catch {
        return fallback;
    }
}

function fallbackAssistantIntent(text: string, mode: AssistantMode, references: CanvasAssistantReference[]): AssistantIntent {
    const routedMode = resolveFallbackAssistantMode(text, mode, references);
    const kind: AssistantIntentKind =
        routedMode === "ask" ? "chat" : isSplitImageTask(text, references) ? "image_split" : hasImageEditIntent(text, references) || wantsImageEdit(text, references) ? "image_edit" : references.some(hasImageReference) && /(分析|总结|提炼|归纳|风格|规范|设计系统|design system)/i.test(text) ? "image_analysis" : "image_generation";
    return { kind, mode: routedMode, useReferences: shouldUseImageReferences(text, references), confidence: 0.45, reason: "fallback" };
}

function resolveFallbackAssistantMode(text: string, mode: AssistantMode, references: CanvasAssistantReference[]): AssistantMode {
    if (mode === "image") return "image";
    return wantsImageOutput(text) || hasImageEditIntent(text, references) || wantsImageEdit(text, references) || wantsImageFromPreviousPrompt(text) || isSplitImageTask(text, references) ? "image" : "ask";
}

function filterReferencesForIntent(text: string, intent: AssistantIntent, references: CanvasAssistantReference[]) {
    if (intent.useReferences || intent.kind === "image_edit" || intent.kind === "image_split" || intent.kind === "image_analysis") return references;
    if (intent.mode !== "image" || shouldUseImageReferences(text, references)) return references;
    return references.filter((item) => !hasImageReference(item));
}

function buildAssistantIntentPrompt(text: string, references: CanvasAssistantReference[], history: CanvasAssistantMessage[]) {
    const recentMessages = history.slice(-6).map((message) => ({
        role: message.role,
        mode: message.mode,
        text: message.text.slice(0, 300),
        references: message.references?.map((item) => ({ title: item.title, type: item.type, hasImage: hasImageReference(item) })) || [],
        hasImages: Boolean(message.images?.length),
    }));
    const referenceSummary = references.map((item, index) => ({
        id: item.id,
        index: index + 1,
        title: item.title,
        type: item.type,
        hasImage: hasImageReference(item),
        hasText: Boolean(item.text),
    }));
    return [
        "你是画布助手的意图路由器。请根据用户当前输入、最近对话和选中的画布引用，判断下一步应该走哪条执行链路。",
        "只输出纯 JSON，不要 Markdown，不要解释。",
        "kind 只能是 chat、image_analysis、image_generation、image_edit、image_split。",
        "chat：普通问答、解释、建议、只要文字回答。",
        "image_analysis：用户想分析/描述/评价参考图，但没有要求生成或修改图片。",
        "image_generation：用户要从文本生成新图片，或者用上一条提示词生图。",
        "image_edit：用户要基于参考图直接改图、修图、换姿势、换角度、扩图、裁剪、换背景、换服装、调整构图或保持主体后改变画面。",
        "image_split：用户要拆分多个元素、多张独立图、多姿势、多页面、多参考图逐张处理。",
        "带参考图时，不要只看关键词，要理解用户是否在要求改变视觉结果；如果是，优先 image_edit 或 image_split。",
        "useReferences 表示本轮执行是否应该携带选中的参考图。图片编辑、图片分析、拆分参考图时必须为 true；纯文本闲聊一般为 false。",
        "confidence 是 0 到 1 的数字。reason 用一句短中文说明。",
        "JSON 格式：{\"kind\":\"image_edit\",\"useReferences\":true,\"confidence\":0.92,\"reason\":\"用户要求基于选中图换姿势并改为全身\"}",
        `当前用户输入：${text}`,
        `选中引用：${JSON.stringify(referenceSummary)}`,
        `最近对话：${JSON.stringify(recentMessages)}`,
    ].join("\n\n");
}

function normalizeAssistantIntent(response: string, fallback: AssistantIntent, references: CanvasAssistantReference[]): AssistantIntent {
    try {
        const cleaned = response
            .trim()
            .replace(/^```(?:json)?/i, "")
            .replace(/```$/i, "")
            .trim();
        const parsed = JSON.parse(cleaned) as { kind?: unknown; mode?: unknown; useReferences?: unknown; confidence?: unknown; reason?: unknown };
        const kind = normalizeIntentKind(parsed.kind);
        if (!kind) return fallback;
        const mode: AssistantMode = kind === "chat" || kind === "image_analysis" ? "ask" : "image";
        const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || fallback.confidence));
        const useReferences = typeof parsed.useReferences === "boolean" ? parsed.useReferences : kind === "image_edit" || kind === "image_split" || kind === "image_analysis" || fallback.useReferences;
        if ((kind === "image_edit" || kind === "image_split") && !references.some(hasImageReference)) return { ...fallback, reason: "model-requested-image-reference-without-reference" };
        return {
            kind,
            mode,
            useReferences,
            confidence,
            reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 120) : fallback.reason,
        };
    } catch {
        return fallback;
    }
}

function normalizeIntentKind(value: unknown): AssistantIntentKind | null {
    if (value === "chat" || value === "image_analysis" || value === "image_generation" || value === "image_edit" || value === "image_split") return value;
    return null;
}

function shouldUseImageReferences(text: string, references: CanvasAssistantReference[]) {
    if (!references.some(hasImageReference)) return false;
    return isReferenceCompositionTask(text, references) || isPerReferenceImageTask(text, references) || hasImageEditIntent(text, references) || /(这张|这几张|选中|参考图|参考图片|原图|图片\s*\d+|根据选中|按照选中|基于选中|保持|一致|理解|分析|总结|提炼|风格|修改|编辑|改成|改为|替换|调整|优化|重绘|变成|去掉|增加|换成|换为|换一个|拆分|拆解|分解|提取|元素)/i.test(text);
}

function wantsImageOutput(text: string) {
    return /(生成|创建|出|做|画|绘制|制作).{0,12}(图片|图像|海报|规范图|设计规范|视觉|icon|图标|素材|效果图)|(生图|出图|重新出一张|再出一张)|^(图片|图像|海报|设计规范图)/i.test(text);
}

function wantsImageEdit(text: string, references: CanvasAssistantReference[]) {
    return references.some(hasImageReference) && (isReferenceCompositionTask(text, references) || hasImageEditIntent(text, references) || /(修改|改成|改为|替换|调整|优化|重绘|变成|去掉|增加|保留|换成|换为|换一个|编辑).{0,16}(图片|图|它|这个|风格|背景|颜色|元素|姿势|构图|角度)?/i.test(text));
}

function hasImageEditIntent(text: string, references: CanvasAssistantReference[]) {
    if (!references.some(hasImageReference)) return false;
    const compactText = text.replace(/\s+/g, "");
    if (!compactText) return false;
    if (IMAGE_ANALYSIS_ONLY_PATTERN.test(compactText) && !IMAGE_EDIT_IMPERATIVE_PATTERN.test(compactText)) return false;
    if (IMAGE_EDIT_DIRECTIVE_PATTERN.test(compactText)) return true;
    return IMAGE_REFERENCE_POINTER_PATTERN.test(compactText) && IMAGE_EDIT_IMPERATIVE_PATTERN.test(compactText);
}

function wantsImageFromPreviousPrompt(text: string) {
    return usesPreviousPrompt(text) && /(生成|创建|出|做|画|绘制|制作|生图|图片|图像|海报|效果图)/i.test(text);
}

function isSplitImageTask(text: string, references: CanvasAssistantReference[]) {
    if (isReferenceCompositionTask(text, references)) return false;
    return isPerReferenceImageTask(text, references) || isReferenceElementSplitTask(text, references) || wantsMultipleIndependentImages(text) || extractUiPageTasks(text).length > 1;
}

function shouldPlanImageTasks(text: string, references: CanvasAssistantReference[], imagePrompt: string) {
    const combined = `${text}\n${imagePrompt}`;
    if (isReferenceCompositionTask(combined, references)) return false;
    return isPerReferenceImageTask(combined, references) || isReferenceElementSplitTask(text, references) || wantsMultipleIndependentImages(combined) || extractUiPageTasks(combined).length > 1;
}

function isReferenceElementSplitTask(text: string, references: CanvasAssistantReference[]) {
    return references.some(hasImageReference) && /(拆分|拆解|分解|提取|元素).{0,18}(分别|单独|逐个|每个|一张|图片|生成)|分别.{0,18}(单独|逐个|每个).{0,18}(生成|出图|图片)/i.test(text);
}

function wantsMultipleIndependentImages(text: string) {
    if (hasSingleCompositionIntent(text)) return false;
    const count = extractRequestedTaskCount(text);
    if (count > 1 && /(张|个|套|页|页面|界面|屏|款|版|种).{0,18}(图|图片|图像|设计|页面|界面|姿势|动作|写真|方案|海报)?/i.test(text)) return true;
    return /(不同|分别|各自|每(?:个|张|页|种)|单独|独立|一张一张|不要拼图|不要合成|多张|成套|系列|套图).{0,24}(姿势|动作|角度|页面|界面|图片|图像|设计|方案|海报|写真|款|版本)|(姿势|动作|角度|页面|界面|图片|图像|设计|方案|海报|写真|款|版本).{0,24}(不同|分别|各自|单独|独立|每(?:个|张|页|种)|多张|成套|系列)/i.test(text);
}

function isReferenceCompositionTask(text: string, references: CanvasAssistantReference[]) {
    return references.filter(hasImageReference).length > 1 && hasSingleCompositionIntent(text);
}

function hasSingleCompositionIntent(text: string) {
    if (/(不要|别|禁止|不要做成|不要生成|不要输出).{0,8}(合成|融合|合并|拼接|拼成|同一张|一张图|一张图片)/i.test(text)) return false;
    return /(合成|融合|合并|组合|整合|拼接|拼成|拼到|放到|放在|汇总到|做成|变成).{0,16}(一张|同一张|一个画面|一幅|单张|single image)|(一张|同一张|一个画面|一幅|单张|single image).{0,16}(合成|融合|合并|组合|整合|拼接|包含|使用|参考)|(参考|根据|基于|使用|用).{0,20}(这几张|这些|多张|选中|参考图|图片).{0,24}(生成|做|创建|制作|设计).{0,12}(一张|一个|同一张|单张)/i.test(text);
}

function isPerReferenceImageTask(text: string, references: CanvasAssistantReference[]) {
    if (references.filter(hasImageReference).length <= 1 || hasSingleCompositionIntent(text)) return false;
    return /((每张|每一张|每个|每一个|各自|分别|逐张|逐个|单独).{0,18}(图片|照片|图|参考图|选中)|(图片|照片|图|参考图|选中).{0,18}(每张|每一张|每个|每一个|各自|分别|逐张|逐个|单独)|(这些|这几张|多张|选中).{0,12}(都|全部|全都).{0,18}(修改|改成|替换|调整|优化|重绘|变成|去掉|增加|换成|编辑|生成|做成|处理))/i.test(text);
}

function resolveImagePrompt(text: string, history: CanvasAssistantMessage[], references: CanvasAssistantReference[] = []) {
    const current = text.trim();
    if (!current) return "";
    if (!usesPreviousPrompt(current)) {
        const recentImagePrompt = references.some(hasImageReference) && shouldCarryRecentImageReference(current) ? findRecentAssistantImagePrompt(history, references) : "";
        return recentImagePrompt ? `${recentImagePrompt}\n\n编辑要求：${current}` : current;
    }
    const previousPrompt = findRecentAssistantPrompt(history);
    if (!previousPrompt) return "";
    const extra = extractImagePromptExtra(current);
    return extra ? `${previousPrompt}\n\n补充要求：${extra}` : previousPrompt;
}

function usesPreviousPrompt(text: string) {
    return /(这个|这段|上面|上方|刚才|上一条|前面|前文|上述|该|它).{0,8}(提示词|prompt|描述|文案|内容)|(照|按|根据|使用|用).{0,6}(上面|上方|刚才|上一条|前面|前文|上述).{0,8}(提示词|prompt|描述|文案|内容)?/i.test(text);
}

function findRecentAssistantPrompt(history: CanvasAssistantMessage[]) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const message = history[index];
        if (message.role !== "assistant" || message.isLoading || message.images?.length) continue;
        const prompt = normalizeAssistantPromptCandidate(message.text);
        if (prompt) return prompt;
    }
    return "";
}

function findRecentAssistantImagePrompt(history: CanvasAssistantMessage[], references: CanvasAssistantReference[]) {
    const referenceIds = new Set(references.filter(hasImageReference).map((item) => item.id));
    let latestPrompt = "";
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const message = history[index];
        if (message.role !== "assistant" || message.isLoading || !message.images?.length) continue;
        for (let imageIndex = message.images.length - 1; imageIndex >= 0; imageIndex -= 1) {
            const image = message.images[imageIndex];
            const prompt = normalizeAssistantPromptCandidate(image.prompt || "");
            if (!prompt) continue;
            latestPrompt ||= prompt;
            if (referenceIds.has(image.id) || (image.insertedNodeId && referenceIds.has(image.insertedNodeId))) return prompt;
        }
        if (latestPrompt) return latestPrompt;
    }
    return "";
}

function normalizeAssistantPromptCandidate(text: string) {
    const codeBlock = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    const source = codeBlock?.[1]?.trim() || text;
    const cleaned = source
        .replace(/^#+\s*/gm, "")
        .replace(/^\s*(提示词|prompt|图片提示词|生图提示词)\s*[:：]\s*/i, "")
        .replace(/^\s*(当然|好的|可以)[，,。\s]*(下面是|这是|以下是)?(优化后)?(的)?(提示词|prompt|图片提示词|生图提示词)?\s*[:：]?\s*/i, "")
        .trim();
    if (cleaned.length < 12) return "";
    if (/^(请提供|没有找到|生成了|已生成|正在|操作失败)/.test(cleaned)) return "";
    return cleaned.slice(0, 4000);
}

function extractImagePromptExtra(text: string) {
    const cleaned = text
        .replace(/帮我|请|麻烦/g, "")
        .replace(/用(这个|这段|上面|上方|刚才|上一条|前面|前文|上述|该)?(提示词|prompt|描述|文案|内容)?/gi, "")
        .replace(/(生成|创建|出|做|画|绘制|制作)(一张|个)?(图片|图像|海报|效果图)?/gi, "")
        .replace(/^[，,。.\s]+|[，,。.\s]+$/g, "")
        .trim();
    return cleaned.length >= 4 ? cleaned.slice(0, 500) : "";
}

type ImageTaskPlan = { intent: string; strategy: "single" | "multi"; tasks: SplitImageTask[] };
type SplitImageTask = { title: string; role: string; prompt: string; count?: number; referenceIds?: string[] };
type GeneratedAssistantImage = { id: string; dataUrl: string; prompt: string };

async function buildImageTaskPlan(config: AiConfig, imagePrompt: string, userRequest: string, references: CanvasAssistantReference[], referenceImages: ReferenceImage[]): Promise<ImageTaskPlan> {
    const requestedCount = extractRequestedTaskCount(`${userRequest}\n${imagePrompt}`);
    const pageTasks = extractUiPageTasks(`${userRequest}\n${imagePrompt}`);
    const prompt = [
        "你是画布创意任务编排智能体，工作方式是先理解用户意图，再拆分任务，并为每个任务分配最合适的执行角色。",
        "多交付物时，每个子任务只生成一张独立图片，必须描述清楚单独元素、构图、背景、风格和输出要求。",
        "如果用户要求不同姿势、不同页面、不同方案或多张图，必须拆成一张图一个任务，禁止把多个姿势、多个页面或多张图放进同一张图。",
        "UI 设计需求按页面拆分，例如首页、商品详情页、购物车页分别是不同任务。",
        "人物写真或产品海报按姿势、动作、角度、场景或方案拆分。",
        "多张参考图不等于多张输出。用户要求合成、融合、组合、拼接到同一张、做成一张图时，必须输出 single，只创建 1 个任务，并在该任务 referenceIds 中放入所有相关参考节点 id。",
        "用户要求每张参考图分别处理、逐张处理、各自改图、每张生成一张时，才按参考图拆成多个任务；每个任务 referenceIds 只放对应参考节点 id。",
        "只要本轮包含参考图片，并且用户要求改为、改成、换成、换一个、缩短、拉长、全身、半身、俯视、姿势、动作、构图、角度、服装、背景等视觉变化，必须视为图片编辑任务，execution.action 使用 edit_image，并携带对应 referenceIds。",
        "用户说“帮我把这张图...”“改图”“修图”“换一个姿势”“改为全身图”等，不是在请求你输出提示词文字，而是在请求直接执行图片编辑。",
        "如果用户明确列出多个姿势词，例如坐着、站着、跪着、半身、全身、回眸、侧身，每个姿势词都必须成为一个独立任务，禁止遗漏。",
        "如果用户基于参考图片要求生成其他场景、不同场景或每个场景一张，优先拆成中性日常场景任务；不要自动加入躺姿、跪姿、暴露服装或暧昧姿态。",
        "可用角色包括：创意总监、提示词工程师、摄影导演、UI 设计师、品牌视觉设计师、风格分析师、元素拆分师、图片编辑师。根据任务选择角色，角色名要短。",
        "输出纯 JSON，不要 markdown，不要解释。strategy 只能是 single 或 multi。",
        "每个任务必须包含 execution 对象，execution 是最终给图片接口识别的结构化 JSON，不要只给自然语言。任务 count 必须和 execution.output.count 一致。",
        "execution.objective 只能描述当前子任务，不要复制完整多任务原句；如果当前任务是坐姿，就不要在 objective 里再出现站姿、跪姿等其他子任务。",
        "execution 不要要求输出正文、Markdown、提示词说明或可用图片任务，只描述要生成或编辑出来的最终图片。",
        "execution 建议字段：action、role、objective、subject、scene、style、composition、details、output、constraints、negative_prompt、references、referenceIds。",
        "格式：{\"intent\":\"用户意图短句\",\"strategy\":\"single\",\"tasks\":[{\"title\":\"短标题\",\"role\":\"执行角色\",\"count\":1,\"referenceIds\":[\"参考节点id\"],\"execution\":{\"action\":\"generate_image\",\"objective\":\"...\",\"subject\":\"...\",\"style\":\"...\",\"output\":{\"format\":\"single_image\",\"count\":1},\"constraints\":[\"...\"],\"referenceIds\":[\"参考节点id\"]}}]}",
        `任务数量${requestedCount > 1 ? `优先为 ${requestedCount} 个` : pageTasks.length > 1 ? `优先为 ${pageTasks.length} 个` : "由用户意图决定；单一交付物只输出 1 个任务，多交付物最多 6 个"}，避免重复。`,
        `当前画布默认生成张数：${readConfigCount(config.count)}。如果用户没有要求多交付物，可用单任务 count 表示同一交付物的多个候选；如果是多交付物，拆成多个任务且每个任务 count=1。`,
        `本轮用户要求：${userRequest}`,
        `完整生图提示词：${imagePrompt}`,
        `参考节点：${references.map((item, index) => `${index + 1}. id=${item.id} title=${item.title}`).join("；")}`,
        "如果任务需要引用参考图，referenceIds 必须使用上面给出的参考节点 id，不要使用序号或自造 id。",
    ].join("\n\n");
    const content: ChatCompletionMessage["content"] = [
        { type: "text", text: prompt },
        ...(await Promise.all(referenceImages.slice(0, 4).map(async (item) => ({ type: "image_url" as const, image_url: { url: await imageToDataUrl(item) } })))),
    ];
    try {
        const response = await requestImageQuestion({ ...config, model: config.textModel || config.model, count: "1", systemPrompt: "" }, [{ role: "user", content }], () => undefined);
        return normalizeImageTaskPlan(parseImageTaskPlan(response), imagePrompt, userRequest, references);
    } catch {
        return fallbackImageTaskPlan(imagePrompt, userRequest, references);
    }
}

function parseImageTaskPlan(response: string): ImageTaskPlan {
    try {
        const cleaned = response
            .trim()
            .replace(/^```(?:json)?/i, "")
            .replace(/```$/i, "")
            .trim();
        const payload = JSON.parse(cleaned) as { intent?: unknown; strategy?: unknown; tasks?: Array<{ title?: unknown; role?: unknown; prompt?: unknown; count?: unknown; execution?: unknown; referenceIds?: unknown; reference_ids?: unknown }> };
        const tasks =
            payload.tasks
                ?.map((item, index) => {
                    const title = typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, 32) : `拆分图片 ${index + 1}`;
                    const role = typeof item.role === "string" && item.role.trim() ? item.role.trim().slice(0, 18) : "提示词工程师";
                    const count = normalizeTaskCountValue(item.count) || readExecutionCount(item.execution);
                    return {
                        title,
                        role,
                        prompt: readExecutionPrompt(item.execution, typeof item.prompt === "string" ? item.prompt.trim() : "", { title, role, count }),
                        count,
                        referenceIds: normalizeReferenceIds(item.referenceIds || item.reference_ids) || readExecutionReferenceIds(item.execution),
                    };
                })
                .filter((item) => item.prompt)
                .slice(0, 6) || [];
        if (tasks.length) return { intent: typeof payload.intent === "string" && payload.intent.trim() ? payload.intent.trim().slice(0, 30) : "图片任务", strategy: payload.strategy === "multi" ? "multi" : "single", tasks };
    } catch {
        return { intent: "", strategy: "single", tasks: [] };
    }
    return { intent: "", strategy: "single", tasks: [] };
}

function normalizeImageTaskPlan(plan: ImageTaskPlan, imagePrompt: string, userRequest: string, references: CanvasAssistantReference[]): ImageTaskPlan {
    const fallback = fallbackImageTaskPlan(imagePrompt, userRequest, references);
    if (isReferenceCompositionTask(`${userRequest}\n${imagePrompt}`, references)) return fallback;
    const wantsMulti = plan.strategy === "multi" || fallback.strategy === "multi" || plan.tasks.length > 1;
    const combined = `${userRequest}\n${imagePrompt}`;
    const count = wantsMulti ? Math.min(6, Math.max(2, plan.tasks.length, fallback.tasks.length, extractRequestedTaskCount(combined) || 0)) : 1;
    const useFocusedFallbackPrompts = isPerReferenceImageTask(combined, references) || shouldPlanReferenceScenes(combined, references) || extractUiPageTasks(combined).length > 1 || extractExplicitPoseTasks(combined).length > 1;
    const action = resolveImageAction(userRequest, references);
    const normalized: SplitImageTask[] = plan.tasks.slice(0, count).map((task, index) => {
        const focusedFallback = useFocusedFallbackPrompts ? fallback.tasks[index] : undefined;
        const title = focusedFallback?.title || task.title || fallback.tasks[index]?.title || `图片 ${index + 1}`;
        const role = focusedFallback?.role || task.role || fallback.tasks[index]?.role || "提示词工程师";
        const taskCount = wantsMulti ? 1 : normalizeTaskCountValue(task.count) || fallback.tasks[index]?.count;
        const prompt = focusedFallback?.prompt || task.prompt || fallback.tasks[index]?.prompt || imagePrompt;
        const normalizedPrompt = enforceSingleImagePrompt(prompt, {
            action,
            title,
            role,
            count: taskCount || 1,
        });
        return {
            title,
            role,
            count: taskCount,
            referenceIds: focusedFallback?.referenceIds || task.referenceIds || fallback.tasks[index]?.referenceIds,
            prompt: enforceReferenceConsistencyPrompt(normalizedPrompt, combined, references),
        };
    });
    while (normalized.length < count) normalized.push(fallback.tasks[normalized.length] || fallbackImageTask(imagePrompt, normalized.length));
    const strategy = normalized.length > 1 ? "multi" : "single";
    return { intent: plan.intent || fallback.intent, strategy, tasks: normalized };
}

function fallbackImageTaskPlan(imagePrompt: string, userRequest: string, references: CanvasAssistantReference[] = []): ImageTaskPlan {
    const combined = `${userRequest}\n${imagePrompt}`;
    const action = resolveImageAction(userRequest, references);
    const imageReferences = references.filter(hasImageReference);
    if (isReferenceCompositionTask(combined, references)) {
        return {
            intent: "多参考图合成",
            strategy: "single",
            tasks: [
                {
                    title: "参考图合成",
                    role: "图片合成师",
                    count: extractRequestedTaskCount(combined) || 1,
                    referenceIds: imageReferences.map((item) => item.id),
                    prompt: buildFocusedImagePrompt(imagePrompt, {
                        action: "edit_image",
                        title: "参考图合成",
                        role: "图片合成师",
                        focus: "多参考图合成一张图",
                        objective: `${cleanImagePromptForTask(imagePrompt)}。请同时理解并使用全部选中参考图片，把它们按用户要求融合到同一张独立成品图中。`,
                        constraints: ["必须同时参考所有选中图片", "输出一张完整图片", "不要拆成多个任务", "不要逐张分别生成", "不要多宫格，除非用户明确要求拼贴版式"],
                    }),
                },
            ],
        };
    }
    if (isPerReferenceImageTask(combined, references) && imageReferences.length > 1) {
        const count = Math.min(6, imageReferences.length);
        return {
            intent: "多参考图逐张处理",
            strategy: "multi",
            tasks: imageReferences.slice(0, count).map((reference, index) => ({
                title: `图片${index + 1}处理`,
                role: "图片编辑师",
                count: 1,
                referenceIds: [reference.id],
                prompt: buildFocusedImagePrompt(imagePrompt, {
                    action: "edit_image",
                    title: `图片${index + 1}处理`,
                    role: "图片编辑师",
                    focus: `只处理第 ${index + 1} 张参考图`,
                    objective: `${cleanImagePromptForTask(imagePrompt)}。只针对第 ${index + 1} 张参考图生成对应结果，不要把其他参考图合成进来。`,
                    constraints: [`只使用第 ${index + 1} 张参考图作为主体参考`, "每个参考图单独输出一张", "不要合成多张参考图", "不要多宫格"],
                }),
            })),
        };
    }
    const pages = extractUiPageTasks(combined);
    const referenceScenes = extractReferenceSceneTasks(combined, references);
    const explicitPoseTasks = extractExplicitPoseTasks(combined);
    if (pages.length > 1) {
        return {
            intent: "多页面 UI 设计",
            strategy: "multi",
            tasks: pages.slice(0, 6).map((title) => ({
                title,
                role: "UI 设计师",
                count: 1,
                prompt: buildFocusedImagePrompt(imagePrompt, {
                    action,
                    title,
                    role: "UI 设计师",
                    focus: title,
                    objective: `${cleanImagePromptForTask(imagePrompt)}，只生成“${title}”这一页的完整 UI 设计图。`,
                    constraints: ["页面结构、组件状态、视觉风格和内容密度要完整", "不要包含其他页面", "不要拼接多个页面"],
                }),
            })),
        };
    }
    if (referenceScenes.length > 1) {
        return {
            intent: "参考图多场景写真",
            strategy: "multi",
            tasks: referenceScenes.slice(0, 6).map((title, index) => ({
                title,
                role: "图片编辑师",
                count: 1,
                prompt: buildFocusedImagePrompt(imagePrompt, {
                    action,
                    title,
                    role: "图片编辑师",
                    focus: title,
                    objective: `${cleanImagePromptForTask(imagePrompt)}，以选中的参考图片为准保持人物、服装和画风一致，只生成第 ${index + 1} 张：${title}场景下的独立角色形象图。`,
                    constraints: ["必须保持参考图人物脸型、发色、服装和整体画风一致", `场景必须是${title}`, "自然站姿或自然坐姿", "中性日常构图", "不要包含躺姿、跪姿、暧昧姿态或暴露服装", "不要拼图、分镜或多宫格"],
                }),
            })),
        };
    }
    if (explicitPoseTasks.length > 1) {
        return {
            intent: "多姿势写真",
            strategy: "multi",
            tasks: explicitPoseTasks.slice(0, 6).map((title, index) => ({
                title: `${title}写真`,
                role: "摄影导演",
                count: 1,
                prompt: buildFocusedImagePrompt(imagePrompt, {
                    action,
                    title: `${title}写真`,
                    role: "摄影导演",
                    focus: title,
                    objective: `${cleanImagePromptForTask(imagePrompt)}，只生成第 ${index + 1} 张写真，人物姿势必须是${title}。`,
                    constraints: [`姿势必须是${title}`, "只保留一个主体人物", "不要包含其他姿势", "不要拼图、分镜或多宫格"],
                }),
            })),
        };
    }
    const requestedCount = extractRequestedTaskCount(combined);
    const count = Math.min(6, Math.max(2, requestedCount || 3));
    if (requestedCount > 1 && /(姿势|动作|角度|写真|pose)/i.test(combined)) {
        const poseTitles = ["正面站姿", "侧身半身", "动态回眸", "坐姿构图", "近景特写", "全身动作"];
        return {
            intent: "多姿势写真",
            strategy: "multi",
            tasks: Array.from({ length: count }, (_, index) => ({
                title: poseTitles[index] || `姿势 ${index + 1}`,
                role: "摄影导演",
                count: 1,
                prompt: buildFocusedImagePrompt(imagePrompt, {
                    action,
                    title: poseTitles[index] || `姿势 ${index + 1}`,
                    role: "摄影导演",
                    focus: poseTitles[index] || `不同姿势 ${index + 1}`,
                    objective: `${cleanImagePromptForTask(imagePrompt)}，只生成第 ${index + 1} 张写真：${poseTitles[index] || `不同姿势 ${index + 1}`}。`,
                    constraints: ["只保留一个主体人物", "一个明确姿势", "不要拼图、分镜或多宫格"],
                }),
            })),
        };
    }
    if (shouldPlanImageTasks(userRequest, references, imagePrompt)) return { intent: "多图独立方案", strategy: "multi", tasks: Array.from({ length: count }, (_, index) => fallbackImageTask(imagePrompt, index, action)) };
    return { intent: "图片生成", strategy: "single", tasks: [{ title: "图片生成", role: "提示词工程师", count: extractRequestedTaskCount(combined) || undefined, prompt: enforceSingleImagePrompt(imagePrompt, { action, title: "图片生成", role: "提示词工程师", count: extractRequestedTaskCount(combined) || 1 }) }] };
}

function fallbackImageTask(imagePrompt: string, index: number, action = "generate_image"): SplitImageTask {
    return {
        title: `图片 ${index + 1}`,
        role: index === 0 ? "创意总监" : "提示词工程师",
        count: 1,
        prompt: buildFocusedImagePrompt(imagePrompt, {
            action,
            title: `图片 ${index + 1}`,
            role: index === 0 ? "创意总监" : "提示词工程师",
            focus: `独立方案 ${index + 1}`,
            objective: `${cleanImagePromptForTask(imagePrompt)}，只生成第 ${index + 1} 张独立图片，作为同一需求下的一个独立方案。`,
            constraints: ["这一张图片需要有独立完整构图", "不要和其他方案拼成一张图"],
        }),
    };
}

function buildFocusedImagePrompt(
    imagePrompt: string,
    options: { action: string; title: string; role: string; objective: string; focus: string; constraints?: string[]; count?: number },
) {
    return enforceSingleImagePrompt(
        JSON.stringify({
            action: options.action,
            role: options.role,
            title: options.title,
            objective: options.objective,
            focus: options.focus,
            source_brief: cleanImagePromptForTask(imagePrompt),
            output: { format: "single_image", count: options.count || 1 },
            constraints: options.constraints || [],
        }),
        { action: options.action, title: options.title, role: options.role, count: options.count || 1 },
    );
}

function cleanImagePromptForTask(prompt: string) {
    const cleaned = prompt
        .replace(/补充要求[:：]?/g, "")
        .replace(/(\d+|[一二两三四五六七八九十])\s*(?:-|~|到|至)\s*(\d+|[一二两三四五六七八九十])\s*(?:张|个|套|页|页面|界面|屏|款|版|种)/g, "")
        .replace(/(?:，|,|、|\s)*(坐着|坐姿|坐下|坐在|站着|站姿|站立|站在|跪着|跪姿|跪坐|单膝跪)(?:，|,|、|\s*)*/g, "，")
        .replace(/每个(?:姿势|动作|角度|页面|界面|场景|方案)?一张(?:图|图片)?/g, "")
        .replace(/至少\s*(\d+|[一二两三四五六七八九十])\s*张/g, "")
        .replace(/[，,、。\s]+$/g, "")
        .replace(/^[，,、。\s]+/g, "")
        .replace(/[，,、]{2,}/g, "，")
        .trim();
    return cleaned || prompt.trim();
}

function enforceSingleImagePrompt(prompt: string, context: { action?: string; title?: string; role?: string; count?: number } = {}) {
    const parsed = parseJsonObject(prompt);
    const parsedOutput = isRecord(parsed?.output) ? parsed.output : {};
    const basePrompt = typeof parsed?.prompt === "string" ? parsed.prompt : typeof parsed?.objective === "string" ? parsed.objective : prompt.trim();
    const count = context.count || normalizeTaskCountValue(parsedOutput.count) || 1;
    const allowsComposition = hasSingleCompositionIntent(`${context.title || ""}\n${basePrompt}\n${normalizeStringList(parsed?.constraints).join("\n")}`);
    return JSON.stringify(
        {
            ...(parsed || {}),
            action: context.action || (typeof parsed?.action === "string" ? parsed.action : "generate_image"),
            role: context.role || (typeof parsed?.role === "string" ? parsed.role : "提示词工程师"),
            title: context.title || (typeof parsed?.title === "string" ? parsed.title : "图片生成"),
            objective: basePrompt,
            output: {
                ...parsedOutput,
                format: "single_image",
                count,
            },
            constraints: uniqueStrings([
                ...normalizeStringList(parsed?.constraints),
                "只生成这一张独立图片",
                ...(allowsComposition ? ["多个参考图要形成同一张最终成品图", "不要拆成多个输出结果"] : ["不要拼图", "不要多宫格", "不要把多个页面、多个姿势或多张图放在同一张图里"]),
            ]),
        },
        null,
        2,
    );
}

function enforceReferenceConsistencyPrompt(prompt: string, sourceText: string, references: CanvasAssistantReference[]) {
    if (!references.some(hasImageReference)) return prompt;
    const parsed = parseJsonObject(prompt);
    if (!parsed) return prompt;
    const subject = extractNamedSubject(sourceText);
    const sanitized = (subject ? sanitizePromptSubject(parsed, subject) : parsed) as Record<string, unknown>;
    return JSON.stringify(
        {
            ...sanitized,
            action: "edit_image",
            ...(subject ? { subject } : {}),
            reference_policy: "以选中的参考图片为准保持人物脸型、发色、服装和整体画风一致，只更换子任务要求的场景、构图或动作。",
            constraints: uniqueStrings([
                ...normalizeStringList(sanitized.constraints),
                "必须参考选中图片理解人物和服装",
                "保持参考图人物脸型、发色、服装、配饰和整体画风一致",
                "不要替换成其他角色",
                "不要改变服装主设计",
            ]),
        },
        null,
        2,
    );
}

function extractReferenceSceneTasks(text: string, references: CanvasAssistantReference[]) {
    if (!shouldPlanReferenceScenes(text, references)) return [];
    const requestedCount = extractRequestedTaskCount(text);
    const sceneTitles = ["海边甲板", "城市街头", "咖啡馆", "花园", "夜景天台", "明亮工作室"];
    const count = Math.min(6, Math.max(3, requestedCount || 3));
    return sceneTitles.slice(0, count);
}

function shouldPlanReferenceScenes(text: string, references: CanvasAssistantReference[]) {
    if (!references.some(hasImageReference)) return false;
    return /(其他|不同|多个|每个|每张|各自|单独).{0,16}(场景|环境|地点|背景)|(场景|环境|地点|背景).{0,16}(其他|不同|多个|每个|每张|各自|单独)/i.test(text);
}

function extractNamedSubject(text: string) {
    if (/娜美|Nami/i.test(text)) return "海贼王娜美";
    if (/雏田|Hinata/i.test(text)) return "火影忍者雏田";
    const match = text.match(/(?:保持|生成|创建|绘制|制作|理解这张)?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9·（）() ]{1,20}?)(?:角色|人物|写真|照片|形象)/);
    return match?.[1]?.replace(/^(一个|一位|这张|这个|该)/, "").trim().slice(0, 30) || "";
}

function sanitizePromptSubject(value: unknown, subject: string): unknown {
    if (typeof value === "string") return value.replace(/Nico Robin from One Piece|Nico Robin|妮可[·・]?罗宾|罗宾/g, subject);
    if (Array.isArray(value)) return value.map((item) => sanitizePromptSubject(item, subject));
    if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizePromptSubject(item, subject)]));
    return value;
}

function resolveImageAction(text: string, references: CanvasAssistantReference[]) {
    if (isReferenceElementSplitTask(text, references)) return "extract_elements_to_images";
    if (wantsImageEdit(text, references)) return "edit_image";
    if (references.some(hasImageReference) && /(分析|总结|提炼|归纳|风格|规范|设计系统|design system)/i.test(text)) return "analyze_reference_and_generate_image";
    return "generate_image";
}

function extractUiPageTasks(text: string) {
    const pages = new Set<string>();
    ["首页", "主页", "商品详情页", "详情页", "列表页", "分类页", "购物车页", "结算页", "支付页", "登录页", "注册页", "个人中心页", "会员页", "订单页", "后台页", "仪表盘", "设置页"].forEach((page) => {
        if (text.includes(page)) pages.add(page);
    });
    const pagePattern = /([\u4e00-\u9fa5A-Za-z0-9]{1,12}(?:页面|界面))/g;
    for (const match of text.matchAll(pagePattern)) {
        const title = match[1]
            .replace(/^(做|生成|创建|设计|一个|一张|和|以及|还有|、|，|,)+/, "")
            .trim();
        if (title.length >= 2) pages.add(title);
    }
    return Array.from(pages).slice(0, 6);
}

function extractExplicitPoseTasks(text: string) {
    const matchers = [
        { title: "坐姿", pattern: /(坐着|坐姿|坐下|坐在)/g },
        { title: "站姿", pattern: /(站着|站姿|站立|站在)/g },
        { title: "跪姿", pattern: /(跪着|跪姿|跪坐|单膝跪)/g },
        { title: "侧身", pattern: /(侧身|侧面|侧脸)/g },
        { title: "回眸", pattern: /(回眸|回头|转身看)/g },
        { title: "半身", pattern: /(半身|半身像|上半身)/g },
        { title: "全身", pattern: /(全身|全身照|全景全身)/g },
        { title: "特写", pattern: /(特写|近景|脸部特写)/g },
    ];
    const matches: Array<{ index: number; title: string }> = [];
    for (const matcher of matchers) {
        matcher.pattern.lastIndex = 0;
        for (const match of text.matchAll(matcher.pattern)) {
            matches.push({ index: match.index || 0, title: matcher.title });
        }
    }
    const seen = new Set<string>();
    return matches
        .sort((a, b) => a.index - b.index)
        .flatMap((item) => {
            if (seen.has(item.title)) return [];
            seen.add(item.title);
            return [item.title];
        })
        .slice(0, 6);
}

function extractRequestedTaskCount(text: string) {
    const range = text.match(/(\d+|[二两三四五六七八九十])\s*(?:-|~|到|至)\s*(\d+|[二两三四五六七八九十])\s*(?:张|个|套|页|页面|界面|屏|款|版|种)/);
    if (range) return normalizeCountWord(range[2]);
    const single = text.match(/(\d+|[一二两三四五六七八九十])\s*(?:张|个|套|页|页面|界面|屏|款|版|种)/);
    return single ? normalizeCountWord(single[1]) : 0;
}

function normalizeCountWord(value: string) {
    const map: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const count = Number(value) || map[value] || 0;
    return Math.max(0, Math.min(6, count));
}

function readConfigCount(count: string) {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(count)) || 1)));
}

function resolveTaskCount(task: SplitImageTask, fallback: number) {
    return normalizeTaskCountValue(task.count) || Math.max(1, Math.min(15, fallback));
}

async function requestTaskImagesWithRetry(config: AiConfig, prompt: string, referenceImages: ReferenceImage[]) {
    let lastError: unknown;
    let currentPrompt = prompt;
    let safetyRewriteUsed = false;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
            return referenceImages.length ? await requestEdit(config, currentPrompt, referenceImages) : await requestGeneration(config, currentPrompt);
        } catch (error) {
            lastError = error;
            if (!safetyRewriteUsed && shouldRewriteUnsafeImageTask(error)) {
                currentPrompt = buildSafeImageRetryPrompt(currentPrompt, Boolean(referenceImages.length));
                safetyRewriteUsed = true;
                await delay(1200);
                continue;
            }
            if (attempt === 4 || !shouldRetryImageTaskError(error)) break;
            await delay(1800 * attempt);
        }
    }
    throw lastError;
}

function shouldRetryImageTaskError(error: unknown) {
    const message = readErrorMessage(error);
    return /(try again later|upstream|502|503|504|bad gateway|timeout|timed out|network|failed to fetch|请求失败：5)/i.test(message);
}

function shouldRewriteUnsafeImageTask(error: unknown) {
    return /(content_policy|policy|safety|violation|unsafe|blocked|内容策略|安全|违规|拒绝)/i.test(readErrorMessage(error));
}

function buildSafeImageRetryPrompt(prompt: string, hasReferences: boolean) {
    const parsed = parseJsonObject(prompt);
    if (parsed) {
        const rewritten = sanitizeUnsafePromptValue(parsed) as Record<string, unknown>;
        return JSON.stringify(
            {
                ...rewritten,
                action: hasReferences ? "edit_image" : typeof rewritten.action === "string" ? rewritten.action : "generate_image",
                safety_retry: true,
                style: typeof rewritten.style === "string" ? rewritten.style : "中性日常角色形象图，清晰、自然、非挑逗",
                composition: "单人自然站姿或自然坐姿，完整独立构图，避免敏感姿态",
                constraints: uniqueStrings([
                    ...normalizeStringList(rewritten.constraints),
                    "中性日常场景",
                    "自然站姿或自然坐姿",
                    "服装完整不暴露",
                    "不要躺姿、跪姿、暧昧姿态或挑逗构图",
                    ...(hasReferences ? ["保持参考图人物、服装和整体画风一致，只更换安全场景"] : []),
                ]),
                negative_prompt: uniqueStrings([...normalizeStringList(rewritten.negative_prompt), "性感", "暴露", "内衣", "泳装", "低胸", "挑逗", "躺姿", "跪姿", "暧昧姿态"]),
            },
            null,
            2,
        );
    }
    return [
        sanitizeUnsafePromptText(prompt),
        "",
        "安全重试要求：生成中性日常角色形象图；单人自然站姿或自然坐姿；服装完整不暴露；不要躺姿、跪姿、暧昧姿态、挑逗构图或多宫格。",
        hasReferences ? "必须保持参考图人物脸型、发色、服装和整体画风一致，只更换安全场景。" : "",
    ]
        .filter(Boolean)
        .join("\n");
}

function sanitizeUnsafePromptValue(value: unknown): unknown {
    if (typeof value === "string") return sanitizeUnsafePromptText(value);
    if (Array.isArray(value)) return value.map(sanitizeUnsafePromptValue);
    if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeUnsafePromptValue(item)]));
    return value;
}

function sanitizeUnsafePromptText(value: string) {
    return value
        .replace(/写真/g, "角色形象图")
        .replace(/(躺姿|侧躺|跪姿|跪着|跪坐|单膝跪|双腿跪地|腿自然交叠|撩人|性感|妩媚|挑逗|暴露|低胸|内衣|泳装)/g, "自然站姿")
        .replace(/私密|暧昧/g, "日常")
        .trim();
}

function delay(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeTaskCountValue(value: unknown) {
    const count = Math.floor(Math.abs(Number(value)) || 0);
    return count ? Math.max(1, Math.min(15, count)) : undefined;
}

function readExecutionPrompt(execution: unknown, fallback: string, context: { title?: string; role?: string; count?: number } = {}) {
    if (isRecord(execution)) return enforceSingleImagePrompt(JSON.stringify(execution), context);
    return fallback;
}

function readExecutionCount(execution: unknown) {
    if (!isRecord(execution)) return undefined;
    const output = isRecord(execution.output) ? execution.output : {};
    return normalizeTaskCountValue(output.count);
}

function readExecutionReferenceIds(execution: unknown) {
    if (!isRecord(execution)) return undefined;
    return normalizeReferenceIds(execution.referenceIds || execution.reference_ids);
}

function normalizeReferenceIds(value: unknown) {
    const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,，、\s]+/) : [];
    const ids = source.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
    return ids.length ? uniqueStrings(ids).slice(0, 6) : undefined;
}

function selectTaskReferenceImages(task: SplitImageTask, referenceImages: ReferenceImage[]) {
    if (!task.referenceIds?.length) return referenceImages;
    const selected = task.referenceIds.map((id) => referenceImages.find((item) => item.id === id)).filter((item): item is ReferenceImage => Boolean(item));
    return selected.length ? selected : referenceImages;
}

function parseJsonObject(value: string) {
    try {
        const parsed = JSON.parse(value);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeStringList(value: unknown) {
    if (Array.isArray(value)) return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
    return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function readErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "请求失败";
}

async function buildChatMessages(messages: CanvasAssistantMessage[], memory?: CanvasAssistantMemory | string): Promise<ChatCompletionMessage[]> {
    const chatMessages = await Promise.all(
        messages.map(async (message, index): Promise<ChatCompletionMessage> => {
            if (message.role === "assistant") return { role: "assistant", content: message.text };
            if (index !== messages.length - 1) return { role: "user", content: message.text };
            const refs = message.references || [];
            return {
                role: "user",
                content: [
                    ...refs.flatMap((item) => (item.text ? [{ type: "text" as const, text: item.text }] : [])),
                    { type: "text", text: message.text },
                    ...(await Promise.all(refs.filter(hasImageReference).map(async (item) => ({ type: "image_url" as const, image_url: { url: await imageToDataUrl(item) } })))),
                ],
            };
        }),
    );
    const normalizedMemory = normalizeStoredMemory(memory);
    const systemContent = [
        "你是画布助手。默认使用中文，回答要直接、简洁、可执行。",
        "只有用户明确要求生成、编辑、拆分图片时，才输出图片任务相关内容；普通问题只按文字对话回答。",
        normalizedMemory ? formatMemoryForPrompt(normalizedMemory) : "",
    ]
        .filter(Boolean)
        .join("\n\n");
    return [{ role: "system", content: systemContent }, ...chatMessages];
}

function createSession(): CanvasAssistantSession {
    const now = new Date().toISOString();
    return { id: nanoid(), title: "新对话", messages: [], createdAt: now, updatedAt: now };
}

function buildFallbackMemory(memory: CanvasAssistantMemory | string | undefined, userMessage: CanvasAssistantMessage, answer: string): CanvasAssistantMemory {
    const normalizedMemory = normalizeStoredMemory(memory);
    const now = new Date().toISOString();
    const refs = userMessage.references?.map((item) => item.title).filter(Boolean) || [];
    const userText = userMessage.text.replace(/\s+/g, " ").trim().slice(0, 120);
    const answerText = answer.replace(/\s+/g, " ").trim().slice(0, 120);
    const turnSummary = `用户问：${userText}${refs.length ? `；引用：${refs.join("、")}` : ""}；回答要点：${answerText}`;
    return {
        summary: [normalizedMemory?.summary, turnSummary].filter(Boolean).join("\n").slice(-900),
        preferences: (normalizedMemory?.preferences || []).slice(-6),
        facts: [...(normalizedMemory?.facts || []), ...refs.map((item) => `本会话引用过画布节点：${item}`)].slice(-8),
        openQuestions: (normalizedMemory?.openQuestions || []).slice(-4),
        updatedAt: now,
        turns: (normalizedMemory?.turns || 0) + 1,
    };
}

function shouldRememberTurn(userMessage: CanvasAssistantMessage, answer: string) {
    const text = userMessage.text.trim();
    if (userMessage.references?.length) return true;
    if (text.length < 12 && /^(你是谁|你是谁呀|hello|hi|你好|在吗|谢谢|ok|好的)$/i.test(text)) return false;
    return answer.trim().length >= 20;
}

function shouldCompressMemory(memory: CanvasAssistantMemory | string | undefined, userMessage: CanvasAssistantMessage) {
    const normalizedMemory = normalizeStoredMemory(memory);
    if (userMessage.references?.length) return true;
    if (!normalizedMemory) return false;
    return normalizedMemory.turns > 0 && normalizedMemory.turns % 4 === 0;
}

async function summarizeSessionMemory(config: AiConfig, memory: CanvasAssistantMemory | string | undefined, recentMessages: CanvasAssistantMessage[], answer: string): Promise<CanvasAssistantMemory> {
    const normalizedMemory = normalizeStoredMemory(memory);
    const fallback = buildFallbackMemory(memory, recentMessages[recentMessages.length - 1], answer);
    const prompt = [
        "请把当前画布助手会话记忆压缩成稳定、短小、可长期使用的 JSON。",
        "只保留会影响后续回答的用户目标、偏好、事实、画布上下文和未解决问题；删除寒暄、一次性细节和重复内容。",
        "输出必须是纯 JSON，不要 markdown，不要解释。",
        "JSON 结构：{\"summary\":\"不超过180字\",\"preferences\":[\"每条不超过40字\"],\"facts\":[\"每条不超过50字\"],\"openQuestions\":[\"每条不超过50字\"]}",
        `旧记忆：${JSON.stringify(normalizedMemory || null)}`,
        `最近对话：${JSON.stringify(recentMessages.map((message) => ({ role: message.role, mode: message.mode, text: message.text, references: message.references?.map((item) => item.title) || [] })).slice(-6))}`,
        `最新回答：${answer}`,
    ].join("\n\n");
    const response = await requestImageQuestion({ ...config, systemPrompt: "" }, [{ role: "user", content: prompt }], () => undefined);
    return normalizeMemory(response, fallback);
}

function normalizeMemory(response: string, fallback: CanvasAssistantMemory): CanvasAssistantMemory {
    try {
        const cleaned = response
            .trim()
            .replace(/^```(?:json)?/i, "")
            .replace(/```$/i, "")
            .trim();
        const parsed = JSON.parse(cleaned) as Partial<CanvasAssistantMemory>;
        return {
            summary: normalizeMemoryText(parsed.summary, fallback.summary, 260),
            preferences: normalizeMemoryList(parsed.preferences, fallback.preferences, 6, 60),
            facts: normalizeMemoryList(parsed.facts, fallback.facts, 8, 70),
            openQuestions: normalizeMemoryList(parsed.openQuestions, fallback.openQuestions, 4, 70),
            updatedAt: new Date().toISOString(),
            turns: fallback.turns,
        };
    } catch {
        return fallback;
    }
}

function normalizeMemoryText(value: unknown, fallback: string, maxLength: number) {
    const text = typeof value === "string" ? value : fallback;
    return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeMemoryList(value: unknown, fallback: string[], maxItems: number, maxLength: number) {
    const source = Array.isArray(value) ? value : fallback;
    return Array.from(new Set(source.map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim().slice(0, maxLength) : "")).filter(Boolean))).slice(0, maxItems);
}

function formatMemoryForPrompt(memory: CanvasAssistantMemory) {
    return [
        "当前画布助手会话记忆，回答时优先遵循这些稳定上下文：",
        memory.summary ? `摘要：${memory.summary}` : "",
        memory.preferences.length ? `用户偏好：${memory.preferences.join("；")}` : "",
        memory.facts.length ? `已知事实：${memory.facts.join("；")}` : "",
        memory.openQuestions.length ? `未解决问题：${memory.openQuestions.join("；")}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}

function normalizeStoredMemory(memory: CanvasAssistantMemory | string | undefined): CanvasAssistantMemory | null {
    if (!memory) return null;
    if (typeof memory === "string") {
        const summary = memory.replace(/\s+/g, " ").trim().slice(0, 260);
        return summary ? { summary, preferences: [], facts: [], openQuestions: [], updatedAt: "", turns: 1 } : null;
    }
    return {
        summary: normalizeMemoryText(memory.summary, "", 260),
        preferences: normalizeMemoryList(memory.preferences, [], 6, 60),
        facts: normalizeMemoryList(memory.facts, [], 8, 70),
        openQuestions: normalizeMemoryList(memory.openQuestions, [], 4, 70),
        updatedAt: memory.updatedAt || "",
        turns: memory.turns || 1,
    };
}

function readMemoryTurns(memory: CanvasAssistantMemory | string) {
    return normalizeStoredMemory(memory)?.turns || 1;
}

function assistantSessionsSignature(sessions: CanvasAssistantSession[], activeSessionId: string | null) {
    return `${activeSessionId || ""}:${sessions.map((session) => `${session.id}:${session.updatedAt}:${session.messages.length}:${session.archivedAt || ""}`).join("|")}`;
}

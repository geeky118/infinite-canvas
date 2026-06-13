"use client";

import { ArrowRight, ImagePlus, Layers3, Sparkles, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { App, Button, Tag } from "antd";

import { PromptDetailDialog } from "@/components/prompts/prompt-detail-dialog";
import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { navigationTools } from "@/constant/navigation-tools";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { promptImageUrl, usePromptFallbackImage } from "@/components/prompts/prompt-image";

export default function IndexPage() {
    const { message } = App.useApp();
    const [primaryTool] = navigationTools;
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const copyText = useCopyText();

    useEffect(() => {
        void fetchPrompts({ pageSize: 12 })
            .then((data) => setPromptShowcase(sortPromptsWithImagesFirst(data.items)))
            .catch((error) => message.error(error instanceof Error ? error.message : "获取提示词失败"));
    }, [message]);

    return (
        <main className="brand-app-bg relative h-full overflow-y-auto text-slate-950 dark:text-sky-50">
            <section className="brand-grid-bg relative mx-auto min-h-[calc(100vh-4rem)] max-w-7xl overflow-hidden px-6">
                <div className="relative grid min-h-[640px] items-center gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_420px]">
                    <div className="max-w-4xl">
                        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/[0.72] px-3 py-1.5 text-sm font-medium text-blue-700 shadow-sm backdrop-blur dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
                            <Sparkles className="size-4" />
                            AI 创作工作流
                        </div>
                        <h1 className="ai-title-aurora max-w-5xl text-balance text-5xl font-semibold tracking-normal sm:text-7xl lg:text-8xl">无限画布</h1>
                        <p className="mt-8 max-w-3xl text-balance text-lg leading-8 text-slate-600 dark:text-sky-100/[0.72]">从提示词、参考图、生成结果到素材沉淀，集中在一张连续画布里完成创意推演。</p>
                        <div className="mt-10 flex flex-wrap items-center gap-3">
                            <Button type="primary" size="large" href={`/${primaryTool.slug}`} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                                进入画布
                            </Button>
                            <Button size="large" href="/image">
                                生图工作台
                            </Button>
                        </div>
                        <div className="mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
                            {[
                                { icon: Layers3, label: "画布编排", value: "节点化" },
                                { icon: ImagePlus, label: "图像生成", value: "多参考" },
                                { icon: Video, label: "视频创作", value: "可沉淀" },
                            ].map((item) => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.label} className="brand-panel rounded-lg px-4 py-3">
                                        <Icon className="mb-3 size-5 text-blue-600 dark:text-sky-300" />
                                        <div className="text-sm font-semibold text-slate-950 dark:text-sky-50">{item.label}</div>
                                        <div className="mt-1 text-xs text-slate-500 dark:text-sky-100/[0.58]">{item.value}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="brand-panel relative hidden overflow-hidden rounded-2xl p-5 lg:block">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600" />
                        <div className="mb-5 flex items-center gap-3">
                            <img src="/logo-icon.png" alt="" className="size-14 rounded-xl shadow-[0_14px_30px_rgba(10,132,255,0.3)]" />
                            <div>
                                <div className="text-base font-semibold text-slate-950 dark:text-sky-50">创作看板</div>
                                <div className="text-sm text-slate-500 dark:text-sky-100/60">从灵感到成片</div>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {["输入提示词", "连接参考图", "生成多版本", "保存到素材"].map((item, index) => (
                                <div key={item} className="flex items-center gap-3 rounded-lg border border-blue-100 bg-white/[0.72] px-3 py-3 dark:border-sky-400/[0.12] dark:bg-white/[0.04]">
                                    <span className="grid size-8 place-items-center rounded-md bg-blue-50 text-sm font-semibold text-blue-700 dark:bg-sky-400/[0.12] dark:text-sky-200">{index + 1}</span>
                                    <span className="text-sm font-medium text-slate-700 dark:text-sky-50/[0.86]">{item}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <section className="relative mx-auto mb-20 max-w-6xl border-t border-blue-200/70 pt-12 dark:border-sky-400/[0.15]">
                    <div className="mb-8 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
                        <div />
                        <div className="max-w-2xl text-center">
                            <h2 className="text-3xl font-semibold text-slate-950 dark:text-sky-50">提示词与结果资产</h2>
                            <p className="mt-3 text-base leading-7 text-slate-500 dark:text-sky-100/[0.62]">把稳定可复用的提示词、参考风格和生成结果保存在同一套创作资产里。</p>
                        </div>
                        <Button type="link" href="/prompts" className="justify-self-center md:justify-self-end" icon={<ArrowRight className="size-4" />} iconPlacement="end">
                            查看提示词库
                        </Button>
                    </div>
                    <div className="grid auto-rows-[210px] gap-4 md:grid-cols-4">
                        {promptShowcase.map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedPrompt(item)}
                                className={cn(
                                    "group relative cursor-pointer overflow-hidden rounded-lg border border-blue-100 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-sky-400/[0.12] dark:bg-white/[0.04]",
                                    index === 0 && "md:col-span-2 md:row-span-2",
                                    index === 3 && "md:col-span-2",
                                )}
                            >
                                <img src={promptImageUrl(item.coverUrl)} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" onError={usePromptFallbackImage} />
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent p-4 text-white">
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                        {item.tags.slice(0, 2).map((tag) => (
                                            <Tag key={tag} variant="filled" className="m-0 bg-white/15 text-[11px] text-white backdrop-blur">
                                                {tag}
                                            </Tag>
                                        ))}
                                    </div>
                                    <h3 className="text-sm font-medium">{item.title}</h3>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/75">{item.prompt}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            </section>
            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, "提示词已复制")} />
        </main>
    );
}

function sortPromptsWithImagesFirst(items: Prompt[]) {
    return [...items].sort((a, b) => Number(hasPromptImage(b)) - Number(hasPromptImage(a)));
}

function hasPromptImage(item: Prompt) {
    return Boolean(item.coverUrl.trim() || item.preview.includes("![](") || item.preview.includes("!["));
}

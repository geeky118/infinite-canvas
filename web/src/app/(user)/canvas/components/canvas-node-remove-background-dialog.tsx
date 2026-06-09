"use client";

import { useEffect, useState } from "react";
import { Button, Modal, Segmented } from "antd";
import { Eraser } from "lucide-react";

import { readImageMeta } from "@/lib/image-utils";
import type { RemoveBackgroundParams, RemoveBackgroundStrength } from "../utils/canvas-image-data";

export type CanvasRemoveBackgroundParams = RemoveBackgroundParams;

const strengthOptions: Array<{ value: RemoveBackgroundStrength; title: string; description: string }> = [
    { value: "conservative", title: "保守", description: "优先保留人物和细节" },
    { value: "standard", title: "标准", description: "平衡主体和背景清理" },
    { value: "strong", title: "强力", description: "更积极清理复杂背景" },
];

const defaultParams: CanvasRemoveBackgroundParams = {
    strength: "conservative",
};

export function CanvasNodeRemoveBackgroundDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasRemoveBackgroundParams) => void }) {
    const [params, setParams] = useState<CanvasRemoveBackgroundParams>(defaultParams);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);

    useEffect(() => {
        if (!open) return;
        setParams(defaultParams);
        setImage(null);
    }, [dataUrl, open]);

    useEffect(() => {
        if (!open) return;
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, open]);

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={780} centered destroyOnHidden>
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">图片去背景</h2>
                </div>
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_320px]">
                    <div className="rounded-xl border p-4">
                        <div className="grid min-h-[300px] place-items-center rounded-lg bg-black/5">
                            <img src={dataUrl} alt="" className="max-h-[340px] max-w-full rounded-lg object-contain shadow-xl" draggable={false} />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                            <span className="opacity-60">源图</span>
                            <span className="font-semibold">{image ? `${image.width} x ${image.height} px` : "读取中"}</span>
                        </div>
                    </div>
                    <div className="space-y-6 py-2">
                        <div className="space-y-2">
                            <div className="font-medium opacity-75">强度</div>
                            <Segmented
                                block
                                value={params.strength}
                                options={strengthOptions.map((item) => ({
                                    value: item.value,
                                    label: (
                                        <span className="flex min-h-12 flex-col justify-center text-left leading-5">
                                            <span className="font-medium">{item.title}</span>
                                            <span className="text-xs opacity-55">{item.description}</span>
                                        </span>
                                    ),
                                }))}
                                onChange={(value) => setParams({ strength: value as RemoveBackgroundStrength })}
                            />
                        </div>
                        <div className="rounded-xl border px-4 py-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="opacity-60">抠图方式</span>
                                <span className="font-semibold">免费模型</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                                <span className="opacity-60">结果检查</span>
                                <span className="font-semibold">自动检测</span>
                            </div>
                        </div>
                        <Button type="primary" size="large" className="w-full" icon={<Eraser className="size-4" />} onClick={() => onConfirm(params)}>
                            生成透明 PNG
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

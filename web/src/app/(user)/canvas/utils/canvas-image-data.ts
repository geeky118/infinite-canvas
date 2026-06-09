"use client";

export type ImageCropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type ImageAngleTransform = {
    horizontalAngle: number;
    pitchAngle: number;
    cameraDistance: number;
    wideAngle: boolean;
};

export type ImageUpscaleAlgorithm = "nearest" | "bilinear" | "high";

export const MAX_UPSCALE_LONG_EDGE = 4096;

export type ImageUpscaleParams = {
    targetLongEdge: number;
    algorithm: ImageUpscaleAlgorithm;
};

export type ImageSplitParams = {
    rows: number;
    columns: number;
};

export type ImageSplitPiece = {
    row: number;
    column: number;
    dataUrl: string;
};

export type RemoveBackgroundStrength = "conservative" | "standard" | "strong";

export type RemoveBackgroundParams = {
    strength: RemoveBackgroundStrength;
};

export type RemoveBackgroundQuality = {
    removedRatio: number;
    centerRemovedRatio: number;
    edgeOpaqueRatio: number;
    partialAlphaRatio: number;
    status: "ok" | "warning";
    warnings: string[];
};

export type RemoveBackgroundResult = {
    dataUrl: string;
    quality: RemoveBackgroundQuality;
    method: "model" | "local";
};

export async function cropDataUrl(dataUrl: string, crop?: ImageCropRect) {
    const image = await loadImage(dataUrl);
    if (crop) {
        return drawCrop(image, Math.floor(crop.x * image.width), Math.floor(crop.y * image.height), Math.ceil(crop.width * image.width), Math.ceil(crop.height * image.height));
    }
    const size = Math.min(image.width, image.height);
    const sx = Math.max(0, Math.floor((image.width - size) / 2));
    const sy = Math.max(0, Math.floor((image.height - size) / 2));
    return drawCrop(image, sx, sy, size, size);
}

export async function splitDataUrl(dataUrl: string, params: ImageSplitParams): Promise<ImageSplitPiece[]> {
    const image = await loadImage(dataUrl);
    const rows = Math.max(1, Math.floor(params.rows));
    const columns = Math.max(1, Math.floor(params.columns));
    const pieces: ImageSplitPiece[] = [];

    for (let row = 0; row < rows; row += 1) {
        const sy = Math.floor((row * image.height) / rows);
        const sh = Math.floor(((row + 1) * image.height) / rows) - sy;
        for (let column = 0; column < columns; column += 1) {
            const sx = Math.floor((column * image.width) / columns);
            const sw = Math.floor(((column + 1) * image.width) / columns) - sx;
            pieces.push({ row, column, dataUrl: drawCrop(image, sx, sy, sw, sh) });
        }
    }

    return pieces;
}

export async function transformAngleDataUrl(dataUrl: string, params: ImageAngleTransform) {
    const image = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    const padding = Math.round(Math.max(image.width, image.height) * 0.18);
    canvas.width = image.width + padding * 2;
    canvas.height = image.height + padding * 2;
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const horizontal = params.horizontalAngle / 60;
    const pitch = params.pitchAngle / 45;
    const distanceScale = 1.12 - params.cameraDistance * 0.035;
    const wideScale = params.wideAngle ? 0.88 : 1;
    const scale = Math.max(0.64, Math.min(1.1, distanceScale * wideScale));
    const width = image.width * scale * (1 - Math.abs(horizontal) * 0.28);
    const height = image.height * scale * (1 - Math.abs(pitch) * 0.18);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const skewX = horizontal * image.width * 0.18;
    const skewY = pitch * image.height * 0.12;
    const x = cx - width / 2 + horizontal * padding * 0.5;
    const y = cy - height / 2 + pitch * padding * 0.45;

    context.save();
    context.setTransform(1, pitch * 0.08, horizontal * -0.1, 1, 0, 0);
    context.drawImage(image, x + skewX, y + skewY, width, height);
    context.restore();

    if (params.wideAngle) {
        const gradient = context.createRadialGradient(cx, cy, Math.min(canvas.width, canvas.height) * 0.2, cx, cy, Math.max(canvas.width, canvas.height) * 0.62);
        gradient.addColorStop(0, "rgba(255,255,255,0)");
        gradient.addColorStop(1, "rgba(0,0,0,0.18)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
    }

    return canvas.toDataURL("image/png");
}

export async function upscaleDataUrl(dataUrl: string, params: ImageUpscaleParams) {
    const image = await loadImage(dataUrl);
    const { width, height } = resolveUpscaleSize(image.width, image.height, params.targetLongEdge);
    return params.algorithm === "high" ? drawStepUpscale(image, width, height) : drawResize(image, image.width, image.height, width, height, params.algorithm);
}

export async function removeBackgroundDataUrl(dataUrl: string, params: RemoveBackgroundParams = { strength: "conservative" }): Promise<RemoveBackgroundResult> {
    try {
        const dataUrlResult = await removeBackgroundWithModel(dataUrl, params.strength);
        return { dataUrl: dataUrlResult, quality: await inspectBackgroundRemoval(dataUrlResult), method: "model" };
    } catch {
        const dataUrlResult = await removeBackgroundWithLocalHeuristic(dataUrl, params.strength);
        return { dataUrl: dataUrlResult, quality: await inspectBackgroundRemoval(dataUrlResult), method: "local" };
    }
}

async function removeBackgroundWithModel(dataUrl: string, strength: RemoveBackgroundStrength) {
    const { remove, newSession, rembgConfig } = await import("@bunnio/rembg-web");
    const model = await resolveRemoveBackgroundModel(strength);
    rembgConfig.setBaseUrl("/models");
    const session = await newSession(model);
    const result = await remove(await dataUrlToBlob(dataUrl), {
        session,
        postProcessMask: strength !== "strong",
    });
    return adjustModelAlpha(await blobToDataUrl(result), strength);
}

async function canLoadLocalModel(file: string) {
    try {
        const response = await fetch(`/models/${file}`, { method: "HEAD", cache: "force-cache" });
        return response.ok;
    } catch {
        return false;
    }
}

async function resolveRemoveBackgroundModel(strength: RemoveBackgroundStrength) {
    if (strength === "conservative" && (await canLoadLocalModel("u2net_human_seg.onnx"))) return "u2net_human_seg";
    if (strength === "strong" && (await canLoadLocalModel("u2net.onnx"))) return "u2net";
    return "u2netp";
}

async function removeBackgroundWithLocalHeuristic(dataUrl: string, strength: RemoveBackgroundStrength) {
    const image = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return dataUrl;
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = removeEdgeConnectedBackground(imageData, canvas.width, canvas.height, strength);
    if (!result) {
        throw new Error("去背景结果疑似误删主体，请换一张背景更清晰的图或使用局部编辑");
    }
    context.putImageData(result, 0, 0);
    return canvas.toDataURL("image/png");
}

async function inspectBackgroundRemoval(dataUrl: string): Promise<RemoveBackgroundQuality> {
    const image = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { removedRatio: 0, centerRemovedRatio: 0, edgeOpaqueRatio: 1, partialAlphaRatio: 0, status: "warning", warnings: ["无法读取结果质量"] };
    context.drawImage(image, 0, 0);
    return analyzeAlphaQuality(context.getImageData(0, 0, canvas.width, canvas.height), canvas.width, canvas.height);
}

export function resolveUpscaleSize(width: number, height: number, targetLongEdge: number) {
    const longEdge = Math.max(1, width, height);
    const target = Math.min(MAX_UPSCALE_LONG_EDGE, Math.max(1, Math.round(targetLongEdge)));
    const scale = target / longEdge;
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function drawCrop(image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, sw);
    canvas.height = Math.max(1, sh);
    const context = canvas.getContext("2d");
    if (!context) return image.src;
    context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
}

function drawStepUpscale(image: HTMLImageElement, width: number, height: number) {
    let source: CanvasImageSource = image;
    let sourceWidth = image.width;
    let sourceHeight = image.height;

    while (sourceWidth * 2 < width && sourceHeight * 2 < height) {
        const nextWidth = sourceWidth * 2;
        const nextHeight = sourceHeight * 2;
        const next = drawResizeCanvas(source, sourceWidth, sourceHeight, nextWidth, nextHeight, "high");
        source = next;
        sourceWidth = nextWidth;
        sourceHeight = nextHeight;
    }

    return drawResize(source, sourceWidth, sourceHeight, width, height, "high");
}

function drawResize(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number, algorithm: ImageUpscaleAlgorithm) {
    return drawResizeCanvas(source, sourceWidth, sourceHeight, width, height, algorithm).toDataURL("image/png");
}

function drawResizeCanvas(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number, algorithm: ImageUpscaleAlgorithm) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return canvas;
    context.imageSmoothingEnabled = algorithm !== "nearest";
    context.imageSmoothingQuality = algorithm === "bilinear" ? "medium" : "high";
    context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
    return canvas;
}

function removeEdgeConnectedBackground(imageData: ImageData, width: number, height: number, strength: RemoveBackgroundStrength) {
    const totalPixels = Math.max(1, width * height);
    const attempts = removeBackgroundAttempts(strength);

    let best: { imageData: ImageData; removedRatio: number; score: number } | null = null;
    for (const attempt of attempts) {
        const candidate = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
        const stats = applyEdgeConnectedBackgroundRemoval(candidate, width, height, attempt.tolerance, attempt.softEdge);
        if (stats.removedPixels === 0) continue;
        const removedRatio = stats.removedPixels / totalPixels;
        const score = scoreBackgroundRemoval(removedRatio, stats.edgeCoverage, stats.centerRemovedRatio, stats.samples.length);
        if (!best || score > best.score) {
            best = { imageData: candidate, removedRatio, score };
        }
        if (score >= 0.74 && removedRatio <= 0.72) return candidate;
    }

    return best && best.removedRatio <= 0.76 && best.score >= 0.32 ? best.imageData : null;
}

function removeBackgroundAttempts(strength: RemoveBackgroundStrength) {
    if (strength === "strong") {
        return [
            { tolerance: 42, softEdge: true },
            { tolerance: 34, softEdge: true },
            { tolerance: 26, softEdge: true },
        ];
    }
    if (strength === "standard") {
        return [
            { tolerance: 34, softEdge: true },
            { tolerance: 28, softEdge: true },
            { tolerance: 22, softEdge: true },
            { tolerance: 16, softEdge: false },
        ];
    }
    return [
        { tolerance: 28, softEdge: true },
        { tolerance: 22, softEdge: true },
        { tolerance: 16, softEdge: true },
        { tolerance: 12, softEdge: false },
    ];
}

function applyEdgeConnectedBackgroundRemoval(imageData: ImageData, width: number, height: number, tolerance: number, softEdge: boolean) {
    const data = imageData.data;
    const samples = collectBackgroundSamples(data, width, height, tolerance);
    const visited = new Uint8Array(width * height);
    const queue: number[] = [];
    const enqueue = (x: number, y: number) => {
        const index = y * width + x;
        if (visited[index]) return;
        if (!isBackgroundPixel(data, index * 4, samples, tolerance)) return;
        visited[index] = 1;
        queue.push(index);
    };

    for (let x = 0; x < width; x += 1) {
        enqueue(x, 0);
        enqueue(x, height - 1);
    }
    for (let y = 1; y < height - 1; y += 1) {
        enqueue(0, y);
        enqueue(width - 1, y);
    }

    let removedPixels = 0;
    let removedEdgePixels = 0;
    let removedCenterPixels = 0;
    let centerPixels = 0;
    const centerLeft = Math.floor(width * 0.2);
    const centerRight = Math.ceil(width * 0.8);
    const centerTop = Math.floor(height * 0.15);
    const centerBottom = Math.ceil(height * 0.9);
    for (let head = 0; head < queue.length; head += 1) {
        const index = queue[head];
        const offset = index * 4;
        data[offset + 3] = 0;
        removedPixels += 1;
        const x = index % width;
        const y = Math.floor(index / width);
        if (x >= centerLeft && x <= centerRight && y >= centerTop && y <= centerBottom) removedCenterPixels += 1;
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) removedEdgePixels += 1;
        if (x > 0) enqueue(x - 1, y);
        if (x < width - 1) enqueue(x + 1, y);
        if (y > 0) enqueue(x, y - 1);
        if (y < height - 1) enqueue(x, y + 1);
    }
    if (softEdge) refineBackgroundEdge(data, visited, samples, width, height, tolerance);
    const edgePixels = Math.max(1, width * 2 + Math.max(0, height - 2) * 2);
    centerPixels = Math.max(1, (centerRight - centerLeft + 1) * (centerBottom - centerTop + 1));
    return { removedPixels, edgeCoverage: removedEdgePixels / edgePixels, centerRemovedRatio: removedCenterPixels / centerPixels, samples };
}

function scoreBackgroundRemoval(removedRatio: number, edgeCoverage: number, centerRemovedRatio: number, sampleCount: number) {
    if (removedRatio <= 0.01 || removedRatio >= 0.92) return 0;
    const targetRatio = removedRatio < 0.1 ? 0.1 : removedRatio > 0.62 ? 0.62 : removedRatio;
    const ratioScore = 1 - Math.min(1, Math.abs(targetRatio - 0.34) / 0.34);
    const edgeScore = Math.min(1, Math.max(0, edgeCoverage));
    const sampleScore = Math.min(1, sampleCount / 3);
    const centerPenalty = Math.max(0, centerRemovedRatio - 0.38) * 0.9;
    return ratioScore * 0.42 + edgeScore * 0.46 + sampleScore * 0.12 - centerPenalty;
}

function collectBackgroundSamples(data: Uint8ClampedArray, width: number, height: number, tolerance: number) {
    const cornerSamples = collectTopCornerSamples(data, width, height);
    const borderClusters = collectBorderClusters(data, width, height);
    const samples = [...cornerSamples];
    const minShare = 0.12;
    for (const cluster of borderClusters) {
        if (cluster.share < minShare) continue;
        if (cornerSamples.some(([r, g, b]) => colorDistance(cluster.r, cluster.g, cluster.b, r, g, b) <= tolerance + 10)) {
            samples.push([cluster.r, cluster.g, cluster.b]);
        }
    }
    return samples.length ? samples : borderClusters.slice(0, 2).map((cluster) => [cluster.r, cluster.g, cluster.b] as [number, number, number]);
}

function collectTopCornerSamples(data: Uint8ClampedArray, width: number, height: number) {
    const patch = Math.max(4, Math.floor(Math.min(width, height) / 18));
    const step = Math.max(1, Math.floor(patch / 3));
    const rawSamples: Array<[number, number, number]> = [];
    const add = (x: number, y: number) => {
        const offset = (y * width + x) * 4;
        if (data[offset + 3] >= 16) rawSamples.push([data[offset], data[offset + 1], data[offset + 2]]);
    };
    for (let y = 0; y < patch; y += step) {
        for (let x = 0; x < patch; x += step) {
            add(x, y);
            add(width - 1 - x, y);
        }
    }
    return clusterSamples(rawSamples, 4).map((cluster) => [cluster.r, cluster.g, cluster.b] as [number, number, number]);
}

function collectBorderClusters(data: Uint8ClampedArray, width: number, height: number) {
    const step = Math.max(1, Math.floor(Math.min(width, height) / 120));
    const rawSamples: Array<[number, number, number]> = [];
    const add = (x: number, y: number) => {
        const offset = (y * width + x) * 4;
        if (data[offset + 3] >= 16) rawSamples.push([data[offset], data[offset + 1], data[offset + 2]]);
    };
    for (let x = 0; x < width; x += step) {
        add(x, 0);
        add(x, height - 1);
    }
    for (let y = step; y < height - 1; y += step) {
        add(0, y);
        add(width - 1, y);
    }
    return clusterSamples(rawSamples, 6);
}

function clusterSamples(samples: Array<[number, number, number]>, limit: number) {
    const clusters = new Map<string, { count: number; r: number; g: number; b: number }>();
    for (const [r, g, b] of samples) {
        const key = `${Math.round(r / 20)}:${Math.round(g / 20)}:${Math.round(b / 20)}`;
        const cluster = clusters.get(key) || { count: 0, r: 0, g: 0, b: 0 };
        cluster.count += 1;
        cluster.r += r;
        cluster.g += g;
        cluster.b += b;
        clusters.set(key, cluster);
    }
    const total = Math.max(1, samples.length);
    return [...clusters.values()]
        .map((cluster) => ({
            count: cluster.count,
            share: cluster.count / total,
            r: Math.round(cluster.r / cluster.count),
            g: Math.round(cluster.g / cluster.count),
            b: Math.round(cluster.b / cluster.count),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

function isBackgroundPixel(data: Uint8ClampedArray, offset: number, samples: Array<[number, number, number]>, tolerance: number) {
    if (data[offset + 3] < 16) return true;
    return samples.some(([r, g, b]) => colorDistance(data[offset], data[offset + 1], data[offset + 2], r, g, b) <= tolerance);
}

function refineBackgroundEdge(data: Uint8ClampedArray, removed: Uint8Array, samples: Array<[number, number, number]>, width: number, height: number, tolerance: number) {
    const candidates = new Set<number>();
    const radius = 1;
    for (let y = radius; y < height - radius; y += 1) {
        for (let x = radius; x < width - radius; x += 1) {
            const index = y * width + x;
            if (removed[index]) continue;
            if (!hasRemovedNeighbor(removed, width, index, radius)) continue;
            candidates.add(index);
        }
    }
    for (const index of candidates) {
        const offset = index * 4;
        const distance = minColorDistance(data[offset], data[offset + 1], data[offset + 2], samples);
        if (distance <= tolerance + 12) {
            const alpha = Math.round(((distance - tolerance * 0.72) / (tolerance + 12 - tolerance * 0.72)) * 255);
            data[offset + 3] = Math.min(data[offset + 3], Math.max(112, alpha));
        }
    }
}

function hasRemovedNeighbor(removed: Uint8Array, width: number, index: number, radius: number) {
    for (let dy = -radius; dy <= radius; dy += 1) {
        const row = index + dy * width;
        for (let dx = -radius; dx <= radius; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            if (removed[row + dx]) return true;
        }
    }
    return false;
}

function minColorDistance(r: number, g: number, b: number, samples: Array<[number, number, number]>) {
    return samples.reduce((best, sample) => Math.min(best, colorDistance(r, g, b, sample[0], sample[1], sample[2])), Number.POSITIVE_INFINITY);
}

async function adjustModelAlpha(dataUrl: string, strength: RemoveBackgroundStrength) {
    const image = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return dataUrl;
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let offset = 3; offset < data.length; offset += 4) {
        const alpha = data[offset];
        if (strength === "conservative") {
            data[offset] = alpha < 56 ? 0 : Math.min(255, Math.round(alpha * 1.16 + 22));
        } else if (strength === "strong") {
            data[offset] = alpha < 96 ? 0 : Math.min(255, Math.round(((alpha - 64) / 191) * 255));
        } else {
            data[offset] = alpha < 44 ? 0 : alpha > 232 ? 255 : alpha;
        }
    }
    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
}

function analyzeAlphaQuality(imageData: ImageData, width: number, height: number): RemoveBackgroundQuality {
    const data = imageData.data;
    const total = Math.max(1, width * height);
    const centerLeft = Math.floor(width * 0.2);
    const centerRight = Math.ceil(width * 0.8);
    const centerTop = Math.floor(height * 0.15);
    const centerBottom = Math.ceil(height * 0.9);
    let transparent = 0;
    let partial = 0;
    let centerTransparent = 0;
    let centerTotal = 0;
    let edgeOpaque = 0;
    let edgeTotal = 0;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha < 16) transparent += 1;
            else if (alpha < 240) partial += 1;
            if (x >= centerLeft && x <= centerRight && y >= centerTop && y <= centerBottom) {
                centerTotal += 1;
                if (alpha < 16) centerTransparent += 1;
            }
            if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
                edgeTotal += 1;
                if (alpha >= 240) edgeOpaque += 1;
            }
        }
    }

    const removedRatio = transparent / total;
    const centerRemovedRatio = centerTransparent / Math.max(1, centerTotal);
    const edgeOpaqueRatio = edgeOpaque / Math.max(1, edgeTotal);
    const partialAlphaRatio = partial / total;
    const warnings: string[] = [];
    if (removedRatio < 0.03) warnings.push("背景清理较少");
    if (removedRatio > 0.84) warnings.push("透明区域过多");
    if (centerRemovedRatio > 0.42) warnings.push("主体区域可能被误删");
    if (edgeOpaqueRatio > 0.48) warnings.push("边缘仍有较多背景残留");
    if (partialAlphaRatio > 0.38) warnings.push("半透明边缘较多");
    return { removedRatio, centerRemovedRatio, edgeOpaqueRatio, partialAlphaRatio, status: warnings.length ? "warning" : "ok", warnings };
}

async function dataUrlToBlob(dataUrl: string) {
    const response = await fetch(dataUrl);
    return response.blob();
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
    const y1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
    const y2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
    const cb1 = 128 - 0.168736 * r1 - 0.331264 * g1 + 0.5 * b1;
    const cb2 = 128 - 0.168736 * r2 - 0.331264 * g2 + 0.5 * b2;
    const cr1 = 128 + 0.5 * r1 - 0.418688 * g1 - 0.081312 * b1;
    const cr2 = 128 + 0.5 * r2 - 0.418688 * g2 - 0.081312 * b2;
    const dy = (y1 - y2) * 0.78;
    const dcb = (cb1 - cb2) * 1.22;
    const dcr = (cr1 - cr2) * 1.22;
    return Math.sqrt(dy * dy + dcb * dcb + dcr * dcr);
}

function loadImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.src = dataUrl;
    });
}

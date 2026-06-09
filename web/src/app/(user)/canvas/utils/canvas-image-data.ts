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

export async function removeBackgroundDataUrl(dataUrl: string) {
    const image = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return dataUrl;
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = removeEdgeConnectedBackground(imageData, canvas.width, canvas.height);
    if (!result) {
        throw new Error("去背景结果疑似误删主体，请换一张背景更清晰的图或使用局部编辑");
    }
    context.putImageData(result, 0, 0);
    return canvas.toDataURL("image/png");
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

function removeEdgeConnectedBackground(imageData: ImageData, width: number, height: number) {
    const totalPixels = Math.max(1, width * height);
    const attempts = [
        { tolerance: 34, softEdge: true },
        { tolerance: 26, softEdge: true },
        { tolerance: 20, softEdge: false },
    ];

    let best: { imageData: ImageData; removedRatio: number } | null = null;
    for (const attempt of attempts) {
        const candidate = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
        const stats = applyEdgeConnectedBackgroundRemoval(candidate, width, height, attempt.tolerance, attempt.softEdge);
        if (stats.removedPixels === 0) continue;
        const removedRatio = stats.removedPixels / totalPixels;
        if (!best || Math.abs(removedRatio - 0.35) < Math.abs(best.removedRatio - 0.35)) {
            best = { imageData: candidate, removedRatio };
        }
        if (removedRatio <= 0.68) return candidate;
    }

    return best && best.removedRatio <= 0.72 ? best.imageData : null;
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
    for (let head = 0; head < queue.length; head += 1) {
        const index = queue[head];
        const offset = index * 4;
        data[offset + 3] = 0;
        removedPixels += 1;
        const x = index % width;
        const y = Math.floor(index / width);
        if (x > 0) enqueue(x - 1, y);
        if (x < width - 1) enqueue(x + 1, y);
        if (y > 0) enqueue(x, y - 1);
        if (y < height - 1) enqueue(x, y + 1);
    }
    if (softEdge) softenBackgroundEdge(data, visited, width, height);
    return { removedPixels };
}

function collectBackgroundSamples(data: Uint8ClampedArray, width: number, height: number, tolerance: number) {
    const cornerSamples = collectCornerSamples(data, width, height);
    const borderClusters = collectBorderClusters(data, width, height);
    const samples = [...cornerSamples];
    const minShare = 0.12;
    for (const cluster of borderClusters) {
        if (cluster.share < minShare) continue;
        if (cornerSamples.some(([r, g, b]) => colorDistance(cluster.r, cluster.g, cluster.b, r, g, b) <= tolerance + 18)) {
            samples.push([cluster.r, cluster.g, cluster.b]);
        }
    }
    return samples.length ? samples : borderClusters.slice(0, 2).map((cluster) => [cluster.r, cluster.g, cluster.b] as [number, number, number]);
}

function collectCornerSamples(data: Uint8ClampedArray, width: number, height: number) {
    const patch = Math.max(2, Math.floor(Math.min(width, height) / 32));
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
            add(x, height - 1 - y);
            add(width - 1 - x, height - 1 - y);
        }
    }
    return clusterSamples(rawSamples, 4).map((cluster) => [cluster.r, cluster.g, cluster.b] as [number, number, number]);
}

function collectBorderClusters(data: Uint8ClampedArray, width: number, height: number) {
    const step = Math.max(1, Math.floor(Math.min(width, height) / 80));
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
        const key = `${Math.round(r / 24)}:${Math.round(g / 24)}:${Math.round(b / 24)}`;
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

function softenBackgroundEdge(data: Uint8ClampedArray, removed: Uint8Array, width: number, height: number) {
    const edgePixels: number[] = [];
    for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
            const index = y * width + x;
            if (removed[index]) continue;
            if (removed[index - 1] || removed[index + 1] || removed[index - width] || removed[index + width]) edgePixels.push(index);
        }
    }
    for (const index of edgePixels) {
        const offset = index * 4;
        data[offset + 3] = Math.min(data[offset + 3], 210);
    }
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

function loadImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.src = dataUrl;
    });
}

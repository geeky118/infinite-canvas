import axios from "axios";

import { useUserStore } from "@/stores/use-user-store";

export type UploadedCanvasImage = {
    key: string;
    url: string;
    mimeType: string;
    bytes: number;
};

type ApiResponse<T> = {
    code: number;
    data: T;
    msg: string;
};

export async function uploadCanvasImage(file: Blob, filename = "image.png") {
    const token = useUserStore.getState().token;
    if (!token) return null;
    const form = new FormData();
    form.append("file", file, filename);
    const response = await axios.post<ApiResponse<UploadedCanvasImage>>("/api/v1/media/images", form, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true,
    });
    const payload = response.data;
    if (response.status < 200 || response.status >= 300 || payload.code !== 0) {
        throw new Error(payload?.msg || "图片保存到云端失败");
    }
    return payload.data;
}

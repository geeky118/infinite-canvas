import { apiGet, apiPost } from "@/services/api/request";

export type UserDataDomain = "canvas" | "ai-config" | "assets";

export type UserDataResponse<T> = {
    domain: UserDataDomain;
    payload: T | null;
    updatedAt: string;
};

export async function fetchUserData<T>(token: string, domain: UserDataDomain) {
    return apiGet<UserDataResponse<T>>(`/api/v1/user-data/${domain}`, undefined, token);
}

export async function saveUserData<T>(token: string, domain: UserDataDomain, payload: T) {
    return apiPost<UserDataResponse<T>>(`/api/v1/user-data/${domain}`, { payload }, token);
}

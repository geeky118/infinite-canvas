import { apiGet, apiPost } from "@/services/api/request";

export const AUTH_TOKEN_KEY = "infinite-canvas-auth-token-v1";

export type UserRole = "guest" | "user" | "admin";

export type AuthUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    role: UserRole;
    credits: number;
    subscriptionId: string;
    subscriptionName: string;
    subscriptionExpireAt: string;
    createdAt: string;
    updatedAt: string;
};

export type AuthSession = {
    token: string;
    user: AuthUser;
};

export type AuthPayload = {
    username: string;
    password: string;
};

export type RegisterPayload = {
    username: string;
    password: string;
    email: string;
    code: string;
};

export type EmailCodeResult = {
    ttlSeconds: number;
    cooldownSeconds: number;
    maxPerHour: number;
    emailDomain: string;
};

export async function login(payload: AuthPayload) {
    return apiPost<AuthSession>("/api/auth/login", payload);
}

export async function register(payload: RegisterPayload) {
    return apiPost<AuthSession>("/api/auth/register", payload);
}

export async function sendEmailCode(email: string) {
    return apiPost<EmailCodeResult>("/api/auth/email-code", { email });
}

export async function fetchCurrentUser(token?: string) {
    return apiGet<AuthUser>("/api/auth/me", undefined, token);
}

import { apiGet, apiPost } from "@/services/api/request";
import type { AuthUser } from "@/services/api/auth";

export type MarketingSettings = {
    registerCredits: number;
    dailyCredits: number;
};

export type MarketingStatus = {
    user: AuthUser;
    marketing: MarketingSettings;
    dailyDate: string;
    dailyClaimed: boolean;
    subscriptionId: string;
    subscriptionName: string;
    subscriptionExpireAt: string;
};

export type MarketingRedeemResult = {
    user: AuthUser;
    redemptionCode: {
        code: string;
        type: "credits" | "subscription";
        credits: number;
        subscriptionName: string;
        subscriptionDurationDays: number;
    };
    message: string;
};

export async function fetchMarketingStatus(token: string) {
    return apiGet<MarketingStatus>("/api/v1/marketing/status", undefined, token);
}

export async function claimDailyCredits(token: string) {
    return apiPost<MarketingStatus>("/api/v1/marketing/daily-credits", {}, token);
}

export async function redeemMarketingCode(token: string, code: string) {
    return apiPost<MarketingRedeemResult>("/api/v1/marketing/redeem", { code }, token);
}

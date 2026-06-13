"use client";

import { useEffect, useState } from "react";
import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
    deleteAdminSubscriptionPlan,
    fetchAdminMarketingSettings,
    fetchAdminRedemptionCodes,
    fetchAdminSubscriptionPlans,
    generateAdminRedemptionCodes,
    saveAdminMarketingSettings,
    saveAdminSubscriptionPlan,
    type AdminMarketingSettings,
    type AdminRedemptionCodeType,
    type AdminSubscriptionPlan,
    type GenerateAdminRedemptionCodePayload,
} from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;

export function useAdminMarketing() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const clearSession = useUserStore((state) => state.clearSession);
    const [planKeyword, setPlanKeyword] = useState("");
    const [planPage, setPlanPage] = useState(1);
    const [planPageSize, setPlanPageSize] = useState(defaultPageSize);
    const [codeKeyword, setCodeKeyword] = useState("");
    const [codeType, setCodeType] = useState("");
    const [codeStatus, setCodeStatus] = useState("");
    const [codeBatchId, setCodeBatchId] = useState("");
    const [codePage, setCodePage] = useState(1);
    const [codePageSize, setCodePageSize] = useState(defaultPageSize);
    const [lastGeneratedCodes, setLastGeneratedCodes] = useState<string[]>([]);

    const settingsQuery = useQuery({
        queryKey: ["admin", "marketing", "settings", token],
        queryFn: () => fetchAdminMarketingSettings(token),
        enabled: Boolean(token),
        retry: false,
    });

    const plansQuery = useQuery({
        queryKey: ["admin", "marketing", "subscriptions", token, planKeyword, planPage, planPageSize],
        queryFn: () => fetchAdminSubscriptionPlans(token, { keyword: planKeyword, page: planPage, pageSize: planPageSize }),
        enabled: Boolean(token),
        retry: false,
    });

    const allPlansQuery = useQuery({
        queryKey: ["admin", "marketing", "subscriptions", "all", token],
        queryFn: () => fetchAdminSubscriptionPlans(token, { page: 1, pageSize: 500 }),
        enabled: Boolean(token),
        retry: false,
    });

    const codesQuery = useQuery({
        queryKey: ["admin", "marketing", "redemption-codes", token, codeKeyword, codeType, codeStatus, codeBatchId, codePage, codePageSize],
        queryFn: () => fetchAdminRedemptionCodes(token, { keyword: codeKeyword, type: codeType as AdminRedemptionCodeType | "", status: codeStatus, batchId: codeBatchId, page: codePage, pageSize: codePageSize }),
        enabled: Boolean(token),
        retry: false,
    });

    const settingsMutation = useMutation({
        mutationFn: (settings: AdminMarketingSettings) => saveAdminMarketingSettings(token, settings),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "marketing", "settings"] });
            message.success("营销设置已保存");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "保存失败"),
    });

    const planMutation = useMutation({
        mutationFn: (plan: Partial<AdminSubscriptionPlan>) => saveAdminSubscriptionPlan(token, plan),
        onSuccess: async (_, plan) => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "marketing", "subscriptions"] });
            message.success(plan.id ? "订阅已保存" : "订阅已新增");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "保存失败"),
    });

    const deletePlanMutation = useMutation({
        mutationFn: (id: string) => deleteAdminSubscriptionPlan(token, id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "marketing", "subscriptions"] });
            message.success("订阅已删除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "删除失败"),
    });

    const codeMutation = useMutation({
        mutationFn: (payload: GenerateAdminRedemptionCodePayload) => generateAdminRedemptionCodes(token, payload),
        onSuccess: async (items) => {
            setLastGeneratedCodes(items.map((item) => item.code));
            await queryClient.invalidateQueries({ queryKey: ["admin", "marketing", "redemption-codes"] });
            message.success(`已生成 ${items.length} 个兑换码`);
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "生成失败"),
    });

    useEffect(() => {
        const queries = [settingsQuery, plansQuery, allPlansQuery, codesQuery];
        const failed = queries.find((query) => query.isError);
        if (!failed) return;
        const errorMessage = failed.error instanceof Error ? failed.error.message : "读取营销数据失败";
        message.error(errorMessage);
        if (errorMessage.includes("未登录") || errorMessage.includes("权限不足") || errorMessage.includes("登录状态无效")) clearSession();
    }, [allPlansQuery, clearSession, codesQuery, message, plansQuery, settingsQuery]);

    return {
        settings: settingsQuery.data || { registerCredits: 0, dailyCredits: 0 },
        plans: plansQuery.data?.items || [],
        allPlans: allPlansQuery.data?.items || [],
        planTotal: plansQuery.data?.total || 0,
        planKeyword,
        planPage,
        planPageSize,
        codes: codesQuery.data?.items || [],
        codeTotal: codesQuery.data?.total || 0,
        codeKeyword,
        codeType,
        codeStatus,
        codeBatchId,
        codePage,
        codePageSize,
        lastGeneratedCodes,
        isLoading: settingsQuery.isFetching || plansQuery.isFetching || allPlansQuery.isFetching || codesQuery.isFetching || settingsMutation.isPending || planMutation.isPending || deletePlanMutation.isPending || codeMutation.isPending,
        saveSettings: (settings: AdminMarketingSettings) => settingsMutation.mutateAsync(settings),
        savePlan: (plan: Partial<AdminSubscriptionPlan>) => planMutation.mutateAsync(plan),
        deletePlan: (id: string) => deletePlanMutation.mutateAsync(id),
        generateCodes: (payload: GenerateAdminRedemptionCodePayload) => codeMutation.mutateAsync(payload),
        refresh: () => {
            void settingsQuery.refetch();
            void plansQuery.refetch();
            void allPlansQuery.refetch();
            void codesQuery.refetch();
        },
        searchPlans: (keyword: string) => {
            setPlanKeyword(keyword);
            setPlanPage(1);
        },
        changePlanPage: (page: number) => setPlanPage(page),
        changePlanPageSize: (pageSize: number) => {
            setPlanPageSize(pageSize);
            setPlanPage(1);
        },
        searchCodes: (keyword: string, type = codeType, status = codeStatus, batchId = codeBatchId) => {
            setCodeKeyword(keyword);
            setCodeType(type);
            setCodeStatus(status);
            setCodeBatchId(batchId);
            setCodePage(1);
        },
        changeCodePage: (page: number) => setCodePage(page),
        changeCodePageSize: (pageSize: number) => {
            setCodePageSize(pageSize);
            setCodePage(1);
        },
        resetCodeFilters: () => {
            setCodeKeyword("");
            setCodeType("");
            setCodeStatus("");
            setCodeBatchId("");
            setCodePage(1);
            setCodePageSize(defaultPageSize);
        },
        clearLastGeneratedCodes: () => setLastGeneratedCodes([]),
    };
}

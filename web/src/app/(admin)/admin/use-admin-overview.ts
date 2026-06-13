"use client";

import { useEffect } from "react";
import { App } from "antd";
import { useQuery } from "@tanstack/react-query";

import { fetchAdminOverview } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";
import { adminModuleStats } from "./admin-modules";

export function useAdminOverview() {
    const { message } = App.useApp();
    const token = useUserStore((state) => state.token);
    const clearSession = useUserStore((state) => state.clearSession);
    const query = useQuery({
        queryKey: ["admin", "overview", token],
        queryFn: () => fetchAdminOverview(token),
        enabled: Boolean(token),
        retry: false,
    });

    useEffect(() => {
        if (!query.isError) return;
        const errorMessage = query.error instanceof Error ? query.error.message : "读取后台概览失败";
        message.error(errorMessage);
        if (errorMessage.includes("未登录") || errorMessage.includes("权限不足") || errorMessage.includes("登录状态无效")) clearSession();
    }, [clearSession, message, query.error, query.isError]);

    const moduleStats = adminModuleStats();
    return {
        overview: query.data
            ? {
                  ...query.data,
                  systemModules: moduleStats,
              }
            : null,
        isLoading: query.isFetching,
        refresh: query.refetch,
    };
}

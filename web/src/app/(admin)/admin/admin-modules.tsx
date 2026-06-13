"use client";

import {
    AppstoreOutlined,
    BankOutlined,
    BarChartOutlined,
    FileTextOutlined,
    GiftOutlined,
    GoldOutlined,
    HomeOutlined,
    LockOutlined,
    MenuOutlined,
    PictureOutlined,
    SettingOutlined,
    TransactionOutlined,
    UserOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";

export type AdminModuleKey = "dashboard" | "users" | "permissions" | "menus" | "statistics" | "marketing" | "finance" | "creditLogs" | "assets" | "prompts" | "settings";

export type AdminModule = {
    key: AdminModuleKey;
    path: string;
    title: string;
    description: string;
    group: "overview" | "member" | "growth" | "content" | "system";
    icon: ReactNode;
    permission: string;
};

export const adminModules: AdminModule[] = [
    { key: "dashboard", path: "/admin", title: "工作台", description: "核心经营指标、待处理事项和系统状态", group: "overview", icon: <HomeOutlined />, permission: "admin.dashboard.view" },
    { key: "statistics", path: "/admin/statistics", title: "统计分析", description: "用户、内容、点数和运营趋势", group: "overview", icon: <BarChartOutlined />, permission: "admin.statistics.view" },
    { key: "users", path: "/admin/users", title: "用户管理", description: "用户资料、状态、角色和点数调整", group: "member", icon: <UserOutlined />, permission: "admin.users.manage" },
    { key: "finance", path: "/admin/finance", title: "财务管理", description: "点数收支、订阅权益和财务核对", group: "member", icon: <BankOutlined />, permission: "admin.finance.view" },
    { key: "creditLogs", path: "/admin/credit-logs", title: "算力点日志", description: "算力点变更流水和审计追踪", group: "member", icon: <TransactionOutlined />, permission: "admin.creditLogs.view" },
    { key: "marketing", path: "/admin/marketing", title: "营销管理", description: "注册奖励、每日领取、订阅方案和兑换码", group: "growth", icon: <GiftOutlined />, permission: "admin.marketing.manage" },
    { key: "assets", path: "/admin/assets", title: "素材库", description: "官方素材、图文资产和内容分发", group: "content", icon: <PictureOutlined />, permission: "admin.assets.manage" },
    { key: "prompts", path: "/admin/prompts", title: "提示词管理", description: "提示词分类、远程同步和精选内容", group: "content", icon: <FileTextOutlined />, permission: "admin.prompts.manage" },
    { key: "permissions", path: "/admin/permissions", title: "权限管理", description: "角色、权限点和后台访问范围", group: "system", icon: <LockOutlined />, permission: "admin.permissions.manage" },
    { key: "menus", path: "/admin/menus", title: "菜单管理", description: "后台菜单结构、分组和展示状态", group: "system", icon: <MenuOutlined />, permission: "admin.menus.manage" },
    { key: "settings", path: "/admin/settings", title: "系统设置", description: "模型渠道、登录、安全和系统级配置", group: "system", icon: <SettingOutlined />, permission: "admin.settings.manage" },
];

export const adminModuleGroups = [
    { key: "overview", title: "概览", icon: <AppstoreOutlined /> },
    { key: "member", title: "用户与财务", icon: <GoldOutlined /> },
    { key: "growth", title: "运营增长", icon: <GiftOutlined /> },
    { key: "content", title: "内容资产", icon: <FileTextOutlined /> },
    { key: "system", title: "系统治理", icon: <SettingOutlined /> },
] as const;

export function findAdminModule(pathname: string) {
    return [...adminModules].sort((a, b) => b.path.length - a.path.length).find((item) => pathname === item.path || (item.path !== "/admin" && pathname.startsWith(`${item.path}/`))) || adminModules[0];
}

export function adminModuleStats() {
    return {
        total: adminModules.length,
        permissions: adminModules.map((item) => item.permission),
        groups: adminModuleGroups.length,
    };
}

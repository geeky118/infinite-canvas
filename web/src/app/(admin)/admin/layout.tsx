"use client";

import { HomeOutlined, LogoutOutlined } from "@ant-design/icons";
import { Button, Flex, Layout, Menu, Space, Tag, Typography, theme } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { adminLayoutStyle } from "@/lib/app-theme";
import { useUserStore } from "@/stores/use-user-store";
import { adminModuleGroups, adminModules, findAdminModule } from "./admin-modules";

export default function AdminLayout({ children }: { children: ReactNode }) {
    const { token: antToken } = theme.useToken();
    const router = useRouter();
    const pathname = usePathname();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const logout = useUserStore((state) => state.clearSession);
    const activeModule = findAdminModule(pathname);
    const activeGroup = adminModuleGroups.find((group) => group.key === activeModule.group);
    const menuItems = adminModuleGroups.map((group) => ({
        key: group.key,
        icon: group.icon,
        label: group.title,
        children: adminModules
            .filter((item) => item.group === group.key)
            .map((item) => ({
                key: item.path,
                icon: item.icon,
                label: (
                    <Link href={item.path} style={{ color: "inherit" }}>
                        {item.title}
                    </Link>
                ),
                style: adminLayoutStyle.menuItem,
            })),
    }));

    useEffect(() => {
        if (!isReady) return;
        if (!token) {
            router.replace("/login?redirect=/admin");
            return;
        }
        if (user?.role !== "admin") {
            router.replace("/");
        }
    }, [isReady, router, token, user?.role]);

    if (!isReady || !token || user?.role !== "admin") {
        return (
            <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: antToken.colorBgLayout }}>
                <span />
            </div>
        );
    }

    return (
        <Layout hasSider style={{ height: "100vh", overflow: "hidden", background: antToken.colorBgLayout }}>
            <Layout.Sider width={adminLayoutStyle.siderWidth} style={{ height: "100vh", overflow: "hidden", background: antToken.colorBgContainer, borderRight: `1px solid ${antToken.colorBorderSecondary}` }}>
                <Flex vertical justify="center" gap={4} style={{ height: adminLayoutStyle.brandHeight, padding: "0 20px", borderBottom: `1px solid ${antToken.colorBorderSecondary}` }}>
                    <Flex align="center" gap={10}>
                        <span aria-hidden style={{ display: "inline-block", width: 28, height: 28, background: antToken.colorText, WebkitMask: "url(/logo.svg) center / contain no-repeat", mask: "url(/logo.svg) center / contain no-repeat" }} />
                        <Typography.Text strong style={{ fontSize: 18, letterSpacing: 0 }}>
                            无限画布
                        </Typography.Text>
                    </Flex>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        管理后台
                    </Typography.Text>
                </Flex>
                <Menu
                    mode="inline"
                    selectedKeys={[activeModule.path]}
                    defaultOpenKeys={adminModuleGroups.map((group) => group.key)}
                    style={adminLayoutStyle.menu}
                    items={menuItems}
                />
                <Flex vertical gap={8} style={{ position: "absolute", bottom: 0, insetInline: 0, padding: 12, borderTop: `1px solid ${antToken.colorBorder}`, background: antToken.colorBgContainer }}>
                    <Button block icon={<HomeOutlined />} href="/canvas" target="_blank" rel="noreferrer">
                        前往画布
                    </Button>
                    <Button block icon={<LogoutOutlined />} onClick={logout}>
                        退出登录
                    </Button>
                </Flex>
            </Layout.Sider>
            <Layout style={{ background: antToken.colorBgLayout }}>
                <Layout.Header
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: adminLayoutStyle.headerHeight, padding: "0 24px", background: antToken.colorBgContainer, borderBottom: `1px solid ${antToken.colorBorderSecondary}` }}
                >
                    <Flex vertical gap={2} style={{ minWidth: 0 }}>
                        <Space size={8}>
                            <Typography.Title level={5} style={{ margin: 0 }}>
                                {activeModule.title}
                            </Typography.Title>
                            {activeGroup ? <Tag>{activeGroup.title}</Tag> : null}
                        </Space>
                        <Typography.Text type="secondary" ellipsis style={{ maxWidth: 680, fontSize: 12 }}>
                            {activeModule.description}
                        </Typography.Text>
                    </Flex>
                    <Flex align="center" gap={4}>
                        <UserStatusActions showConfig={false} />
                    </Flex>
                </Layout.Header>
                <Layout.Content style={{ minHeight: 0, overflow: "auto" }}>{children}</Layout.Content>
            </Layout>
        </Layout>
    );
}

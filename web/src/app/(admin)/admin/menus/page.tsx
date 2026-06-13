"use client";

import { DragOutlined, EyeOutlined } from "@ant-design/icons";
import { Card, Flex, Table, Tag, Typography } from "antd";

import { adminModuleGroups, adminModules } from "../admin-modules";

export default function AdminMenusPage() {
    const rows = adminModules.map((item, index) => ({ ...item, order: index + 1, groupTitle: adminModuleGroups.find((group) => group.key === item.group)?.title || item.group }));

    return (
        <main style={{ padding: 24 }}>
            <Flex vertical gap={16}>
                <Card variant="borderless">
                    <Typography.Title level={4} style={{ margin: 0 }}>菜单管理</Typography.Title>
                    <Typography.Text type="secondary">管理菜单结构、访问路径和权限绑定。</Typography.Text>
                </Card>
                <Card title="菜单结构" variant="borderless">
                    <Table
                        rowKey="path"
                        dataSource={rows}
                        pagination={false}
                        columns={[
                            { title: "顺序", dataIndex: "order", width: 80, render: (value) => <Tag icon={<DragOutlined />}>{value}</Tag> },
                            { title: "菜单", dataIndex: "title", render: (value, item) => <Flex vertical><Typography.Text strong>{item.icon} {value}</Typography.Text><Typography.Text type="secondary">{item.description}</Typography.Text></Flex> },
                            { title: "分组", dataIndex: "groupTitle", width: 140 },
                            { title: "路径", dataIndex: "path", render: (value) => <Typography.Text code>{value}</Typography.Text> },
                            { title: "权限", dataIndex: "permission", render: (value) => <Typography.Text code>{value}</Typography.Text> },
                            { title: "状态", key: "visible", width: 110, render: () => <Tag icon={<EyeOutlined />} color="success">展示</Tag> },
                        ]}
                    />
                </Card>
            </Flex>
        </main>
    );
}

"use client";

import { LockOutlined, SafetyCertificateOutlined, UserOutlined } from "@ant-design/icons";
import { Card, Flex, Space, Table, Tag, Typography } from "antd";

import { adminModules } from "../admin-modules";

export default function AdminPermissionsPage() {
    return (
        <main style={{ padding: 24 }}>
            <Flex vertical gap={16}>
                <Card variant="borderless">
                    <Typography.Title level={4} style={{ margin: 0 }}>权限管理</Typography.Title>
                    <Typography.Text type="secondary">管理角色、权限点和后台访问范围。</Typography.Text>
                </Card>
                <Card title="角色矩阵" variant="borderless">
                    <Table
                        rowKey="role"
                        pagination={false}
                        dataSource={[
                            { role: "admin", name: "管理员", scope: "全部后台模块", status: "启用" },
                            { role: "user", name: "普通用户", scope: "无后台访问权限", status: "启用" },
                        ]}
                        columns={[
                            { title: "角色", dataIndex: "name", render: (value, item) => <Space>{item.role === "admin" ? <SafetyCertificateOutlined /> : <UserOutlined />}{value}<Typography.Text code>{item.role}</Typography.Text></Space> },
                            { title: "访问范围", dataIndex: "scope" },
                            { title: "状态", dataIndex: "status", render: (value) => <Tag color="success">{value}</Tag> },
                        ]}
                    />
                </Card>
                <Card title="权限点" variant="borderless">
                    <Table
                        rowKey="permission"
                        dataSource={adminModules}
                        pagination={false}
                        columns={[
                            { title: "模块", dataIndex: "title", render: (value, item) => <Space>{item.icon}{value}</Space> },
                            { title: "权限编码", dataIndex: "permission", render: (value) => <Typography.Text code>{value}</Typography.Text> },
                            { title: "说明", dataIndex: "description" },
                            { title: "访问", key: "access", width: 100, render: () => <Tag icon={<LockOutlined />} color="blue">管理员</Tag> },
                        ]}
                    />
                </Card>
            </Flex>
        </main>
    );
}

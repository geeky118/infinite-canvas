"use client";

import { ArrowUpOutlined, BankOutlined, BarChartOutlined, FileTextOutlined, GiftOutlined, PictureOutlined, ReloadOutlined, TeamOutlined, WalletOutlined } from "@ant-design/icons";
import { Button, Card, Col, Flex, Progress, Row, Space, Statistic, Table, Tag, Typography } from "antd";

import { adminModules } from "./admin-modules";
import { useAdminOverview } from "./use-admin-overview";

export default function AdminDashboardPage() {
    const { overview, codeUseRate, isLoading, refresh } = useAdminOverview();
    const users = overview?.users;
    const credits = overview?.credits;
    const content = overview?.content;
    const finance = overview?.finance;

    return (
        <main style={{ padding: 24 }}>
            <Flex vertical gap={16}>
                <Card variant="borderless">
                    <Flex justify="space-between" align="center" gap={16} wrap>
                        <div>
                            <Typography.Title level={4} style={{ margin: 0 }}>
                                运营总览
                            </Typography.Title>
                            <Typography.Text type="secondary">用户、内容、营销、财务和系统治理的一页式工作台</Typography.Text>
                        </div>
                        <Button icon={<ReloadOutlined />} loading={isLoading} onClick={() => void refresh()}>
                            刷新
                        </Button>
                    </Flex>
                </Card>

                <Row gutter={[16, 16]}>
                    <Col xs={24} md={12} xl={6}>
                        <Card variant="borderless">
                            <Statistic title="用户总数" value={users?.total || 0} prefix={<TeamOutlined />} loading={isLoading} />
                            <Typography.Text type="secondary">管理员 {users?.admins || 0} / 禁用 {users?.banned || 0}</Typography.Text>
                        </Card>
                    </Col>
                    <Col xs={24} md={12} xl={6}>
                        <Card variant="borderless">
                            <Statistic title="算力点余额池" value={credits?.balanceTotal || 0} prefix={<WalletOutlined />} loading={isLoading} />
                            <Typography.Text type="secondary">流水 {credits?.logTotal || 0} 条</Typography.Text>
                        </Card>
                    </Col>
                    <Col xs={24} md={12} xl={6}>
                        <Card variant="borderless">
                            <Statistic title="内容资产" value={(content?.assets || 0) + (content?.prompts || 0)} prefix={<PictureOutlined />} loading={isLoading} />
                            <Typography.Text type="secondary">素材 {content?.assets || 0} / 提示词 {content?.prompts || 0}</Typography.Text>
                        </Card>
                    </Col>
                    <Col xs={24} md={12} xl={6}>
                        <Card variant="borderless">
                            <Statistic title="兑换码使用率" value={codeUseRate} suffix="%" prefix={<GiftOutlined />} loading={isLoading} />
                            <Progress percent={codeUseRate} showInfo={false} size="small" />
                        </Card>
                    </Col>
                </Row>

                <Row gutter={[16, 16]}>
                    <Col xs={24} xl={14}>
                        <Card title="财务与点数" variant="borderless">
                            <Row gutter={[16, 16]}>
                                <Col xs={24} md={8}>
                                    <Statistic title="点数收入" value={credits?.incomeTotal || 0} prefix={<ArrowUpOutlined />} loading={isLoading} />
                                </Col>
                                <Col xs={24} md={8}>
                                    <Statistic title="AI 消费" value={Math.abs(finance?.aiExpense || 0)} prefix={<BankOutlined />} loading={isLoading} />
                                </Col>
                                <Col xs={24} md={8}>
                                    <Statistic title="失败返还" value={finance?.aiRefund || 0} loading={isLoading} />
                                </Col>
                            </Row>
                        </Card>
                    </Col>
                    <Col xs={24} xl={10}>
                        <Card title="系统治理" variant="borderless">
                            <Space direction="vertical" size={12} style={{ width: "100%" }}>
                                <Flex justify="space-between">
                                    <Typography.Text>后台模块</Typography.Text>
                                    <Tag>{overview?.systemModules.total || adminModules.length} 个</Tag>
                                </Flex>
                                <Flex justify="space-between">
                                    <Typography.Text>菜单分组</Typography.Text>
                                    <Tag>{overview?.systemModules.groups || 0} 组</Tag>
                                </Flex>
                                <Flex justify="space-between">
                                    <Typography.Text>权限点</Typography.Text>
                                    <Tag>{overview?.systemModules.permissions.length || 0} 个</Tag>
                                </Flex>
                            </Space>
                        </Card>
                    </Col>
                </Row>

                <Card title="模块状态" variant="borderless">
                    <Table
                        rowKey="path"
                        pagination={false}
                        dataSource={adminModules}
                        columns={[
                            { title: "模块", dataIndex: "title", render: (value, item) => <Space>{item.icon}{value}</Space> },
                            { title: "访问路径", dataIndex: "path" },
                            { title: "权限点", dataIndex: "permission", render: (value) => <Typography.Text code>{value}</Typography.Text> },
                            { title: "状态", key: "status", width: 100, render: () => <Tag color="success">已接入</Tag> },
                        ]}
                    />
                </Card>
            </Flex>
        </main>
    );
}

"use client";

import { BarChartOutlined, FileTextOutlined, GiftOutlined, PictureOutlined, TeamOutlined, WalletOutlined } from "@ant-design/icons";
import { Card, Col, Flex, Progress, Row, Space, Statistic, Table, Tag, Typography } from "antd";

import { useAdminOverview } from "../use-admin-overview";

export default function AdminStatisticsPage() {
    const { overview, isLoading } = useAdminOverview();
    const codeUseRate = overview?.marketing.redemptionCodes ? Math.round((overview.marketing.usedCodes / overview.marketing.redemptionCodes) * 100) : 0;
    const userActiveRate = overview?.users.total ? Math.round((overview.users.active / overview.users.total) * 100) : 0;

    const rows = [
        { key: "users", domain: "用户", total: overview?.users.total || 0, active: overview?.users.active || 0, rate: userActiveRate },
        { key: "assets", domain: "素材", total: overview?.content.assets || 0, active: overview?.content.images || 0, rate: overview?.content.assets ? Math.round(((overview.content.images || 0) / overview.content.assets) * 100) : 0 },
        { key: "codes", domain: "兑换码", total: overview?.marketing.redemptionCodes || 0, active: overview?.marketing.usedCodes || 0, rate: codeUseRate },
    ];

    return (
        <main style={{ padding: 24 }}>
            <Flex vertical gap={16}>
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={12} xl={6}>
                        <Card variant="borderless">
                            <Statistic title="活跃用户占比" value={userActiveRate} suffix="%" prefix={<TeamOutlined />} loading={isLoading} />
                            <Progress percent={userActiveRate} showInfo={false} size="small" />
                        </Card>
                    </Col>
                    <Col xs={24} md={12} xl={6}>
                        <Card variant="borderless">
                            <Statistic title="点数流水" value={overview?.credits.logTotal || 0} prefix={<WalletOutlined />} loading={isLoading} />
                            <Typography.Text type="secondary">收入 {overview?.credits.incomeTotal || 0} / 支出 {overview?.credits.expenseTotal || 0}</Typography.Text>
                        </Card>
                    </Col>
                    <Col xs={24} md={12} xl={6}>
                        <Card variant="borderless">
                            <Statistic title="提示词规模" value={overview?.content.prompts || 0} prefix={<FileTextOutlined />} loading={isLoading} />
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
                        <Card title="核心指标矩阵" variant="borderless">
                            <Table
                                rowKey="key"
                                pagination={false}
                                dataSource={rows}
                                columns={[
                                    { title: "业务域", dataIndex: "domain", render: (value) => <Space><BarChartOutlined />{value}</Space> },
                                    { title: "总量", dataIndex: "total" },
                                    { title: "有效量", dataIndex: "active" },
                                    { title: "占比", dataIndex: "rate", render: (value) => <Progress percent={value} size="small" /> },
                                ]}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} xl={10}>
                        <Card title="内容结构" variant="borderless">
                            <Space direction="vertical" size={14} style={{ width: "100%" }}>
                                <Flex justify="space-between">
                                    <Typography.Text><PictureOutlined /> 图片素材</Typography.Text>
                                    <Tag>{overview?.content.images || 0}</Tag>
                                </Flex>
                                <Flex justify="space-between">
                                    <Typography.Text><FileTextOutlined /> 文本素材</Typography.Text>
                                    <Tag>{overview?.content.texts || 0}</Tag>
                                </Flex>
                                <Flex justify="space-between">
                                    <Typography.Text>订阅方案</Typography.Text>
                                    <Tag>{overview?.marketing.enabledSubscriptionPlans || 0} / {overview?.marketing.subscriptionPlans || 0}</Tag>
                                </Flex>
                                <Flex justify="space-between">
                                    <Typography.Text>点数兑换码</Typography.Text>
                                    <Tag>{overview?.marketing.creditCodes || 0}</Tag>
                                </Flex>
                                <Flex justify="space-between">
                                    <Typography.Text>订阅兑换码</Typography.Text>
                                    <Tag>{overview?.marketing.subscriptionCodes || 0}</Tag>
                                </Flex>
                                <Flex justify="space-between">
                                    <Typography.Text>每日领取记录</Typography.Text>
                                    <Tag>{overview?.marketing.dailyClaims || 0}</Tag>
                                </Flex>
                            </Space>
                        </Card>
                    </Col>
                </Row>
            </Flex>
        </main>
    );
}

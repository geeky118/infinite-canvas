"use client";

import { BankOutlined, GiftOutlined, ReloadOutlined, RobotOutlined, TransactionOutlined, WalletOutlined } from "@ant-design/icons";
import { Button, Card, Col, Flex, Row, Space, Statistic, Table, Tag, Typography } from "antd";

import { useAdminOverview } from "../use-admin-overview";

export default function AdminFinancePage() {
    const { overview, isLoading, refresh } = useAdminOverview();
    const rows = [
        { key: "admin", name: "后台手动调整", type: "收入", amount: overview?.finance.adminAdjustIncome || 0 },
        { key: "redeem", name: "兑换码兑换", type: "营销兑换", amount: overview?.finance.redeemIncome || 0 },
        { key: "daily", name: "每日领取", type: "营销成本", amount: overview?.finance.dailyRewardIncome || 0 },
        { key: "consume", name: "AI 调用消费", type: "消耗", amount: overview?.finance.aiExpense || 0 },
        { key: "refund", name: "失败返还", type: "返还", amount: overview?.finance.aiRefund || 0 },
    ];

    return (
        <main style={{ padding: 24 }}>
            <Flex vertical gap={16}>
                <Card variant="borderless">
                    <Flex justify="space-between" align="center" wrap gap={16}>
                        <div>
                            <Typography.Title level={4} style={{ margin: 0 }}>财务管理</Typography.Title>
                            <Typography.Text type="secondary">统一核对算力点收支、营销成本和订阅权益。</Typography.Text>
                        </div>
                        <Button icon={<ReloadOutlined />} loading={isLoading} onClick={() => void refresh()}>刷新</Button>
                    </Flex>
                </Card>
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={12} xl={6}>
                        <Card variant="borderless">
                            <Statistic title="用户余额池" value={overview?.credits.balanceTotal || 0} prefix={<WalletOutlined />} loading={isLoading} />
                        </Card>
                    </Col>
                    <Col xs={24} md={12} xl={6}>
                        <Card variant="borderless">
                            <Statistic title="累计收入点数" value={overview?.credits.incomeTotal || 0} prefix={<BankOutlined />} loading={isLoading} />
                        </Card>
                    </Col>
                    <Col xs={24} md={12} xl={6}>
                        <Card variant="borderless">
                            <Statistic title="AI 消耗点数" value={Math.abs(overview?.finance.aiExpense || 0)} prefix={<RobotOutlined />} loading={isLoading} />
                        </Card>
                    </Col>
                    <Col xs={24} md={12} xl={6}>
                        <Card variant="borderless">
                            <Statistic title="兑换码点数流水" value={overview?.finance.redeemIncome || 0} prefix={<GiftOutlined />} loading={isLoading} />
                        </Card>
                    </Col>
                </Row>
                <Card title="点数科目" variant="borderless">
                    <Table
                        rowKey="key"
                        dataSource={rows}
                        pagination={false}
                        columns={[
                            { title: "科目", dataIndex: "name", render: (value) => <Space><TransactionOutlined />{value}</Space> },
                            { title: "类型", dataIndex: "type", render: (value) => <Tag>{value}</Tag> },
                            { title: "点数", dataIndex: "amount", render: (value) => <Typography.Text type={value < 0 ? "danger" : "success"}>{value}</Typography.Text> },
                        ]}
                    />
                </Card>
            </Flex>
        </main>
    );
}

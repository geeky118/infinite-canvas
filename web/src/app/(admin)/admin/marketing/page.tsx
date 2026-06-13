"use client";

import { CopyOutlined, DeleteOutlined, EditOutlined, GiftOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { App, Button, Card, Col, Flex, Form, Input, InputNumber, Modal, Row, Segmented, Select, Space, Statistic, Switch, Tabs, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";

import type { AdminRedemptionCode, AdminRedemptionCodeType, AdminSubscriptionPlan } from "@/services/api/admin";
import { useAdminOverview } from "../use-admin-overview";
import { useAdminMarketing } from "./use-admin-marketing";

type PlanFormValues = Partial<AdminSubscriptionPlan>;
type CodeFormValues = { type: AdminRedemptionCodeType; credits?: number; subscriptionId?: string; count: number };

const codeTypeLabels: Record<AdminRedemptionCodeType, string> = {
    credits: "点数",
    subscription: "订阅",
};

export default function AdminMarketingPage() {
    const { message } = App.useApp();
    const [settingsForm] = Form.useForm();
    const [planForm] = Form.useForm<PlanFormValues>();
    const [codeForm] = Form.useForm<CodeFormValues>();
    const marketing = useAdminMarketing();
    const { overview } = useAdminOverview();
    const [planKeywordText, setPlanKeywordText] = useState(marketing.planKeyword);
    const [codeKeywordText, setCodeKeywordText] = useState(marketing.codeKeyword);
    const [codeBatchText, setCodeBatchText] = useState(marketing.codeBatchId);
    const [editingPlan, setEditingPlan] = useState<Partial<AdminSubscriptionPlan> | null>(null);
    const [deletingPlan, setDeletingPlan] = useState<AdminSubscriptionPlan | null>(null);
    const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
    const [isGeneratedModalOpen, setIsGeneratedModalOpen] = useState(false);
    const codeType = Form.useWatch("type", codeForm) || "credits";

    useEffect(() => {
        settingsForm.setFieldsValue(marketing.settings);
    }, [marketing.settings, settingsForm]);

    useEffect(() => setPlanKeywordText(marketing.planKeyword), [marketing.planKeyword]);
    useEffect(() => setCodeKeywordText(marketing.codeKeyword), [marketing.codeKeyword]);
    useEffect(() => setCodeBatchText(marketing.codeBatchId), [marketing.codeBatchId]);

    useEffect(() => {
        if (editingPlan) planForm.setFieldsValue({ enabled: true, durationDays: 30, ...editingPlan });
    }, [editingPlan, planForm]);

    useEffect(() => {
        if (isCodeModalOpen) codeForm.setFieldsValue({ type: "credits", credits: 100, count: 10 });
    }, [codeForm, isCodeModalOpen]);

    const enabledPlans = useMemo(() => marketing.allPlans.filter((plan) => plan.enabled), [marketing.allPlans]);
    const marketingStats = overview?.marketing;

    const saveSettings = async () => {
        const value = await settingsForm.validateFields();
        await marketing.saveSettings({
            registerCredits: Math.max(0, Number(value.registerCredits) || 0),
            dailyCredits: Math.max(0, Number(value.dailyCredits) || 0),
        });
    };

    const savePlan = async () => {
        const value = await planForm.validateFields();
        await marketing.savePlan({ ...editingPlan, ...value });
        setEditingPlan(null);
    };

    const generateCodes = async () => {
        const value = await codeForm.validateFields();
        await marketing.generateCodes({
            type: value.type,
            credits: value.type === "credits" ? Number(value.credits) || 0 : undefined,
            subscriptionId: value.type === "subscription" ? value.subscriptionId : undefined,
            count: Number(value.count) || 0,
        });
        setIsCodeModalOpen(false);
        setIsGeneratedModalOpen(true);
    };

    const planColumns: ProColumns<AdminSubscriptionPlan>[] = [
        { title: "订阅名称", dataIndex: "name", width: 180, render: (_, item) => <Typography.Text strong>{item.name}</Typography.Text> },
        { title: "有效天数", dataIndex: "durationDays", width: 110, render: (_, item) => `${item.durationDays} 天` },
        { title: "状态", dataIndex: "enabled", width: 90, render: (_, item) => <Tag color={item.enabled ? "success" : "default"}>{item.enabled ? "启用" : "停用"}</Tag> },
        { title: "说明", dataIndex: "description", ellipsis: true, render: (_, item) => <Typography.Text type="secondary">{item.description || "-"}</Typography.Text> },
        { title: "更新时间", dataIndex: "updatedAt", width: 180, render: (_, item) => <Typography.Text type="secondary">{formatDate(item.updatedAt)}</Typography.Text> },
        {
            title: "操作",
            key: "actions",
            width: 96,
            align: "right",
            render: (_, item) => (
                <Space size={4}>
                    <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingPlan(item)} />
                    </Tooltip>
                    <Tooltip title="删除">
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => setDeletingPlan(item)} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const codeColumns: ProColumns<AdminRedemptionCode>[] = [
        { title: "兑换码", dataIndex: "code", width: 180, render: (_, item) => <Typography.Text copyable strong>{item.code}</Typography.Text> },
        { title: "类型", dataIndex: "type", width: 100, render: (_, item) => <Tag>{codeTypeLabels[item.type] || item.type}</Tag> },
        {
            title: "内容",
            dataIndex: "credits",
            width: 180,
            render: (_, item) => (item.type === "credits" ? `${item.credits} 点数` : `${item.subscriptionName || "-"} / ${item.subscriptionDurationDays} 天`),
        },
        { title: "使用状态", dataIndex: "used", width: 110, render: (_, item) => <Tag color={item.used ? "blue" : "success"}>{item.used ? "已使用" : "未使用"}</Tag> },
        { title: "使用用户", dataIndex: "usedBy", width: 220, render: (_, item) => (item.usedBy ? <Typography.Text copyable>{item.usedBy}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>) },
        { title: "使用时间", dataIndex: "usedAt", width: 180, render: (_, item) => <Typography.Text type="secondary">{formatDate(item.usedAt)}</Typography.Text> },
        { title: "批次", dataIndex: "batchId", width: 180, ellipsis: true, render: (_, item) => <Typography.Text copyable>{item.batchId}</Typography.Text> },
        { title: "创建时间", dataIndex: "createdAt", width: 180, render: (_, item) => <Typography.Text type="secondary">{formatDate(item.createdAt)}</Typography.Text> },
    ];

    return (
        <main style={{ padding: 24 }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={8} xl={4}>
                        <Card variant="borderless">
                            <Statistic title="新注册奖励" value={marketing.settings.registerCredits} suffix="点" />
                        </Card>
                    </Col>
                    <Col xs={24} md={8} xl={4}>
                        <Card variant="borderless">
                            <Statistic title="每日领取" value={marketing.settings.dailyCredits} suffix="点" />
                        </Card>
                    </Col>
                    <Col xs={24} md={8} xl={4}>
                        <Card variant="borderless">
                            <Statistic title="启用订阅" value={marketingStats?.enabledSubscriptionPlans ?? enabledPlans.length} suffix="个" />
                        </Card>
                    </Col>
                    <Col xs={24} md={8} xl={4}>
                        <Card variant="borderless">
                            <Statistic title="兑换码总量" value={marketingStats?.redemptionCodes || 0} suffix="个" />
                        </Card>
                    </Col>
                    <Col xs={24} md={8} xl={4}>
                        <Card variant="borderless">
                            <Statistic title="未使用码" value={marketingStats?.unusedCodes || 0} suffix="个" />
                        </Card>
                    </Col>
                    <Col xs={24} md={8} xl={4}>
                        <Card variant="borderless">
                            <Statistic title="已使用码" value={marketingStats?.usedCodes || 0} suffix="个" />
                        </Card>
                    </Col>
                </Row>

                <Tabs
                    items={[
                        {
                            key: "settings",
                            label: "基础奖励",
                            children: (
                                <Card variant="borderless">
                                    <Form form={settingsForm} layout="vertical" requiredMark={false}>
                                        <Row gutter={18}>
                                            <Col xs={24} md={8}>
                                                <Form.Item name="registerCredits" label="新注册用户奖励点数" rules={[{ required: true, message: "请输入奖励点数" }]}>
                                                    <InputNumber min={0} precision={0} className="!w-full" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={8}>
                                                <Form.Item name="dailyCredits" label="用户每日可领取点数" rules={[{ required: true, message: "请输入每日点数" }]}>
                                                    <InputNumber min={0} precision={0} className="!w-full" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={8}>
                                                <Form.Item label="操作">
                                                    <Button type="primary" icon={<GiftOutlined />} loading={marketing.isLoading} onClick={() => void saveSettings()}>
                                                        保存奖励设置
                                                    </Button>
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </Form>
                                </Card>
                            ),
                        },
                        {
                            key: "subscriptions",
                            label: "订阅方案",
                            children: (
                                <Space direction="vertical" size={16} style={{ width: "100%" }}>
                                    <Card variant="borderless">
                                        <Row gutter={16} align="bottom">
                                            <Col flex="360px">
                                                <Input.Search value={planKeywordText} placeholder="搜索订阅名称或说明" allowClear enterButton={<SearchOutlined />} onSearch={() => marketing.searchPlans(planKeywordText)} onChange={(event) => setPlanKeywordText(event.target.value)} />
                                            </Col>
                                            <Col flex="none">
                                                <Button icon={<ReloadOutlined />} onClick={() => marketing.searchPlans(planKeywordText)}>
                                                    查询
                                                </Button>
                                            </Col>
                                        </Row>
                                    </Card>
                                    <ProTable<AdminSubscriptionPlan>
                                        rowKey="id"
                                        columns={planColumns}
                                        dataSource={marketing.plans}
                                        loading={marketing.isLoading}
                                        search={false}
                                        defaultSize="middle"
                                        tableLayout="fixed"
                                        cardProps={{ variant: "borderless" }}
                                        headerTitle={<Typography.Text strong>订阅方案</Typography.Text>}
                                        options={{ density: true, setting: true, reload: () => marketing.refresh() }}
                                        toolBarRender={() => [
                                            <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingPlan({ enabled: true, durationDays: 30 })}>
                                                新增订阅
                                            </Button>,
                                        ]}
                                        pagination={{
                                            current: marketing.planPage,
                                            pageSize: marketing.planPageSize,
                                            total: marketing.planTotal,
                                            showSizeChanger: true,
                                            showTotal: (value) => `共 ${value} 条`,
                                            onChange: (page, pageSize) => (pageSize !== marketing.planPageSize ? marketing.changePlanPageSize(pageSize) : marketing.changePlanPage(page)),
                                        }}
                                    />
                                </Space>
                            ),
                        },
                        {
                            key: "codes",
                            label: "兑换码",
                            children: (
                                <Space direction="vertical" size={16} style={{ width: "100%" }}>
                                    <Card variant="borderless">
                                        <Row gutter={16} align="bottom">
                                            <Col flex="320px">
                                                <Input.Search value={codeKeywordText} placeholder="搜索兑换码、批次或用户" allowClear enterButton={<SearchOutlined />} onSearch={() => marketing.searchCodes(codeKeywordText, marketing.codeType, marketing.codeStatus, codeBatchText)} onChange={(event) => setCodeKeywordText(event.target.value)} />
                                            </Col>
                                            <Col flex="180px">
                                                <Segmented
                                                    block
                                                    value={marketing.codeType || "all"}
                                                    options={[
                                                        { label: "全部", value: "all" },
                                                        { label: "点数", value: "credits" },
                                                        { label: "订阅", value: "subscription" },
                                                    ]}
                                                    onChange={(value) => marketing.searchCodes(codeKeywordText, value === "all" ? "" : String(value), marketing.codeStatus, codeBatchText)}
                                                />
                                            </Col>
                                            <Col flex="180px">
                                                <Segmented
                                                    block
                                                    value={marketing.codeStatus || "all"}
                                                    options={[
                                                        { label: "全部", value: "all" },
                                                        { label: "未使用", value: "unused" },
                                                        { label: "已使用", value: "used" },
                                                    ]}
                                                    onChange={(value) => marketing.searchCodes(codeKeywordText, marketing.codeType, value === "all" ? "" : String(value), codeBatchText)}
                                                />
                                            </Col>
                                            <Col flex="240px">
                                                <Input value={codeBatchText} placeholder="按批次 ID 精确筛选" allowClear onChange={(event) => setCodeBatchText(event.target.value)} onPressEnter={() => marketing.searchCodes(codeKeywordText, marketing.codeType, marketing.codeStatus, codeBatchText)} />
                                            </Col>
                                            <Col flex="none">
                                                <Space>
                                                    <Button onClick={marketing.resetCodeFilters}>重置</Button>
                                                    <Button icon={<ReloadOutlined />} onClick={() => marketing.searchCodes(codeKeywordText, marketing.codeType, marketing.codeStatus, codeBatchText)}>
                                                        查询
                                                    </Button>
                                                </Space>
                                            </Col>
                                        </Row>
                                    </Card>
                                    <ProTable<AdminRedemptionCode>
                                        rowKey="id"
                                        columns={codeColumns}
                                        dataSource={marketing.codes}
                                        loading={marketing.isLoading}
                                        search={false}
                                        defaultSize="middle"
                                        tableLayout="fixed"
                                        scroll={{ x: 1380 }}
                                        cardProps={{ variant: "borderless" }}
                                        headerTitle={<Typography.Text strong>兑换码列表</Typography.Text>}
                                        options={{ density: true, setting: true, reload: () => marketing.refresh() }}
                                        toolBarRender={() => [
                                            ...(marketing.lastGeneratedCodes.length ? [
                                                <Button key="last" icon={<CopyOutlined />} onClick={() => setIsGeneratedModalOpen(true)}>
                                                    最近生成
                                                </Button>
                                            ] : []),
                                            <Button key="copy" icon={<CopyOutlined />} onClick={() => copyUnusedCodes(marketing.codes, message)}>
                                                复制未使用码
                                            </Button>,
                                            <Button key="generate" type="primary" icon={<PlusOutlined />} onClick={() => setIsCodeModalOpen(true)}>
                                                生成兑换码
                                            </Button>,
                                        ]}
                                        pagination={{
                                            current: marketing.codePage,
                                            pageSize: marketing.codePageSize,
                                            total: marketing.codeTotal,
                                            showSizeChanger: true,
                                            showTotal: (value) => `共 ${value} 条`,
                                            onChange: (page, pageSize) => (pageSize !== marketing.codePageSize ? marketing.changeCodePageSize(pageSize) : marketing.changeCodePage(page)),
                                        }}
                                    />
                                </Space>
                            ),
                        },
                    ]}
                />
            </Space>

            <Modal title={editingPlan?.id ? "编辑订阅" : "新增订阅"} open={Boolean(editingPlan)} width={620} onCancel={() => setEditingPlan(null)} onOk={() => void savePlan()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={planForm} layout="vertical" requiredMark={false}>
                    <Row gutter={14}>
                        <Col span={12}>
                            <Form.Item name="name" label="订阅名称" rules={[{ required: true, message: "请输入订阅名称" }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="durationDays" label="有效天数" rules={[{ required: true, message: "请输入有效天数" }]}>
                                <InputNumber min={1} precision={0} className="!w-full" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="enabled" label="启用" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="description" label="说明">
                                <Input.TextArea rows={3} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            <Modal
                title="删除订阅"
                open={Boolean(deletingPlan)}
                onCancel={() => setDeletingPlan(null)}
                onOk={async () => {
                    if (!deletingPlan) return;
                    await marketing.deletePlan(deletingPlan.id);
                    setDeletingPlan(null);
                }}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除订阅「{deletingPlan?.name}」吗？
            </Modal>

            <Modal title="生成兑换码" open={isCodeModalOpen} width={620} onCancel={() => setIsCodeModalOpen(false)} onOk={() => void generateCodes()} okText="生成" cancelText="取消" destroyOnHidden>
                <Form form={codeForm} layout="vertical" requiredMark={false}>
                    <Row gutter={14}>
                        <Col span={12}>
                            <Form.Item name="type" label="类型" rules={[{ required: true, message: "请选择类型" }]}>
                                <Select
                                    options={[
                                        { label: "点数", value: "credits" },
                                        { label: "订阅", value: "subscription" },
                                    ]}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="count" label="生成数量" rules={[{ required: true, message: "请输入生成数量" }]}>
                                <InputNumber min={1} max={500} precision={0} className="!w-full" />
                            </Form.Item>
                        </Col>
                        {codeType === "credits" ? (
                            <Col span={24}>
                                <Form.Item name="credits" label="点数数量" rules={[{ required: true, message: "请输入点数数量" }]}>
                                    <InputNumber min={1} precision={0} className="!w-full" />
                                </Form.Item>
                            </Col>
                        ) : (
                            <Col span={24}>
                                <Form.Item name="subscriptionId" label="订阅类型" rules={[{ required: true, message: "请选择订阅类型" }]}>
                                    <Select options={enabledPlans.map((plan) => ({ label: `${plan.name} / ${plan.durationDays} 天`, value: plan.id }))} />
                                </Form.Item>
                            </Col>
                        )}
                    </Row>
                </Form>
            </Modal>

            <Modal
                title="最近生成的兑换码"
                open={isGeneratedModalOpen}
                width={620}
                onCancel={() => setIsGeneratedModalOpen(false)}
                footer={[
                    <Button key="clear" onClick={() => marketing.clearLastGeneratedCodes()}>
                        清空
                    </Button>,
                    <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={() => copyText(marketing.lastGeneratedCodes.join("\n"), message, "最近生成的兑换码已复制")}>
                        复制全部
                    </Button>,
                ]}
            >
                <Flex vertical gap={12}>
                    <Typography.Text type="secondary">本批次兑换码可直接复制，关闭后可在兑换码列表中按批次检索。</Typography.Text>
                    <Input.TextArea value={marketing.lastGeneratedCodes.join("\n")} rows={Math.min(12, Math.max(4, marketing.lastGeneratedCodes.length))} readOnly />
                </Flex>
            </Modal>
        </main>
    );
}

function formatDate(value: string) {
    return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-";
}

function copyUnusedCodes(codes: AdminRedemptionCode[], message: { success: (content: string) => void; warning: (content: string) => void }) {
    const text = codes.filter((item) => !item.used).map((item) => item.code).join("\n");
    if (!text) {
        message.warning("当前列表没有未使用兑换码");
        return;
    }
    copyText(text, message, "未使用兑换码已复制");
}

function copyText(text: string, message: { success: (content: string) => void; warning: (content: string) => void }, successText: string) {
    if (!text) {
        message.warning("没有可复制内容");
        return;
    }
    void navigator.clipboard.writeText(text);
    message.success(successText);
}

"use client";

import { App, Button, Col, Form, Input, Modal, Row, Space, Statistic, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { CreditSymbol } from "@/constant/credits";
import { claimDailyCredits, fetchMarketingStatus, redeemMarketingCode, type MarketingStatus } from "@/services/api/marketing";
import { useUserStore } from "@/stores/use-user-store";

type RedeemCenterModalProps = {
    open: boolean;
    onClose: () => void;
};

export function RedeemCenterModal({ open, onClose }: RedeemCenterModalProps) {
    const { message } = App.useApp();
    const [form] = Form.useForm<{ code: string }>();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const setSession = useUserStore((state) => state.setSession);
    const [status, setStatus] = useState<MarketingStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);
    const [isRedeeming, setIsRedeeming] = useState(false);

    useEffect(() => {
        if (!open || !token) return;
        setIsLoading(true);
        void fetchMarketingStatus(token)
            .then((data) => {
                setStatus(data);
                setSession(token, data.user);
            })
            .catch((error) => message.error(error instanceof Error ? error.message : "读取兑换信息失败"))
            .finally(() => setIsLoading(false));
    }, [message, open, setSession, token]);

    const claimDaily = async () => {
        if (!token) return;
        setIsClaiming(true);
        try {
            const data = await claimDailyCredits(token);
            setStatus(data);
            setSession(token, data.user);
            message.success("已领取");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "领取失败");
        } finally {
            setIsClaiming(false);
        }
    };

    const redeemCode = async () => {
        if (!token) return;
        const value = await form.validateFields();
        setIsRedeeming(true);
        try {
            const result = await redeemMarketingCode(token, value.code);
            setSession(token, result.user);
            setStatus((current) =>
                current ? { ...current, user: result.user, subscriptionId: result.user.subscriptionId, subscriptionName: result.user.subscriptionName, subscriptionExpireAt: result.user.subscriptionExpireAt } : current,
            );
            void fetchMarketingStatus(token).then(setStatus).catch(() => undefined);
            form.resetFields();
            message.success(result.message || "兑换成功");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "兑换失败");
        } finally {
            setIsRedeeming(false);
        }
    };

    const currentUser = status?.user || user;
    const dailyCredits = status?.marketing.dailyCredits || 0;
    const subscriptionName = currentUser?.subscriptionName || status?.subscriptionName || "";
    const subscriptionExpireAt = currentUser?.subscriptionExpireAt || status?.subscriptionExpireAt || "";

    return (
        <Modal title="兑换中心" open={open} onCancel={onClose} footer={null} width={560} destroyOnHidden>
            <Space direction="vertical" size={18} style={{ width: "100%" }}>
                <Row gutter={12}>
                    <Col span={12}>
                        <Statistic title="当前点数" value={currentUser?.credits || 0} prefix={<CreditSymbol />} loading={isLoading} />
                    </Col>
                    <Col span={12}>
                        <Statistic title="每日可领取" value={dailyCredits} suffix="点" loading={isLoading} />
                    </Col>
                </Row>
                <div>
                    <Typography.Text type="secondary">订阅状态</Typography.Text>
                    <div style={{ marginTop: 8 }}>
                        {subscriptionName ? (
                            <Space wrap>
                                <Tag color="blue">{subscriptionName}</Tag>
                                <Typography.Text>{subscriptionExpireAt ? `${formatDate(subscriptionExpireAt)} 到期` : "已开通"}</Typography.Text>
                            </Space>
                        ) : (
                            <Typography.Text>未开通</Typography.Text>
                        )}
                    </div>
                </div>
                <Row gutter={12} align="middle">
                    <Col flex="auto">
                        <Typography.Text type="secondary">{status?.dailyClaimed ? "今日已领取" : "今日可领取"}</Typography.Text>
                    </Col>
                    <Col flex="none">
                        <Button type="primary" disabled={!dailyCredits || status?.dailyClaimed} loading={isClaiming} onClick={() => void claimDaily()}>
                            领取每日点数
                        </Button>
                    </Col>
                </Row>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="code" label="兑换码" rules={[{ required: true, message: "请输入兑换码" }]}>
                        <Input placeholder="XXXX-XXXX-XXXX" autoComplete="off" />
                    </Form.Item>
                    <Button block type="primary" loading={isRedeeming} onClick={() => void redeemCode()}>
                        兑换
                    </Button>
                </Form>
            </Space>
        </Modal>
    );
}

function formatDate(value: string) {
    return dayjs(value).format("YYYY-MM-DD HH:mm:ss");
}

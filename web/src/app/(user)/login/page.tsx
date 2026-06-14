"use client";

import { LockOutlined, MailOutlined, SafetyOutlined, UserOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, Segmented, Space } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { fetchCurrentUser } from "@/services/api/auth";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type LoginFormValues = {
    username: string;
    password: string;
    confirmPassword?: string;
    email?: string;
    code?: string;
};

const EMAIL_PATTERN = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

// 仅放行站内相对路径，拦截开放重定向。浏览器会忽略 URL 中的 Tab/换行/回车，并把
// //host 或 /\host 解析为协议相对的跨站地址，因此先剥离控制字符，再拒绝 // 与 /\ 前缀。
function safeRedirect(value: string | null): string {
    const cleaned = (value ?? "").replace(/[\t\n\r]/g, "");
    if (!cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.startsWith("/\\")) {
        return "/";
    }
    return cleaned;
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginContent />
        </Suspense>
    );
}

function LoginContent() {
    const { message } = App.useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const login = useUserStore((state) => state.login);
    const register = useUserStore((state) => state.register);
    const sendCode = useUserStore((state) => state.sendEmailCode);
    const setSession = useUserStore((state) => state.setSession);
    const isLoading = useUserStore((state) => state.isLoading);
    const linuxDoEnabled = useConfigStore((state) => state.publicSettings?.auth?.linuxDo?.enabled === true);
    const allowRegister = useConfigStore((state) => state.publicSettings?.auth?.allowRegister !== false);
    const [mode, setMode] = useState<"login" | "register">("login");
    const [cooldown, setCooldown] = useState(0);
    const [emailDomain, setEmailDomain] = useState("qq.com");
    const [sendingCode, setSendingCode] = useState(false);
    const [form] = Form.useForm<LoginFormValues>();
    const redirect = safeRedirect(searchParams.get("redirect"));

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = window.setInterval(() => setCooldown((value) => (value > 0 ? value - 1 : 0)), 1000);
        return () => window.clearInterval(timer);
    }, [cooldown]);

    useEffect(() => {
        const token = searchParams.get("token");
        const error = searchParams.get("error");
        if (error) message.error(error);
        if (!token) return;
        void fetchCurrentUser(token).then((user) => {
            setSession(token, user);
            message.success("登录成功");
            router.replace(redirect);
            router.refresh();
        });
    }, [message, redirect, router, searchParams, setSession]);

    useEffect(() => {
        if (!allowRegister && mode === "register") setMode("login");
    }, [allowRegister, mode]);

    const handleSendCode = async (email: string) => {
        const normalized = email.trim().toLowerCase();
        if (!EMAIL_PATTERN.test(normalized)) {
            message.error("请输入有效的邮箱地址");
            return;
        }
        if (cooldown > 0 || sendingCode) return;
        setSendingCode(true);
        try {
            const result = await sendCode(normalized);
            setEmailDomain(result.emailDomain);
            setCooldown(result.cooldownSeconds > 0 ? result.cooldownSeconds : 60);
            message.success(`验证码已发送至 ${normalized}，${Math.round(result.ttlSeconds / 60)} 分钟内有效`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "验证码发送失败");
        } finally {
            setSendingCode(false);
        }
    };

    const submit = async (values: LoginFormValues) => {
        try {
            if (mode === "register" && !allowRegister) {
                message.error("当前未开放注册");
                return;
            }
            if (mode === "register" && values.password !== values.confirmPassword) {
                message.error("两次输入的密码不一致");
                return;
            }
            if (mode === "register") {
                const email = (values.email ?? "").trim().toLowerCase();
                if (!EMAIL_PATTERN.test(email)) {
                    message.error("请输入有效的邮箱地址");
                    return;
                }
                if (!values.code) {
                    message.error("请输入邮箱验证码");
                    return;
                }
            }
            const user = mode === "register"
                ? await register({ username: values.username, password: values.password, email: (values.email ?? "").trim().toLowerCase(), code: values.code ?? "" })
                : await login({ username: values.username, password: values.password });
            message.success(mode === "register" ? "注册成功" : "登录成功");
            router.replace(redirect);
            router.refresh();
            if (user.role !== "admin") router.replace("/");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        }
    };

    return (
        <main className="brand-app-bg brand-grid-bg flex h-full min-h-0 items-center justify-center overflow-y-auto px-6 py-10">
            <section className="brand-panel w-full max-w-[420px] rounded-2xl p-7">
                <div className="mb-7 text-center">
                    <img src="/logo-icon.png" alt="无限画布" className="mx-auto mb-4 size-16 rounded-2xl shadow-[0_16px_34px_rgba(10,132,255,0.32)]" />
                    <h1 className="text-3xl font-semibold tracking-normal text-slate-950 dark:text-sky-50">账号登录</h1>
                    <p className="mt-3 text-base leading-7 text-slate-500 dark:text-sky-100/[0.62]">登录后同步画布、配置和素材资产。</p>
                </div>

                <Form<LoginFormValues> form={form} layout="vertical" size="large" requiredMark={false} onFinish={submit}>
                    <Form.Item>
                        <Segmented
                            block
                            value={mode}
                            onChange={(value) => setMode(value as "login" | "register")}
                            options={allowRegister ? [{ label: "登录", value: "login" }, { label: "注册", value: "register" }] : [{ label: "登录", value: "login" }]}
                        />
                    </Form.Item>
                    <Form.Item name="username" label={<span className="font-medium text-slate-800 dark:text-sky-100">用户名</span>} rules={[{ required: true, message: "请输入用户名" }]}>
                        <Input prefix={<UserOutlined />} autoComplete="username" />
                    </Form.Item>
                    <Form.Item name="password" label={<span className="font-medium text-slate-800 dark:text-sky-100">密码</span>} rules={[{ required: true, message: "请输入密码" }]}>
                        <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
                    </Form.Item>
                    {mode === "register" ? (
                        <Form.Item name="email" label={<span className="font-medium text-slate-800 dark:text-sky-100">QQ 邮箱</span>} rules={[{ required: true, message: "请输入 QQ 邮箱" }, { pattern: EMAIL_PATTERN, message: "邮箱格式不正确" }]} extra={<span className="text-xs text-slate-500 dark:text-sky-100/60">仅支持 @{emailDomain} 邮箱注册，需要先收一封验证邮件</span>}>
                            <Input prefix={<MailOutlined />} autoComplete="email" placeholder="例如：yourname@qq.com" />
                        </Form.Item>
                    ) : null}
                    {mode === "register" ? (
                        <Form.Item name="code" label={<span className="font-medium text-slate-800 dark:text-sky-100">邮箱验证码</span>} rules={[{ required: true, message: "请输入邮箱验证码" }, { len: 6, message: "验证码为 6 位数字" }]}>
                        <Input prefix={<SafetyOutlined />} autoComplete="one-time-code" placeholder="6 位数字" maxLength={6} addonAfter={(
                            <Button type="link" size="small" disabled={cooldown > 0 || sendingCode} loading={sendingCode} onClick={() => void handleSendCode(form.getFieldValue("email") ?? "")}>
                                {cooldown > 0 ? `${cooldown} 秒后重发` : "发送验证码"}
                            </Button>
                        )} />
                    </Form.Item>
                    ) : null}
                    {mode === "register" ? (
                        <Form.Item name="confirmPassword" label={<span className="font-medium text-slate-800 dark:text-sky-100">确认密码</span>} rules={[{ required: true, message: "请再次输入密码" }]}>
                            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
                        </Form.Item>
                    ) : null}
                    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                        <Button block type="primary" htmlType="submit" loading={isLoading}>
                            {mode === "register" ? "注册" : "登录"}
                        </Button>
                        {linuxDoEnabled ? (
                            <Button block href={`/api/auth/linux-do/authorize?redirect=${encodeURIComponent(redirect)}`} icon={<img src="/icons/linuxdo.svg" alt="" width={18} height={18} />}>
                                使用 Linux.do 登录
                            </Button>
                        ) : null}
                    </Space>
                </Form>
            </section>
        </main>
    );
}

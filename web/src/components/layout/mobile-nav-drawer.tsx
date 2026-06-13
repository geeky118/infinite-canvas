"use client";

import { Drawer } from "antd";
import Link from "next/link";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    return (
        <Drawer
            title={
                <span className="inline-flex items-center gap-2">
                    <img src="/logo-64.png" alt="" className="size-7 rounded-md" />
                    导航
                </span>
            }
            placement="left"
            size={280}
            open={open}
            onClose={onClose}
            className="md:hidden"
            classNames={{ header: "!border-blue-100 dark:!border-sky-400/[0.15]", body: "!bg-white dark:!bg-[#071524]" }}
            styles={{ wrapper: { background: "var(--surface-panel-strong)", borderRight: "1px solid var(--surface-border)" } }}
        >
            <div className="space-y-1">
                {navigationTools.map((tool) => {
                    const Icon = tool.icon;
                    const active = tool.slug === activeToolSlug;
                    return (
                        <Link
                            key={tool.slug}
                            href={`/${tool.slug}`}
                            onClick={onClose}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-3 text-base transition",
                                active ? "bg-blue-50 font-medium text-blue-700 dark:bg-sky-400/10 dark:text-sky-200" : "text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-sky-100/[0.72] dark:hover:bg-sky-400/10 dark:hover:text-sky-100",
                            )}
                        >
                            <Icon className="size-5" />
                            <span>{tool.label}</span>
                        </Link>
                    );
                })}
            </div>
        </Drawer>
    );
}

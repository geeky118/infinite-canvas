import type { CSSProperties } from "react";
import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const brand = {
    light: {
        primary: "#0A84FF",
        primaryHover: "#006FE6",
        primaryText: "#ffffff",
        menuBg: "#EAF4FF",
        menuText: "#0757B8",
        selectActiveBg: "#F0F7FF",
        selectSelectedBg: "#E3F1FF",
        selectText: "#073B8E",
        tableSelectedBg: "rgba(10, 132, 255, 0.08)",
        tableSelectedHoverBg: "rgba(10, 132, 255, 0.12)",
    },
    dark: {
        primary: "#52B5FF",
        primaryHover: "#84CCFF",
        primaryText: "#04111F",
        menuBg: "rgba(82, 181, 255, 0.14)",
        menuText: "#E7F6FF",
        selectActiveBg: "rgba(82, 181, 255, 0.12)",
        selectSelectedBg: "rgba(82, 181, 255, 0.18)",
        selectText: "#F6FBFF",
        tableSelectedBg: "rgba(82, 181, 255, 0.12)",
        tableSelectedHoverBg: "rgba(82, 181, 255, 0.18)",
    },
};

export const adminLayoutStyle = {
    siderWidth: 232,
    headerHeight: 56,
    brandHeight: 64,
    menu: { borderInlineEnd: 0, padding: "18px 12px", fontSize: 15 } satisfies CSSProperties,
    menuItem: { height: 44, lineHeight: "44px", marginBlock: 4, borderRadius: 8 } satisfies CSSProperties,
};

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    const color = dark ? brand.dark : brand.light;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "infinite-canvas-dark" : "infinite-canvas-light" },
        token: {
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            borderRadius: 8,
            borderRadiusLG: 8,
            colorBgLayout: dark ? "#061320" : "#F5FAFF",
            colorBgContainer: dark ? "#0B1724" : "#FFFFFF",
            colorBgElevated: dark ? "#101D2B" : "#FFFFFF",
            colorBorder: dark ? "rgba(148, 190, 230, 0.18)" : "#D7E7F7",
            colorText: dark ? "#EAF5FF" : "#0B1724",
            colorTextSecondary: dark ? "#9EB6CF" : "#536D88",
        },
        components: {
            Button: {
                primaryShadow: "none",
                defaultHoverBorderColor: color.primary,
                defaultHoverColor: color.primary,
            },
            Menu: {
                itemActiveBg: color.menuBg,
                itemHoverBg: color.menuBg,
                itemSelectedBg: color.menuBg,
                itemSelectedColor: color.menuText,
                darkItemHoverBg: brand.dark.menuBg,
                darkItemSelectedBg: brand.dark.menuBg,
                darkItemSelectedColor: brand.dark.menuText,
            },
            Select: {
                optionActiveBg: color.selectActiveBg,
                optionSelectedBg: color.selectSelectedBg,
                optionSelectedColor: color.selectText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

// 首页首屏和提示词缺省封面统一指向 COS 上预压缩的 WebP 资源，避免主图在客户端首次加载时阻塞首屏。
export const BRAND_HERO_IMAGE_URL = "https://haojiang-1332489043.cos.ap-guangzhou.myqcloud.com/brand/creator-hero.webp";

import type { NextConfig } from "next";

const staticExport = process.env.DEMO_EXPORT === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(staticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
        assetPrefix: process.env.NEXT_PUBLIC_ASSET_BASE || undefined,
        images: { unoptimized: true }
      }
    : {})
};

export default nextConfig;

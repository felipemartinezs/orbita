import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence Turbopack/webpack conflict warning in Next.js 16
  turbopack: {},
  // canvas: false alias prevents pdf.js from trying to use node canvas
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;

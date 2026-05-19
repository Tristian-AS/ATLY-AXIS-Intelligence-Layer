import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: false,
  },
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;

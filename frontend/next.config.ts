import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // allows `next build` to succeed even if eslint finds errors
    ignoreDuringBuilds: true,
  },

};

export default nextConfig;

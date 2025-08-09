// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',           // good for Docker
  reactStrictMode: true,
};

export default nextConfig;

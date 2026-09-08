/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // No bloquear el build en Vercel por advertencias de estilo
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;

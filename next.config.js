/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // No bloquear el build en Vercel por advertencias de estilo
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // react-pdf/pdfjs-dist intenta resolver "canvas" (solo se usa para
    // renderizar PDFs en Node); no se usa en esta app, que solo lo carga
    // en el navegador, así que se ignora para que no rompa el build.
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = nextConfig;

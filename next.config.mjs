/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep dev artifacts separate from production build artifacts to avoid
  // stale asset manifests (seen as /_next/static/css/app/layout.css 404 in dev).
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;

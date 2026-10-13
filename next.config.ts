import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["sanitize-html"],
  images: { unoptimized: true },
};
export default config;

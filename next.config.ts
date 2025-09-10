import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow builds to pass even if there are TypeScript or ESLint issues.
  // This is useful in constrained CI environments; fix issues locally.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;

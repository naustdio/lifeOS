import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Boundary enforcement, tokens, and type-checking run in the explicit
  // `pnpm verify` gate (see design.md §2 Gate C) rather than relying on
  // Next.js's own build-time lint step, whose behavior has changed across
  // major versions.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

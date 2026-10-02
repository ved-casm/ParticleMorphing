import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Old demo URLs keep working after the move to /version-2 and /version-3.
  async redirects() {
    return [
      { source: "/demo", destination: "/version-2", permanent: false },
      { source: "/demo1", destination: "/version-3", permanent: false },
    ];
  },
};

export default nextConfig;

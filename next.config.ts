import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Old demo URLs keep working: /demo is now Version 1 (particle morph), /demo1 Version 2 (depth field).
  async redirects() {
    return [
      { source: "/demo", destination: "/version-1", permanent: false },
      { source: "/demo1", destination: "/version-2", permanent: false },
      { source: "/version-3", destination: "/version-2", permanent: false },
    ];
  },
};

export default nextConfig;

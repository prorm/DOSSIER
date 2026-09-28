import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "pdf-lib", "qrcode"],
  // Packs are read at runtime from ./packs; make sure the standalone trace keeps drizzle migrations.
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
  experimental: {
    optimizePackageImports: ["lucide-react", "motion"],
  },
};

export default config;

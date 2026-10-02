import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // The dev badge sits on top of the HUD in every demo recording; build errors still surface in the overlay.
  devIndicators: false,
  reactStrictMode: true,
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "pdf-lib", "qrcode"],
  // Packs are read at runtime from ./packs; make sure the standalone trace keeps drizzle migrations.
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
  experimental: {
    optimizePackageImports: ["lucide-react", "motion", "@react-three/drei", "@react-three/postprocessing"],
  },
};

export default config;

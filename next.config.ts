import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The /admin/pitch route reads private/pitch-demo.html at request time via a
  // process.cwd() path. Vercel's output tracer won't detect a runtime fs.readFile,
  // so include the file explicitly or it gets stripped from the deploy bundle.
  outputFileTracingIncludes: {
    "/admin/pitch": ["./private/pitch-demo.html"],
  },
};

export default nextConfig;

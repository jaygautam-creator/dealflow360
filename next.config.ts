import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project keeps its own documentation in README.md and docs/; the generated
  // agent-rules files are noise in the repo.
  agentRules: false,
  /* config options here */
};

export default nextConfig;

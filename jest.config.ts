import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        module: "commonjs",
        esModuleInterop: true,
      },
    }],
  },
  moduleNameMapper: {
    // Handle .js extensions in ESM-style imports
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testTimeout: 60_000,
  // No forceExit needed: afterAll() in orchestrator.test.ts calls mcpClient.disconnect(),
  // which explicitly closes the StdioClientTransport child process so Jest exits cleanly.
  openHandlesTimeout: 2000,
};


export default config;

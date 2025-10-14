import { spawn } from "child_process";

const commands = [
  ["pnpm", ["hardhat", "compile"]],
  ["pnpm", ["hardhat", "test", "test/v2/GlobalGovernanceCouncil.test.ts"]]
];

async function run() {
  for (const [cmd, args] of commands) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: "inherit" });
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
        }
      });
    });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { readFile } from "fs/promises";
import path from "path";
import type { MissionConfig, OwnerCapabilityAudit } from "./types";

export type PackageScripts = Record<string, string | undefined>;

export interface OwnerScriptStatus {
  script: string;
  available: boolean;
}

const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

async function loadPackageJson(repoRoot: string): Promise<{ scripts?: PackageScripts }> {
  const packagePath = path.join(repoRoot, "package.json");
  const raw = await readFile(packagePath, "utf8");
  return JSON.parse(raw) as { scripts?: PackageScripts };
}

export async function loadPackageScripts(repoRoot: string = DEFAULT_REPO_ROOT): Promise<PackageScripts> {
  const pkg = await loadPackageJson(repoRoot);
  return pkg.scripts ?? {};
}

export function inspectCommand(command: string, scripts: PackageScripts): boolean {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return false;
  }

  if (tokens[0] === "npm" && tokens[1] === "run" && tokens.length >= 3) {
    let index = 2;
    while (index < tokens.length && tokens[index].startsWith("-") && tokens[index] !== "--") {
      index += 1;
    }
    if (index < tokens.length && tokens[index] === "--") {
      index += 1;
    }
    if (index >= tokens.length) {
      return false;
    }
    const scriptName = tokens[index];
    return Boolean(scriptName && scripts[scriptName]);
  }

  if (tokens[0] === "npx" || tokens[0] === "node" || tokens[0] === "ts-node") {
    return true;
  }

  return true;
}

export function evaluateOwnerScripts(commands: string[], scripts: PackageScripts): OwnerScriptStatus[] {
  return commands.map((command) => ({
    script: command,
    available: inspectCommand(command, scripts),
  }));
}

export async function auditOwnerScripts(
  mission: MissionConfig,
  options: { repoRoot?: string; scripts?: PackageScripts } = {},
): Promise<OwnerScriptStatus[]> {
  const scripts = options.scripts ?? (await loadPackageScripts(options.repoRoot));
  const commands = mission.meta.governance?.ownerScripts ?? [];
  return evaluateOwnerScripts(commands, scripts);
}

export function auditOwnerCapabilities(
  mission: MissionConfig,
  options: { scripts: PackageScripts },
): OwnerCapabilityAudit[] {
  const { scripts } = options;
  return mission.ownerControls.capabilities.map((capability) => ({
    capability,
    commandAvailable: inspectCommand(capability.command, scripts),
    verificationAvailable: inspectCommand(capability.verification, scripts),
  }));
}

export async function loadOwnerCapabilities(
  mission: MissionConfig,
  options: { repoRoot?: string; scripts?: PackageScripts } = {},
): Promise<OwnerCapabilityAudit[]> {
  const scripts = options.scripts ?? (await loadPackageScripts(options.repoRoot));
  return auditOwnerCapabilities(mission, { scripts });
}

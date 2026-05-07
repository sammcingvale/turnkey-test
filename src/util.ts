import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { formatEther, formatUnits } from "viem";
import { USDC_DECIMALS } from "./chain.js";

export function fmtEth(wei: bigint): string {
  return `${formatEther(wei)} ETH`;
}

export function fmtUsdc(units: bigint): string {
  return `${formatUnits(units, USDC_DECIMALS)} USDC`;
}

export async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${message} [type 'yes' to continue]: `);
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

export interface CliFlags {
  dryRun: boolean;
  yes: boolean;
  limit?: number;
}

export function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--yes" || a === "-y") flags.yes = true;
    else if (a === "--limit") {
      const v = argv[++i];
      if (!v) throw new Error("--limit requires a value");
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`--limit must be a positive integer, got: ${v}`);
      }
      flags.limit = n;
    } else if (a && a.startsWith("--")) {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  return flags;
}

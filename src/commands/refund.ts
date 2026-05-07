import { erc20Abi, type Address } from "viem";
import { env } from "../env.js";
import {
  explorerTx,
  publicClient,
  readBalances,
  USDC_ADDRESS,
} from "../chain.js";
import { readState } from "../state.js";
import { walletClientFor } from "../turnkey.js";
import { confirm, fmtEth, fmtUsdc, type CliFlags } from "../util.js";

const REFUND_GAS_ESTIMATE = 100_000n;

interface Plan {
  name: string;
  address: Address;
  ethBalance: bigint;
  usdcBalance: bigint;
  skipReason?: string;
}

export async function refund(flags: CliFlags): Promise<void> {
  const state = readState();
  const targets = flags.limit
    ? state.testWallets.slice(0, flags.limit)
    : state.testWallets;

  const feeData = await publicClient.estimateFeesPerGas();
  const minEthForGas = REFUND_GAS_ESTIMATE * feeData.maxFeePerGas;

  console.log(`refund target: ${env.refundAddress}`);
  console.log(`min ETH per wallet for gas: ${fmtEth(minEthForGas)}\n`);

  const balances = await readBalances(targets.map((w) => w.address));
  const plans: Plan[] = targets.map((w) => {
    const { eth, usdc } = balances.get(w.address)!;
    let skipReason: string | undefined;
    if (usdc === 0n) skipReason = "no USDC";
    else if (eth < minEthForGas)
      skipReason = `insufficient ETH (have ${fmtEth(eth)}, need ${fmtEth(minEthForGas)}) — run \`npm run fund-gas\``;
    return {
      name: w.name,
      address: w.address,
      ethBalance: eth,
      usdcBalance: usdc,
      skipReason,
    };
  });

  for (const p of plans) {
    const status = p.skipReason ? `SKIP (${p.skipReason})` : `send ${fmtUsdc(p.usdcBalance)}`;
    console.log(`  ${p.name}  ${p.address}  ${status}`);
  }

  const sendable = plans.filter((p) => !p.skipReason);
  const blocked = plans.filter(
    (p) => p.skipReason && p.skipReason.startsWith("insufficient ETH"),
  );

  if (blocked.length > 0 && !flags.dryRun) {
    throw new Error(
      `${blocked.length} wallet(s) have USDC but not enough ETH for gas. run \`npm run fund-gas\` first, or pass --dry-run to preview.`,
    );
  }

  if (sendable.length === 0) {
    console.log("\nnothing to refund.");
    return;
  }

  if (flags.dryRun) {
    console.log("\n--dry-run set; not sending any tx.");
    return;
  }

  if (!flags.yes) {
    const totalUsdc = sendable.reduce((acc, p) => acc + p.usdcBalance, 0n);
    const ok = await confirm(
      `\nsend ${fmtUsdc(totalUsdc)} total from ${sendable.length} wallets to ${env.refundAddress}?`,
    );
    if (!ok) {
      console.log("aborted.");
      return;
    }
  }

  for (const p of sendable) {
    process.stdout.write(`  refunding ${p.name} (${fmtUsdc(p.usdcBalance)})... `);
    const wc = await walletClientFor(p.address);
    const hash = await wc.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "transfer",
      args: [env.refundAddress, p.usdcBalance],
    });
    console.log(explorerTx(hash));
  }
  console.log("\ndone. run `npm run sweep-gas` to recover leftover ETH.");
}

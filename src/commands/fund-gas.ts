import { env } from "../env.js";
import { explorerTx, publicClient, readBalances } from "../chain.js";
import { readState } from "../state.js";
import { walletClientFor } from "../turnkey.js";
import { confirm, fmtEth, type CliFlags } from "../util.js";

// rough upper bound for one ERC20 transfer + buffer
const REFUND_GAS_ESTIMATE = 100_000n;
// gas budget for the topup tx itself (paid by gas tank)
const TOPUP_GAS_ESTIMATE = 21_000n;

export async function fundGas(flags: CliFlags): Promise<void> {
  const state = readState();
  const targets = flags.limit
    ? state.testWallets.slice(0, flags.limit)
    : state.testWallets;

  const topup = env.gasTopupWei;
  const feeData = await publicClient.estimateFeesPerGas();
  const minRefundGas = REFUND_GAS_ESTIMATE * feeData.maxFeePerGas;
  const perTopupCost = topup + TOPUP_GAS_ESTIMATE * feeData.maxFeePerGas;

  // batched read: gas tank + every test wallet, eth + usdc
  const balances = await readBalances([
    state.gasTank.address,
    ...targets.map((w) => w.address),
  ]);
  const gasTankBalance = balances.get(state.gasTank.address)!.eth;

  // idempotent filter: only top up wallets that have USDC to refund AND don't
  // already have enough ETH for one refund tx
  const decisions = targets.map((w) => {
    const { eth, usdc } = balances.get(w.address)!;
    let skipReason: string | undefined;
    if (usdc === 0n) skipReason = "no USDC";
    else if (eth >= minRefundGas)
      skipReason = `already funded (${fmtEth(eth)})`;
    return { w, eth, usdc, skipReason };
  });
  const needsTopup = decisions.filter((d) => !d.skipReason);
  const needed = perTopupCost * BigInt(needsTopup.length);

  console.log(`gas tank: ${state.gasTank.address}`);
  console.log(`  balance:    ${fmtEth(gasTankBalance)}`);
  console.log(
    `  required:   ${fmtEth(needed)}  (${needsTopup.length} topup${needsTopup.length === 1 ? "" : "s"})`,
  );
  console.log(`  per-topup:  ${fmtEth(topup)}`);
  console.log(
    `  refund-gas-budget per wallet: ~${fmtEth(minRefundGas)}\n`,
  );

  for (const d of decisions) {
    const status = d.skipReason ? `SKIP (${d.skipReason})` : `topup ${fmtEth(topup)}`;
    console.log(`  ${d.w.name}  ${d.w.address}  ${status}`);
  }
  console.log("");

  if (needsTopup.length === 0) {
    console.log("nothing to top up. run `npm run refund` next.");
    return;
  }

  if (gasTankBalance < needed) {
    throw new Error(
      `gas tank underfunded. send at least ${fmtEth(needed - gasTankBalance)} more ETH to ${state.gasTank.address} (or lower GAS_TOPUP_WEI in .env)`,
    );
  }

  if (flags.dryRun) {
    console.log("--dry-run set; not sending any tx.");
    return;
  }

  if (!flags.yes) {
    const ok = await confirm(
      `send ${fmtEth(topup)} from gas tank to ${needsTopup.length} wallet${needsTopup.length === 1 ? "" : "s"}?`,
    );
    if (!ok) {
      console.log("aborted.");
      return;
    }
  }

  const wc = await walletClientFor(state.gasTank.address);
  // explicit local nonce management: public RPCs can return stale `pending`
  // counts across rapid sequential sends, causing same-nonce collisions that
  // surface as `replacement transaction underpriced`.
  let nonce = await publicClient.getTransactionCount({
    address: state.gasTank.address,
    blockTag: "pending",
  });
  for (const d of needsTopup) {
    process.stdout.write(`  topping up ${d.w.name} (nonce=${nonce})... `);
    const hash = await wc.sendTransaction({
      to: d.w.address,
      value: topup,
      nonce,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(explorerTx(hash));
    nonce++;
  }
  console.log("\ndone. run `npm run refund` next.");
}

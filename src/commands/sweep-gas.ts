import type { Hex } from "viem";
import { env } from "../env.js";
import { explorerTx, publicClient, readBalances } from "../chain.js";
import { readState } from "../state.js";
import { walletClientFor } from "../turnkey.js";
import { confirm, fmtEth, type CliFlags } from "../util.js";

const SEND_GAS = 21_000n;

export async function sweepGas(flags: CliFlags): Promise<void> {
  const state = readState();
  const targets = flags.limit
    ? state.testWallets.slice(0, flags.limit)
    : state.testWallets;

  const feeData = await publicClient.estimateFeesPerGas();
  const reserve = SEND_GAS * feeData.maxFeePerGas;

  console.log(
    `step 1: sweep leftover ETH from ${targets.length} test wallets -> gas tank`,
  );
  console.log(`  per-tx gas reserve: ${fmtEth(reserve)}\n`);

  // one batched RPC call for all test-wallet ETH balances
  const balances = await readBalances(targets.map((w) => w.address));
  const plans = targets.map((w) => {
    const bal = balances.get(w.address)!.eth;
    const sendable = bal > reserve ? bal - reserve : 0n;
    return { w, balance: bal, sendable };
  });

  for (const p of plans) {
    const status = p.sendable === 0n ? "SKIP (dust)" : `sweep ${fmtEth(p.sendable)}`;
    console.log(`  ${p.w.name}  ${p.w.address}  bal=${fmtEth(p.balance)}  ${status}`);
  }

  const sweepable = plans.filter((p) => p.sendable > 0n);

  if (flags.dryRun) {
    console.log("\n--dry-run set; not sending any tx.");
  } else if (sweepable.length === 0) {
    console.log("\nno wallets with sweepable ETH; skipping step 1.");
  } else {
    if (!flags.yes) {
      const ok = await confirm(
        `\nsweep ${sweepable.length} wallets to gas tank ${state.gasTank.address}?`,
      );
      if (!ok) {
        console.log("aborted.");
        return;
      }
    }
    const hashes: Hex[] = [];
    for (const p of sweepable) {
      process.stdout.write(`  sweeping ${p.w.name}... `);
      const wc = await walletClientFor(p.w.address);
      const hash = await wc.sendTransaction({
        to: state.gasTank.address,
        value: p.sendable,
      });
      hashes.push(hash);
      console.log(explorerTx(hash));
    }
    // wait for all sweeps to mine before reading the gas tank balance below
    process.stdout.write(`\n  waiting for ${hashes.length} sweep tx(s) to confirm... `);
    await Promise.all(
      hashes.map((h) => publicClient.waitForTransactionReceipt({ hash: h })),
    );
    console.log("confirmed.");
  }

  // step 2: gas tank -> refund address
  console.log(
    `\nstep 2: send gas tank balance -> ${env.refundAddress}`,
  );
  const tankBal = await publicClient.getBalance({
    address: state.gasTank.address,
  });
  const tankSendable = tankBal > reserve ? tankBal - reserve : 0n;
  console.log(`  gas tank balance: ${fmtEth(tankBal)}`);
  console.log(`  sendable (minus gas): ${fmtEth(tankSendable)}`);

  if (tankSendable === 0n) {
    console.log("\nnothing to send from gas tank.");
    return;
  }
  if (flags.dryRun) {
    console.log("\n--dry-run set; not sending any tx.");
    return;
  }
  if (!flags.yes) {
    const ok = await confirm(`\nsend ${fmtEth(tankSendable)} to refund address?`);
    if (!ok) {
      console.log("aborted.");
      return;
    }
  }

  const wc = await walletClientFor(state.gasTank.address);
  process.stdout.write(`  draining gas tank... `);
  const hash = await wc.sendTransaction({
    to: env.refundAddress,
    value: tankSendable,
  });
  console.log(explorerTx(hash));
  console.log("\ndone.");
}

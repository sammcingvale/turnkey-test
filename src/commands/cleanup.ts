import * as fs from "node:fs";
import { readBalances } from "../chain.js";
import { readState, statePath } from "../state.js";
import { apiClient } from "../turnkey.js";
import { confirm, fmtEth, fmtUsdc, type CliFlags } from "../util.js";

// USDC has 6 decimals; 10_000 units = $0.01. Anything below this is dust we
// won't bother refunding before delete (gas to recover would exceed value).
const USDC_DUST_THRESHOLD = 10_000n;

export async function cleanup(flags: CliFlags): Promise<void> {
  const state = readState();
  const allWallets = [...state.testWallets, state.gasTank];

  console.log(`will delete ${allWallets.length} turnkey wallet(s):\n`);

  // safety check: confirm balances are drained (above dust)
  const balances = await readBalances(allWallets.map((w) => w.address));
  let walletsBlocking = 0;
  let totalUsdcDust = 0n;
  for (const w of allWallets) {
    const b = balances.get(w.address)!;
    if (b.usdc > USDC_DUST_THRESHOLD) walletsBlocking++;
    else if (b.usdc > 0n) totalUsdcDust += b.usdc;
    console.log(
      `  ${w.name.padEnd(16)} ${w.address}  ${fmtEth(b.eth).padEnd(22)} ${fmtUsdc(b.usdc)}`,
    );
  }

  if (walletsBlocking > 0) {
    throw new Error(
      `${walletsBlocking} wallet(s) still hold > $0.01 USDC. run \`npm run refund\` first, ` +
        `or remove those entries from wallets.json if you really mean to abandon them.`,
    );
  }

  if (totalUsdcDust > 0n) {
    console.log(
      `\nnote: ${fmtUsdc(totalUsdcDust)} of dust will be permanently inaccessible after deletion (below $0.01 refund threshold).`,
    );
  }

  const totalEth = allWallets.reduce(
    (acc, w) => acc + balances.get(w.address)!.eth,
    0n,
  );
  if (totalEth > 0n) {
    console.log(
      `\nnote: ${fmtEth(totalEth)} across these wallets will be permanently inaccessible after deletion.`,
    );
    console.log(`(run \`npm run sweep-gas\` first if you want to recover it.)`);
  }

  if (flags.dryRun) {
    console.log("\n--dry-run set; not calling turnkey.");
    return;
  }

  if (!flags.yes) {
    const ok = await confirm(
      `\ndelete ${allWallets.length} wallets from turnkey? this is irreversible.`,
    );
    if (!ok) {
      console.log("aborted.");
      return;
    }
  }

  const res = await apiClient.deleteWallets({
    walletIds: allWallets.map((w) => w.walletId),
    deleteWithoutExport: true,
  });

  const deletedIds =
    res.activity.result.deleteWalletsResult?.walletIds ?? [];
  console.log(`\ndeleted ${deletedIds.length} wallet(s) from turnkey.`);

  fs.unlinkSync(statePath());
  console.log(`removed ${statePath()}.`);
}

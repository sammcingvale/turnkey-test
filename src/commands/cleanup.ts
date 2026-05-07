import * as fs from "node:fs";
import { readBalances } from "../chain.js";
import { readState, statePath } from "../state.js";
import { apiClient } from "../turnkey.js";
import { confirm, fmtEth, fmtUsdc, type CliFlags } from "../util.js";

export async function cleanup(flags: CliFlags): Promise<void> {
  const state = readState();
  const allWallets = [...state.testWallets, state.gasTank];

  console.log(`will delete ${allWallets.length} turnkey wallet(s):\n`);

  // safety check: confirm balances are drained
  const balances = await readBalances(allWallets.map((w) => w.address));
  let walletsWithUsdc = 0;
  for (const w of allWallets) {
    const b = balances.get(w.address)!;
    if (b.usdc > 0n) walletsWithUsdc++;
    console.log(
      `  ${w.name.padEnd(16)} ${w.address}  ${fmtEth(b.eth).padEnd(22)} ${fmtUsdc(b.usdc)}`,
    );
  }

  if (walletsWithUsdc > 0) {
    throw new Error(
      `${walletsWithUsdc} wallet(s) still hold USDC. run \`npm run refund\` first, ` +
        `or remove those entries from wallets.json if you really mean to abandon them.`,
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

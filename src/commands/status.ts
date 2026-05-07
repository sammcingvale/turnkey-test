import { readBalances } from "../chain.js";
import { readState, type PersistedWallet } from "../state.js";
import { fmtEth, fmtUsdc } from "../util.js";

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

export async function status(): Promise<void> {
  const state = readState();
  const all: PersistedWallet[] = [...state.testWallets, state.gasTank];
  const balances = await readBalances(all.map((w) => w.address));

  console.log(
    `${pad("name", 18)} ${pad("address", 44)} ${pad("ETH", 24)} ${"USDC"}`,
  );
  console.log("-".repeat(110));
  for (const w of all) {
    const b = balances.get(w.address)!;
    console.log(
      `${pad(w.name, 18)} ${pad(w.address, 44)} ${pad(fmtEth(b.eth), 24)} ${fmtUsdc(b.usdc)}`,
    );
  }

  const totalUsdc = state.testWallets.reduce(
    (acc, w) => acc + balances.get(w.address)!.usdc,
    0n,
  );
  const totalEth = all.reduce(
    (acc, w) => acc + balances.get(w.address)!.eth,
    0n,
  );
  console.log("-".repeat(110));
  console.log(
    `${pad("TOTAL (test wallets USDC, all ETH)", 63)} ${pad(fmtEth(totalEth), 24)} ${fmtUsdc(totalUsdc)}`,
  );
}

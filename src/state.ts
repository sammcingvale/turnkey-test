import * as fs from "node:fs";
import * as path from "node:path";
import type { Address } from "viem";

export interface PersistedWallet {
  name: string;
  walletId: string;
  address: Address;
}

export interface WalletState {
  createdAt: string;
  testWallets: PersistedWallet[];
  gasTank: PersistedWallet;
}

const STATE_PATH = path.resolve(process.cwd(), "wallets.json");

export function stateExists(): boolean {
  return fs.existsSync(STATE_PATH);
}

export function readState(): WalletState {
  if (!stateExists()) {
    throw new Error(
      `wallets.json not found at ${STATE_PATH}. run \`npm run create\` first.`,
    );
  }
  const raw = fs.readFileSync(STATE_PATH, "utf8");
  return JSON.parse(raw) as WalletState;
}

export function writeState(state: WalletState): void {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function statePath(): string {
  return STATE_PATH;
}

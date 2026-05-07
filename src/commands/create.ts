import type { Address } from "viem";
import { env } from "../env.js";
import { explorerAddress } from "../chain.js";
import {
  stateExists,
  writeState,
  statePath,
  type PersistedWallet,
} from "../state.js";
import { apiClient } from "../turnkey.js";

const ETH_ACCOUNT_PARAMS = {
  curve: "CURVE_SECP256K1",
  pathFormat: "PATH_FORMAT_BIP32",
  path: "m/44'/60'/0'/0/0",
  addressFormat: "ADDRESS_FORMAT_ETHEREUM",
} as const;

async function createOne(name: string): Promise<PersistedWallet> {
  const res = await apiClient.createWallet({
    walletName: name,
    accounts: [ETH_ACCOUNT_PARAMS],
  });
  const address = res.addresses[0];
  if (!address) {
    throw new Error(`turnkey returned no address for wallet ${name}`);
  }
  return { name, walletId: res.walletId, address: address as Address };
}

export async function create(): Promise<void> {
  if (stateExists()) {
    throw new Error(
      `${statePath()} already exists. delete it first if you want to start over (and consider archiving the old wallets in the turnkey dashboard).`,
    );
  }

  const count = env.testWalletCount;
  console.log(`creating ${count} test wallets + 1 gas-tank wallet...`);

  const testWallets: PersistedWallet[] = [];
  for (let i = 1; i <= count; i++) {
    const name = `test-wallet-${String(i).padStart(2, "0")}`;
    const w = await createOne(name);
    testWallets.push(w);
    console.log(`  ${w.name}  ${w.address}`);
  }

  const gasTank = await createOne("gas-tank");
  console.log(`  ${gasTank.name}     ${gasTank.address}`);

  writeState({
    createdAt: new Date().toISOString(),
    testWallets,
    gasTank,
  });

  console.log(`\nwrote ${statePath()}\n`);
  console.log("next steps:");
  console.log(`  1. send your USDC amounts to the test wallets above`);
  console.log(`  2. send a small amount of ETH to the gas tank:`);
  console.log(`     ${gasTank.address}`);
  console.log(`     (${explorerAddress(gasTank.address)})`);
  console.log(`  3. run \`npm run status\` to confirm balances landed`);
}

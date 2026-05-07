import { Turnkey as TurnkeyServerSDK } from "@turnkey/sdk-server";
import { createAccount } from "@turnkey/viem";
import { createWalletClient, http, type Account, type Address } from "viem";
import { base } from "viem/chains";
import { env } from "./env.js";

export const turnkey = new TurnkeyServerSDK({
  apiBaseUrl: "https://api.turnkey.com",
  apiPublicKey: env.turnkeyApiPublicKey,
  apiPrivateKey: env.turnkeyApiPrivateKey,
  defaultOrganizationId: env.turnkeyOrganizationId,
});

export const apiClient = turnkey.apiClient();

/** Build a viem walletClient backed by a turnkey-managed EVM account. */
export async function walletClientFor(address: Address) {
  const account = await createAccount({
    client: apiClient,
    organizationId: env.turnkeyOrganizationId,
    signWith: address,
  });

  return createWalletClient({
    account: account as Account,
    chain: base,
    transport: http(env.baseRpcUrl),
  });
}

import * as dotenv from "dotenv";
import { isAddress, type Address } from "viem";

dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`missing required env var: ${name} (see .env.example)`);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

function asAddress(name: string, value: string): Address {
  if (!isAddress(value)) {
    throw new Error(`env var ${name} is not a valid EVM address: ${value}`);
  }
  return value as Address;
}

export const env = {
  turnkeyOrganizationId: required("TURNKEY_ORGANIZATION_ID"),
  turnkeyApiPublicKey: required("TURNKEY_API_PUBLIC_KEY"),
  turnkeyApiPrivateKey: required("TURNKEY_API_PRIVATE_KEY"),
  refundAddress: asAddress("REFUND_ADDRESS", required("REFUND_ADDRESS")),
  baseRpcUrl: optional("BASE_RPC_URL", "https://mainnet.base.org"),
  gasTopupWei: BigInt(optional("GAS_TOPUP_WEI", "100000000000000")),
  testWalletCount: Number(optional("TEST_WALLET_COUNT", "10")),
};

import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { base } from "viem/chains";
import { env } from "./env.js";

// native USDC on base mainnet (Circle-issued, 6 decimals)
export const USDC_ADDRESS: Address =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const USDC_DECIMALS = 6;

// multicall3 — same address on every chain
export const MULTICALL3_ADDRESS: Address =
  "0xcA11bde05977b3631167028862bE2a173976CA11";

const multicall3Abi = [
  {
    name: "getEthBalance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const publicClient = createPublicClient({
  chain: base,
  transport: http(env.baseRpcUrl),
});

export interface AddressBalances {
  eth: bigint;
  usdc: bigint;
}

/**
 * Batched balance reader: one RPC round-trip for both ETH + USDC across N
 * addresses. Uses multicall3's getEthBalance + ERC20 balanceOf in a single
 * eth_call. Avoids burning rate-limit budget on the public base RPC.
 */
export async function readBalances(
  addresses: readonly Address[],
): Promise<Map<Address, AddressBalances>> {
  const out = new Map<Address, AddressBalances>();
  if (addresses.length === 0) return out;

  const calls = addresses.flatMap((addr) => [
    {
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [addr] as const,
    },
    {
      address: MULTICALL3_ADDRESS,
      abi: multicall3Abi,
      functionName: "getEthBalance" as const,
      args: [addr] as const,
    },
  ]);

  const results = await publicClient.multicall({
    contracts: calls,
    allowFailure: false,
  });

  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i]!;
    const usdc = results[i * 2] as bigint;
    const eth = results[i * 2 + 1] as bigint;
    out.set(addr, { eth, usdc });
  }
  return out;
}

export const explorerTx = (hash: string) => `https://basescan.org/tx/${hash}`;
export const explorerAddress = (addr: string) =>
  `https://basescan.org/address/${addr}`;

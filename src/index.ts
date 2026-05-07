import { create } from "./commands/create.js";
import { status } from "./commands/status.js";
import { fundGas } from "./commands/fund-gas.js";
import { refund } from "./commands/refund.js";
import { sweepGas } from "./commands/sweep-gas.js";
import { parseFlags } from "./util.js";

const USAGE = `
turnkey-test — sample app for creating + sweeping turnkey wallets on base mainnet

usage:
  npm run <command>                    (create | status | fund-gas | refund | sweep-gas)
  npx tsx src/index.ts <command> [flags]

commands:
  create              create N test wallets + 1 gas-tank wallet (writes wallets.json)
  status              show ETH + USDC balances for all wallets
  fund-gas            top up each test wallet with ETH from the gas tank
  refund              send each test wallet's USDC balance to REFUND_ADDRESS
  sweep-gas           pull leftover ETH from test wallets -> gas tank -> REFUND_ADDRESS

flags (where applicable):
  --dry-run           print intended actions without signing or sending
  --limit N           operate on only the first N test wallets
  --yes, -y           skip confirmation prompts

env (see .env.example):
  TURNKEY_ORGANIZATION_ID, TURNKEY_API_PUBLIC_KEY, TURNKEY_API_PRIVATE_KEY
  REFUND_ADDRESS, BASE_RPC_URL (default: public base RPC)
  GAS_TOPUP_WEI (default: 0.0001 ETH), TEST_WALLET_COUNT (default: 10)
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(USAGE);
    return;
  }

  const flags = parseFlags(rest);

  switch (cmd) {
    case "create":
      return create();
    case "status":
      return status();
    case "fund-gas":
      return fundGas(flags);
    case "refund":
      return refund(flags);
    case "sweep-gas":
      return sweepGas(flags);
    default:
      console.error(`unknown command: ${cmd}`);
      console.log(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\nerror: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

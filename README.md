# turnkey-test

a small TypeScript CLI that exercises the [Turnkey](https://turnkey.com) wallet API end-to-end on Base mainnet: create N wallets, fund them with USDC + ETH, refund the USDC back to a configured address, recover leftover ETH, delete the wallets.

built as a "can we one-shot a Turnkey integration?" test in [Claude Code](https://claude.com/claude-code). this README mostly exists so the Turnkey team can see how the code came together — design notes + gotchas at the bottom.

## what it does

```
create  ─►  (you fund externally)  ─►  fund-gas  ─►  refund  ─►  sweep-gas  ─►  cleanup
```

1. `create` provisions 10 turnkey-managed EVM wallets + 1 "gas tank" wallet
2. you send USDC to the test wallets and a small amount of ETH to the gas tank
3. `fund-gas` distributes just-enough ETH from gas tank → each test wallet
4. `refund` sends each test wallet's USDC back to `REFUND_ADDRESS` via `USDC.transfer`
5. `sweep-gas` recovers leftover ETH (test wallets → gas tank → `REFUND_ADDRESS`)
6. `cleanup` calls Turnkey's `deleteWallets` activity to delete all 11 wallets

money-moving commands support `--dry-run`, `--limit N`, and `-y/--yes`.

## setup

requires Node ≥ 20.

```bash
npm install
cp .env.example .env
# fill in TURNKEY_ORGANIZATION_ID, TURNKEY_API_PUBLIC_KEY, TURNKEY_API_PRIVATE_KEY,
# and REFUND_ADDRESS. defaults for BASE_RPC_URL / GAS_TOPUP_WEI / TEST_WALLET_COUNT
# are sane for the smoke test.
```

API key pair is created once in the Turnkey dashboard (User Details → Create an API key, in-browser, authenticate with passkey/YubiKey).

## runbook

```bash
npm run create                            # writes wallets.json — refuses to overwrite
# ... fund test wallets with USDC and gas tank with ETH ...
npm run status                            # confirm balances landed

# (recommended) smoke test on one wallet before fanning out
npx tsx src/index.ts fund-gas --limit 1
npx tsx src/index.ts refund --limit 1

# the rest
npm run fund-gas
npm run refund
npm run sweep-gas
npm run cleanup
```

## commands

| command | what it does |
|---|---|
| `create` | create N test wallets + 1 gas-tank wallet (one EVM account each), write `wallets.json` |
| `status` | print ETH + USDC balance for every wallet (single multicall) |
| `fund-gas` | gas tank → test wallets; idempotent (skips already-funded or no-USDC wallets) |
| `refund` | test wallet → `REFUND_ADDRESS` (USDC.transfer); refuses if a wallet lacks gas |
| `sweep-gas` | step 1: test wallets → gas tank; step 2: gas tank → `REFUND_ADDRESS` |
| `cleanup` | `deleteWallets` for all 11; refuses if any wallet holds > $0.01 USDC |

## design notes

**SDK choice.** `@turnkey/sdk-server` for wallet CRUD, `@turnkey/viem` for the signer plugged into viem's `walletClient`. the `with-viem` example in the `tkhq/sdk` repo was the highest-signal reference — i followed it almost verbatim for the `createAccount` + `createWalletClient` pattern. ERC20 transfers go through viem's `writeContract` with viem's built-in `erc20Abi`. i looked at `ethSendErc20Transfer` from `@turnkey/core` but didn't pull it in — the viem path is one line and was already in scope for signing.

**no third-party RPC required.** viem's `walletClient` handles broadcast through whatever URL is in `BASE_RPC_URL`. defaults to `https://mainnet.base.org`; swap in alchemy/infura if you outgrow it.

**batched balance reads via multicall3.** the public Base RPC rate-limits hard. naively reading ETH + USDC for 11 wallets is 22 `eth_call`s and trips the limit immediately. `src/chain.ts` exposes a `readBalances(addrs)` helper that combines multicall3's `getEthBalance` and ERC20's `balanceOf` into a single `eth_call`. used by `status`, `refund`, `sweep-gas`, and `cleanup`.

**explicit nonce management for sequential sends from one address.** `fund-gas` sends N transactions back-to-back from the gas tank. without explicit nonces, public RPCs occasionally return a stale `pending` count — viem fetches the same nonce twice, the second tx looks like a "replace at gas N with same gas" attempt and gets rejected as `replacement transaction underpriced`. fixed by fetching the starting nonce once with `blockTag: 'pending'` and incrementing locally per send. paired with `waitForTransactionReceipt` between sends so any failure aborts cleanly without nonce gaps. `refund` doesn't need this since each tx is from a different wallet.

**idempotency.** `fund-gas` skips wallets that already have enough ETH for one refund or that hold no USDC. `create` refuses to run if `wallets.json` exists. `cleanup` deletes `wallets.json` on success so a fresh `create` can start clean. partial / re-run flows (e.g. after the smoke test) just work.

**safety rails.** every money-moving command prompts for `yes` confirmation (skip with `-y`), supports `--dry-run`, and pre-flight-checks balances before sending. `cleanup` blocks on USDC > $0.01 (anything below that is treated as rounding dust).

## file layout

```
src/
├── index.ts          CLI entry, arg parsing, command dispatch
├── env.ts            .env loading with required-field validation
├── chain.ts          Base mainnet constants, public client, readBalances() helper
├── turnkey.ts        Turnkey SDK client + viem walletClient factory (per address, on demand)
├── state.ts          wallets.json read/write
├── util.ts           formatters, confirm prompt, flag parser
└── commands/
    ├── create.ts
    ├── status.ts
    ├── fund-gas.ts
    ├── refund.ts
    ├── sweep-gas.ts
    └── cleanup.ts
```

## gotchas hit during the build

things that surprised me — flagging in case any of these are useful Turnkey-side product feedback:

- **public Base RPC is unusable for fanout reads.** 22 sequential balance reads = rate-limit error. multicall3 fixes it but the failure mode (cryptic `over rate limit` from viem) might be worth calling out in the Turnkey docs' "first integration" section, since most folks will start with the public endpoint.
- **the viem signer pattern works great, but the docs page for `@turnkey/viem` doesn't show a complete example inline.** i had to pull `examples/with-viem/src/index.ts` from the github repo to get the canonical `createAccount` + `createWalletClient` shape. inlining a Node-style example on the doc page would shave 10 minutes off a first integration.
- **`ethSendErc20Transfer` lives in a different package (`@turnkey/core`?) from the rest of the server SDK.** the docs reference it but it's not obvious at a glance whether it composes with `@turnkey/sdk-server`'s `apiClient`. i picked the viem path partly to sidestep this question.
- **API key bootstrap is dashboard-only.** that's fine for a script like this, but it does mean "fully programmatic from zero" isn't possible without a human + authenticator. understood why, just worth noting for anyone wiring Turnkey into CI.

## what's coming next

- **policy demo** — attach a per-wallet policy that restricts the wallet to `USDC.transfer` to `REFUND_ADDRESS` only on Base, then prove Turnkey rejects a refund to a different address before any signing happens.

other ideas considered but not yet built: sub-organizations refactor (production embedded-wallet pattern), passkey-gated activities via `WebauthnStamper` (actually using the YubiKey at runtime), multi-chain (Solana accounts on the same wallets).

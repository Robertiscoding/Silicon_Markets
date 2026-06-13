# Contracts

Foundry project for Silicon Markets on Arc Testnet (chain id `5042002`).

## Deploy OrnnOracle

```bash
cd contracts
cp .env.example .env   # set DEPLOYER_PRIVATE_KEY and ARC_RPC_URL
forge script script/DeployOrnnOracle.s.sol:DeployOrnnOracle \
  --rpc-url "$ARC_RPC_URL" --broadcast
```

Deployed addresses live in `deployments/arc.json`.

## Deploy SiliconMarket

Requires `OrnnOracle` in `deployments/arc.json`.

```bash
forge script script/DeploySiliconMarket.s.sol:DeploySiliconMarket \
  --rpc-url "$ARC_RPC_URL" --broadcast
```

## Deploy BucketMarket

Requires `OrnnOracle` in `deployments/arc.json`.

```bash
forge script script/DeployBucketMarket.s.sol:DeployBucketMarket \
  --rpc-url "$ARC_RPC_URL" --broadcast
```

## Deploy demo market

Zero-cutoff `SiliconMarket` for the one-click settlement demo in the web app. Reads existing addresses from `deployments/arc.json` and writes `demoMarket` back to that file.

```bash
forge script script/DeployDemoMarket.s.sol:DeployDemoMarket \
  --rpc-url "$ARC_RPC_URL" --broadcast
```

Set `NEXT_PUBLIC_DEMO_MARKET_ADDRESS` and `DEMO_MARKET_ADDRESS` in `web/.env` to the address in `deployments/arc.json`.

## Demo scripts

| Script | Purpose |
|--------|---------|
| `Deploy.s.sol` | Full stack deploy (oracle + market + bucket) |
| `ArcDemo.s.sol` | Arc-native demo flow |
| `E2EDemo.s.sol` | End-to-end market lifecycle |
| `BookDemo.s.sol` | Bucket market demo |
| `SeedMarkets.s.sol` | Seed forecasts on existing markets |
| `seed-arc-native.sh` | Shell wrapper for native USDC seeding |

## Test

```bash
forge test
```

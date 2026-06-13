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

## Test

```bash
forge test
```

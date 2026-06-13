# Silicon Markets

GPU compute prediction markets on Arc.

## Web

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `web/.env.example` to `web/.env` and set server keys locally (never commit):

- `DEMO_PRIVATE_KEY` — oracle updater key for one-click demo settlement
- `FUNDER_PRIVATE_KEY` — Circle Send faucet for test USDC

## Contracts

See [`contracts/README.md`](contracts/README.md). Arc Testnet deployment addresses are in [`contracts/deployments/arc.json`](contracts/deployments/arc.json).

## Oracle

Off-chain agent: scrapes Ornn daily prints, archives to `oracle/data/prints.json`, publishes on-chain.

```bash
cd oracle
cp .env.example .env   # fill ORACLE_UPDATER_KEY
npm install
npm run scrape         # fetch latest prints
npm run publish        # push to OrnnOracle on Arc
npm run daemon         # scheduled scrape + publish
```

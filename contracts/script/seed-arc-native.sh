#!/usr/bin/env bash
#
# Seed the Arc Testnet deployment with NATIVE USDC (Circle's canonical token at
# 0x3600...0000, which is also the gas token on Arc).
#
# Why cast instead of forge script: Arc's native USDC routes ERC-20 calls
# through a Circle compliance precompile (isBlocklisted @ 0x1800...0001).
# Foundry's local EVM cannot simulate that precompile, so any forge script
# that touches 0x3600 reverts in simulation. Sending real transactions with
# cast (no local simulation) works fine.
#
# Usage:
#   export DEPLOYER_PRIVATE_KEY=0x...   # funded Arc Testnet key (gas + stakes)
#   export ARC_RPC_URL=https://...      # Arc Testnet RPC
#   ./script/seed-arc-native.sh <oracle> <market> <book> <settlementTs>
#
# Amounts are intentionally tiny (~$10 total locked) because native USDC is
# real faucet money shared with the gas balance.
set -euo pipefail

ORACLE=${1:?oracle address}
MARKET=${2:?silicon market address}
BOOK=${3:?bucket market address}
TS=${4:?settlement unix ts}

USDC=0x3600000000000000000000000000000000000000
SEND="cast send --private-key $DEPLOYER_PRIVATE_KEY --rpc-url $ARC_RPC_URL"
MAX=0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff

echo "1/5 approve both venues for native USDC"
$SEND $USDC "approve(address,uint256)" $MARKET $MAX
$SEND $USDC "approve(address,uint256)" $BOOK $MAX

echo "2/5 create parametric market (RTX 5090 @ $TS) + 3 small forecasts (\$0.30 each)"
$SEND $MARKET "createMarket(string,uint64)" "RTX 5090" $TS
$SEND $MARKET "lockForecast(uint256,int128,uint128,uint128)" 0 84000000 3000000 300000
$SEND $MARKET "lockForecast(uint256,int128,uint128,uint128)" 0 86000000 4000000 300000
$SEND $MARKET "lockForecast(uint256,int128,uint128,uint128)" 0 82000000 3000000 300000

echo "3/5 create order-book market: 24 x \$0.01 buckets on [\$0.72, \$0.96), centered on spot \$0.84"
$SEND $BOOK "createMarket(string,uint64,uint128,uint128,uint16)" "RTX 5090" $TS 72000000 1000000 24

echo "4/5 post tent-shaped asks around the \$0.84 center bucket (sizes 1-2 shares)"
#       bucket price(rawUSDC) size
$SEND $BOOK "postAsk(uint256,uint16,uint128,uint128)" 0 8  80000  1   # $0.80 @ 8c
$SEND $BOOK "postAsk(uint256,uint16,uint128,uint128)" 0 9  130000 1   # $0.81 @ 13c
$SEND $BOOK "postAsk(uint256,uint16,uint128,uint128)" 0 10 200000 1   # $0.82 @ 20c
$SEND $BOOK "postAsk(uint256,uint16,uint128,uint128)" 0 11 280000 1   # $0.83 @ 28c
$SEND $BOOK "postAsk(uint256,uint16,uint128,uint128)" 0 12 340000 2   # $0.84 @ 34c (center)
$SEND $BOOK "postAsk(uint256,uint16,uint128,uint128)" 0 13 270000 1   # $0.85 @ 27c
$SEND $BOOK "postAsk(uint256,uint16,uint128,uint128)" 0 14 190000 1   # $0.86 @ 19c
$SEND $BOOK "postAsk(uint256,uint16,uint128,uint128)" 0 15 120000 1   # $0.87 @ 12c
$SEND $BOOK "postAsk(uint256,uint16,uint128,uint128)" 0 16 80000  1   # $0.88 @ 8c

echo "5/5 starter taker fill: 1 share at the center bucket"
$SEND $BOOK "fillBucket(uint256,uint16,uint128,uint128)" 0 12 1 1000000

echo "done."

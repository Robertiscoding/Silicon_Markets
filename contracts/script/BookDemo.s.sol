// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {OrnnOracle} from "../src/OrnnOracle.sol";
import {BucketMarket} from "../src/BucketMarket.sol";

/// @notice Local demo bootstrap for the BucketMarket order book.
///
///         Deploys MockUSDC + Oracle + BucketMarket on anvil, creates an RTX 5090
///         market with 24 buckets covering [$0.65, $0.89] in $0.01 steps, and seeds
///         a Gaussian-shaped ask book around $0.74 from three named maker wallets.
///         The UI can connect immediately and see real prices, sizes and counterparties.
///
///         anvil --chain-id 5042002
///         forge script script/BookDemo.s.sol:BookDemo \
///             --rpc-url http://127.0.0.1:8545 --broadcast --skip-simulation
contract BookDemo is Script {
    uint256 constant DEPLOYER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant MAKER_A_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 constant MAKER_B_KEY = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
    uint256 constant MAKER_C_KEY = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
    uint256 constant TAKER_KEY = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;

    uint128 constant BUCKET_LOW = uint128(65 * 1e6); // $0.65
    uint128 constant BUCKET_WIDTH = uint128(1 * 1e6); // $0.01
    uint16 constant BUCKET_COUNT = 24; // up to $0.89

    function run() external {
        address deployer = vm.addr(DEPLOYER_KEY);
        address makerA = vm.addr(MAKER_A_KEY);
        address makerB = vm.addr(MAKER_B_KEY);
        address makerC = vm.addr(MAKER_C_KEY);
        address taker = vm.addr(TAKER_KEY);

        uint64 settlementTs = uint64(block.timestamp + 1 days);

        // 1. Deploy core stack as deployer.
        vm.startBroadcast(DEPLOYER_KEY);
        MockUSDC usdc = new MockUSDC();
        OrnnOracle oracle = new OrnnOracle(deployer, deployer);
        BucketMarket book = new BucketMarket(IERC20(address(usdc)), oracle, deployer);
        usdc.mint(deployer, 100_000e6);
        usdc.mint(makerA, 100_000e6);
        usdc.mint(makerB, 100_000e6);
        usdc.mint(makerC, 100_000e6);
        usdc.mint(taker, 10_000e6);
        uint256 marketId = book.createMarket("RTX 5090", settlementTs, BUCKET_LOW, BUCKET_WIDTH, BUCKET_COUNT);
        vm.stopBroadcast();

        // 2. Each maker approves the book and posts asks shaped like a tent around bucket 9 ($0.74).
        _seedMaker(book, address(usdc), MAKER_A_KEY, marketId, _profileA());
        _seedMaker(book, address(usdc), MAKER_B_KEY, marketId, _profileB());
        _seedMaker(book, address(usdc), MAKER_C_KEY, marketId, _profileC());

        // 3. Have the taker pre-buy a starter band so the UI shows a non-empty position.
        vm.startBroadcast(TAKER_KEY);
        usdc.approve(address(book), type(uint256).max);
        book.fillBucketsAround(marketId, 9 /* $0.74 */, 2 /* ±2 buckets */, 5 /* shares per bucket */, 50e6);
        vm.stopBroadcast();

        console2.log("=== Silicon Markets BucketMarket demo ===");
        console2.log("USDC          :", address(usdc));
        console2.log("OrnnOracle    :", address(oracle));
        console2.log("BucketMarket  :", address(book));
        console2.log("marketId      :", marketId);
        console2.log("settlementTs  :", settlementTs);
        console2.log("Buckets       :", BUCKET_COUNT, "x $0.01 starting at $0.65");
        console2.log("Makers        :");
        console2.log("  A           :", makerA);
        console2.log("  B           :", makerB);
        console2.log("  C           :", makerC);
        console2.log("Demo taker    :", taker);
    }

    struct Quote {
        uint16 bucket;
        uint128 price; // raw USDC per share
        uint128 size; // shares
    }

    /// @dev Maker A: tight market-maker around the consensus center, posts at competitive prices.
    function _profileA() internal pure returns (Quote[] memory q) {
        // Center bucket 9 ($0.74), tight spread, deep size.
        uint16[5] memory buckets = [uint16(7), 8, 9, 10, 11];
        uint128[5] memory prices = [uint128(0.18e6), 0.26e6, 0.34e6, 0.24e6, 0.16e6];
        uint128[5] memory sizes = [uint128(40), 60, 80, 60, 40];
        q = new Quote[](5);
        for (uint256 i = 0; i < 5; ++i) {
            q[i] = Quote(buckets[i], prices[i], sizes[i]);
        }
    }

    /// @dev Maker B: cheaper but smaller, slightly skewed downside.
    function _profileB() internal pure returns (Quote[] memory q) {
        uint16[7] memory buckets = [uint16(5), 6, 7, 8, 9, 10, 11];
        uint128[7] memory prices = [uint128(0.04e6), 0.08e6, 0.14e6, 0.22e6, 0.30e6, 0.20e6, 0.12e6];
        uint128[7] memory sizes = [uint128(20), 30, 40, 50, 50, 40, 30];
        q = new Quote[](7);
        for (uint256 i = 0; i < 7; ++i) {
            q[i] = Quote(buckets[i], prices[i], sizes[i]);
        }
    }

    /// @dev Maker C: fades the tails — sells cheap YES way out of the money.
    function _profileC() internal pure returns (Quote[] memory q) {
        uint16[8] memory buckets = [uint16(0), 1, 2, 3, 4, 19, 20, 21];
        uint128[8] memory prices =
            [uint128(0.01e6), 0.02e6, 0.03e6, 0.04e6, 0.06e6, 0.05e6, 0.03e6, 0.02e6];
        uint128[8] memory sizes = [uint128(10), 15, 20, 25, 30, 25, 20, 15];
        q = new Quote[](8);
        for (uint256 i = 0; i < 8; ++i) {
            q[i] = Quote(buckets[i], prices[i], sizes[i]);
        }
    }

    function _seedMaker(BucketMarket book, address usdc, uint256 pk, uint256 marketId, Quote[] memory quotes)
        internal
    {
        vm.startBroadcast(pk);
        IERC20(usdc).approve(address(book), type(uint256).max);
        for (uint256 i = 0; i < quotes.length; ++i) {
            book.postAsk(marketId, quotes[i].bucket, quotes[i].price, quotes[i].size);
        }
        vm.stopBroadcast();
    }
}

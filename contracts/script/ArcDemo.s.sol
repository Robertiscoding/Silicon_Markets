// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {OrnnOracle} from "../src/OrnnOracle.sol";
import {SiliconMarket} from "../src/SiliconMarket.sol";
import {BucketMarket} from "../src/BucketMarket.sol";

/// @notice Live Arc Testnet bootstrap, driven entirely by a SINGLE funded account.
///
///         Arc charges gas in native USDC, and on a public testnet we only have
///         one pre-funded key, so everything (deploy, market creation, every
///         maker ask, the starter taker fill) is broadcast from `deployer`.
///         Liquidity uses a mintable MockUSDC because seeding a deep on-chain
///         order book would otherwise need hundreds of real testnet USDC.
///
///         Usage:
///             export DEPLOYER_PRIVATE_KEY=0x...    # funded Arc testnet key
///             forge script script/ArcDemo.s.sol:ArcDemo \
///                 --rpc-url $ARC_RPC_URL --broadcast --slow
contract ArcDemo is Script {
    uint128 constant BUCKET_LOW = uint128(65 * 1e6); // $0.65
    uint128 constant BUCKET_WIDTH = uint128(1 * 1e6); // $0.01
    uint16 constant BUCKET_COUNT = 24; // up to $0.89
    uint16 constant CENTER_BUCKET = 9; // $0.74

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        uint64 settlementTs = uint64(block.timestamp + 1 days);

        vm.startBroadcast(pk);

        // 1. Core stack. Oracle owner + updater = deployer so we can push prints later.
        MockUSDC usdc = new MockUSDC();
        OrnnOracle oracle = new OrnnOracle(deployer, deployer);
        SiliconMarket market = new SiliconMarket(IERC20(address(usdc)), oracle, deployer, 100, deployer, 5 minutes);
        BucketMarket book = new BucketMarket(IERC20(address(usdc)), oracle, deployer);

        // 2. Mint demo liquidity to ourselves and approve both venues.
        usdc.mint(deployer, 1_000_000e6);
        usdc.approve(address(market), type(uint256).max);
        usdc.approve(address(book), type(uint256).max);

        // 3. Parametric pool (drives the main market cards).
        uint256 parametricId = market.createMarket("RTX 5090", settlementTs);
        market.lockForecast(parametricId, int128(int256(82 * 1e6)), uint128(3 * 1e6), uint128(100e6));
        market.lockForecast(parametricId, int128(int256(80 * 1e6)), uint128(5 * 1e6), uint128(100e6));
        market.lockForecast(parametricId, int128(int256(75 * 1e6)), uint128(4 * 1e6), uint128(100e6));

        // 4. On-chain order book: 24 buckets, Gaussian-shaped asks around $0.74.
        uint256 bookId = book.createMarket("RTX 5090", settlementTs, BUCKET_LOW, BUCKET_WIDTH, BUCKET_COUNT);
        _seedBook(book, bookId);

        // 5. Starter taker fill so the UI shows a live position + filled depth.
        book.fillBucketsAround(bookId, CENTER_BUCKET, 2, 5, 50e6);

        vm.stopBroadcast();

        console2.log("=== Silicon Markets - Arc Testnet deployment ===");
        console2.log("chainId        :", block.chainid);
        console2.log("deployer       :", deployer);
        console2.log("USDC (mock)    :", address(usdc));
        console2.log("OrnnOracle     :", address(oracle));
        console2.log("SiliconMarket  :", address(market));
        console2.log("BucketMarket   :", address(book));
        console2.log("parametric id  :", parametricId);
        console2.log("book market id :", bookId);
        console2.log("settlementTs   :", settlementTs);

        string memory json = string(
            abi.encodePacked(
                "{\n",
                '  "chainId": ',
                vm.toString(block.chainid),
                ",\n",
                '  "usdc": "',
                vm.toString(address(usdc)),
                '",\n',
                '  "oracle": "',
                vm.toString(address(oracle)),
                '",\n',
                '  "market": "',
                vm.toString(address(market)),
                '",\n',
                '  "book": "',
                vm.toString(address(book)),
                '",\n',
                '  "bookMarketId": ',
                vm.toString(bookId),
                ",\n",
                '  "settlementTs": ',
                vm.toString(uint256(settlementTs)),
                "\n}\n"
            )
        );
        vm.writeFile("deployments/arc.json", json);
    }

    /// @dev Posts a tent-shaped ask book across the buckets, all from the deployer.
    ///      Prices are raw USDC per YES share (1e6 == $1 payout if the bucket wins).
    function _seedBook(BucketMarket book, uint256 marketId) internal {
        uint16[18] memory buckets =
            [uint16(2), 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 21];
        uint128[18] memory prices = [
            uint128(0.02e6),
            0.03e6,
            0.05e6,
            0.08e6,
            0.13e6,
            0.20e6,
            0.28e6,
            0.34e6,
            0.27e6,
            0.19e6,
            0.12e6,
            0.08e6,
            0.05e6,
            0.04e6,
            0.03e6,
            0.02e6,
            0.02e6,
            0.01e6
        ];
        uint128[18] memory sizes = [
            uint128(20),
            25,
            35,
            45,
            60,
            75,
            90,
            110,
            90,
            70,
            55,
            45,
            35,
            30,
            25,
            20,
            18,
            15
        ];
        for (uint256 i = 0; i < buckets.length; ++i) {
            book.postAsk(marketId, buckets[i], prices[i], sizes[i]);
        }
    }
}

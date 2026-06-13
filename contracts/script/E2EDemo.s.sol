// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {OrnnOracle} from "../src/OrnnOracle.sol";
import {SiliconMarket} from "../src/SiliconMarket.sol";

/// @notice Local demo bootstrap. Deploys MockUSDC + Oracle + Market on anvil, funds
///         a handful of test wallets, creates today's RTX 5090 market, and seeds a
///         starter pool so the UI lights up immediately. Use:
///             anvil --chain-id 5042002
///             forge script script/E2EDemo.s.sol:E2EDemo \
///                 --rpc-url http://127.0.0.1:8545 --broadcast --skip-simulation
contract E2EDemo is Script {
    uint256 constant DEPLOYER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    function run() external {
        address deployer = vm.addr(DEPLOYER_KEY);
        uint64 settlementTs = uint64(block.timestamp + 1 days);

        vm.startBroadcast(DEPLOYER_KEY);
        MockUSDC usdc = new MockUSDC();
        OrnnOracle oracle = new OrnnOracle(deployer, deployer);
        SiliconMarket market = new SiliconMarket(IERC20(address(usdc)), oracle, deployer, 100, deployer, 5 minutes);
        _fundDemoWallets(usdc);
        usdc.mint(deployer, 1_000e6);
        usdc.approve(address(market), type(uint256).max);
        uint256 marketId = market.createMarket("RTX 5090", settlementTs);
        _seedPool(market, marketId);
        vm.stopBroadcast();

        console2.log("=== Silicon Markets dev deployment ===");
        console2.log("USDC          :", address(usdc));
        console2.log("OrnnOracle    :", address(oracle));
        console2.log("SiliconMarket :", address(market));
        console2.log("marketId      :", marketId);
        console2.log("settlementTs  :", settlementTs);
    }

    function _fundDemoWallets(MockUSDC usdc) internal {
        usdc.mint(0x70997970C51812dc3A010C7d01b50e0d17dc79C8, 10_000e6);
        usdc.mint(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 10_000e6);
        usdc.mint(0x90F79bf6EB2c4f870365E785982E1f101E93b906, 10_000e6);
        usdc.mint(0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65, 10_000e6);
    }

    function _seedPool(SiliconMarket market, uint256 marketId) internal {
        market.lockForecast(marketId, int128(int256(82 * 1e6)), uint128(3 * 1e6), uint128(100e6));
        market.lockForecast(marketId, int128(int256(80 * 1e6)), uint128(5 * 1e6), uint128(100e6));
        market.lockForecast(marketId, int128(int256(75 * 1e6)), uint128(4 * 1e6), uint128(100e6));
    }
}

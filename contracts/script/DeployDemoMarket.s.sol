// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {OrnnOracle} from "../src/OrnnOracle.sol";
import {SiliconMarket} from "../src/SiliconMarket.sol";

/// @notice Deploys a DEMO SiliconMarket instance with NO trading cutoff, wired
///         to the existing OrnnOracle and native USDC. Used by the frontend's
///         one-click settlement demo: markets can settle seconds after they're
///         seeded. The production daily market is a separate deployment.
///
///         Env: DEPLOYER_PRIVATE_KEY, ORACLE_ADDRESS
contract DeployDemoMarket is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        OrnnOracle oracle = OrnnOracle(vm.envAddress("ORACLE_ADDRESS"));

        vm.startBroadcast(pk);
        SiliconMarket demo =
            new SiliconMarket(IERC20(ARC_USDC), oracle, deployer, 100, deployer, 0 /* no cutoff */);
        vm.stopBroadcast();

        console2.log("DemoSiliconMarket:", address(demo));
    }
}

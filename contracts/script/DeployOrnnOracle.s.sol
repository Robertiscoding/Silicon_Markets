// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {OrnnOracle} from "../src/OrnnOracle.sol";

contract DeployOrnnOracle is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address updater = vm.envOr("ORACLE_UPDATER", deployer);

        vm.startBroadcast(pk);
        OrnnOracle oracle = new OrnnOracle(deployer, updater);
        vm.stopBroadcast();

        console2.log("Deployer:", deployer);
        console2.log("OrnnOracle:", address(oracle));
        console2.log("Oracle updater:", updater);

        string memory json = string(
            abi.encodePacked(
                "{\n",
                '  "chainId": ',
                vm.toString(block.chainid),
                ",\n",
                '  "usdc": "0x3600000000000000000000000000000000000000",\n',
                '  "oracle": "',
                vm.toString(address(oracle)),
                "\",\n",
                '  "updater": "',
                vm.toString(updater),
                '",\n',
                '  "owner": "',
                vm.toString(deployer),
                "\"\n}\n"
            )
        );
        vm.writeFile("deployments/arc.json", json);
    }
}

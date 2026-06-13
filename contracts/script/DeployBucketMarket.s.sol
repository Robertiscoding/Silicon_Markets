// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {OrnnOracle} from "../src/OrnnOracle.sol";
import {BucketMarket} from "../src/BucketMarket.sol";

contract DeployBucketMarket is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        string memory root = vm.readFile("deployments/arc.json");
        address oracleAddr = vm.parseJsonAddress(root, ".oracle");
        address updater = vm.parseJsonAddress(root, ".updater");
        address owner = vm.parseJsonAddress(root, ".owner");
        address market = vm.parseJsonAddress(root, ".market");
        address feeRecipient = vm.parseJsonAddress(root, ".feeRecipient");
        uint256 feeBps = vm.parseJsonUint(root, ".feeBps");
        OrnnOracle oracle = OrnnOracle(oracleAddr);

        vm.startBroadcast(pk);
        BucketMarket book = new BucketMarket(IERC20(ARC_USDC), oracle, deployer);
        vm.stopBroadcast();

        console2.log("Deployer:", deployer);
        console2.log("BucketMarket:", address(book));
        console2.log("Oracle:", oracleAddr);

        string memory json = string(
            abi.encodePacked(
                "{\n",
                '  "chainId": ',
                vm.toString(block.chainid),
                ",\n",
                '  "usdc": "0x3600000000000000000000000000000000000000",\n',
                '  "oracle": "',
                vm.toString(oracleAddr),
                "\",\n",
                '  "market": "',
                vm.toString(market),
                "\",\n",
                '  "book": "',
                vm.toString(address(book)),
                "\",\n",
                '  "updater": "',
                vm.toString(updater),
                "\",\n",
                '  "owner": "',
                vm.toString(owner),
                "\",\n",
                '  "feeRecipient": "',
                vm.toString(feeRecipient),
                "\",\n",
                '  "feeBps": ',
                vm.toString(feeBps),
                "\n}\n"
            )
        );
        vm.writeFile("deployments/arc.json", json);
    }
}

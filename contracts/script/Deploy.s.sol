// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {OrnnOracle} from "../src/OrnnOracle.sol";
import {SiliconMarket} from "../src/SiliconMarket.sol";
import {BucketMarket} from "../src/BucketMarket.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Deploys OrnnOracle + SiliconMarket. Wires them to the USDC ERC-20 interface
///         on Arc Testnet (0x3600000000000000000000000000000000000000) unless a
///         `MOCK_USDC=true` env var is set, in which case a MockUSDC is deployed too.
/// @dev    Required env vars:
///         - DEPLOYER_PRIVATE_KEY
///         - ORACLE_UPDATER (address allowed to push prints)
///         - FEE_RECIPIENT  (defaults to deployer)
///         - FEE_BPS        (defaults to 100 = 1%)
contract Deploy is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address updater = vm.envOr("ORACLE_UPDATER", deployer);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(100)));
        bool mockUsdc = vm.envOr("MOCK_USDC", false);

        vm.startBroadcast(pk);

        IERC20 usdc;
        if (mockUsdc) {
            MockUSDC m = new MockUSDC();
            usdc = IERC20(address(m));
            console2.log("MockUSDC deployed at", address(m));
        } else {
            usdc = IERC20(ARC_USDC);
        }

        OrnnOracle oracle = new OrnnOracle(deployer, updater);
        SiliconMarket market = new SiliconMarket(usdc, oracle, feeRecipient, feeBps, deployer, 5 minutes);
        BucketMarket book = new BucketMarket(usdc, oracle, deployer);

        vm.stopBroadcast();

        console2.log("Deployer:        ", deployer);
        console2.log("USDC:            ", address(usdc));
        console2.log("OrnnOracle:      ", address(oracle));
        console2.log("SiliconMarket:   ", address(market));
        console2.log("BucketMarket:    ", address(book));
        console2.log("Oracle updater:  ", updater);
        console2.log("Fee recipient:   ", feeRecipient);
        console2.log("Fee BPS:         ", feeBps);

        string memory json = string(
            abi.encodePacked(
                "{\n",
                "  \"chainId\": ",
                vm.toString(block.chainid),
                ",\n",
                "  \"usdc\": \"",
                vm.toString(address(usdc)),
                "\",\n",
                "  \"oracle\": \"",
                vm.toString(address(oracle)),
                "\",\n",
                "  \"market\": \"",
                vm.toString(address(market)),
                "\",\n",
                "  \"book\": \"",
                vm.toString(address(book)),
                "\",\n",
                "  \"updater\": \"",
                vm.toString(updater),
                "\",\n",
                "  \"feeRecipient\": \"",
                vm.toString(feeRecipient),
                "\",\n",
                "  \"feeBps\": ",
                vm.toString(uint256(feeBps)),
                "\n}\n"
            )
        );
        vm.writeFile("deployments/latest.json", json);
    }
}

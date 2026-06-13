// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SiliconMarket} from "../src/SiliconMarket.sol";

/// @notice Creates tomorrow's daily markets for the six tracked GPU symbols.
///         Run nightly (or right after deploy) so the UI always has markets to display.
contract SeedMarkets is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address marketAddr = vm.envAddress("MARKET_ADDRESS");
        SiliconMarket market = SiliconMarket(marketAddr);

        // settlementTs = next 4 PM ET. We pass it explicitly via env so the off-chain
        // tooling stays the source of truth for the ET boundary (handles DST cleanly).
        uint64 settlementTs = uint64(vm.envUint("SETTLEMENT_TS"));

        string[6] memory symbols =
            ["H100 SXM", "H200", "B200", "A100 SXM4", "RTX 5090", "RTX PRO 6000 WS"];

        vm.startBroadcast(pk);
        for (uint256 i = 0; i < symbols.length; ++i) {
            (uint256 existing, bool exists) = market.marketIdFor(symbols[i], settlementTs);
            if (exists) {
                console2.log("Market already exists for", symbols[i], "id", existing);
                continue;
            }
            uint256 id = market.createMarket(symbols[i], settlementTs);
            console2.log("Created market id", id, "for", symbols[i]);
        }
        vm.stopBroadcast();
    }
}

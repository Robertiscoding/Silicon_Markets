// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OrnnOracle} from "../src/OrnnOracle.sol";

contract OrnnOracleTest is Test {
    OrnnOracle internal oracle;
    address internal admin = address(0xA11CE);
    address internal updater = address(0xB0B);

    function setUp() public {
        oracle = new OrnnOracle(admin, updater);
    }

    function test_publishPrint() public {
        vm.prank(updater);
        oracle.publishPrint("RTX 5090", 1_700_000_000, 245_000_000);

        (uint128 price,) = oracle.getPrint("RTX 5090", 1_700_000_000);
        assertEq(price, 245_000_000);
    }

    function test_revertNotUpdater() public {
        vm.expectRevert(OrnnOracle.NotUpdater.selector);
        oracle.publishPrint("RTX 5090", 1_700_000_000, 245_000_000);
    }
}

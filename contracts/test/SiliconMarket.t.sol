// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {OrnnOracle} from "../src/OrnnOracle.sol";
import {SiliconMarket} from "../src/SiliconMarket.sol";

contract SiliconMarketTest is Test {
    MockUSDC internal usdc;
    OrnnOracle internal oracle;
    SiliconMarket internal market;

    address internal admin = address(0xA11CE);
    address internal feeSink = address(0xFEE);
    address internal updater = address(0xB0B);
    address internal alice = address(0xA);
    address internal bob = address(0xB);
    address internal carol = address(0xC);
    address internal dan = address(0xD);

    string internal constant RTX = "RTX 5090";
    uint64 internal settleTs;

    function setUp() public {
        vm.warp(1_716_000_000); // arbitrary anchor time
        settleTs = uint64(block.timestamp + 1 days);

        vm.startPrank(admin);
        usdc = new MockUSDC();
        oracle = new OrnnOracle(admin, updater);
        market = new SiliconMarket(usdc, oracle, feeSink, 100 /* 1% */, admin, 5 minutes);
        vm.stopPrank();

        for (uint160 i = 1; i <= 4; ++i) {
            address user = address(uint160(0xA) - 1 + i);
            usdc.mint(user, 1_000_000e6);
            vm.prank(user);
            usdc.approve(address(market), type(uint256).max);
        }
    }

    function _createMarket() internal returns (uint256 marketId) {
        marketId = market.createMarket(RTX, settleTs);
    }

    function _lock(address user, uint256 marketId, uint256 centerCents, uint256 bandCents, uint256 stake)
        internal
        returns (uint256 forecastId)
    {
        vm.prank(user);
        forecastId = market.lockForecast(
            marketId, int128(int256(centerCents) * 1e6), uint128(bandCents * 1e6), uint128(stake)
        );
    }

    function testCreateMarket() public {
        uint256 id = _createMarket();
        assertEq(id, 0);
        (uint256 lookup, bool exists) = market.marketIdFor(RTX, settleTs);
        assertTrue(exists);
        assertEq(lookup, id);
    }

    function testCannotCreateDuplicate() public {
        _createMarket();
        vm.expectRevert(SiliconMarket.MarketExists.selector);
        market.createMarket(RTX, settleTs);
    }

    function testLockForecastTransfersUSDC() public {
        uint256 id = _createMarket();
        uint256 beforeBal = usdc.balanceOf(alice);
        _lock(alice, id, 82, 3, 50e6);
        assertEq(usdc.balanceOf(alice), beforeBal - 50e6);
        assertEq(usdc.balanceOf(address(market)), 50e6);
    }

    function testTradingCutoff() public {
        uint256 id = _createMarket();
        // Move to within cutoff window.
        vm.warp(settleTs - 1 minutes);
        vm.expectRevert(SiliconMarket.TradingClosed.selector);
        _lock(alice, id, 82, 3, 50e6);
    }

    function testResolvePaysWinnersProRata() public {
        uint256 id = _createMarket();

        // Pool composition: Alice $50 on 0.82±0.03 (winning), Bob $25 on 0.80±0.05 (winning),
        // Carol $40 on 0.65±0.02 (losing), Dan $35 on 0.95±0.02 (losing).
        uint256 aliceFc = _lock(alice, id, 82, 3, 50e6);
        uint256 bobFc = _lock(bob, id, 80, 5, 25e6);
        _lock(carol, id, 65, 2, 40e6);
        _lock(dan, id, 95, 2, 35e6);

        SiliconMarket.Market memory mState = market.getMarket(id);
        assertEq(mState.totalStake, 150e6);

        // Move past settlement.
        vm.warp(settleTs + 1);

        // Updater pushes the print: $0.82.
        vm.prank(updater);
        oracle.publishPrint(RTX, settleTs, uint128(82 * 1e6)); // 0.82 USD/hr in 1e8 units

        market.resolve(id);

        // Winning stake should be Alice($50) + Bob($25) = $75.
        mState = market.getMarket(id);
        assertEq(uint8(mState.status), uint8(SiliconMarket.Status.Resolved));
        assertEq(mState.winningStake, 75e6);

        // Pool $150, fee 1% = $1.50, distributable $148.50.
        // Alice (50/75) * 148.50 = $99, fee share (50/75) * 1.50 = $1.
        // Bob   (25/75) * 148.50 = $49.50, fee share (25/75) * 1.50 = $0.50.
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        uint256 alicePayout = market.claim(id, aliceFc);
        assertEq(alicePayout, 99_000_000); // $99.00 in 6 decimals
        assertEq(usdc.balanceOf(alice) - aliceBefore, 99_000_000);

        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        uint256 bobPayout = market.claim(id, bobFc);
        assertEq(bobPayout, 49_500_000);
        assertEq(usdc.balanceOf(bob) - bobBefore, 49_500_000);

        // Fee sink should have received $1 + $0.50 = $1.50.
        assertEq(usdc.balanceOf(feeSink), 1_500_000);

        // Market should be drained.
        assertEq(usdc.balanceOf(address(market)), 0);
    }

    function testRefundWhenNoWinners() public {
        uint256 id = _createMarket();
        uint256 aliceFc = _lock(alice, id, 82, 1, 50e6); // [0.81, 0.83]
        uint256 bobFc = _lock(bob, id, 79, 1, 50e6); // [0.78, 0.80]

        vm.warp(settleTs + 1);
        vm.prank(updater);
        oracle.publishPrint(RTX, settleTs, uint128(70 * 1e6)); // 0.70 — both lose

        market.resolve(id);
        SiliconMarket.Market memory mState = market.getMarket(id);
        assertEq(uint8(mState.status), uint8(SiliconMarket.Status.Refunded));

        vm.prank(alice);
        uint256 a = market.claim(id, aliceFc);
        assertEq(a, 50e6);

        vm.prank(bob);
        uint256 b = market.claim(id, bobFc);
        assertEq(b, 50e6);

        // No fee charged on refund.
        assertEq(usdc.balanceOf(feeSink), 0);
    }

    function testLosingForecastCannotClaim() public {
        uint256 id = _createMarket();
        _lock(alice, id, 82, 3, 50e6);
        uint256 carolFc = _lock(carol, id, 65, 2, 40e6);

        vm.warp(settleTs + 1);
        vm.prank(updater);
        oracle.publishPrint(RTX, settleTs, uint128(82 * 1e6));

        market.resolve(id);

        vm.expectRevert(SiliconMarket.NothingToClaim.selector);
        vm.prank(carol);
        market.claim(id, carolFc);
    }

    function testImpliedOddsBps() public {
        uint256 id = _createMarket();
        _lock(alice, id, 82, 3, 50e6); // $50 wins at 0.82
        _lock(bob, id, 90, 2, 50e6); // $50 wins at 0.90
        _lock(carol, id, 70, 5, 100e6); // $100 wins at 0.70

        uint16 oddsAt82 = market.impliedOddsBps(id, uint128(82 * 1e6));
        // Only Alice wins at 0.82, $50 out of $200 pool = 2500 bps (25%).
        assertEq(oddsAt82, 2500);

        uint16 oddsAt70 = market.impliedOddsBps(id, uint128(70 * 1e6));
        // Carol wins ($100/$200 = 5000).
        assertEq(oddsAt70, 5000);
    }

    function testOracleRejectsUnauthorized() public {
        vm.expectRevert(OrnnOracle.NotUpdater.selector);
        oracle.publishPrint(RTX, settleTs, 1e8);
    }

    function testOracleIdempotent() public {
        vm.prank(updater);
        oracle.publishPrint(RTX, settleTs, 1e8);
        vm.prank(updater);
        vm.expectRevert(OrnnOracle.PrintExists.selector);
        oracle.publishPrint(RTX, settleTs, 2e8);
    }
}

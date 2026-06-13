// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {OrnnOracle} from "../src/OrnnOracle.sol";
import {BucketMarket} from "../src/BucketMarket.sol";

contract BucketMarketTest is Test {
    MockUSDC internal usdc;
    OrnnOracle internal oracle;
    BucketMarket internal book;

    address internal admin = address(0xA11CE);
    address internal updater = address(0xB0B);
    address internal makerA = address(0xAA);
    address internal makerB = address(0xBB);
    address internal taker = address(0xCC);
    address internal taker2 = address(0xDD);

    string internal constant RTX = "RTX 5090";
    uint64 internal settleTs;

    // Bucket grid: $0.65 to $0.89 in $0.01 steps, 24 buckets.
    uint128 internal constant BUCKET_LOW = uint128(65 * 1e6); // 0.65 in 1e8 units
    uint128 internal constant BUCKET_WIDTH = uint128(1 * 1e6); // 0.01 in 1e8 units
    uint16 internal constant BUCKET_COUNT = 24;

    function setUp() public {
        vm.warp(1_716_000_000);
        settleTs = uint64(block.timestamp + 1 days);

        vm.startPrank(admin);
        usdc = new MockUSDC();
        oracle = new OrnnOracle(admin, updater);
        book = new BucketMarket(usdc, oracle, admin);
        vm.stopPrank();

        address[5] memory wallets = [makerA, makerB, taker, taker2, admin];
        for (uint256 i = 0; i < wallets.length; ++i) {
            usdc.mint(wallets[i], 1_000_000e6);
            vm.prank(wallets[i]);
            usdc.approve(address(book), type(uint256).max);
        }
    }

    function _create() internal returns (uint256) {
        return book.createMarket(RTX, settleTs, BUCKET_LOW, BUCKET_WIDTH, BUCKET_COUNT);
    }

    function _bucketIndexFor(uint128 price) internal pure returns (uint16) {
        return uint16((price - BUCKET_LOW) / BUCKET_WIDTH);
    }

    function testCreateMarket() public {
        uint256 id = _create();
        BucketMarket.Market memory m = book.getMarket(id);
        assertEq(m.bucketCount, BUCKET_COUNT);
        assertEq(m.bucketLow, BUCKET_LOW);
        assertEq(m.bucketWidth, BUCKET_WIDTH);
    }

    function testPostAskLocksCollateral() public {
        uint256 id = _create();
        uint16 b = 9; // bucket starting at 0.74

        uint256 beforeBal = usdc.balanceOf(makerA);
        vm.prank(makerA);
        book.postAsk(id, b, uint128(0.32e6) /* $0.32 raw */, 100 /* 100 shares */);
        // collateral = (1_000_000 - 320_000) × 100 = 68_000_000 raw USDC = $68.
        assertEq(beforeBal - usdc.balanceOf(makerA), 68e6);
        assertEq(usdc.balanceOf(address(book)), 68e6);
    }

    function testPostAskInsertionSortByPrice() public {
        uint256 id = _create();
        uint16 b = 9;

        vm.prank(makerA);
        book.postAsk(id, b, uint128(0.32e6), 100);
        vm.prank(makerB);
        book.postAsk(id, b, uint128(0.18e6), 50); // cheaper, should sort to front
        vm.prank(makerA);
        book.postAsk(id, b, uint128(0.25e6), 80);

        // Best ask should be makerB at $0.18.
        (uint128 price, uint128 size, address maker,, bool exists) = book.bestAsk(id, b);
        assertTrue(exists);
        assertEq(price, uint128(0.18e6));
        assertEq(size, 50);
        assertEq(maker, makerB);
    }

    function testFillBucketWalksAsks() public {
        uint256 id = _create();
        uint16 b = 9;

        vm.prank(makerA);
        book.postAsk(id, b, uint128(0.20e6), 30); // cheap
        vm.prank(makerB);
        book.postAsk(id, b, uint128(0.30e6), 50); // pricier

        // Taker wants 60 shares with up to $20 budget.
        uint256 takerBefore = usdc.balanceOf(taker);
        vm.prank(taker);
        (uint128 bought, uint128 paid) = book.fillBucket(id, b, 60, 20e6);

        // Should fill 30 @ 0.20 = $6, then 30 @ 0.30 = $9 → 60 shares for $15.
        assertEq(bought, 60);
        assertEq(paid, 15e6);
        assertEq(takerBefore - usdc.balanceOf(taker), 15e6);
        assertEq(book.yesShares(id, b, taker), 60);
    }

    function testFillBucketRespectsCostCap() public {
        uint256 id = _create();
        uint16 b = 9;

        vm.prank(makerA);
        book.postAsk(id, b, uint128(0.20e6), 100);

        // Cap at $5 → should fill 25 shares (5 / 0.20).
        vm.prank(taker);
        (uint128 bought, uint128 paid) = book.fillBucket(id, b, 100, 5e6);
        assertEq(bought, 25);
        assertEq(paid, 5e6);
    }

    function testFillBucketsAroundFillsBand() public {
        uint256 id = _create();
        uint16 center = 9; // 0.74

        // Seed each of buckets 7..11 with 10 shares @ $0.20.
        for (uint16 b = 7; b <= 11; ++b) {
            vm.prank(makerA);
            book.postAsk(id, b, uint128(0.20e6), 10);
        }

        // Taker fills band of half-width 2 (5 buckets), 10 shares each, big budget.
        vm.prank(taker);
        (uint128 totalShares, uint128 totalCost) =
            book.fillBucketsAround(id, center, 2, 10, 1_000e6);

        assertEq(totalShares, 50); // 5 buckets × 10 shares
        assertEq(totalCost, 10e6); // 50 × 0.20
        for (uint16 b = 7; b <= 11; ++b) {
            assertEq(book.yesShares(id, b, taker), 10);
        }
    }

    function testResolveAndClaimWinnerGets1USDCPerShare() public {
        uint256 id = _create();
        uint16 winningBucket = _bucketIndexFor(uint128(74 * 1e6)); // 0.74 print -> bucket 9

        // Maker A sells YES @ $0.30, 100 shares, in bucket 9 (winner).
        vm.prank(makerA);
        book.postAsk(id, winningBucket, uint128(0.30e6), 100);
        // Maker B sells YES @ $0.10, 50 shares, in bucket 5 (loser).
        vm.prank(makerB);
        book.postAsk(id, 5, uint128(0.10e6), 50);

        // Taker buys 100 from winner @ $0.30 = $30, and 50 from loser @ $0.10 = $5.
        vm.prank(taker);
        book.fillBucket(id, winningBucket, 100, 1_000e6);
        vm.prank(taker);
        book.fillBucket(id, 5, 50, 1_000e6);

        vm.warp(settleTs + 1);
        vm.prank(updater);
        oracle.publishPrint(RTX, settleTs, uint128(74 * 1e6)); // 0.74 -> bucket 9
        book.resolve(id);

        BucketMarket.Market memory m = book.getMarket(id);
        assertEq(uint256(m.winningBucket), uint256(winningBucket));
        assertEq(uint8(m.status), uint8(BucketMarket.Status.Resolved));

        // Taker claims winning bucket: 100 shares × 1 USDC = $100.
        uint256 takerBefore = usdc.balanceOf(taker);
        vm.prank(taker);
        uint256 payout = book.claimYes(id, winningBucket);
        assertEq(payout, 100e6);
        assertEq(usdc.balanceOf(taker) - takerBefore, 100e6);

        // Taker tries to claim losing bucket -> nothing to claim.
        vm.expectRevert(BucketMarket.NothingToClaim.selector);
        vm.prank(taker);
        book.claimYes(id, 5);
    }

    function testMakerEscrowFlowsLoserKeepsAllProfit() public {
        uint256 id = _create();

        // Maker B sells 50 YES @ $0.10 in bucket 5 (will lose).
        // Locked collateral = (1 - 0.10) × 50 = $45.
        // Taker buys 50 → maker B receives $5 implicitly held in contract.
        vm.prank(makerB);
        uint256 askId = book.postAsk(id, 5, uint128(0.10e6), 50);
        vm.prank(taker);
        book.fillBucket(id, 5, 50, 1_000e6);

        vm.warp(settleTs + 1);
        vm.prank(updater);
        oracle.publishPrint(RTX, settleTs, uint128(74 * 1e6)); // bucket 9 wins
        book.resolve(id);

        // Maker B reclaims escrow on losing bucket: full filled value (50) returns to them.
        // unfilled = 0 → no extra. Filled = 50 × $1 = $50.
        uint256 mbBefore = usdc.balanceOf(makerB);
        vm.prank(makerB);
        uint256 amount = book.reclaimMakerEscrow(id, 5, askId);
        assertEq(amount, 50e6);
        assertEq(usdc.balanceOf(makerB) - mbBefore, 50e6);
    }

    function testMakerEscrowOnWinningBucketOnlyUnfilledReturned() public {
        uint256 id = _create();
        uint16 wb = 9;

        // Maker A posts 100 shares @ $0.30 in winning bucket. Collateral = 70.
        vm.prank(makerA);
        uint256 askId = book.postAsk(id, wb, uint128(0.30e6), 100);

        // Taker fills only 40 of 100 shares (cost = 12).
        vm.prank(taker);
        book.fillBucket(id, wb, 40, 1_000e6);

        vm.warp(settleTs + 1);
        vm.prank(updater);
        oracle.publishPrint(RTX, settleTs, uint128(74 * 1e6));
        book.resolve(id);

        // Unfilled = 60 shares; refund collateral = 0.70 × 60 = $42.
        // Filled = 40 shares; bucket won → no refund (those go to YES holders).
        uint256 maBefore = usdc.balanceOf(makerA);
        vm.prank(makerA);
        uint256 amount = book.reclaimMakerEscrow(id, wb, askId);
        assertEq(amount, 42e6);
        assertEq(usdc.balanceOf(makerA) - maBefore, 42e6);

        // Taker claims their 40 shares.
        vm.prank(taker);
        uint256 takerPayout = book.claimYes(id, wb);
        assertEq(takerPayout, 40e6);

        // Contract is fully drained.
        assertEq(usdc.balanceOf(address(book)), 0);
    }

    function testCancelRefundsUnfilledCollateral() public {
        uint256 id = _create();
        uint16 b = 9;

        vm.prank(makerA);
        uint256 askId = book.postAsk(id, b, uint128(0.40e6), 100); // collateral = 60
        vm.prank(taker);
        book.fillBucket(id, b, 30, 1_000e6); // fills 30 (cost = 12)

        // Cancel: unfilled = 70 → refund = 0.60 × 70 = 42.
        uint256 maBefore = usdc.balanceOf(makerA);
        vm.prank(makerA);
        book.cancelAsk(id, b, askId);
        assertEq(usdc.balanceOf(makerA) - maBefore, 42e6);
    }

    function testQuoteBucketMatchesFill() public {
        uint256 id = _create();
        uint16 b = 9;

        vm.prank(makerA);
        book.postAsk(id, b, uint128(0.10e6), 30);
        vm.prank(makerB);
        book.postAsk(id, b, uint128(0.20e6), 40);

        (uint128 quotedShares, uint128 quotedCost) = book.quoteBucket(id, b, 50);
        // First 30 @ 0.10 = 3, next 20 @ 0.20 = 4 → 50 shares for $7.
        assertEq(quotedShares, 50);
        assertEq(quotedCost, 7e6);

        vm.prank(taker);
        (uint128 actualShares, uint128 actualCost) = book.fillBucket(id, b, 50, 100e6);
        assertEq(actualShares, quotedShares);
        assertEq(actualCost, quotedCost);
    }

    function testBucketIndexConversion() public {
        uint256 id = _create();
        // 0.74 should map to bucket index 9.
        (uint128 lo, uint128 hi) = book.bucketEdges(id, 9);
        assertEq(lo, uint128(74 * 1e6));
        assertEq(hi, uint128(75 * 1e6));
    }

    function testVoidWhenPrintBelowGrid() public {
        uint256 id = _create();
        vm.prank(makerA);
        book.postAsk(id, 9, uint128(0.30e6), 100);
        vm.prank(taker);
        book.fillBucket(id, 9, 100, 1_000e6); // cost = 30

        vm.warp(settleTs + 1);
        vm.prank(updater);
        oracle.publishPrint(RTX, settleTs, uint128(50 * 1e6)); // 0.50 below 0.65 floor
        book.resolve(id);

        BucketMarket.Market memory m = book.getMarket(id);
        assertEq(uint8(m.status), uint8(BucketMarket.Status.Voided));

        // Maker A reclaims full escrow as if losing.
        // Collateral 70 + filled 30 = 100.
        uint256 maBefore = usdc.balanceOf(makerA);
        vm.prank(makerA);
        book.reclaimMakerEscrow(id, 9, 0);
        assertEq(usdc.balanceOf(makerA) - maBefore, 100e6);

        // Taker has nothing to claim on a voided market.
        vm.expectRevert(BucketMarket.NothingToClaim.selector);
        vm.prank(taker);
        book.claimYes(id, 9);
    }
}

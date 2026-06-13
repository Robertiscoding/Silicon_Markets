// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {OrnnOracle} from "./OrnnOracle.sol";

/// @title BucketMarket
/// @notice Discrete-bucket prediction market with an on-chain order book.
///         Each market is a (gpuSymbol, settlementDayKey) tuple sliced into N
///         narrow price buckets. Each bucket is a binary YES outcome paying
///         exactly 1 USDC if the Ornn 4 PM ET print lands inside it, 0 otherwise.
///
/// @dev Maker workflow:
///        - postAsk(marketId, bucketIdx, pricePerShare, size)
///          Maker locks (1 USDC - price) × size as collateral. Their ask is
///          inserted into the bucket's price-sorted ask book.
///      Taker workflow:
///        - fillBucket(marketId, bucketIdx, maxShares, maxCost)
///          Walks the bucket's asks cheapest-first. Pays `price × filled` USDC
///          per fill (held in escrow) and receives YES shares.
///        - fillBucketsAround(marketId, centerBucket, halfWidth, sharesPerBucket, maxCost)
///          Convenience: fills `2 × halfWidth + 1` adjacent buckets, mirroring
///          the user's "center ± band" forecast band.
///      Settlement:
///        - resolve(marketId) reads the price from OrnnOracle and identifies
///          the winning bucket.
///        - claimYes(marketId, bucketIdx)         — winners redeem 1 USDC/share
///        - reclaimMakerEscrow(marketId, bucketIdx) — losing-bucket makers reclaim
///        - cancelAsk(marketId, bucketIdx, askIdx) — cancel unfilled portion
///
/// All prices in this contract are denominated in raw USDC (6 decimals).
/// SHARE_PAYOUT = 1e6 = 1 USDC. A YES share priced at 0.32e6 means 32¢/share.
contract BucketMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Constants ---------------------------------------------------------

    /// @notice Payout in raw USDC (6 decimals) per winning YES share. 1 share -> 1 USDC.
    uint256 public constant SHARE_PAYOUT = 1e6;
    /// @notice Matches OrnnOracle's USD-per-GPU-hour scale (1e8).
    uint256 public constant PRICE_SCALE = 1e8;

    // --- Storage -----------------------------------------------------------

    IERC20 public immutable usdc;
    OrnnOracle public immutable oracle;

    enum Status {
        Open,
        Resolved,
        Voided
    }

    struct Market {
        string gpuSymbol;
        bytes32 gpuSymbolHash;
        uint64 settlementTs;
        uint128 bucketLow; // lower edge of bucket 0, scaled by PRICE_SCALE
        uint128 bucketWidth; // width of each bucket, scaled by PRICE_SCALE
        uint16 bucketCount;
        uint16 winningBucket; // valid iff status == Resolved
        Status status;
    }

    struct Ask {
        address maker;
        uint128 pricePerShare; // 0 < price < SHARE_PAYOUT, in raw USDC
        uint128 size; // total shares offered originally
        uint128 filled; // shares already sold
        bool cancelled;
    }

    Market[] private _markets;
    /// @notice marketId => bucketIdx => sorted (price ascending) ask book
    mapping(uint256 => mapping(uint256 => Ask[])) private _asks;
    /// @notice YES share holdings per (marketId, bucketIdx, holder)
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public yesShares;
    /// @notice Has the maker reclaimed escrow for this (marketId, bucketIdx) yet?
    ///         Combined with per-ask `cancelled` and `filled` accounting we avoid
    ///         double-spends.
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bool))) public escrowClaimed;
    /// @notice unique market lookup
    mapping(bytes32 => mapping(uint256 => uint256)) private _marketIdPlusOne;

    // --- Events ------------------------------------------------------------

    event MarketCreated(
        uint256 indexed marketId,
        bytes32 indexed gpuSymbolHash,
        string gpuSymbol,
        uint64 settlementTs,
        uint128 bucketLow,
        uint128 bucketWidth,
        uint16 bucketCount
    );
    event AskPosted(
        uint256 indexed marketId,
        uint256 indexed bucketIdx,
        uint256 indexed askId,
        address maker,
        uint128 pricePerShare,
        uint128 size
    );
    event Filled(
        uint256 indexed marketId,
        uint256 indexed bucketIdx,
        uint256 indexed askId,
        address taker,
        address maker,
        uint128 shares,
        uint128 cost
    );
    event AskCancelled(uint256 indexed marketId, uint256 indexed bucketIdx, uint256 indexed askId);
    event MarketResolved(uint256 indexed marketId, uint128 settlementPrice, uint16 winningBucket);
    event MarketVoided(uint256 indexed marketId);
    event YesClaimed(
        uint256 indexed marketId, uint256 indexed bucketIdx, address indexed user, uint256 amount
    );
    event MakerEscrowReclaimed(
        uint256 indexed marketId, uint256 indexed bucketIdx, uint256 indexed askId, address maker, uint256 amount
    );

    // --- Errors ------------------------------------------------------------

    error InvalidParams();
    error MarketExists();
    error MarketNotOpen();
    error MarketNotResolvable();
    error MarketAlreadySettled();
    error TradingClosed();
    error BadBucket();
    error BadPrice();
    error BadSize();
    error NotMaker();
    error AlreadyClaimed();
    error NothingToClaim();

    // --- Constructor -------------------------------------------------------

    constructor(IERC20 usdc_, OrnnOracle oracle_, address owner_) Ownable(owner_) {
        if (address(usdc_) == address(0) || address(oracle_) == address(0)) revert InvalidParams();
        usdc = usdc_;
        oracle = oracle_;
    }

    // --- Market lifecycle --------------------------------------------------

    /// @notice Create a bucketed market. The bucket grid is fixed at creation.
    /// @dev Buckets cover [bucketLow, bucketLow + bucketWidth × bucketCount).
    function createMarket(
        string calldata gpuSymbol,
        uint64 settlementTs,
        uint128 bucketLow,
        uint128 bucketWidth,
        uint16 bucketCount
    ) external returns (uint256 marketId) {
        if (settlementTs <= block.timestamp) revert InvalidParams();
        if (bucketWidth == 0 || bucketCount == 0 || bucketCount > 256) revert InvalidParams();

        bytes32 symHash = keccak256(bytes(gpuSymbol));
        if (_marketIdPlusOne[symHash][settlementTs] != 0) revert MarketExists();

        marketId = _markets.length;
        _markets.push(
            Market({
                gpuSymbol: gpuSymbol,
                gpuSymbolHash: symHash,
                settlementTs: settlementTs,
                bucketLow: bucketLow,
                bucketWidth: bucketWidth,
                bucketCount: bucketCount,
                winningBucket: 0,
                status: Status.Open
            })
        );
        _marketIdPlusOne[symHash][settlementTs] = marketId + 1;

        emit MarketCreated(marketId, symHash, gpuSymbol, settlementTs, bucketLow, bucketWidth, bucketCount);
    }

    // --- Maker side --------------------------------------------------------

    /// @notice Post a YES ask for a single bucket.
    /// @dev Maker locks (SHARE_PAYOUT - pricePerShare) × size USDC. Combined with
    ///      taker payment on fill, total escrow per filled share equals SHARE_PAYOUT,
    ///      so winners can always redeem 1 USDC each from the contract.
    function postAsk(uint256 marketId, uint16 bucketIdx, uint128 pricePerShare, uint128 size)
        external
        nonReentrant
        returns (uint256 askId)
    {
        Market storage m = _market(marketId);
        if (m.status != Status.Open) revert MarketNotOpen();
        if (block.timestamp >= m.settlementTs) revert TradingClosed();
        if (bucketIdx >= m.bucketCount) revert BadBucket();
        if (pricePerShare == 0 || pricePerShare >= SHARE_PAYOUT) revert BadPrice();
        if (size == 0) revert BadSize();

        // size is denominated in whole YES shares; pricePerShare is raw USDC.
        // Maker locks (1 USDC - price) per share so that combined with the taker's
        // payment on fill, the contract holds exactly 1 USDC per share — enough
        // to pay any winning YES holder.
        uint256 collateral = uint256(SHARE_PAYOUT - pricePerShare) * uint256(size);
        usdc.safeTransferFrom(msg.sender, address(this), collateral);

        Ask[] storage book = _asks[marketId][bucketIdx];
        askId = book.length;
        book.push(Ask({maker: msg.sender, pricePerShare: pricePerShare, size: size, filled: 0, cancelled: false}));

        // Insertion sort to keep cheapest-first ordering.
        for (uint256 i = askId; i > 0; --i) {
            if (book[i].pricePerShare < book[i - 1].pricePerShare) {
                Ask memory tmp = book[i];
                book[i] = book[i - 1];
                book[i - 1] = tmp;
            } else {
                break;
            }
        }

        emit AskPosted(marketId, bucketIdx, askId, msg.sender, pricePerShare, size);
    }

    /// @notice Cancel the unfilled remainder of an ask and reclaim its collateral.
    function cancelAsk(uint256 marketId, uint16 bucketIdx, uint256 askId) external nonReentrant {
        Market storage m = _market(marketId);
        if (m.status != Status.Open) revert MarketAlreadySettled();
        Ask storage a = _asks[marketId][bucketIdx][askId];
        if (a.maker != msg.sender) revert NotMaker();
        if (a.cancelled) revert AlreadyClaimed();
        a.cancelled = true;
        uint128 unfilled = a.size - a.filled;
        if (unfilled > 0) {
            uint256 refund = uint256(SHARE_PAYOUT - a.pricePerShare) * unfilled;
            usdc.safeTransfer(msg.sender, refund);
        }
        emit AskCancelled(marketId, bucketIdx, askId);
    }

    // --- Taker side --------------------------------------------------------

    /// @notice Walk the bucket's asks cheapest-first and fill up to `maxShares` /
    ///         `maxCost`. Returns the actual shares received and USDC paid.
    function fillBucket(uint256 marketId, uint16 bucketIdx, uint128 maxShares, uint128 maxCost)
        public
        nonReentrant
        returns (uint128 sharesBought, uint128 costPaid)
    {
        Market storage m = _market(marketId);
        if (m.status != Status.Open) revert MarketNotOpen();
        if (block.timestamp >= m.settlementTs) revert TradingClosed();
        if (bucketIdx >= m.bucketCount) revert BadBucket();

        Ask[] storage book = _asks[marketId][bucketIdx];
        uint256 n = book.length;
        for (uint256 i = 0; i < n && sharesBought < maxShares && costPaid < maxCost; ++i) {
            Ask storage a = book[i];
            if (a.cancelled) continue;
            uint128 available = a.size - a.filled;
            if (available == 0) continue;

            uint128 wantShares = maxShares - sharesBought;
            uint128 fill = available < wantShares ? available : wantShares;
            uint128 cost = uint128(uint256(fill) * a.pricePerShare);
            if (costPaid + cost > maxCost) {
                // Cap by remaining USDC budget — keep whole shares.
                fill = uint128(uint256(maxCost - costPaid) / a.pricePerShare);
                if (fill == 0) break;
                cost = uint128(uint256(fill) * a.pricePerShare);
            }

            a.filled += fill;
            sharesBought += fill;
            costPaid += cost;
            yesShares[marketId][bucketIdx][msg.sender] += fill;

            usdc.safeTransferFrom(msg.sender, address(this), cost);
            emit Filled(marketId, bucketIdx, i, msg.sender, a.maker, fill, cost);
        }
    }

    /// @notice Convenience: fill the same `sharesPerBucket` quantity across a band of
    ///         buckets `[centerBucket - halfWidth, centerBucket + halfWidth]`.
    function fillBucketsAround(
        uint256 marketId,
        uint16 centerBucket,
        uint16 halfWidth,
        uint128 sharesPerBucket,
        uint128 maxCost
    ) external returns (uint128 totalShares, uint128 totalCost) {
        Market storage m = _market(marketId);
        if (centerBucket >= m.bucketCount) revert BadBucket();

        uint16 lo = halfWidth >= centerBucket ? 0 : centerBucket - halfWidth;
        uint256 hiCandidate = uint256(centerBucket) + halfWidth;
        uint16 hi = hiCandidate >= m.bucketCount ? m.bucketCount - 1 : uint16(hiCandidate);

        for (uint16 b = lo; b <= hi; ++b) {
            uint128 budget = maxCost - totalCost;
            if (budget == 0) break;
            (uint128 bought, uint128 paid) = fillBucket(marketId, b, sharesPerBucket, budget);
            totalShares += bought;
            totalCost += paid;
        }
    }

    // --- Settlement --------------------------------------------------------

    /// @notice Resolve the market by reading the print from `OrnnOracle`. Permissionless.
    function resolve(uint256 marketId) external {
        Market storage m = _market(marketId);
        if (m.status != Status.Open) revert MarketAlreadySettled();
        if (block.timestamp < m.settlementTs) revert MarketNotResolvable();

        (uint128 price,, bool exists) = oracle.getPrintBySymbolHash(m.gpuSymbolHash, uint256(m.settlementTs));
        if (!exists) revert MarketNotResolvable();

        if (price < m.bucketLow) {
            // Print landed below the lowest bucket: no bucket wins, market voids.
            m.status = Status.Voided;
            emit MarketVoided(marketId);
            return;
        }
        uint256 idx = (price - m.bucketLow) / m.bucketWidth;
        if (idx >= m.bucketCount) {
            m.status = Status.Voided;
            emit MarketVoided(marketId);
            return;
        }
        m.winningBucket = uint16(idx);
        m.status = Status.Resolved;
        emit MarketResolved(marketId, price, uint16(idx));
    }

    /// @notice Claim YES payout for a winning bucket (1 USDC × shares).
    function claimYes(uint256 marketId, uint16 bucketIdx) external nonReentrant returns (uint256 payout) {
        Market storage m = _market(marketId);
        if (m.status == Status.Open) revert MarketNotResolvable();
        if (m.status == Status.Voided) revert NothingToClaim();
        if (bucketIdx != m.winningBucket) revert NothingToClaim();
        uint256 shares = yesShares[marketId][bucketIdx][msg.sender];
        if (shares == 0) revert NothingToClaim();
        yesShares[marketId][bucketIdx][msg.sender] = 0;
        payout = shares * SHARE_PAYOUT;
        usdc.safeTransfer(msg.sender, payout);
        emit YesClaimed(marketId, bucketIdx, msg.sender, payout);
    }

    /// @notice After resolution, makers in LOSING buckets reclaim the entire
    ///         per-ask escrow (their original collateral + all taker payments).
    ///         For the WINNING bucket, makers reclaim ONLY their unfilled-portion
    ///         collateral; the filled portion was paid out to YES holders.
    /// @dev    Idempotent per (marketId, bucketIdx, askId).
    function reclaimMakerEscrow(uint256 marketId, uint16 bucketIdx, uint256 askId)
        external
        nonReentrant
        returns (uint256 amount)
    {
        Market storage m = _market(marketId);
        if (m.status == Status.Open) revert MarketNotResolvable();
        Ask storage a = _asks[marketId][bucketIdx][askId];
        if (a.maker != msg.sender) revert NotMaker();
        if (escrowClaimed[marketId][bucketIdx][askId]) revert AlreadyClaimed();
        escrowClaimed[marketId][bucketIdx][askId] = true;

        uint128 filled = a.filled;
        uint128 unfilled = a.cancelled ? 0 : a.size - filled;
        // Unfilled portion: original collateral comes back to the maker regardless of outcome.
        uint256 unfilledRefund = uint256(SHARE_PAYOUT - a.pricePerShare) * unfilled;

        // Filled portion: contract holds (collateral + taker payment) = SHARE_PAYOUT × filled.
        uint256 filledRefund = 0;
        bool isLoser = m.status == Status.Voided || bucketIdx != m.winningBucket;
        if (isLoser) {
            filledRefund = uint256(filled) * SHARE_PAYOUT;
        }

        amount = unfilledRefund + filledRefund;
        if (amount > 0) usdc.safeTransfer(msg.sender, amount);
        emit MakerEscrowReclaimed(marketId, bucketIdx, askId, msg.sender, amount);
    }

    // --- Views -------------------------------------------------------------

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _market(marketId);
    }

    function bucketEdges(uint256 marketId, uint16 bucketIdx)
        external
        view
        returns (uint128 low, uint128 high)
    {
        Market storage m = _market(marketId);
        if (bucketIdx >= m.bucketCount) revert BadBucket();
        low = m.bucketLow + uint128(bucketIdx) * m.bucketWidth;
        high = low + m.bucketWidth;
    }

    function askCount(uint256 marketId, uint16 bucketIdx) external view returns (uint256) {
        return _asks[marketId][bucketIdx].length;
    }

    function getAsk(uint256 marketId, uint16 bucketIdx, uint256 askId) external view returns (Ask memory) {
        return _asks[marketId][bucketIdx][askId];
    }

    /// @notice Cheapest live ask for a bucket. Returns zeros if the book is empty.
    function bestAsk(uint256 marketId, uint16 bucketIdx)
        external
        view
        returns (uint128 price, uint128 sizeAvailable, address maker, uint256 askId, bool exists)
    {
        Ask[] storage book = _asks[marketId][bucketIdx];
        for (uint256 i = 0; i < book.length; ++i) {
            Ask storage a = book[i];
            if (a.cancelled) continue;
            uint128 available = a.size - a.filled;
            if (available == 0) continue;
            return (a.pricePerShare, available, a.maker, i, true);
        }
        return (0, 0, address(0), 0, false);
    }

    /// @notice Quote the cost of buying up to `maxShares` from a bucket without executing.
    function quoteBucket(uint256 marketId, uint16 bucketIdx, uint128 maxShares)
        external
        view
        returns (uint128 sharesAvailable, uint128 totalCost)
    {
        Ask[] storage book = _asks[marketId][bucketIdx];
        for (uint256 i = 0; i < book.length && sharesAvailable < maxShares; ++i) {
            Ask storage a = book[i];
            if (a.cancelled) continue;
            uint128 available = a.size - a.filled;
            if (available == 0) continue;
            uint128 want = maxShares - sharesAvailable;
            uint128 fill = available < want ? available : want;
            sharesAvailable += fill;
            totalCost += uint128(uint256(fill) * a.pricePerShare);
        }
    }

    function marketIdFor(string calldata gpuSymbol, uint64 settlementTs)
        external
        view
        returns (uint256 marketId, bool exists)
    {
        uint256 idPlus = _marketIdPlusOne[keccak256(bytes(gpuSymbol))][settlementTs];
        if (idPlus == 0) return (0, false);
        return (idPlus - 1, true);
    }

    // --- Internal ----------------------------------------------------------

    function _market(uint256 marketId) internal view returns (Market storage) {
        if (marketId >= _markets.length) revert InvalidParams();
        return _markets[marketId];
    }
}

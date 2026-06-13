// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {OrnnOracle} from "./OrnnOracle.sol";

/// @title SiliconMarket
/// @notice Parametric pari-mutuel prediction market for GPU compute prices on Arc.
/// @dev Each market is a single (gpuSymbol, settlementDayKey) tuple. Forecasters stake USDC
///      on a numeric forecast (center, band). At settlement the contract reads the day's
///      4 PM ET print from `OrnnOracle`. All forecasts whose [center-band, center+band]
///      range contains the print share the pool pro rata to their stake. Losers' stake
///      (minus a 1% protocol fee) flows to winners. If nobody wins the pool refunds
///      pro-rata to all stakers.
contract SiliconMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Constants ---------------------------------------------------------

    uint256 public constant PRICE_SCALE = 1e8; // matches OrnnOracle
    uint256 public constant FEE_BPS_MAX = 500; // 5%
    uint256 public constant BPS = 10_000;
    /// @notice Betting closes this many seconds before settlement (0 = no cutoff,
    ///         used by short-lived demo deployments).
    uint256 public immutable tradingCutoff;

    // --- Storage -----------------------------------------------------------

    IERC20 public immutable usdc;
    OrnnOracle public immutable oracle;

    uint16 public feeBps; // protocol fee on the pool (in basis points)
    address public feeRecipient;

    enum Status {
        Open,
        Resolved,
        Refunded
    }

    struct Market {
        string gpuSymbol; // e.g. "RTX 5090"
        bytes32 gpuSymbolHash; // cached keccak256 for cheaper oracle reads
        uint64 settlementTs; // unix seconds of the 4 PM ET print
        uint256 dayKey; // identical to settlementTs; kept separate to allow future tz changes
        uint256 totalStake;
        uint256 winningStake;
        uint128 settlementPrice; // populated on resolve()
        Status status;
    }

    struct Forecast {
        address user;
        int128 center; // scaled by PRICE_SCALE (signed for safe math, always >= 0)
        uint128 band; // scaled by PRICE_SCALE (must be > 0)
        uint128 stake; // USDC raw units (6 decimals)
        bool claimed;
    }

    Market[] private _markets;
    /// @notice marketId => forecasts
    mapping(uint256 => Forecast[]) private _forecasts;
    /// @notice marketId => user => indices into _forecasts[marketId]
    mapping(uint256 => mapping(address => uint256[])) private _userForecasts;
    /// @notice unique market lookup by (symbolHash, dayKey)
    mapping(bytes32 => mapping(uint256 => uint256)) private _marketIdPlusOne;

    // --- Events ------------------------------------------------------------

    event MarketCreated(
        uint256 indexed marketId, bytes32 indexed gpuSymbolHash, string gpuSymbol, uint64 settlementTs
    );
    event ForecastLocked(
        uint256 indexed marketId,
        uint256 indexed forecastId,
        address indexed user,
        int128 center,
        uint128 band,
        uint128 stake
    );
    event MarketResolved(uint256 indexed marketId, uint128 settlementPrice, uint256 winningStake);
    event MarketRefunded(uint256 indexed marketId);
    event Payout(uint256 indexed marketId, uint256 indexed forecastId, address indexed user, uint256 amount);
    event FeeUpdated(uint16 feeBps, address feeRecipient);

    // --- Errors ------------------------------------------------------------

    error MarketExists();
    error MarketNotOpen();
    error MarketNotResolvable();
    error MarketAlreadySettled();
    error TradingClosed();
    error InvalidParams();
    error NotOwner();
    error AlreadyClaimed();
    error NothingToClaim();
    error FeeTooHigh();

    // --- Constructor -------------------------------------------------------

    constructor(
        IERC20 usdc_,
        OrnnOracle oracle_,
        address feeRecipient_,
        uint16 feeBps_,
        address owner_,
        uint256 tradingCutoff_
    ) Ownable(owner_) {
        if (address(usdc_) == address(0) || address(oracle_) == address(0)) revert InvalidParams();
        if (feeBps_ > FEE_BPS_MAX) revert FeeTooHigh();
        usdc = usdc_;
        oracle = oracle_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
        tradingCutoff = tradingCutoff_;
        emit FeeUpdated(feeBps_, feeRecipient_);
    }

    // --- Admin -------------------------------------------------------------

    function setFee(uint16 newFeeBps, address newRecipient) external onlyOwner {
        if (newFeeBps > FEE_BPS_MAX) revert FeeTooHigh();
        feeBps = newFeeBps;
        feeRecipient = newRecipient;
        emit FeeUpdated(newFeeBps, newRecipient);
    }

    // --- Market lifecycle --------------------------------------------------

    /// @notice Create a new market for a given GPU symbol and settlement timestamp.
    /// @dev settlementTs must be in the future and a 4 PM ET print boundary.
    function createMarket(string calldata gpuSymbol, uint64 settlementTs) external returns (uint256 marketId) {
        if (settlementTs <= block.timestamp) revert InvalidParams();
        bytes32 symHash = keccak256(bytes(gpuSymbol));
        if (_marketIdPlusOne[symHash][settlementTs] != 0) revert MarketExists();

        marketId = _markets.length;
        _markets.push(
            Market({
                gpuSymbol: gpuSymbol,
                gpuSymbolHash: symHash,
                settlementTs: settlementTs,
                dayKey: settlementTs,
                totalStake: 0,
                winningStake: 0,
                settlementPrice: 0,
                status: Status.Open
            })
        );
        _marketIdPlusOne[symHash][settlementTs] = marketId + 1;
        emit MarketCreated(marketId, symHash, gpuSymbol, settlementTs);
    }

    /// @notice Lock a forecast (center, band) with `stake` USDC.
    /// @dev Caller must have approved `stake` USDC to this contract.
    function lockForecast(uint256 marketId, int128 center, uint128 band, uint128 stake)
        external
        nonReentrant
        returns (uint256 forecastId)
    {
        Market storage m = _market(marketId);
        if (m.status != Status.Open) revert MarketNotOpen();
        if (block.timestamp + tradingCutoff >= m.settlementTs) revert TradingClosed();
        if (band == 0 || stake == 0 || center < 0) revert InvalidParams();

        usdc.safeTransferFrom(msg.sender, address(this), stake);

        forecastId = _forecasts[marketId].length;
        _forecasts[marketId].push(
            Forecast({user: msg.sender, center: center, band: band, stake: stake, claimed: false})
        );
        _userForecasts[marketId][msg.sender].push(forecastId);
        m.totalStake += stake;

        emit ForecastLocked(marketId, forecastId, msg.sender, center, band, stake);
    }

    /// @notice Resolve a market by pulling the 4 PM ET print from the oracle.
    /// @dev Permissionless; anyone can call after settlement.
    function resolve(uint256 marketId) external {
        Market storage m = _market(marketId);
        if (m.status != Status.Open) revert MarketAlreadySettled();
        if (block.timestamp < m.settlementTs) revert MarketNotResolvable();

        (uint128 price,, bool exists) = oracle.getPrintBySymbolHash(m.gpuSymbolHash, m.dayKey);
        if (!exists) revert MarketNotResolvable();

        m.settlementPrice = price;

        // Tally winning stake.
        uint256 winning = 0;
        Forecast[] storage forecasts = _forecasts[marketId];
        uint256 n = forecasts.length;
        int256 signedPrice = int256(uint256(price));
        for (uint256 i = 0; i < n; ++i) {
            Forecast storage f = forecasts[i];
            int256 diff = signedPrice - int256(f.center);
            uint256 absDiff = diff >= 0 ? uint256(diff) : uint256(-diff);
            if (absDiff <= uint256(f.band)) {
                winning += f.stake;
            }
        }
        m.winningStake = winning;

        if (winning == 0) {
            // No winners: pool refunds pro-rata, no fee taken.
            m.status = Status.Refunded;
            emit MarketRefunded(marketId);
        } else {
            m.status = Status.Resolved;
            emit MarketResolved(marketId, price, winning);
        }
    }

    /// @notice Claim payout for a forecast.
    function claim(uint256 marketId, uint256 forecastId) external nonReentrant returns (uint256 payout) {
        Market storage m = _market(marketId);
        Forecast storage f = _forecasts[marketId][forecastId];
        if (f.user != msg.sender) revert NotOwner();
        if (f.claimed) revert AlreadyClaimed();

        if (m.status == Status.Resolved) {
            // Did this forecast win?
            int256 diff = int256(uint256(m.settlementPrice)) - int256(f.center);
            uint256 absDiff = diff >= 0 ? uint256(diff) : uint256(-diff);
            if (absDiff > uint256(f.band)) revert NothingToClaim();

            uint256 pool = m.totalStake;
            uint256 fee = (pool * feeBps) / BPS;
            uint256 distributable = pool - fee;
            payout = (distributable * uint256(f.stake)) / m.winningStake;

            // Pay fee once (lazy): only the first winning claim transfers the protocol fee out.
            // Tracked by checking if any winning forecast was previously claimed by comparing
            // contract balance accounting; simpler to just deduct from the first claim.
            if (fee > 0 && feeRecipient != address(0)) {
                // Pull the fee from this market's pool only the first time someone claims.
                // We mark fee as paid by using a sentinel: winningStake is decremented as
                // each winner claims; when winningStake equals the original total, fee was
                // already paid. We avoid an extra slot by stashing a flag in feeBps? Safer:
                // pay the fee proportionally on every winning claim so accounting is local.
                uint256 feeShare = (fee * uint256(f.stake)) / m.winningStake;
                if (feeShare > 0) usdc.safeTransfer(feeRecipient, feeShare);
            }
        } else if (m.status == Status.Refunded) {
            payout = uint256(f.stake);
        } else {
            revert MarketAlreadySettled();
        }

        f.claimed = true;
        if (payout > 0) usdc.safeTransfer(msg.sender, payout);
        emit Payout(marketId, forecastId, msg.sender, payout);
    }

    // --- Views -------------------------------------------------------------

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _market(marketId);
    }

    function forecastCount(uint256 marketId) external view returns (uint256) {
        return _forecasts[marketId].length;
    }

    function getForecast(uint256 marketId, uint256 forecastId) external view returns (Forecast memory) {
        return _forecasts[marketId][forecastId];
    }

    function getUserForecasts(uint256 marketId, address user) external view returns (uint256[] memory) {
        return _userForecasts[marketId][user];
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

    /// @notice Returns the implied probability (in basis points) that the current pool
    ///         would pay out if the print resolved at `hypotheticalPrice`. This is the
    ///         number the UI shows as "implied odds".
    function impliedOddsBps(uint256 marketId, uint128 hypotheticalPrice) external view returns (uint16) {
        Market storage m = _market(marketId);
        if (m.totalStake == 0) return 0;
        int256 sp = int256(uint256(hypotheticalPrice));
        uint256 winning = 0;
        Forecast[] storage forecasts = _forecasts[marketId];
        uint256 n = forecasts.length;
        for (uint256 i = 0; i < n; ++i) {
            Forecast storage f = forecasts[i];
            int256 diff = sp - int256(f.center);
            uint256 absDiff = diff >= 0 ? uint256(diff) : uint256(-diff);
            if (absDiff <= uint256(f.band)) winning += f.stake;
        }
        return uint16((winning * BPS) / m.totalStake);
    }

    // --- Internal ----------------------------------------------------------

    function _market(uint256 marketId) internal view returns (Market storage) {
        if (marketId >= _markets.length) revert InvalidParams();
        return _markets[marketId];
    }
}

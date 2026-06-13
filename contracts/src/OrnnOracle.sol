// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title OrnnOracle
/// @notice Push oracle for daily 4 PM ET prints from the Ornn Compute Price Index.
/// @dev Off-chain agent ("updater") pulls https://ornn-backend-api... at 4 PM ET and pushes
///      the (gpu, dayKey) -> price tuple here. SiliconMarket reads from this contract at
///      settlement. dayKey = unix seconds at 16:00 America/New_York for the print day.
contract OrnnOracle is Ownable {
    /// @notice Prices are stored as USD per GPU-hour scaled by 1e8 (e.g. $0.82 -> 82_000_000).
    uint256 public constant PRICE_SCALE = 1e8;

    struct Print {
        uint128 price;
        uint64 publishedAt;
        bool exists;
    }

    mapping(address => bool) public isUpdater;
    mapping(bytes32 => mapping(uint256 => Print)) private _prints;
    mapping(bytes32 => uint256) public latestDayKey;

    event UpdaterSet(address indexed updater, bool authorized);
    event PrintPublished(bytes32 indexed gpuSymbolHash, string gpuSymbol, uint256 indexed dayKey, uint128 price);

    error NotUpdater();
    error PrintExists();
    error PrintMissing();
    error InvalidPrice();

    modifier onlyUpdater() {
        if (!isUpdater[msg.sender]) revert NotUpdater();
        _;
    }

    constructor(address initialOwner, address initialUpdater) Ownable(initialOwner) {
        if (initialUpdater != address(0)) {
            isUpdater[initialUpdater] = true;
            emit UpdaterSet(initialUpdater, true);
        }
    }

    function setUpdater(address updater, bool authorized) external onlyOwner {
        isUpdater[updater] = authorized;
        emit UpdaterSet(updater, authorized);
    }

    function publishPrint(string calldata gpuSymbol, uint256 dayKey, uint128 price) external onlyUpdater {
        if (price == 0) revert InvalidPrice();
        bytes32 sym = keccak256(bytes(gpuSymbol));
        Print storage p = _prints[sym][dayKey];
        if (p.exists) revert PrintExists();
        p.price = price;
        p.publishedAt = uint64(block.timestamp);
        p.exists = true;
        if (dayKey > latestDayKey[sym]) latestDayKey[sym] = dayKey;
        emit PrintPublished(sym, gpuSymbol, dayKey, price);
    }

    function getPrint(string calldata gpuSymbol, uint256 dayKey)
        external
        view
        returns (uint128 price, uint64 publishedAt)
    {
        Print memory p = _prints[keccak256(bytes(gpuSymbol))][dayKey];
        if (!p.exists) revert PrintMissing();
        return (p.price, p.publishedAt);
    }

    function getPrintBySymbolHash(bytes32 symbolHash, uint256 dayKey)
        external
        view
        returns (uint128 price, uint64 publishedAt, bool exists)
    {
        Print memory p = _prints[symbolHash][dayKey];
        return (p.price, p.publishedAt, p.exists);
    }
}

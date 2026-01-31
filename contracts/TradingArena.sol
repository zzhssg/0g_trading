// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./StrategyNFT.sol";

contract TradingArena is Ownable {
    StrategyNFT public strategyNFT;

    struct TradingResult {
        uint256 strategyId;
        int256 pnl;
        uint256 totalTrades;
        uint256 winningTrades;
        bytes32 backtestLogRoot;
        bytes32 executionLogHash;
        bytes32 codeHash;
        bytes32 paramsHash;
        bytes32 datasetVersionHash;
        bytes32 evalWindowHash;
        bytes32 marketDataRoot;
        uint256 timestamp;
        uint256 roundId;
    }

    struct Round {
        uint256 startTime;
        uint256 endTime;
        bytes32 marketDataRoot;
        bytes32 datasetVersionHash;
        bytes32 evalWindowHash;
        bool finalized;
    }

    uint256 public currentRound;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(uint256 => TradingResult)) public results;
    mapping(uint256 => uint256[]) public roundParticipants;
    mapping(uint256 => int256) public totalPnL;
    mapping(uint256 => mapping(uint256 => bool)) public resultSubmitted;

    event RoundStarted(uint256 indexed roundId, bytes32 marketDataRoot);
    event ResultSubmitted(uint256 indexed roundId, uint256 indexed strategyId, int256 pnl);
    event RoundFinalized(uint256 indexed roundId);

    constructor(address _strategyNFT) Ownable(msg.sender) {
        strategyNFT = StrategyNFT(_strategyNFT);
    }

    function startNewRound(
        bytes32 _marketDataRoot,
        bytes32 _datasetVersionHash,
        bytes32 _evalWindowHash
    ) external onlyOwner {
        require(_marketDataRoot != bytes32(0), "empty root");
        currentRound += 1;
        rounds[currentRound] = Round({
            startTime: block.timestamp,
            endTime: 0,
            marketDataRoot: _marketDataRoot,
            datasetVersionHash: _datasetVersionHash,
            evalWindowHash: _evalWindowHash,
            finalized: false
        });

        emit RoundStarted(currentRound, _marketDataRoot);
    }

    /// @notice Submit backtest result for current round.
    /// @dev executionLogHash should match the off-chain backtest log hash used for verification.
    function submitResult(
        uint256 _strategyId,
        int256 _pnl,
        uint256 _totalTrades,
        uint256 _winningTrades,
        bytes32 _backtestLogRoot,
        bytes32 _executionLogHash
    ) external {
        require(rounds[currentRound].startTime > 0, "No active round");
        require(!rounds[currentRound].finalized, "Round finalized");
        require(strategyNFT.ownerOf(_strategyId) == msg.sender, "Only strategy owner");
        require(!resultSubmitted[currentRound][_strategyId], "Result already submitted");

        StrategyNFT.Strategy memory strategy = strategyNFT.getStrategy(_strategyId);
        Round memory round = rounds[currentRound];

        results[currentRound][_strategyId] = TradingResult({
            strategyId: _strategyId,
            pnl: _pnl,
            totalTrades: _totalTrades,
            winningTrades: _winningTrades,
            backtestLogRoot: _backtestLogRoot,
            executionLogHash: _executionLogHash,
            codeHash: strategy.codeHash,
            paramsHash: strategy.paramsHash,
            datasetVersionHash: round.datasetVersionHash,
            evalWindowHash: round.evalWindowHash,
            marketDataRoot: round.marketDataRoot,
            timestamp: block.timestamp,
            roundId: currentRound
        });

        roundParticipants[currentRound].push(_strategyId);
        totalPnL[_strategyId] += _pnl;
        resultSubmitted[currentRound][_strategyId] = true;

        emit ResultSubmitted(currentRound, _strategyId, _pnl);
    }

    function finalizeRound() external onlyOwner {
        require(rounds[currentRound].startTime > 0, "No active round");
        require(!rounds[currentRound].finalized, "Already finalized");

        rounds[currentRound].endTime = block.timestamp;
        rounds[currentRound].finalized = true;

        emit RoundFinalized(currentRound);
    }

    function getLeaderboardByRound(uint256 roundId, uint256 limit)
        external
        view
        returns (uint256[] memory strategyIds, int256[] memory pnls)
    {
        uint256 total = roundParticipants[roundId].length;
        if (total == 0 || limit == 0) {
            return (new uint256[](0), new int256[](0));
        }

        uint256 count = total < limit ? total : limit;

        uint256[] memory ids = new uint256[](total);
        int256[] memory scores = new int256[](total);
        for (uint256 i = 0; i < total; i++) {
            uint256 strategyId = roundParticipants[roundId][i];
            ids[i] = strategyId;
            scores[i] = results[roundId][strategyId].pnl;
        }

        for (uint256 i = 0; i < total; i++) {
            uint256 maxIdx = i;
            for (uint256 j = i + 1; j < total; j++) {
                if (scores[j] > scores[maxIdx]) {
                    maxIdx = j;
                }
            }
            if (maxIdx != i) {
                (scores[i], scores[maxIdx]) = (scores[maxIdx], scores[i]);
                (ids[i], ids[maxIdx]) = (ids[maxIdx], ids[i]);
            }
        }

        strategyIds = new uint256[](count);
        pnls = new int256[](count);
        for (uint256 i = 0; i < count; i++) {
            strategyIds[i] = ids[i];
            pnls[i] = scores[i];
        }

        return (strategyIds, pnls);
    }

    function getResult(uint256 _roundId, uint256 _strategyId)
        external
        view
        returns (TradingResult memory)
    {
        return results[_roundId][_strategyId];
    }

    function verifyResult(
        uint256 _roundId,
        uint256 _strategyId,
        bytes32 _expectedLogHash,
        bytes32 _expectedCodeHash,
        bytes32 _expectedParamsHash,
        bytes32 _expectedDatasetVersionHash,
        bytes32 _expectedEvalWindowHash,
        bytes32 _expectedMarketDataRoot
    ) external view returns (bool) {
        TradingResult memory result = results[_roundId][_strategyId];
        return
            result.executionLogHash == _expectedLogHash &&
            result.codeHash == _expectedCodeHash &&
            result.paramsHash == _expectedParamsHash &&
            result.datasetVersionHash == _expectedDatasetVersionHash &&
            result.evalWindowHash == _expectedEvalWindowHash &&
            result.marketDataRoot == _expectedMarketDataRoot;
    }
}

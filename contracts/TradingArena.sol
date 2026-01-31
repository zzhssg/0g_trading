// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./StrategyNFT.sol";

contract TradingArena {
    StrategyNFT public strategyNFT;

    struct TradingResult {
        uint256 strategyId;
        int256 pnl;
        uint256 totalTrades;
        uint256 winningTrades;
        bytes32 executionLogHash;
        bytes32 codeHash;
        bytes32 paramsHash;
        bytes32 datasetVersionHash;
        bytes32 evalWindowHash;
        bytes32 marketDataHash;
        uint256 timestamp;
        uint256 roundId;
    }

    struct Round {
        uint256 startTime;
        uint256 endTime;
        bytes32 marketDataHash;
        bool finalized;
    }

    uint256 public currentRound;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(uint256 => TradingResult)) public results;
    mapping(uint256 => uint256[]) public roundParticipants;
    mapping(uint256 => int256) public totalPnL;
    mapping(uint256 => mapping(uint256 => bool)) public resultSubmitted;

    event RoundStarted(uint256 indexed roundId, bytes32 marketDataHash);
    event ResultSubmitted(uint256 indexed roundId, uint256 indexed strategyId, int256 pnl);
    event RoundFinalized(uint256 indexed roundId);

    constructor(address _strategyNFT) {
        strategyNFT = StrategyNFT(_strategyNFT);
    }

    function startNewRound(bytes32 _marketDataHash) external {
        currentRound += 1;
        rounds[currentRound] = Round({
            startTime: block.timestamp,
            endTime: 0,
            marketDataHash: _marketDataHash,
            finalized: false
        });

        emit RoundStarted(currentRound, _marketDataHash);
    }

    /// @notice Submit backtest result for current round.
    /// @dev executionLogHash should match the off-chain backtest log hash used for verification.
    function submitResult(
        uint256 _strategyId,
        int256 _pnl,
        uint256 _totalTrades,
        uint256 _winningTrades,
        bytes32 _executionLogHash
    ) external {
        require(rounds[currentRound].startTime > 0, "No active round");
        require(!rounds[currentRound].finalized, "Round finalized");
        require(strategyNFT.ownerOf(_strategyId) == msg.sender, "Only strategy owner");
        require(!resultSubmitted[currentRound][_strategyId], "Result already submitted");

        StrategyNFT.Strategy memory strategy = strategyNFT.getStrategy(_strategyId);
        bytes32 datasetVersionHash = keccak256(bytes(strategy.datasetVersion));
        bytes32 evalWindowHash = keccak256(bytes(strategy.evalWindow));
        bytes32 marketDataHash = rounds[currentRound].marketDataHash;

        results[currentRound][_strategyId] = TradingResult({
            strategyId: _strategyId,
            pnl: _pnl,
            totalTrades: _totalTrades,
            winningTrades: _winningTrades,
            executionLogHash: _executionLogHash,
            codeHash: strategy.codeHash,
            paramsHash: strategy.paramsHash,
            datasetVersionHash: datasetVersionHash,
            evalWindowHash: evalWindowHash,
            marketDataHash: marketDataHash,
            timestamp: block.timestamp,
            roundId: currentRound
        });

        roundParticipants[currentRound].push(_strategyId);
        totalPnL[_strategyId] += _pnl;
        resultSubmitted[currentRound][_strategyId] = true;

        emit ResultSubmitted(currentRound, _strategyId, _pnl);
    }

    function finalizeRound() external {
        require(rounds[currentRound].startTime > 0, "No active round");
        require(!rounds[currentRound].finalized, "Already finalized");

        rounds[currentRound].endTime = block.timestamp;
        rounds[currentRound].finalized = true;

        emit RoundFinalized(currentRound);
    }

    function getLeaderboard(uint256 limit)
        external
        view
        returns (uint256[] memory strategyIds, int256[] memory pnls)
    {
        uint256 total = strategyNFT.totalStrategies();
        if (total == 0 || limit == 0) {
            return (new uint256[](0), new int256[](0));
        }

        uint256 count = total < limit ? total : limit;

        uint256[] memory ids = new uint256[](total);
        int256[] memory scores = new int256[](total);
        for (uint256 i = 0; i < total; i++) {
            ids[i] = i + 1;
            scores[i] = totalPnL[i + 1];
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
        bytes32 _expectedMarketDataHash
    ) external view returns (bool) {
        TradingResult memory result = results[_roundId][_strategyId];
        return
            result.executionLogHash == _expectedLogHash &&
            result.codeHash == _expectedCodeHash &&
            result.paramsHash == _expectedParamsHash &&
            result.datasetVersionHash == _expectedDatasetVersionHash &&
            result.evalWindowHash == _expectedEvalWindowHash &&
            result.marketDataHash == _expectedMarketDataHash;
    }
}

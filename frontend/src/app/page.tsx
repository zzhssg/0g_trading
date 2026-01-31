"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import { buildStrategyRegistrationPayload } from "../lib/strategyPayload";
import { uploadJsonContent, uploadStrategyJson } from "../lib/ogStorage";
import {
  buildKlinePreview,
  computeDatasetHashes as computeMarketDatasetHashes,
  parseMarketSample,
  type MarketRow,
  type MarketSample,
} from "../lib/marketSample";
import { computePnlFromLog, hashLog } from "../lib/verify";

declare global {
  interface Window {
    ethereum?: {
      request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

type ViewId = "dashboard" | "factory" | "inspector" | "admin";

type LeaderboardEntry = {
  rank: number;
  name: string;
  tokenId: string;
  pnl: number | null;
  verification: string;
  status: string;
  creator: string;
};

type MintStage = "idle" | "hashing" | "contract";

type SummaryState = {
  totalPnl: number;
  activeStrategies: number;
};

const STRATEGY_NFT_ADDRESS =
  process.env.NEXT_PUBLIC_STRATEGY_NFT_ADDRESS ||
  "0xD2C5fDA21334c45f28ee992d4564C5CB29A06A7c";
const TRADING_ARENA_ADDRESS =
  process.env.NEXT_PUBLIC_TRADING_ARENA_ADDRESS ||
  "0xbDffd2F1d2399c75aF9B171754c55Ca18EC7a1CB";
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://evmrpc-testnet.0g.ai";

const CHAIN_ID = 16602;
const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

const STRATEGY_NFT_ABI = [
  "event StrategyRegistered(uint256 indexed tokenId,address indexed creator,bytes32 codeHash,bytes32 paramsHash,string datasetVersion,string evalWindow,string storageRoot,string performancePointer)",
  "function registerStrategy(bytes32 codeHash,bytes32 paramsHash,string datasetVersion,string evalWindow,string storageRoot,string performancePointer,string tokenURI) external returns (uint256)",
  "function getStrategy(uint256 tokenId) external view returns (tuple(bytes32 codeHash,bytes32 paramsHash,string datasetVersion,string evalWindow,string storageRoot,string performancePointer,uint256 createdAt,address creator,bool isActive))",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function totalStrategies() external view returns (uint256)",
];

const TRADING_ARENA_ABI = [
  "function getLeaderboardByRound(uint256 roundId,uint256 limit) external view returns (uint256[] strategyIds, int256[] pnls)",
  "function currentRound() external view returns (uint256)",
  "function rounds(uint256) external view returns (uint256 startTime,uint256 endTime,bytes32 marketDataHash,bool finalized)",
  "function owner() external view returns (address)",
  "function getResult(uint256 roundId,uint256 strategyId) external view returns (tuple(uint256 strategyId,int256 pnl,uint256 totalTrades,uint256 winningTrades,bytes32 executionLogHash,bytes32 codeHash,bytes32 paramsHash,bytes32 datasetVersionHash,bytes32 evalWindowHash,bytes32 marketDataHash,uint256 timestamp,uint256 roundId))",
];

const viewTitles: Record<ViewId, string> = {
  dashboard: "竞技场大盘",
  factory: "策略工厂",
  inspector: "验证详情",
  admin: "市场样本库",
};

function shortenHash(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function isZeroHash(value: string) {
  return /^0x0+$/.test(value);
}

function shortenAddress(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function decodeTokenName(tokenUri: string) {
  const prefix = "data:application/json;base64,";
  if (!tokenUri.startsWith(prefix)) return null;
  try {
    const encoded = tokenUri.slice(prefix.length);
    const json = window.atob(encoded);
    const data = JSON.parse(json);
    if (typeof data?.name === "string" && data.name.trim()) {
      return data.name.trim();
    }
  } catch {
    return null;
  }
  return null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  return undefined;
}

export default function Home() {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [arenaOwner, setArenaOwner] = useState<string | null>(null);
  const [mintStage, setMintStage] = useState<MintStage>("idle");
  const [mintResult, setMintResult] = useState<{
    tokenId: string;
    storageRoot: string;
    performancePointer: string;
  } | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [verifyRoundId, setVerifyRoundId] = useState("");
  const [verifyStrategyId, setVerifyStrategyId] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<
    "idle" | "loading" | "success" | "failed"
  >("idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyDetails, setVerifyDetails] = useState<null | {
    expectedHash: string;
    computedHash: string;
    expectedPnl: string;
    computedPnl: number;
    performancePointer: string;
  }>(null);
  const [strategyName, setStrategyName] = useState("");
  const [datasetVersion, setDatasetVersion] = useState("v1");
  const [evalWindow, setEvalWindow] = useState("2025-01-01~2025-02-01");
  const [storageRootInput, setStorageRootInput] = useState("");
  const [backtestLogHashInput, setBacktestLogHashInput] = useState("");
  const [performancePointerInput, setPerformancePointerInput] = useState("");
  const [tokenURIInput, setTokenURIInput] = useState("");
  const [storageUploadStatus, setStorageUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [storageUploadError, setStorageUploadError] = useState<string | null>(
    null
  );
  const [strategyCode, setStrategyCode] = useState(
    "function trade(data) { return 0; }"
  );
  const [strategyCodeRoot, setStrategyCodeRoot] = useState("");
  const [marketDataJson, setMarketDataJson] = useState("[]");
  const [marketDataRoot, setMarketDataRoot] = useState("");
  const [localVerifyResult, setLocalVerifyResult] = useState<null | {
    pnl: number;
    ok: boolean;
  }>(null);
  const [marketFileName, setMarketFileName] = useState<string | null>(null);
  const [marketSample, setMarketSample] = useState<MarketSample | null>(null);
  const [marketSamplePreview, setMarketSamplePreview] = useState<MarketRow[]>([]);
  const [marketSampleError, setMarketSampleError] = useState<string | null>(null);
  const [marketUploadStatus, setMarketUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [marketUploadError, setMarketUploadError] = useState<string | null>(null);
  const [marketDatasetHashes, setMarketDatasetHashes] = useState<{
    datasetVersionHash: string;
    evalWindowHash: string;
  } | null>(null);
  const [marketSubmitStatus, setMarketSubmitStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [marketSubmitError, setMarketSubmitError] = useState<string | null>(null);
  const [sampleLibraryRoot, setSampleLibraryRoot] = useState("");
  const [sampleLibraryData, setSampleLibraryData] = useState<MarketSample | null>(
    null
  );
  const [sampleLibraryPreview, setSampleLibraryPreview] = useState<MarketRow[]>([]);
  const [sampleLibraryError, setSampleLibraryError] = useState<string | null>(
    null
  );
  const [strategyJson, setStrategyJson] = useState(
    `{
  "strategy": { "name": "rsi-threshold-v1", "version": "1.0.0", "author": "anon", "description": "RSI 阈值多空" },
  "instrument": { "symbol": "BTC/USDT", "timeframe": "1m", "market": "perp" },
  "logic": {
    "type": "indicator-threshold",
    "indicators": ["rsi(14)"],
    "rules": [
      { "if": "rsi < 30", "then": "entry_long" },
      { "if": "rsi > 70", "then": "entry_short" },
      { "if": "rsi > 50", "then": "exit_long" },
      { "if": "rsi < 50", "then": "exit_short" }
    ],
    "slPct": 0.02,
    "tpPct": 0.04
  },
  "execution": { "position": "all-in", "direction": "long+short", "feeBps": 4, "slippageBps": 6, "leverage": 2 },
  "verification": { "backtestLogHash": "0x..." }
}`
  );
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryState>({
    totalPnl: 0,
    activeStrategies: 0,
  });
  const [currentRound, setCurrentRound] = useState<string>("--");
  const [marketDataHash, setMarketDataHash] = useState<string | null>(null);

  const timeoutsRef = useRef<number[]>([]);

  const readProvider = useMemo(() => new ethers.JsonRpcProvider(RPC_URL), []);

  const configMissing = !STRATEGY_NFT_ADDRESS || !TRADING_ARENA_ADDRESS;
  const isOwner =
    !!walletAddress &&
    !!arenaOwner &&
    walletAddress.toLowerCase() === arenaOwner.toLowerCase();

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setWalletMenuOpen(false);
    }
  }, [walletAddress]);

  const getWalletProvider = () => {
    if (!window.ethereum) return null;
    return new ethers.BrowserProvider(window.ethereum);
  };

  const ensureWallet = async () => {
    setWalletError(null);
    const provider = getWalletProvider();
    if (!provider) {
      throw new Error("未检测到钱包，请安装或启用 MetaMask。");
    }

    await provider.send("eth_requestAccounts", []);

    const chainId = (await provider.send("eth_chainId", [])) as string;
    if (chainId?.toLowerCase() !== CHAIN_ID_HEX) {
      try {
        await provider.send("wallet_switchEthereumChain", [
          { chainId: CHAIN_ID_HEX },
        ]);
      } catch (error: unknown) {
        if (getErrorCode(error) === 4902) {
          await provider.send("wallet_addEthereumChain", [
            {
              chainId: CHAIN_ID_HEX,
              chainName: "0G Galileo Testnet",
              nativeCurrency: { name: "OG", symbol: "OG", decimals: 18 },
              rpcUrls: [RPC_URL],
              blockExplorerUrls: ["https://chainscan-galileo.0g.ai"],
            },
          ]);
        } else {
          throw error;
        }
      }
    }

    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    setWalletAddress(address);
    return signer;
  };

  const handleConnectWallet = async () => {
    try {
      await ensureWallet();
      setWalletMenuOpen(false);
    } catch (error: unknown) {
      setWalletError(getErrorMessage(error, "钱包连接失败"));
    }
  };

  const handleWalletButton = async () => {
    if (walletAddress) {
      setWalletMenuOpen((open) => !open);
      return;
    }
    await handleConnectWallet();
  };

  const handleDisconnectWallet = () => {
    setWalletAddress(null);
    setWalletError(null);
    setWalletMenuOpen(false);
  };

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    setLeaderboardError(null);

    try {
      const arena = new ethers.Contract(
        TRADING_ARENA_ADDRESS,
        TRADING_ARENA_ABI,
        readProvider
      );
      const nft = new ethers.Contract(
        STRATEGY_NFT_ADDRESS,
        STRATEGY_NFT_ABI,
        readProvider
      );

      const [roundId, totalStrategies] = await Promise.all([
        arena.currentRound(),
        nft.totalStrategies(),
      ]);
      const roundIdText = roundId.toString();
      setCurrentRound(roundIdText);

      const totalCount = Number(totalStrategies);
      const hasRound = roundId > 0n;

      const [roundData, leaderboardData] = await Promise.all([
        hasRound ? arena.rounds(roundId) : null,
        hasRound && totalCount > 0
          ? arena.getLeaderboardByRound(roundId, totalStrategies)
          : [[], []],
      ]);

      let roundFinalized = false;
      if (roundData) {
        roundFinalized = Boolean(roundData?.finalized ?? roundData?.[3]);
        const hash =
          (roundData?.marketDataHash ?? roundData?.[2])?.toString?.() ??
          (roundData?.marketDataHash ?? roundData?.[2]);
        if (typeof hash === "string" && hash !== "0x") {
          setMarketDataHash(hash);
        } else {
          setMarketDataHash(null);
        }
      } else {
        setMarketDataHash(null);
      }

      const [strategyIds, pnls] = leaderboardData as [bigint[], bigint[]];
      const pnlMap = new Map<string, bigint>();
      strategyIds.forEach((id, index) => {
        pnlMap.set(id.toString(), pnls[index]);
      });

      if (!Number.isFinite(totalCount) || totalCount <= 0) {
        setSummary({ totalPnl: 0, activeStrategies: 0 });
        setLeaderboard([]);
        return;
      }

      const allStrategyIds = Array.from(
        { length: totalCount },
        (_, index) => BigInt(index + 1)
      );

      const entriesData = await Promise.all(
        allStrategyIds.map(async (id) => {
          const tokenId = id.toString();
          let creator = "--";
          let name = `Strategy #${tokenId}`;

          const [strategyResult, tokenUriResult] = await Promise.all([
            nft.getStrategy(id).catch(() => null),
            nft.tokenURI(id).catch(() => null),
          ]);

          if (strategyResult && typeof strategyResult.creator === "string") {
            creator = strategyResult.creator as string;
          }

          if (typeof tokenUriResult === "string") {
            const decodedName = decodeTokenName(tokenUriResult);
            if (decodedName) {
              name = decodedName;
            }
          }

          const pnlRaw = pnlMap.get(tokenId);
          if (pnlRaw === undefined || !hasRound) {
            return {
              rank: 0,
              name,
              tokenId,
              pnl: null,
              verification: "--",
              status: "未回测",
              creator,
            } as LeaderboardEntry;
          }

          let verification = "--";
          try {
            const result = await arena.getResult(roundId, id);
            const executionLogHash =
              (result?.executionLogHash ?? result?.[4])?.toString?.() ??
              (result?.executionLogHash ?? result?.[4]);
            if (
              typeof executionLogHash === "string" &&
              executionLogHash !== "0x" &&
              !isZeroHash(executionLogHash)
            ) {
              verification = shortenHash(executionLogHash);
            }
          } catch {
            verification = "--";
          }

          const pnl = Number(pnlRaw) / 100;
          const status = roundFinalized ? "已结束" : "运行中";

          return {
            rank: 0,
            name,
            tokenId,
            pnl,
            verification,
            status,
            creator,
          } as LeaderboardEntry;
        })
      );

      const sorted = [...entriesData].sort((a, b) => {
        const aMissing = a.pnl === null;
        const bMissing = b.pnl === null;
        if (aMissing && bMissing) {
          return Number(a.tokenId) - Number(b.tokenId);
        }
        if (aMissing) return 1;
        if (bMissing) return -1;
        if (a.pnl !== b.pnl) return (b.pnl ?? 0) - (a.pnl ?? 0);
        return Number(a.tokenId) - Number(b.tokenId);
      });
      sorted.forEach((entry, index) => {
        entry.rank = index + 1;
      });

      const totalPnl = sorted.reduce((sum, entry) => sum + (entry.pnl ?? 0), 0);

      setSummary({
        totalPnl,
        activeStrategies: sorted.length,
      });
      setLeaderboard(sorted);
    } catch (error: unknown) {
      setLeaderboardError(getErrorMessage(error, "排行榜加载失败"));
      setMarketDataHash(null);
    } finally {
      setLeaderboardLoading(false);
    }
  }, [readProvider]);

  useEffect(() => {
    if (configMissing) {
      setLeaderboardError("缺少合约地址配置，请检查前端环境变量。");
      setLeaderboardLoading(false);
      return;
    }

    void loadLeaderboard();
  }, [configMissing, loadLeaderboard]);

  useEffect(() => {
    if (configMissing) {
      setArenaOwner(null);
      return;
    }

    const arena = new ethers.Contract(
      TRADING_ARENA_ADDRESS,
      TRADING_ARENA_ABI,
      readProvider
    );
    arena
      .owner()
      .then((owner: string) => setArenaOwner(owner))
      .catch(() => setArenaOwner(null));
  }, [configMissing, readProvider]);

  const handleMint = async () => {
    if (mintStage !== "idle") return;
    if (!strategyName.trim() || !strategyJson.trim()) {
      setMintError("请填写策略名称与 JSON");
      return;
    }
    if (!datasetVersion.trim() || !evalWindow.trim()) {
      setMintError("请填写数据集版本与评测窗口");
      return;
    }

    setMintError(null);
    setMintResult(null);

    try {
      setMintStage("hashing");
      const trimmedDatasetVersion = datasetVersion.trim();
      const trimmedEvalWindow = evalWindow.trim();
      const payload = buildStrategyRegistrationPayload({
        strategyName: strategyName.trim(),
        strategyJson,
        datasetVersion: trimmedDatasetVersion,
        evalWindow: trimmedEvalWindow,
        storageRoot: storageRootInput.trim() || undefined,
        backtestLogHash: backtestLogHashInput.trim() || undefined,
        performancePointer: performancePointerInput.trim() || undefined,
        tokenURI: tokenURIInput.trim() || undefined,
        strategyCode: strategyCode.trim(),
        strategyCodeRoot: strategyCodeRoot.trim() || undefined,
      });

      setMintStage("contract");
      const signer = await ensureWallet();
      const nft = new ethers.Contract(
        STRATEGY_NFT_ADDRESS,
        STRATEGY_NFT_ABI,
        signer
      );
      const tx = await nft.registerStrategy(
        payload.codeHash,
        payload.paramsHash,
        trimmedDatasetVersion,
        trimmedEvalWindow,
        payload.storageRoot,
        payload.performancePointer,
        payload.tokenURI
      );
      const receipt = await tx.wait();

      let tokenId: string | null = null;
      for (const log of receipt?.logs ?? []) {
        try {
          const parsed = nft.interface.parseLog(log);
          if (parsed?.name === "StrategyRegistered") {
            tokenId = (parsed.args[0] as bigint).toString();
            break;
          }
        } catch {
          // ignore non-matching logs
        }
      }

      if (!tokenId) {
        throw new Error("未获取到 TokenId");
      }

      setMintResult({
        tokenId,
        storageRoot: payload.storageRoot,
        performancePointer: payload.performancePointer,
      });
      await loadLeaderboard();
      setActiveView("dashboard");
    } catch (error: unknown) {
      setMintError(getErrorMessage(error, "策略注册失败"));
    } finally {
      setMintStage("idle");
    }
  };

  const handleUploadStrategyJson = async () => {
    if (storageUploadStatus === "uploading") return;
    if (!strategyJson.trim()) {
      setStorageUploadStatus("error");
      setStorageUploadError("请填写策略 JSON 后再上传");
      return;
    }

    setStorageUploadError(null);
    setStorageUploadStatus("uploading");

    try {
      const signer = await ensureWallet();
      const rootHash = await uploadStrategyJson(strategyJson, signer);
      setStorageRootInput(rootHash);
      setStorageUploadStatus("success");
    } catch (error: unknown) {
      setStorageUploadStatus("error");
      setStorageUploadError(getErrorMessage(error, "Storage 上传失败"));
    }
  };

  const handleVerify = async () => {
    if (!verifyRoundId.trim() || !verifyStrategyId.trim()) {
      setVerifyError("请填写 Round ID 与 Strategy ID");
      return;
    }

    setVerifyStatus("loading");
    setVerifyError(null);
    setVerifyDetails(null);

    try {
      const roundId = BigInt(verifyRoundId.trim());
      const strategyId = BigInt(verifyStrategyId.trim());
      const nft = new ethers.Contract(
        STRATEGY_NFT_ADDRESS,
        STRATEGY_NFT_ABI,
        readProvider
      );
      const arena = new ethers.Contract(
        TRADING_ARENA_ADDRESS,
        TRADING_ARENA_ABI,
        readProvider
      );

      const strategy = await nft.getStrategy(strategyId);
      const result = await arena.getResult(roundId, strategyId);

      const performancePointer =
        (strategy?.performancePointer as string | undefined) ??
        (strategy?.[5] as string);
      const expectedHash =
        (result?.executionLogHash as string | undefined) ??
        (result?.[4] as string);
      const expectedPnlValue =
        (result?.pnl as bigint | undefined) ?? (result?.[1] as bigint);
      const expectedPnl = expectedPnlValue.toString();

      const res = await fetch(
        `/api/storage-download?root=${performancePointer}`
      );
      const payload = (await res.json()) as { content?: string; error?: string };
      if (!res.ok || !payload.content) {
        throw new Error(payload.error ?? "下载日志失败");
      }

      const logEntries = JSON.parse(payload.content) as Array<{
        entryPrice: number;
        exitPrice: number;
        side: "long" | "short";
        size: number;
        ts?: number;
      }>;

      const computedHash = hashLog(logEntries);
      const computedPnl = computePnlFromLog(logEntries);
      const hashOk =
        computedHash.toLowerCase() === expectedHash.toLowerCase();
      const pnlOk =
        Number.isFinite(computedPnl) &&
        Number(expectedPnl) === computedPnl;

      setVerifyDetails({
        expectedHash,
        computedHash,
        expectedPnl,
        computedPnl,
        performancePointer,
      });
      setVerifyStatus(hashOk && pnlOk ? "success" : "failed");
    } catch (error) {
      setVerifyError(getErrorMessage(error, "验证失败"));
      setVerifyStatus("failed");
    }
  };

  const handleLocalVerify = () => {
    try {
      const data = JSON.parse(marketDataJson);
      const fn = new Function("data", `${strategyCode}\nreturn trade(data);`);
      const pnl = Number(fn(data));
      const ok = Number.isFinite(pnl);
      setLocalVerifyResult({ pnl, ok });
    } catch {
      setLocalVerifyResult({ pnl: 0, ok: false });
    }
  };

  const handleMarketFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMarketFileName(file.name);
    setMarketSampleError(null);
    setMarketSample(null);
    setMarketSamplePreview([]);
    setMarketDatasetHashes(null);
    setMarketUploadStatus("idle");
    setMarketUploadError(null);
    setMarketSubmitStatus("idle");
    setMarketSubmitError(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = String(reader.result ?? "");
        const parsed = parseMarketSample(content);
        setMarketSample(parsed);
        setMarketSamplePreview(buildKlinePreview(parsed.rows, 10));
        setMarketDatasetHashes(
          computeMarketDatasetHashes({
            datasetVersion: parsed.datasetVersion,
            evalWindow: parsed.evalWindow,
          })
        );
        setMarketDataJson(content);
      } catch (error) {
        setMarketSampleError(getErrorMessage(error, "市场样本解析失败"));
      }
    };
    reader.onerror = () => {
      setMarketSampleError("读取文件失败");
    };
    reader.readAsText(file);
  };

  const handleMarketUpload = async () => {
    if (marketUploadStatus === "uploading") return;
    if (!marketDataJson.trim()) {
      setMarketUploadStatus("error");
      setMarketUploadError("请先选择市场样本文件");
      return;
    }

    setMarketUploadError(null);
    setMarketUploadStatus("uploading");

    try {
      const signer = await ensureWallet();
      const rootHash = await uploadJsonContent(marketDataJson, signer);
      setMarketDataRoot(rootHash);
      setMarketUploadStatus("success");
    } catch (error: unknown) {
      setMarketUploadStatus("error");
      setMarketUploadError(getErrorMessage(error, "市场样本上传失败"));
    }
  };

  const handleStartNewRound = async () => {
    if (marketSubmitStatus === "submitting") return;
    if (!marketDataRoot || !marketDatasetHashes) {
      setMarketSubmitStatus("error");
      setMarketSubmitError("请先上传市场样本并确认哈希");
      return;
    }

    setMarketSubmitError(null);
    setMarketSubmitStatus("submitting");

    try {
      const signer = await ensureWallet();
      const arena = new ethers.Contract(
        TRADING_ARENA_ADDRESS,
        TRADING_ARENA_ABI,
        signer
      );
      const tx = await arena.startNewRound(
        marketDataRoot,
        marketDatasetHashes.datasetVersionHash,
        marketDatasetHashes.evalWindowHash
      );
      await tx.wait();
      setMarketSubmitStatus("success");
      await loadLeaderboard();
    } catch (error: unknown) {
      setMarketSubmitStatus("error");
      setMarketSubmitError(getErrorMessage(error, "提交新轮次失败"));
    }
  };

  const handleLoadSampleFromRoot = async () => {
    if (!sampleLibraryRoot.trim()) {
      setSampleLibraryError("请输入 market data root");
      return;
    }

    setSampleLibraryError(null);
    setSampleLibraryData(null);
    setSampleLibraryPreview([]);

    try {
      const res = await fetch(
        `/api/storage-download?root=${sampleLibraryRoot.trim()}`
      );
      const payload = (await res.json()) as { content?: string; error?: string };
      if (!res.ok || !payload.content) {
        throw new Error(payload.error ?? "下载样本失败");
      }
      const parsed = parseMarketSample(payload.content);
      setSampleLibraryData(parsed);
      setSampleLibraryPreview(buildKlinePreview(parsed.rows, 10));
    } catch (error) {
      setSampleLibraryError(getErrorMessage(error, "解析样本失败"));
    }
  };

  const handleCopyMarketHash = useCallback(async () => {
    if (!marketDataHash) return;
    if (currentRound !== "--") {
      setVerifyRoundId(currentRound);
    }
    setActiveView("inspector");

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(marketDataHash);
      } catch {
        // ignore clipboard errors
      }
    }
  }, [currentRound, marketDataHash]);

  const mintButtonText =
    mintStage === "hashing"
      ? "正在计算 Hash..."
      : mintStage === "contract"
        ? "正在调用 0G Chain 智能合约..."
        : "注册策略 (Strategy NFT)";

  return (
    <div className="min-h-screen bg-[#080a0f] text-slate-50">
      <div className="absolute inset-0 radial-glow pointer-events-none" />
      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row lg:overflow-hidden">
        <aside className="w-full border-b border-white/5 bg-[#0b0e14] lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-10">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-xl shadow-[0_0_20px_rgba(59,130,246,0.4)]">
                0G
              </div>
              <div className="font-bold text-xl tracking-tight uppercase">Arena</div>
            </div>

            <nav className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-1 lg:gap-2">
              {(Object.keys(viewTitles) as ViewId[]).map((view) => (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className={`sidebar-item w-full flex items-center gap-4 px-4 py-3 rounded-lg text-sm font-semibold transition-all hover:bg-white/5 ${
                    activeView === view ? "active" : "text-gray-500"
                  }`}
                >
                  <span className="w-5 h-5 inline-flex items-center justify-center">
                    {view === "dashboard" && (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    )}
                    {view === "factory" && (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                    )}
                    {view === "inspector" && (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    )}
                    {view === "admin" && (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M4 7h16M4 12h16M4 17h16" />
                      </svg>
                    )}
                  </span>
                  {viewTitles[view]}
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-6 border-t border-white/5 bg-black/20 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <span className="text-[10px] mono text-gray-400 uppercase tracking-widest">
                0G Galileo Testnet
              </span>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto no-scrollbar lg:h-screen">
          <header className="sticky top-0 z-40 px-6 py-5 lg:px-10 lg:py-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between glass-panel border-b border-white/5">
            <h2 className="text-2xl font-bold tracking-tight">{viewTitles[activeView]}</h2>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-[10px] text-gray-500 uppercase font-bold mono">
                  Current Round
                </p>
                <p className="text-sm font-bold mono">
                  {currentRound === "0" ? "--" : `#${currentRound}`}
                </p>
              </div>
              <div className="hidden h-8 w-px bg-white/10 sm:block" />
              <div className="relative text-right">
                <button
                  onClick={() => void handleWalletButton()}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-all ${
                    walletAddress
                      ? "bg-blue-600/10 text-blue-400 border-blue-500/20"
                      : "bg-white/5 text-white border-white/10 hover:bg-white/10"
                  }`}
                >
                  <span>{walletAddress ? shortenAddress(walletAddress) : "连接钱包"}</span>
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {walletAddress && walletMenuOpen && (
                  <div className="absolute right-0 mt-2 w-40 rounded-xl border border-white/10 bg-[#0b0e14] shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
                    <button
                      onClick={handleDisconnectWallet}
                      className="w-full px-4 py-3 text-left text-xs font-semibold text-red-300 hover:bg-white/5"
                    >
                      断开钱包
                    </button>
                  </div>
                )}
                {walletError && (
                  <p className="mt-2 text-xs text-red-400 leading-relaxed">
                    {walletError}
                  </p>
                )}
              </div>
              <button className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 border border-white/5">
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
            </div>
          </header>

          <div className="p-6 lg:p-10">
            <section
              id="view-dashboard"
              className={`view-section ${activeView === "dashboard" ? "active" : ""}`}
            >
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 mb-10">
                <div className="glass-panel rounded-3xl p-8 overflow-hidden relative lg:col-span-8">
                  <div className="absolute top-0 right-0 p-8">
                    <svg
                      className="w-32 h-32 text-blue-500/10"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                    </svg>
                  </div>
                  <h3 className="text-gray-400 text-sm font-semibold mb-1">
                    Total PnL Value
                  </h3>
                  <div className="text-4xl sm:text-5xl font-extrabold tracking-tighter mb-4">
                    {summary.totalPnl >= 0 ? "+" : ""}
                    {summary.totalPnl.toFixed(2)}{" "}
                    <span className="text-xl text-blue-500 uppercase">OG</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 font-bold">
                      链上实时
                    </span>
                    <span className="px-3 py-1 rounded-full bg-white/5 text-gray-400 font-bold mono">
                      RPC: Galileo
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold mono mt-3">
                  来源：TradingArena.getLeaderboardByRound + StrategyNFT.totalStrategies
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <span className="text-[10px] text-gray-500 uppercase font-bold">
                      Market Data Hash
                    </span>
                    <span className="px-3 py-1 rounded-full bg-white/5 text-gray-300 text-xs mono">
                      {marketDataHash ? shortenHash(marketDataHash) : "--"}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyMarketHash}
                      disabled={!marketDataHash}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                        marketDataHash
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20"
                          : "bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed"
                      }`}
                    >
                      复制到验证
                    </button>
                  </div>
                </div>

                <div className="glass-panel rounded-3xl p-8 flex flex-col justify-center lg:col-span-4">
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">
                    Active Strategies
                  </p>
                  <div className="text-4xl font-bold mono">{summary.activeStrategies}</div>
                  <div className="mt-4 h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 w-2/3 shadow-[0_0_10px_#3b82f6]" />
                  </div>
                  <p className="text-[10px] text-blue-500 mt-2 font-bold uppercase tracking-tighter">
                    Capacity 68%
                  </p>
                </div>
              </div>

              <div className="glass-panel rounded-3xl overflow-hidden">
                <div className="px-6 py-5 lg:px-8 border-b border-white/5 flex justify-between items-center">
                  <h4 className="font-bold">实时排行榜</h4>
                  <button
                    onClick={loadLeaderboard}
                    className="text-xs text-blue-500 font-bold uppercase tracking-widest"
                  >
                    刷新数据
                  </button>
                </div>

                {leaderboardError && (
                  <div className="px-6 py-4 text-sm text-red-400 border-b border-white/5">
                    {leaderboardError}
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[820px]">
                    <thead>
                      <tr className="bg-white/5 text-[10px] text-gray-500 uppercase font-bold">
                        <th className="px-6 py-4 lg:px-8">Rank</th>
                        <th className="px-6 py-4 lg:px-8">Strategy</th>
                        <th className="px-6 py-4 lg:px-8 text-right">PnL (%)</th>
                        <th className="px-6 py-4 lg:px-8">Verification</th>
                        <th className="px-6 py-4 lg:px-8">Creator</th>
                        <th className="px-6 py-4 lg:px-8">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {leaderboardLoading ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                            读取链上数据中...
                          </td>
                        </tr>
                      ) : leaderboard.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                            暂无策略
                          </td>
                        </tr>
                      ) : (
                        leaderboard.map((entry, index) => (
                          <tr key={entry.tokenId} className="hover:bg-white/5 transition-all">
                            <td
                              className={`px-6 py-5 lg:px-8 font-bold italic ${
                                index === 0
                                  ? "text-yellow-500"
                                  : index === 1
                                    ? "text-slate-300"
                                    : index === 2
                                      ? "text-amber-400"
                                      : "text-gray-400"
                              }`}
                            >
                              #{index + 1}
                            </td>
                            <td className="px-6 py-5 lg:px-8">
                              <div className="font-bold">{entry.name}</div>
                              <div className="text-[10px] text-gray-500 mono">
                                Token ID: {entry.tokenId}
                              </div>
                            </td>
                            <td
                              className="px-6 py-5 lg:px-8 text-right font-bold text-emerald-400 text-lg"
                              data-testid="leaderboard-pnl"
                            >
                              {entry.pnl === null
                                ? "--"
                                : `${entry.pnl >= 0 ? "+" : ""}${entry.pnl.toFixed(2)}%`}
                            </td>
                            <td className="px-6 py-5 lg:px-8">
                              <span className="px-3 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] mono border border-blue-500/20">
                                {entry.verification}
                              </span>
                            </td>
                            <td className="px-6 py-5 lg:px-8 text-gray-400">
                              {shortenAddress(entry.creator)}
                            </td>
                            <td className="px-6 py-5 lg:px-8">
                              <div className="flex items-center gap-2 text-xs text-gray-400">
                                <div
                                  className={`w-2 h-2 rounded-full ${
                                    entry.status === "运行中"
                                      ? "bg-emerald-500"
                                      : entry.status === "已结束"
                                        ? "bg-gray-500"
                                        : "bg-amber-400"
                                  }`}
                                />
                                {entry.status}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section
              id="view-factory"
              className={`view-section ${activeView === "factory" ? "active" : ""}`}
            >
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
                <div className="space-y-6 lg:col-span-7">
                  <div className="glass-panel rounded-3xl p-8">
                    <h3 className="text-xl font-bold mb-6 italic">Deploy Your AI Strategy</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1">
                          Strategy Name
                        </label>
                        <input
                          type="text"
                          value={strategyName}
                          onChange={(event) => setStrategyName(event.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 transition-all outline-none"
                          placeholder="My Alpha Bot"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1">
                            Dataset Version
                          </label>
                          <input
                            type="text"
                            value={datasetVersion}
                            onChange={(event) => setDatasetVersion(event.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 transition-all outline-none"
                            placeholder="v1"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1">
                            Eval Window
                          </label>
                          <input
                            type="text"
                            value={evalWindow}
                            onChange={(event) => setEvalWindow(event.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 transition-all outline-none"
                            placeholder="2025-01-01~2025-02-01"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label
                            htmlFor="storageRoot"
                            className="block text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1"
                          >
                            Storage Root
                          </label>
                          <input
                            id="storageRoot"
                            type="text"
                            value={storageRootInput}
                            onChange={(event) =>
                              setStorageRootInput(event.target.value)
                            }
                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 transition-all outline-none mono"
                            placeholder="0x... (from 0G Storage)"
                          />
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <button
                              type="button"
                              onClick={handleUploadStrategyJson}
                              disabled={storageUploadStatus === "uploading"}
                              className="px-4 py-3 rounded-2xl bg-white/10 border border-white/10 text-xs font-bold hover:bg-white/15 transition-all disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {storageUploadStatus === "uploading"
                                ? "上传中..."
                                : "上传到 0G Storage"}
                            </button>
                            <span className="text-[10px] mono text-gray-500">
                              {storageUploadStatus === "success"
                                ? `OK ${shortenHash(storageRootInput)}`
                                : storageUploadStatus === "error"
                                  ? "上传失败"
                                  : "未上传"}
                            </span>
                          </div>
                          {storageUploadError && (
                            <p className="text-[10px] text-red-400">
                              {storageUploadError}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor="backtestLogHash"
                            className="block text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1"
                          >
                            Backtest Log Hash
                          </label>
                          <input
                            id="backtestLogHash"
                            type="text"
                            value={backtestLogHashInput}
                            onChange={(event) =>
                              setBacktestLogHashInput(event.target.value)
                            }
                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 transition-all outline-none mono"
                            placeholder="0x... (from backtest log)"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label
                            htmlFor="performancePointer"
                            className="block text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1"
                          >
                            Performance Pointer
                          </label>
                          <input
                            id="performancePointer"
                            type="text"
                            value={performancePointerInput}
                            onChange={(event) =>
                              setPerformancePointerInput(event.target.value)
                            }
                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 transition-all outline-none mono"
                            placeholder="0x... (log root)"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="tokenURI"
                            className="block text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1"
                          >
                            Token URI
                          </label>
                          <input
                            id="tokenURI"
                            type="text"
                            value={tokenURIInput}
                            onChange={(event) =>
                              setTokenURIInput(event.target.value)
                            }
                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 transition-all outline-none mono"
                            placeholder="0x... (metadata root)"
                          />
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="strategyCode"
                          className="block text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1"
                        >
                          Strategy Code
                        </label>
                        <textarea
                          id="strategyCode"
                          rows={6}
                          value={strategyCode}
                          onChange={(event) => setStrategyCode(event.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm mono focus:border-blue-500 transition-all outline-none"
                          placeholder="function trade(data) { return pnl; }"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label
                            htmlFor="strategyCodeRoot"
                            className="block text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1"
                          >
                            Strategy Code Root
                          </label>
                          <input
                            id="strategyCodeRoot"
                            type="text"
                            value={strategyCodeRoot}
                            onChange={(event) =>
                              setStrategyCodeRoot(event.target.value)
                            }
                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 transition-all outline-none mono"
                            placeholder="0x... (code root)"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="marketDataRoot"
                            className="block text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1"
                          >
                            Market Data Root
                          </label>
                          <input
                            id="marketDataRoot"
                            type="text"
                            value={marketDataRoot}
                            onChange={(event) => setMarketDataRoot(event.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 transition-all outline-none mono"
                            placeholder="0x... (market data root)"
                          />
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="marketDataJson"
                          className="block text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1"
                        >
                          Market Data JSON
                        </label>
                        <textarea
                          id="marketDataJson"
                          rows={6}
                          value={marketDataJson}
                          onChange={(event) => setMarketDataJson(event.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm mono focus:border-blue-500 transition-all outline-none"
                          placeholder='[{ "t": 0, "o": 1, "h": 2, "l": 0.5, "c": 1.5 }]'
                        />
                      </div>
                      <button
                        onClick={handleLocalVerify}
                        className="w-full py-4 rounded-2xl bg-white/10 border border-white/10 text-sm font-bold hover:bg-white/20 transition-all"
                      >
                        Local Verify (Run Strategy)
                      </button>
                      {localVerifyResult && (
                        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-xs text-gray-300">
                          <div>Local PnL: {localVerifyResult.pnl}</div>
                          <div>Status: {localVerifyResult.ok ? "OK" : "Failed"}</div>
                        </div>
                      )}
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1">
                          Strategy Logic (JSON)
                        </label>
                        <p className="text-[10px] text-gray-500 mb-2 ml-1">
                          Suggested keys: strategy, instrument, logic, execution, verification
                        </p>
                        <textarea
                          rows={10}
                          value={strategyJson}
                          onChange={(event) => setStrategyJson(event.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm mono focus:border-blue-500 transition-all outline-none"
                        />
                      </div>
                      <button
                        onClick={handleMint}
                        disabled={mintStage !== "idle"}
                        className={`w-full py-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 font-bold text-white shadow-xl transition-all flex justify-center items-center gap-3 ${
                          mintStage !== "idle"
                            ? "opacity-80 cursor-not-allowed"
                            : "hover:scale-[1.01] active:scale-[0.98]"
                        }`}
                      >
                        {mintStage !== "idle" && (
                          <span className="inline-flex h-5 w-5 items-center justify-center animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
                        )}
                        <span>{mintButtonText}</span>
                      </button>
                      {mintError && (
                        <p className="text-sm text-red-400">{mintError}</p>
                      )}
                      {mintResult && (
                        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
                          <div className="font-bold">✅ 策略注册成功</div>
                          <div className="mt-2 text-xs text-emerald-200 mono">
                            Token ID: {mintResult.tokenId}
                          </div>
                          <div className="text-xs text-emerald-200 mono">
                            Storage Root: {mintResult.storageRoot}
                          </div>
                          <div className="text-xs text-emerald-200 mono">
                            Performance Pointer: {mintResult.performancePointer}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <div className="glass-panel rounded-3xl p-8 lg:sticky lg:top-32">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-6">
                      Execution Steps
                    </h4>
                    <div className="space-y-8 relative">
                      <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-white/5" />

                      <div className="flex gap-6 relative">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold z-10">
                          1
                        </div>
                        <div>
                          <h5 className="font-bold text-sm">JSON Data Hashing</h5>
                          <p className="text-xs text-gray-500 mt-1">
                            计算策略代码的 Keccak-256 哈希值作为指纹。
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-6 relative">
                        <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold z-10">
                          2
                        </div>
                        <div>
                          <h5 className="font-bold text-sm">0G Storage Upload</h5>
                          <p className="text-xs text-gray-500 mt-1">
                            上传策略 JSON 到 0G Storage 生成 Storage Root。
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-6 relative">
                        <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold z-10">
                          3
                        </div>
                        <div>
                          <h5 className="font-bold text-sm">On-chain Registration</h5>
                          <p className="text-xs text-gray-500 mt-1">
                            使用 StrategyNFT.registerStrategy 上链登记。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section
              id="view-inspector"
              className={`view-section ${activeView === "inspector" ? "active" : ""}`}
            >
              <div className="mx-auto max-w-3xl">
                <div className="glass-panel rounded-3xl p-8 sm:p-10 text-center">
                  <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-500">
                    <svg
                      className="w-10 h-10"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Verifiable Result Inspector</h3>
                  <p className="text-gray-500 text-sm mb-8">
                    输入 Round ID / Strategy ID，下载日志并复算哈希与 PnL
                  </p>

                  <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2">
                    <input
                      type="text"
                      value={verifyRoundId}
                      onChange={(event) => setVerifyRoundId(event.target.value)}
                      className="bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-sm mono outline-none focus:border-blue-500 transition-all"
                      placeholder="Round ID"
                    />
                    <input
                      type="text"
                      value={verifyStrategyId}
                      onChange={(event) => setVerifyStrategyId(event.target.value)}
                      className="bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-sm mono outline-none focus:border-blue-500 transition-all"
                      placeholder="Strategy ID"
                    />
                  </div>
                  <button
                    onClick={handleVerify}
                    disabled={verifyStatus === "loading"}
                    className={`w-full px-8 py-4 rounded-2xl font-bold transition-all ${
                      verifyStatus === "loading"
                        ? "bg-white/10 text-gray-400 cursor-not-allowed"
                        : "bg-white text-black hover:bg-gray-200"
                    }`}
                  >
                    {verifyStatus === "loading" ? "验证中..." : "验证"}
                  </button>
                  {verifyError && (
                    <p className="mt-4 text-sm text-red-400">{verifyError}</p>
                  )}

                  {verifyDetails && (
                    <div className="mt-6">
                      <div
                        className={`p-6 rounded-2xl border text-left ${
                          verifyStatus === "success"
                            ? "bg-emerald-500/10 border-emerald-500/20"
                            : "bg-amber-500/10 border-amber-500/20"
                        }`}
                      >
                        <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
                          <span
                            className={`font-bold flex items-center gap-2 ${
                              verifyStatus === "success"
                                ? "text-emerald-500"
                                : "text-amber-400"
                            }`}
                          >
                            {verifyStatus === "success"
                              ? "Verification Success"
                              : "Verification Mismatch"}
                          </span>
                          <span className="text-[10px] mono text-gray-500">
                            Node: 0G-Validator-7
                          </span>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500 uppercase">
                              Performance Pointer
                            </span>
                            <span className="mono">
                              {shortenHash(verifyDetails.performancePointer)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500 uppercase">
                              Execution Log Hash
                            </span>
                            <span className="mono">
                              {shortenHash(verifyDetails.expectedHash)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500 uppercase">
                              Recomputed Hash
                            </span>
                            <span className="mono">
                              {shortenHash(verifyDetails.computedHash)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500 uppercase">PnL</span>
                            <span className="mono">
                              {verifyDetails.computedPnl} / {verifyDetails.expectedPnl}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section
              id="view-admin"
              className={`view-section ${activeView === "admin" ? "active" : ""}`}
            >
              <div className="mx-auto max-w-4xl">
                <div className="glass-panel rounded-3xl p-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold">Market Samples</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        管理员上传样本并提交新轮次
                      </p>
                    </div>
                    <div className="text-[10px] mono text-gray-500 uppercase">
                      Owner: {arenaOwner ? shortenAddress(arenaOwner) : "--"}
                    </div>
                  </div>

                  {!walletAddress && (
                    <p className="text-sm text-gray-400">请先连接钱包。</p>
                  )}
                  {walletAddress && !isOwner && (
                    <p className="text-sm text-amber-400">
                      仅合约 owner 可操作市场样本管理。
                    </p>
                  )}

                  {isOwner && (
                    <div className="space-y-6">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                          <p className="text-[10px] uppercase text-gray-500 font-bold mb-2">
                            Market Sample File
                          </p>
                          <input
                            type="file"
                            accept=".json,application/json"
                            onChange={handleMarketFileChange}
                            className="w-full text-xs text-gray-300 file:mr-4 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-xs file:font-bold file:text-gray-200 hover:file:bg-white/20"
                          />
                          {marketFileName && (
                            <p className="mt-2 text-xs text-gray-400">
                              {marketFileName}
                            </p>
                          )}
                          {marketSampleError && (
                            <p className="mt-2 text-xs text-red-400">
                              {marketSampleError}
                            </p>
                          )}
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500 uppercase">
                              Dataset Version
                            </span>
                            <span className="mono">
                              {marketSample?.datasetVersion ?? "--"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500 uppercase">Eval Window</span>
                            <span className="mono">
                              {marketSample?.evalWindow ?? "--"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500 uppercase">Price Scale</span>
                            <span className="mono">
                              {marketSample?.scale?.price ?? "--"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500 uppercase">Volume Scale</span>
                            <span className="mono">
                              {marketSample?.scale?.volume ?? "--"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {marketDatasetHashes && (
                        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-xs">
                          <div className="flex flex-wrap gap-4">
                            <div>
                              <p className="text-[10px] uppercase text-gray-500 font-bold">
                                Dataset Version Hash
                              </p>
                              <p className="mono text-gray-300">
                                {shortenHash(marketDatasetHashes.datasetVersionHash)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-gray-500 font-bold">
                                Eval Window Hash
                              </p>
                              <p className="mono text-gray-300">
                                {shortenHash(marketDatasetHashes.evalWindowHash)}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="grid gap-4 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={handleMarketUpload}
                          disabled={marketUploadStatus === "uploading"}
                          className={`w-full rounded-2xl border border-white/10 px-6 py-4 text-sm font-bold transition-all ${
                            marketUploadStatus === "uploading"
                              ? "bg-white/5 text-gray-400 cursor-not-allowed"
                              : "bg-white/10 hover:bg-white/20"
                          }`}
                        >
                          {marketUploadStatus === "uploading"
                            ? "上传中..."
                            : "上传市场样本"}
                        </button>
                        <button
                          type="button"
                          onClick={handleStartNewRound}
                          disabled={marketSubmitStatus === "submitting"}
                          className={`w-full rounded-2xl border px-6 py-4 text-sm font-bold transition-all ${
                            marketSubmitStatus === "submitting"
                              ? "border-blue-500/20 bg-blue-500/10 text-blue-300/50 cursor-not-allowed"
                              : "border-blue-500/40 bg-blue-500/20 text-blue-200 hover:bg-blue-500/30"
                          }`}
                        >
                          {marketSubmitStatus === "submitting"
                            ? "提交中..."
                            : "提交新轮次"}
                        </button>
                      </div>

                      {marketUploadError && (
                        <p className="text-xs text-red-400">{marketUploadError}</p>
                      )}
                      {marketSubmitError && (
                        <p className="text-xs text-red-400">{marketSubmitError}</p>
                      )}

                      {marketDataRoot && (
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs text-emerald-200">
                          <div className="font-bold">✅ Market Data Root</div>
                          <div className="mono mt-2">{marketDataRoot}</div>
                        </div>
                      )}

                      {marketSamplePreview.length > 0 && (
                        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                          <p className="text-[10px] uppercase text-gray-500 font-bold mb-3">
                            Kline Preview (First 10)
                          </p>
                          <div className="overflow-x-auto">
                            <table className="min-w-[640px] w-full text-left text-xs">
                              <thead className="text-[10px] uppercase text-gray-500">
                                <tr>
                                  <th className="py-2">TS</th>
                                  <th className="py-2">Open</th>
                                  <th className="py-2">High</th>
                                  <th className="py-2">Low</th>
                                  <th className="py-2">Close</th>
                                  <th className="py-2">Volume</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {marketSamplePreview.map((row, index) => (
                                  <tr key={`${row.ts}-${index}`}>
                                    <td className="py-2 mono">{row.ts}</td>
                                    <td className="py-2 mono">{row.open}</td>
                                    <td className="py-2 mono">{row.high ?? "--"}</td>
                                    <td className="py-2 mono">{row.low ?? "--"}</td>
                                    <td className="py-2 mono">{row.close}</td>
                                    <td className="py-2 mono">{row.volume ?? "--"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="glass-panel rounded-3xl p-8 mt-6">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">
                    Market Sample Library
                  </h4>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={sampleLibraryRoot}
                      onChange={(event) => setSampleLibraryRoot(event.target.value)}
                      className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-5 py-3 text-sm mono outline-none focus:border-blue-500 transition-all"
                      placeholder="0x... (market data root)"
                    />
                    <button
                      type="button"
                      onClick={handleLoadSampleFromRoot}
                      className="rounded-2xl border border-white/10 bg-white/10 px-6 py-3 text-xs font-bold transition-all hover:bg-white/20"
                    >
                      解析样本
                    </button>
                  </div>
                  {sampleLibraryError && (
                    <p className="mt-3 text-xs text-red-400">{sampleLibraryError}</p>
                  )}
                  {sampleLibraryData && (
                    <div className="mt-4 space-y-4 text-xs">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                          <div className="flex justify-between">
                            <span className="text-gray-500 uppercase">Dataset</span>
                            <span className="mono">{sampleLibraryData.datasetVersion}</span>
                          </div>
                          <div className="flex justify-between mt-2">
                            <span className="text-gray-500 uppercase">Eval Window</span>
                            <span className="mono">{sampleLibraryData.evalWindow}</span>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                          <div className="flex justify-between">
                            <span className="text-gray-500 uppercase">Price Scale</span>
                            <span className="mono">
                              {sampleLibraryData.scale?.price ?? "--"}
                            </span>
                          </div>
                          <div className="flex justify-between mt-2">
                            <span className="text-gray-500 uppercase">Volume Scale</span>
                            <span className="mono">
                              {sampleLibraryData.scale?.volume ?? "--"}
                            </span>
                          </div>
                        </div>
                      </div>
                      {sampleLibraryPreview.length > 0 && (
                        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                          <p className="text-[10px] uppercase text-gray-500 font-bold mb-3">
                            Kline Preview (First 10)
                          </p>
                          <div className="overflow-x-auto">
                            <table className="min-w-[640px] w-full text-left text-xs">
                              <thead className="text-[10px] uppercase text-gray-500">
                                <tr>
                                  <th className="py-2">TS</th>
                                  <th className="py-2">Open</th>
                                  <th className="py-2">High</th>
                                  <th className="py-2">Low</th>
                                  <th className="py-2">Close</th>
                                  <th className="py-2">Volume</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {sampleLibraryPreview.map((row, index) => (
                                  <tr key={`${row.ts}-${index}`}>
                                    <td className="py-2 mono">{row.ts}</td>
                                    <td className="py-2 mono">{row.open}</td>
                                    <td className="py-2 mono">{row.high ?? "--"}</td>
                                    <td className="py-2 mono">{row.low ?? "--"}</td>
                                    <td className="py-2 mono">{row.close}</td>
                                    <td className="py-2 mono">{row.volume ?? "--"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MARKET_HASH = `0x${"33".repeat(32)}`;
const RESULT_HASH = `0x${"44".repeat(32)}`;
const ARENA_ADDRESS = "0x00000000000000000000000000000000000000a1";
const NFT_ADDRESS = "0x00000000000000000000000000000000000000b2";

const mockArena = {
  getLeaderboardByRound: vi.fn().mockResolvedValue([[2n], [1500n]]),
  currentRound: vi.fn().mockResolvedValue(1n),
  owner: vi.fn().mockResolvedValue("0xowner"),
  rounds: vi.fn().mockResolvedValue({
    startTime: 0n,
    endTime: 0n,
    marketDataHash: MARKET_HASH,
    finalized: false,
  }),
  getResult: vi.fn().mockImplementation((_roundId: bigint, strategyId: bigint) => {
    if (strategyId === 2n) {
      return { executionLogHash: RESULT_HASH };
    }
    return { executionLogHash: `0x${"00".repeat(32)}` };
  }),
};

const mockNft = {
  getStrategy: vi.fn().mockResolvedValue({ creator: "0xcreator" }),
  tokenURI: vi.fn().mockResolvedValue(""),
  totalStrategies: vi.fn().mockResolvedValue(3n),
};

vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers");

  class MockContract {
    constructor(address: string) {
      return address === ARENA_ADDRESS ? mockArena : mockNft;
    }
  }

  class MockJsonRpcProvider {}

  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: MockContract,
      JsonRpcProvider: MockJsonRpcProvider,
    },
  };
});

describe("dashboard leaderboard all strategies", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_STRATEGY_NFT_ADDRESS = NFT_ADDRESS;
    process.env.NEXT_PUBLIC_TRADING_ARENA_ADDRESS = ARENA_ADDRESS;
    process.env.NEXT_PUBLIC_RPC_URL = "http://localhost:8545";
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("shows non-participating strategies with placeholders", async () => {
    const { default: Home } = await import("../page");
    render(<Home />);

    const token1 = await screen.findByText(/Token ID: 1/i);
    const row1 = token1.closest("tr");
    expect(row1).not.toBeNull();

    const row1Scope = within(row1 as HTMLElement);
    expect(row1Scope.getByText("未回测")).toBeInTheDocument();
    expect(row1Scope.getAllByText("--")).toHaveLength(2);

    const token2 = await screen.findByText(/Token ID: 2/i);
    const row2 = token2.closest("tr");
    expect(row2).not.toBeNull();

    const row2Scope = within(row2 as HTMLElement);
    const shortHash = `${RESULT_HASH.slice(0, 6)}...${RESULT_HASH.slice(-4)}`;
    expect(row2Scope.getByText("+15.00%")).toBeInTheDocument();
    expect(row2Scope.getByText(shortHash)).toBeInTheDocument();

    expect(mockArena.getLeaderboardByRound).toHaveBeenCalledWith(1n, 3n);
  });
});

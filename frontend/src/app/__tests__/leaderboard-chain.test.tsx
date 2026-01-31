import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MARKET_HASH = `0x${"22".repeat(32)}`;
const ARENA_ADDRESS = "0x00000000000000000000000000000000000000a1";
const NFT_ADDRESS = "0x00000000000000000000000000000000000000b2";

const mockArena = {
  getLeaderboardByRound: vi.fn().mockResolvedValue([[1n, 2n], [1000n, -500n]]),
  currentRound: vi.fn().mockResolvedValue(1n),
  rounds: vi.fn().mockResolvedValue({
    startTime: 0n,
    endTime: 0n,
    marketDataHash: MARKET_HASH,
    finalized: false,
  }),
};

const mockNft = {
  getStrategy: vi.fn().mockResolvedValue({ creator: "0xcreator" }),
  tokenURI: vi.fn().mockResolvedValue(""),
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

describe("dashboard leaderboard", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_STRATEGY_NFT_ADDRESS = NFT_ADDRESS;
    process.env.NEXT_PUBLIC_TRADING_ARENA_ADDRESS = ARENA_ADDRESS;
    process.env.NEXT_PUBLIC_RPC_URL = "http://localhost:8545";
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("renders leaderboard pnl from chain data", async () => {
    const { default: Home } = await import("../page");
    render(<Home />);

    const pnls = await screen.findAllByTestId("leaderboard-pnl");
    const values = pnls.map((node) => node.textContent);
    expect(values).toEqual(["+10.00%", "-5.00%"]);

    expect(mockArena.getLeaderboardByRound).toHaveBeenCalledWith(1n, 10);
  });
});

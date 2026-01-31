import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MARKET_HASH = `0x${"11".repeat(32)}`;
const ARENA_ADDRESS = "0x00000000000000000000000000000000000000a1";
const NFT_ADDRESS = "0x00000000000000000000000000000000000000b2";

vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers");

  const mockArena = {
    getLeaderboardByRound: vi.fn().mockResolvedValue([[1n], [1000n]]),
    currentRound: vi.fn().mockResolvedValue(1n),
    owner: vi.fn().mockResolvedValue("0xowner"),
    rounds: vi.fn().mockResolvedValue({
      startTime: 0n,
      endTime: 0n,
      marketDataHash: MARKET_HASH,
      finalized: false,
    }),
    getResult: vi.fn().mockResolvedValue({ executionLogHash: `0x${"11".repeat(32)}` }),
  };

  const mockNft = {
    getStrategy: vi.fn().mockResolvedValue({ creator: "0xcreator" }),
    tokenURI: vi.fn().mockResolvedValue(""),
    totalStrategies: vi.fn().mockResolvedValue(1n),
  };

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

describe("dashboard -> inspector hash copy", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_STRATEGY_NFT_ADDRESS = NFT_ADDRESS;
    process.env.NEXT_PUBLIC_TRADING_ARENA_ADDRESS = ARENA_ADDRESS;
    process.env.NEXT_PUBLIC_RPC_URL = "http://localhost:8545";
    Object.defineProperty(global.navigator, "clipboard", {
      value: { writeText: vi.fn() },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("copies market data hash and opens inspector", async () => {
    const { default: Home } = await import("../page");
    render(<Home />);

    const copyButton = await screen.findByRole("button", {
      name: /复制到验证/i,
    });
    await userEvent.click(copyButton);

    const input = await screen.findByPlaceholderText(/Round ID/i);
    expect(input).toHaveValue("1");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(MARKET_HASH);
  });
});

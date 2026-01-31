import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ARENA_ADDRESS = "0x00000000000000000000000000000000000000a1";
const NFT_ADDRESS = "0x00000000000000000000000000000000000000b2";
const OWNER_ADDRESS = "0x0000000000000000000000000000000000000aa1";
const NON_OWNER_ADDRESS = "0x0000000000000000000000000000000000000bb2";
const CHAIN_ID_HEX = "0x40da";

let walletAddress = OWNER_ADDRESS;

const mockArena = {
  owner: vi.fn().mockResolvedValue(OWNER_ADDRESS),
  currentRound: vi.fn().mockResolvedValue(0n),
  getLeaderboardByRound: vi.fn().mockResolvedValue([[], []]),
  rounds: vi.fn().mockResolvedValue({
    startTime: 0n,
    endTime: 0n,
    marketDataHash: `0x${"00".repeat(32)}`,
    finalized: false,
  }),
};

const mockNft = {
  getStrategy: vi.fn().mockResolvedValue({ creator: OWNER_ADDRESS }),
  tokenURI: vi.fn().mockResolvedValue(""),
  totalStrategies: vi.fn().mockResolvedValue(0n),
};

vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers");

  class MockContract {
    constructor(address: string) {
      return address === ARENA_ADDRESS ? mockArena : mockNft;
    }
  }

  class MockJsonRpcProvider {}

  class MockBrowserProvider {
    async send(method: string) {
      if (method === "eth_chainId") {
        return CHAIN_ID_HEX;
      }
      if (method === "eth_requestAccounts") {
        return [walletAddress];
      }
      return null;
    }
    async getSigner() {
      return {
        getAddress: async () => walletAddress,
      };
    }
  }

  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: MockContract,
      JsonRpcProvider: MockJsonRpcProvider,
      BrowserProvider: MockBrowserProvider,
    },
  };
});

describe("market admin view", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_STRATEGY_NFT_ADDRESS = NFT_ADDRESS;
    process.env.NEXT_PUBLIC_TRADING_ARENA_ADDRESS = ARENA_ADDRESS;
    process.env.NEXT_PUBLIC_RPC_URL = "http://localhost:8545";
    walletAddress = OWNER_ADDRESS;
    window.ethereum = { request: vi.fn() };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    cleanup();
  });

  it("shows admin controls for owner", async () => {
    const user = userEvent.setup();
    const { default: Home } = await import("../page");
    render(<Home />);

    await user.click(screen.getAllByRole("button", { name: "市场样本库" })[0]);
    await user.click(screen.getByRole("button", { name: /连接钱包/ }));

    expect(
      await screen.findByRole("button", { name: /上传市场样本/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /提交新轮次/ })
    ).toBeInTheDocument();
  });

  it("hides admin controls for non-owner", async () => {
    walletAddress = NON_OWNER_ADDRESS;
    const user = userEvent.setup();
    const { default: Home } = await import("../page");
    render(<Home />);

    await user.click(screen.getAllByRole("button", { name: "市场样本库" })[0]);
    await user.click(screen.getByRole("button", { name: /连接钱包/ }));

    expect(
      screen.queryByRole("button", { name: /上传市场样本/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /提交新轮次/ })
    ).not.toBeInTheDocument();
  });
});

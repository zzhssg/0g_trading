// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract StrategyNFT is ERC721, ERC721URIStorage, Ownable {
    struct Strategy {
        bytes32 codeHash;
        bytes32 paramsHash;
        string datasetVersion;
        string evalWindow;
        string storageRoot;
        string performancePointer;
        uint256 createdAt;
        address creator;
        bool isActive;
    }

    uint256 private _tokenIds;
    mapping(uint256 => Strategy) public strategies;

    event StrategyRegistered(
        uint256 indexed tokenId,
        address indexed creator,
        bytes32 codeHash,
        bytes32 paramsHash,
        string datasetVersion,
        string evalWindow,
        string storageRoot,
        string performancePointer
    );

    constructor() ERC721("AI Trading Strategy", "AITS") Ownable(msg.sender) {}

    /// @notice Register a strategy NFT with minimal on-chain fields.
    /// @dev tokenURI should point to metadata JSON including:
    ///      strategy/instrument/logic/execution/verification.
    ///      For MVP, storageRoot/performancePointer may be hash placeholders if not uploaded.
    function registerStrategy(
        bytes32 _codeHash,
        bytes32 _paramsHash,
        string memory _datasetVersion,
        string memory _evalWindow,
        string memory _storageRoot,
        string memory _performancePointer,
        string memory _tokenURI
    ) external returns (uint256) {
        _tokenIds += 1;
        uint256 newTokenId = _tokenIds;

        _safeMint(msg.sender, newTokenId);
        _setTokenURI(newTokenId, _tokenURI);

        strategies[newTokenId] = Strategy({
            codeHash: _codeHash,
            paramsHash: _paramsHash,
            datasetVersion: _datasetVersion,
            evalWindow: _evalWindow,
            storageRoot: _storageRoot,
            performancePointer: _performancePointer,
            createdAt: block.timestamp,
            creator: msg.sender,
            isActive: true
        });

        emit StrategyRegistered(
            newTokenId,
            msg.sender,
            _codeHash,
            _paramsHash,
            _datasetVersion,
            _evalWindow,
            _storageRoot,
            _performancePointer
        );
        return newTokenId;
    }

    function getStrategy(uint256 tokenId) external view returns (Strategy memory) {
        require(_ownerOf(tokenId) != address(0), "Strategy does not exist");
        return strategies[tokenId];
    }

    function totalStrategies() external view returns (uint256) {
        return _tokenIds;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

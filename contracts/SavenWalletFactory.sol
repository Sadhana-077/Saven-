// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./SavenWalletProxy.sol";

contract SavenWalletFactory {

    address public immutable implementation;

    address[] public wallets;

    mapping(address => address[]) public walletsOf;

    event WalletCreated(
        address indexed wallet,
        address indexed owner,
        address implementation
    );

    constructor(
        address _implementation
    ) {
        require(
            _implementation != address(0),
            "Invalid implementation"
        );

        implementation = _implementation;
    }

    function createWallet(
        address[] calldata _owners,
        uint256 _threshold,
        address _recoveryAddress,
        uint256 _recoveryDelay
    )
        external
        returns (address wallet)
    {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address[],uint256,address,uint256)",
            _owners,
            _threshold,
            _recoveryAddress,
            _recoveryDelay
        );

        SavenWalletProxy proxy =
            new SavenWalletProxy(
                implementation,
                data
            );

        wallet = address(proxy);

        wallets.push(wallet);

        for (uint256 i = 0; i < _owners.length; i++) {
            walletsOf[_owners[i]].push(wallet);
        }

        emit WalletCreated(
            wallet,
            _owners[0],
            implementation
        );
    }

    function getWalletCount()
        external
        view
        returns (uint256)
    {
        return wallets.length;
    }

    function getWallets()
        external
        view
        returns (address[] memory)
    {
        return wallets;
    }

    function getWalletsOf(
        address _owner
    )
        external
        view
        returns (address[] memory)
    {
        return walletsOf[_owner];
    }
}
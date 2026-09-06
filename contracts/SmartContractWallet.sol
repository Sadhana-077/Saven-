// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SmartContractWallet {
    address public owner;

    event EtherReceived(address indexed from, uint256 amount);
    event EtherSent(
        address indexed to,
        uint256 amount
    );

    constructor(address _owner) {
        require(_owner != address(0), "Invalid owner");
        owner = _owner;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    receive() external payable {
        emit EtherReceived(msg.sender, msg.value);
    }

    function sendEther(
        address payable _to,
        uint256 _amount
    ) external onlyOwner {
        require(_to != address(0), "Invalid recipient");
        require(
            address(this).balance >= _amount,
            "Insufficient balance"
        );

        (bool success, ) = _to.call{value: _amount}("");
        require(success, "Transfer failed");

        emit EtherSent(_to, _amount);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
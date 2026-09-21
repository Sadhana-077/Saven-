// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SavenWallet {

    struct Transaction {
        address target;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmations;
    }

    struct BatchTransaction {
        address[] targets;
        uint256[] values;
        bytes[] data;
        bool executed;
        uint256 confirmations;
    }

    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public threshold;

    Transaction[] public transactions;
    mapping(uint256 => mapping(address => bool)) public approved;

    BatchTransaction[] public batchTransactions;
    mapping(uint256 => mapping(address => bool)) public batchApproved;

    mapping(address => bool) public isSpender;
    mapping(address => uint256) public spenderDailyLimit;
    mapping(address => uint256) public spenderSpentToday;
    mapping(address => uint256) public spenderLastReset;

    address public recoveryAddress;
    uint256 public recoveryDelay;
    address public pendingRecoveryOwner;
    uint256 public recoveryExecuteAfter;

    bool public initialized;

    event EtherReceived(address indexed from, uint256 amount);
    event EtherSent(address indexed to, uint256 amount);

    event TransactionSubmitted(
        uint256 indexed transactionId,
        address indexed target,
        uint256 value,
        bytes data
    );

    event TransactionApproved(
        uint256 indexed transactionId,
        address indexed owner
    );

    event TransactionRevoked(
        uint256 indexed transactionId,
        address indexed owner
    );

    event TransactionExecuted(uint256 indexed transactionId);

    event BatchTransactionSubmitted(uint256 indexed transactionId);

    event BatchTransactionApproved(
        uint256 indexed transactionId,
        address indexed owner
    );

    event BatchTransactionRevoked(
        uint256 indexed transactionId,
        address indexed owner
    );

    event BatchTransactionExecuted(uint256 indexed transactionId);

    event OwnerAdded(address indexed owner);
    event OwnerRemoved(address indexed owner);
    event ThresholdChanged(uint256 threshold);

    event SpenderConfigured(
        address indexed spender,
        bool enabled,
        uint256 dailyLimit
    );

    event SpenderTransfer(
        address indexed spender,
        address indexed to,
        uint256 amount
    );

    event RecoveryStarted(
        address indexed newOwner,
        uint256 executeAfter
    );

    event RecoveryCancelled();

    event RecoveryExecuted(address indexed newOwner);

    event RecoveryAddressChanged(
        address indexed recoveryAddress
    );

    event RecoveryDelayChanged(uint256 delay);

    modifier onlyOwner() {
        require(isOwner[msg.sender], "Not an owner");
        _;
    }

    modifier onlySelf() {
        require(msg.sender == address(this), "Only wallet can call");
        _;
    }

    function initialize(
        address[] memory _owners,
        uint256 _threshold,
        address _recoveryAddress,
        uint256 _recoveryDelay
    ) external {
        require(!initialized, "Already initialized");

        require(
            _owners.length > 0,
            "Owners required"
        );

        require(
            _threshold > 0 &&
            _threshold <= _owners.length,
            "Invalid threshold"
        );

        require(
            _recoveryAddress != address(0),
            "Invalid recovery address"
        );

        require(
            _recoveryDelay > 0,
            "Invalid recovery delay"
        );

        for (uint256 i = 0; i < _owners.length; i++) {

            address owner = _owners[i];

            require(
                owner != address(0),
                "Invalid owner"
            );

            require(
                !isOwner[owner],
                "Duplicate owner"
            );

            isOwner[owner] = true;
            owners.push(owner);
        }

        threshold = _threshold;
        recoveryAddress = _recoveryAddress;
        recoveryDelay = _recoveryDelay;

        initialized = true;
    }

    receive() external payable {
        emit EtherReceived(
            msg.sender,
            msg.value
        );
    }

    function getBalance()
        external
        view
        returns (uint256)
    {
        return address(this).balance;
    }

    function submitTransaction(
        address _target,
        uint256 _value,
        bytes calldata _data
    )
        external
        onlyOwner
        returns (uint256 transactionId)
    {
        require(
            _target != address(0),
            "Invalid target"
        );

        transactionId = transactions.length;

        transactions.push(
            Transaction({
                target: _target,
                value: _value,
                data: _data,
                executed: false,
                confirmations: 0
            })
        );

        emit TransactionSubmitted(
            transactionId,
            _target,
            _value,
            _data
        );
    }

    function approveTransaction(
        uint256 _transactionId
    )
        external
        onlyOwner
    {
        require(
            _transactionId < transactions.length,
            "Invalid transaction"
        );

        Transaction storage transaction =
            transactions[_transactionId];

        require(
            !transaction.executed,
            "Already executed"
        );

        require(
            !approved[_transactionId][msg.sender],
            "Already approved"
        );

        approved[_transactionId][msg.sender] = true;
        transaction.confirmations += 1;

        emit TransactionApproved(
            _transactionId,
            msg.sender
        );
    }

    function revokeApproval(
        uint256 _transactionId
    )
        external
        onlyOwner
    {
        require(
            _transactionId < transactions.length,
            "Invalid transaction"
        );

        Transaction storage transaction =
            transactions[_transactionId];

        require(
            !transaction.executed,
            "Already executed"
        );

        require(
            approved[_transactionId][msg.sender],
            "Not approved"
        );

        approved[_transactionId][msg.sender] = false;
        transaction.confirmations -= 1;

        emit TransactionRevoked(
            _transactionId,
            msg.sender
        );
    }

    function simulateTransaction(
        address _target,
        uint256 _value,
        bytes calldata _data
    )
        external
        view
        returns (
            bool success,
            bytes memory result
        )
    {
        require(
            _target != address(0),
            "Invalid target"
        );

        require(
            address(this).balance >= _value,
            "Insufficient balance"
        );

        (
            success,
            result
        ) = _target.staticcall(_data);
    }

    function executeTransaction(
        uint256 _transactionId
    )
        external
        onlyOwner
    {
        require(
            _transactionId < transactions.length,
            "Invalid transaction"
        );

        Transaction storage transaction =
            transactions[_transactionId];

        require(
            !transaction.executed,
            "Already executed"
        );

        require(
            transaction.confirmations >= threshold,
            "Threshold not reached"
        );

        require(
            address(this).balance >= transaction.value,
            "Insufficient balance"
        );

        transaction.executed = true;

        (
            bool success,
        ) = transaction.target.call{
            value: transaction.value
        }(
            transaction.data
        );

        require(
            success,
            "Transaction failed"
        );

        emit TransactionExecuted(
            _transactionId
        );

        if (transaction.data.length == 0) {
            emit EtherSent(
                transaction.target,
                transaction.value
            );
        }
    }

    function submitBatchTransaction(
        address[] calldata _targets,
        uint256[] calldata _values,
        bytes[] calldata _data
    )
        external
        onlyOwner
        returns (uint256 transactionId)
    {
        require(
            _targets.length > 0,
            "Empty batch"
        );

        require(
            _targets.length == _values.length,
            "Length mismatch"
        );

        require(
            _targets.length == _data.length,
            "Length mismatch"
        );

        for (uint256 i = 0; i < _targets.length; i++) {
            require(
                _targets[i] != address(0),
                "Invalid target"
            );
        }

        transactionId = batchTransactions.length;

        batchTransactions.push();

        BatchTransaction storage batch =
            batchTransactions[transactionId];

        for (uint256 i = 0; i < _targets.length; i++) {
            batch.targets.push(_targets[i]);
            batch.values.push(_values[i]);
            batch.data.push(_data[i]);
        }

        emit BatchTransactionSubmitted(
            transactionId
        );
    }

    function approveBatchTransaction(
        uint256 _transactionId
    )
        external
        onlyOwner
    {
        require(
            _transactionId < batchTransactions.length,
            "Invalid batch"
        );

        BatchTransaction storage batch =
            batchTransactions[_transactionId];

        require(
            !batch.executed,
            "Already executed"
        );

        require(
            !batchApproved[_transactionId][msg.sender],
            "Already approved"
        );

        batchApproved[_transactionId][msg.sender] = true;
        batch.confirmations += 1;

        emit BatchTransactionApproved(
            _transactionId,
            msg.sender
        );
    }

    function revokeBatchApproval(
        uint256 _transactionId
    )
        external
        onlyOwner
    {
        require(
            _transactionId < batchTransactions.length,
            "Invalid batch"
        );

        BatchTransaction storage batch =
            batchTransactions[_transactionId];

        require(
            !batch.executed,
            "Already executed"
        );

        require(
            batchApproved[_transactionId][msg.sender],
            "Not approved"
        );

        batchApproved[_transactionId][msg.sender] = false;
        batch.confirmations -= 1;

        emit BatchTransactionRevoked(
            _transactionId,
            msg.sender
        );
    }

    function simulateBatchTransaction(
        uint256 _transactionId
    )
        external
        view
        returns (
            bool success,
            uint256 failedIndex,
            bytes memory result
        )
    {
        require(
            _transactionId < batchTransactions.length,
            "Invalid batch"
        );

        BatchTransaction storage batch =
            batchTransactions[_transactionId];

        uint256 totalValue;

        for (uint256 i = 0; i < batch.values.length; i++) {
            totalValue += batch.values[i];
        }

        require(
            address(this).balance >= totalValue,
            "Insufficient balance"
        );

        for (uint256 i = 0; i < batch.targets.length; i++) {

            (
                bool callSuccess,
                bytes memory callResult
            ) = batch.targets[i].staticcall(
                batch.data[i]
            );

            if (!callSuccess) {
                return (
                    false,
                    i,
                    callResult
                );
            }
        }

        return (
            true,
            0,
            ""
        );
    }

    function executeBatchTransaction(
        uint256 _transactionId
    )
        external
        onlyOwner
    {
        require(
            _transactionId < batchTransactions.length,
            "Invalid batch"
        );

        BatchTransaction storage batch =
            batchTransactions[_transactionId];

        require(
            !batch.executed,
            "Already executed"
        );

        require(
            batch.confirmations >= threshold,
            "Threshold not reached"
        );

        uint256 totalValue;

        for (uint256 i = 0; i < batch.values.length; i++) {
            totalValue += batch.values[i];
        }

        require(
            address(this).balance >= totalValue,
            "Insufficient balance"
        );

        batch.executed = true;

        for (uint256 i = 0; i < batch.targets.length; i++) {

            (
                bool success,
            ) = batch.targets[i].call{
                value: batch.values[i]
            }(
                batch.data[i]
            );

            require(
                success,
                "Batch transaction failed"
            );

            if (batch.data[i].length == 0) {
                emit EtherSent(
                    batch.targets[i],
                    batch.values[i]
                );
            }
        }

        emit BatchTransactionExecuted(
            _transactionId
        );
    }

    function addOwner(
        address _owner
    )
        external
        onlySelf
    {
        require(
            _owner != address(0),
            "Invalid owner"
        );

        require(
            !isOwner[_owner],
            "Already owner"
        );

        isOwner[_owner] = true;
        owners.push(_owner);

        emit OwnerAdded(_owner);
    }

    function removeOwner(
        address _owner
    )
        external
        onlySelf
    {
        require(
            isOwner[_owner],
            "Not an owner"
        );

        require(
            owners.length > 1,
            "Cannot remove last owner"
        );

        require(
            threshold <= owners.length - 1,
            "Threshold too high"
        );

        isOwner[_owner] = false;

        for (uint256 i = 0; i < owners.length; i++) {

            if (owners[i] == _owner) {

                owners[i] =
                    owners[owners.length - 1];

                owners.pop();

                break;
            }
        }

        emit OwnerRemoved(_owner);
    }

    function changeThreshold(
        uint256 _threshold
    )
        external
        onlySelf
    {
        require(
            _threshold > 0 &&
            _threshold <= owners.length,
            "Invalid threshold"
        );

        threshold = _threshold;

        emit ThresholdChanged(
            _threshold
        );
    }

    function getOwners()
        external
        view
        returns (address[] memory)
    {
        return owners;
    }

    function configureSpender(
        address _spender,
        bool _enabled,
        uint256 _dailyLimit
    )
        external
        onlySelf
    {
        require(
            _spender != address(0),
            "Invalid spender"
        );

        isSpender[_spender] = _enabled;

        spenderDailyLimit[_spender] =
            _enabled
                ? _dailyLimit
                : 0;

        if (!_enabled) {
            spenderSpentToday[_spender] = 0;
            spenderLastReset[_spender] = 0;
        }

        emit SpenderConfigured(
            _spender,
            _enabled,
            _dailyLimit
        );
    }

    function spend(
        address payable _to,
        uint256 _amount
    )
        external
    {
        require(
            isSpender[msg.sender],
            "Not an authorized spender"
        );

        require(
            _to != address(0),
            "Invalid recipient"
        );

        require(
            address(this).balance >= _amount,
            "Insufficient balance"
        );

        _resetSpenderIfNeeded(msg.sender);

        uint256 limit =
            spenderDailyLimit[msg.sender];

        require(
            spenderSpentToday[msg.sender] + _amount <= limit,
            "Daily limit exceeded"
        );

        spenderSpentToday[msg.sender] += _amount;

        (
            bool success,
        ) = _to.call{
            value: _amount
        }("");

        require(
            success,
            "Transfer failed"
        );

        emit EtherSent(
            _to,
            _amount
        );

        emit SpenderTransfer(
            msg.sender,
            _to,
            _amount
        );
    }

    function _resetSpenderIfNeeded(
        address _spender
    )
        internal
    {
        if (
            block.timestamp >=
            spenderLastReset[_spender] + 1 days
        ) {
            spenderSpentToday[_spender] = 0;

            spenderLastReset[_spender] =
                block.timestamp;
        }
    }

    function getSpenderRemainingLimit(
        address _spender
    )
        external
        view
        returns (uint256)
    {
        if (!isSpender[_spender]) {
            return 0;
        }

        if (
            block.timestamp >=
            spenderLastReset[_spender] + 1 days
        ) {
            return spenderDailyLimit[_spender];
        }

        uint256 spent =
            spenderSpentToday[_spender];

        uint256 limit =
            spenderDailyLimit[_spender];

        return spent >= limit
            ? 0
            : limit - spent;
    }

    function setRecoveryAddress(
        address _recoveryAddress
    )
        external
        onlySelf
    {
        require(
            _recoveryAddress != address(0),
            "Invalid recovery address"
        );

        recoveryAddress =
            _recoveryAddress;

        emit RecoveryAddressChanged(
            _recoveryAddress
        );
    }

    function setRecoveryDelay(
        uint256 _recoveryDelay
    )
        external
        onlySelf
    {
        require(
            _recoveryDelay > 0,
            "Invalid recovery delay"
        );

        recoveryDelay =
            _recoveryDelay;

        emit RecoveryDelayChanged(
            _recoveryDelay
        );
    }

    function initiateRecovery(
        address _newOwner
    )
        external
    {
        require(
            msg.sender == recoveryAddress,
            "Not recovery address"
        );

        require(
            _newOwner != address(0),
            "Invalid new owner"
        );

        require(
            !isOwner[_newOwner],
            "Already owner"
        );

        pendingRecoveryOwner =
            _newOwner;

        recoveryExecuteAfter =
            block.timestamp + recoveryDelay;

        emit RecoveryStarted(
            _newOwner,
            recoveryExecuteAfter
        );
    }

    function cancelRecovery()
        external
        onlyOwner
    {
        pendingRecoveryOwner =
            address(0);

        recoveryExecuteAfter = 0;

        emit RecoveryCancelled();
    }

    function executeRecovery()
        external
    {
        require(
            pendingRecoveryOwner != address(0),
            "No recovery pending"
        );

        require(
            block.timestamp >= recoveryExecuteAfter,
            "Recovery delay active"
        );

        address newOwner =
            pendingRecoveryOwner;

        for (uint256 i = 0; i < owners.length; i++) {
            isOwner[owners[i]] = false;
        }

        delete owners;

        owners.push(newOwner);

        isOwner[newOwner] = true;

        threshold = 1;

        pendingRecoveryOwner = address(0);
        recoveryExecuteAfter = 0;

        emit RecoveryExecuted(
            newOwner
        );
    }
}
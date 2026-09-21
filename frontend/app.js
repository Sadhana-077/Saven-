const CONTRACT_ADDRESS = "0x6339919840e0A0551927581C423E5De1007a4A96";
const SEPOLIA_CHAIN_ID = 11155111;

const CONTRACT_ABI = [
    "function getOwners() view returns (address[])",
    "function isOwner(address) view returns (bool)",
    "function threshold() view returns (uint256)",
    "function getBalance() view returns (uint256)",
    "function submitTransaction(address,uint256,bytes) returns (uint256)",
    "function approveTransaction(uint256)",
    "function revokeApproval(uint256)",
    "function executeTransaction(uint256)",
    "function transactions(uint256) view returns (address target,uint256 value,bytes data,bool executed,uint256 confirmations)",
    "function approved(uint256,address) view returns (bool)",
    "function submitBatchTransaction(address[],uint256[],bytes[]) returns (uint256)",
    "function approveBatchTransaction(uint256)",
    "function revokeBatchApproval(uint256)",
    "function executeBatchTransaction(uint256)",
    "function batchTransactions(uint256) view returns (bool executed,uint256 confirmations)",
    "function batchApproved(uint256,address) view returns (bool)",
    "function isSpender(address) view returns (bool)",
    "function spenderDailyLimit(address) view returns (uint256)",
    "function getSpenderRemainingLimit(address) view returns (uint256)",
    "function spend(address payable,uint256)",
    "function recoveryAddress() view returns (address)",
    "function recoveryDelay() view returns (uint256)",
    "function pendingRecoveryOwner() view returns (address)",
    "function recoveryExecuteAfter() view returns (uint256)",
    "function initiateRecovery(address)",
    "function cancelRecovery()",
    "function executeRecovery()",
    "function addOwner(address)",
    "function removeOwner(address)",
    "function changeThreshold(uint256)",
    "function configureSpender(address,bool,uint256)",
    "function simulateTransaction(address,uint256,bytes) view returns (bool,bytes)",

    "event TransactionSubmitted(uint256 indexed transactionId,address indexed target,uint256 value,bytes data)",
    "event TransactionApproved(uint256 indexed transactionId,address indexed owner)",
    "event TransactionRevoked(uint256 indexed transactionId,address indexed owner)",
    "event TransactionExecuted(uint256 indexed transactionId)",

    "event BatchTransactionSubmitted(uint256 indexed transactionId)",
    "event BatchTransactionApproved(uint256 indexed transactionId,address indexed owner)",
    "event BatchTransactionRevoked(uint256 indexed transactionId,address indexed owner)",
    "event BatchTransactionExecuted(uint256 indexed transactionId)",

    "event EtherReceived(address indexed from,uint256 amount)",
    "event EtherSent(address indexed to,uint256 amount)",
    "event OwnerAdded(address indexed owner)",
    "event OwnerRemoved(address indexed owner)",
    "event ThresholdChanged(uint256 threshold)",
    "event SpenderConfigured(address indexed spender,bool enabled,uint256 dailyLimit)",
    "event SpenderTransfer(address indexed spender,address indexed to,uint256 amount)",
    "event RecoveryStarted(address indexed newOwner,uint256 executeAfter)",
    "event RecoveryCancelled()",
    "event RecoveryExecuted(address indexed newOwner)"
];

let provider;
let signer;
let contract;
let account;
let owners = [];
let threshold = 1n;

const connectBtn = document.getElementById("connectBtn");
const toastContainer = document.getElementById("toastContainer");

const PENDING_STORAGE_KEY = "saven_pending_transactions";
const HISTORY_STORAGE_KEY = "saven_transaction_history";

function notify(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
}

function getError(error) {
    return (
        error?.shortMessage ||
        error?.reason ||
        error?.info?.error?.message ||
        error?.message ||
        "Transaction failed"
    );
}

function requireWallet() {
    if (!contract || !signer || !account) {
        throw new Error("Connect wallet first");
    }
}

function requireOwner() {
    if (!owners.some(owner => owner.toLowerCase() === account.toLowerCase())) {
        throw new Error("Connected wallet is not an owner");
    }
}

function shortAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatEth(value) {
    return Number(ethers.formatEther(value)).toFixed(5);
}

function formatTime(timestamp) {
    return new Date(Number(timestamp) * 1000).toLocaleString();
}

async function getCurrentChainId() {
    const network = await provider.getNetwork();
    return Number(network.chainId);
}


/* =========================
   LOCAL PENDING STORAGE
========================= */

function getStoredPendingTransactions() {
    try {
        const stored = localStorage.getItem(PENDING_STORAGE_KEY);

        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored);

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed;
    } catch {
        return [];
    }
}

function savePendingTransaction(type, id) {
    const pending = getStoredPendingTransactions();

    const exists = pending.some(
        item => item.type === type && String(item.id) === String(id)
    );

    if (!exists) {
        pending.push({
            type,
            id: String(id)
        });

        localStorage.setItem(
            PENDING_STORAGE_KEY,
            JSON.stringify(pending)
        );
    }
}

function removePendingTransaction(type, id) {
    const pending = getStoredPendingTransactions();

    const updated = pending.filter(
        item =>
            !(
                item.type === type &&
                String(item.id) === String(id)
            )
    );

    localStorage.setItem(
        PENDING_STORAGE_KEY,
        JSON.stringify(updated)
    );
}

function getStoredHistory() {
    try {
        const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : [];

        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveHistoryItem(item) {
    const history = getStoredHistory();
    const exists = history.some(
        entry => entry.type === item.type && String(entry.id) === String(item.id)
    );

    if (!exists) {
        history.push(item);
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    }
}

async function queryWalletEvents(filter) {
    try {
        return await contract.queryFilter(filter);
    } catch (error) {
        console.log("Could not load wallet events", error);
        return [];
    }
}


/* =========================
   CONNECT WALLET
========================= */

async function connectWallet() {
    try {
        if (!window.ethereum) {
            throw new Error("MetaMask is not installed");
        }

        provider = new ethers.BrowserProvider(window.ethereum);

        await provider.send("eth_requestAccounts", []);

        signer = await provider.getSigner();
        account = await signer.getAddress();

        const chainId = await getCurrentChainId();

        if (chainId !== SEPOLIA_CHAIN_ID) {
            connectBtn.textContent = shortAddress(account);

            notify(
                "Switch MetaMask to Sepolia to use this Saven wallet"
            );

            return;
        }

        contract = new ethers.Contract(
            CONTRACT_ADDRESS,
            CONTRACT_ABI,
            signer
        );

        owners = await contract.getOwners();
        threshold = await contract.threshold();

        connectBtn.textContent = shortAddress(account);
        connectBtn.title = account;

        await updateWallet();
        await refreshPendingTransactions();
        await renderHistory();

        const owner = await contract.isOwner(account);
        const spender = await contract.isSpender(account);

        const recovery =
            (
                await contract.recoveryAddress()
            ).toLowerCase() === account.toLowerCase();

        if (owner) {
            notify(
                `Connected as owner · ${shortAddress(account)}`
            );
        } else if (spender) {
            notify(
                `Connected as spender · ${shortAddress(account)}`
            );
        } else if (recovery) {
            notify(
                `Connected as recovery address · ${shortAddress(account)}`
            );
        } else {
            notify(
                `Connected · ${shortAddress(account)}`
            );
        }

    } catch (error) {
        notify(getError(error));
    }
}


/* =========================
   WALLET
========================= */

async function updateWallet() {
    requireWallet();

    const balance = await contract.getBalance();

    document.getElementById("balance").textContent =
        formatEth(balance);

    owners = await contract.getOwners();
    threshold = await contract.threshold();

    document.getElementById("ownerCount").textContent =
        owners.length;

    document.getElementById("thresholdValue").textContent =
        threshold.toString();

    const ownersList =
        document.getElementById("ownersList");

    ownersList.innerHTML = owners
        .map(
            (owner, index) =>
                `<div class="owner-item">${index + 1}. ${owner}</div>`
        )
        .join("");

    await loadRecovery();
}

async function loadRecovery() {
    const recovery = await contract.recoveryAddress();
    const delay = await contract.recoveryDelay();
    const pending = await contract.pendingRecoveryOwner();
    const executeAfter = await contract.recoveryExecuteAfter();

    document.getElementById("recoveryAddress").textContent =
        recovery;

    document.getElementById("recoveryDelay").textContent =
        `${Number(delay) / 86400} day(s)`;

    document.getElementById("pendingRecoveryOwner").textContent =
        pending === ethers.ZeroAddress ? "None" : pending;

    document.getElementById("recoveryExecuteAfter").textContent =
        executeAfter === 0n
            ? "Not pending"
            : formatTime(executeAfter);
}


/* =========================
   SINGLE TRANSACTION
========================= */

async function submitOwnerTransaction(target, value, data) {
    requireWallet();
    requireOwner();

    const id =
        await contract.submitTransaction.staticCall(
            target,
            value,
            data
        );

    const tx =
        await contract.submitTransaction(
            target,
            value,
            data
        );

    await tx.wait();

    const transactionId = id.toString();

    savePendingTransaction(
        "single",
        transactionId
    );

    const approval =
        await contract.approveTransaction(id);

    await approval.wait();

    return id;
}

async function maybeExecuteTransaction(id) {
    savePendingTransaction(
        "single",
        id.toString()
    );

    return null;
}


/* =========================
   SEND ETH
========================= */

async function sendEther() {
    try {
        requireWallet();
        requireOwner();

        const recipient =
            document.getElementById("recipient").value.trim();

        const amount =
            document.getElementById("amount").value.trim();

        if (!ethers.isAddress(recipient)) {
            throw new Error("Invalid recipient address");
        }

        if (!amount || Number(amount) <= 0) {
            throw new Error("Enter a valid amount");
        }

        const value =
            ethers.parseEther(amount);

        const balance =
            await contract.getBalance();

        if (balance < value) {
            throw new Error("Insufficient wallet balance");
        }

        notify(
            "Submitting transaction for owner approval"
        );

        const id =
            await submitOwnerTransaction(
                recipient,
                value,
                "0x"
            );

        const hash =
            await maybeExecuteTransaction(id);

        if (hash) {
            notify(
                "Transaction executed successfully"
            );
        } else {
            notify(
                `Transaction pending · ${id}`
            );
        }

        document.getElementById("recipient").value = "";
        document.getElementById("amount").value = "";

        await updateWallet();
        await refreshPendingTransactions();
        await renderHistory();

    } catch (error) {
        notify(getError(error));
    }
}


/* =========================
   SELF TRANSACTION
========================= */

async function submitSelfCall(functionName, args) {
    requireWallet();
    requireOwner();

    const data =
        contract.interface.encodeFunctionData(
            functionName,
            args
        );

    const id =
        await submitOwnerTransaction(
            CONTRACT_ADDRESS,
            0n,
            data
        );

    const hash =
        await maybeExecuteTransaction(id);

    return {
        id,
        hash
    };
}

async function addOwner() {
    try {
        const newOwner =
            document.getElementById("newOwner").value.trim();

        if (!ethers.isAddress(newOwner)) {
            throw new Error("Invalid owner address");
        }

        const result =
            await submitSelfCall(
                "addOwner",
                [newOwner]
            );

        notify(
            result.hash
                ? "Owner added successfully"
                : `Owner addition is pending · ${result.id}`
        );

        await updateWallet();
        await refreshPendingTransactions();

    } catch (error) {
        notify(getError(error));
    }
}

async function removeOwner() {
    try {
        const owner =
            document
                .getElementById("removeOwnerAddress")
                .value
                .trim();

        if (!ethers.isAddress(owner)) {
            throw new Error("Invalid owner address");
        }

        const result =
            await submitSelfCall(
                "removeOwner",
                [owner]
            );

        notify(
            result.hash
                ? "Owner removed successfully"
                : `Owner removal is pending · ${result.id}`
        );

        await updateWallet();
        await refreshPendingTransactions();

    } catch (error) {
        notify(getError(error));
    }
}

async function changeThreshold() {
    try {
        const value =
            Number(
                document
                    .getElementById("newThreshold")
                    .value
            );

        if (
            !Number.isInteger(value) ||
            value < 1
        ) {
            throw new Error("Invalid threshold");
        }

        if (value > owners.length) {
            throw new Error(
                `Threshold cannot exceed ${owners.length} owners`
            );
        }

        const result =
            await submitSelfCall(
                "changeThreshold",
                [value]
            );

        notify(
            result.hash
                ? "Threshold updated"
                : `Threshold change is pending · ${result.id}`
        );

        await updateWallet();
        await refreshPendingTransactions();

    } catch (error) {
        notify(getError(error));
    }
}


/* =========================
   GET SINGLE PENDING
========================= */

async function getPendingSingleTransactions() {
    if (!contract) {
        return [];
    }

    const unique = new Map();

    /* First try blockchain event logs */

    try {
        const logs =
            await queryWalletEvents(
                contract.filters.TransactionSubmitted()
            );

        for (const log of logs) {
            const id =
                Number(log.args.transactionId);

            unique.set(id, {
                id,
                blockNumber: log.blockNumber,
                transactionHash: log.transactionHash
            });
        }
    } catch (error) {
        console.log(
            "Could not load TransactionSubmitted events",
            error
        );
    }

    /* Then use localStorage */

    const stored =
        getStoredPendingTransactions();

    for (const item of stored) {
        if (item.type !== "single") {
            continue;
        }

        const id =
            Number(item.id);

        if (!unique.has(id)) {
            unique.set(id, {
                id,
                blockNumber: 0,
                transactionHash: ""
            });
        }
    }

    const pending = [];

    for (const [id, info] of unique) {
        try {
            const transaction =
                await contract.transactions(id);

            if (!transaction.executed) {
                pending.push({
                    type: "single",
                    id,
                    target: transaction.target,
                    value: transaction.value,
                    confirmations:
                        Number(transaction.confirmations),
                    data: transaction.data,
                    blockNumber:
                        info.blockNumber,
                    transactionHash:
                        info.transactionHash
                });
            } else {
                removePendingTransaction(
                    "single",
                    id
                );
            }
        } catch (error) {
            console.log(
                `Unable to read transaction ${id}`,
                error
            );
        }
    }

    return pending;
}


/* =========================
   GET BATCH PENDING
========================= */

async function getPendingBatchTransactions() {
    if (!contract) {
        return [];
    }

    const unique = new Map();

    try {
        const logs =
            await queryWalletEvents(
                contract.filters.BatchTransactionSubmitted()
            );

        for (const log of logs) {
            const id =
                Number(log.args.transactionId);

            unique.set(id, {
                id,
                blockNumber: log.blockNumber,
                transactionHash:
                    log.transactionHash
            });
        }
    } catch (error) {
        console.log(
            "Could not load batch events",
            error
        );
    }

    const stored =
        getStoredPendingTransactions();

    for (const item of stored) {
        if (item.type !== "batch") {
            continue;
        }

        const id =
            Number(item.id);

        if (!unique.has(id)) {
            unique.set(id, {
                id,
                blockNumber: 0,
                transactionHash: ""
            });
        }
    }

    const pending = [];

    for (const [id, info] of unique) {
        try {
            const batch =
                await contract.batchTransactions(id);

            if (!batch.executed) {
                pending.push({
                    type: "batch",
                    id,
                    confirmations:
                        Number(batch.confirmations),
                    blockNumber:
                        info.blockNumber,
                    transactionHash:
                        info.transactionHash
                });
            } else {
                removePendingTransaction(
                    "batch",
                    id
                );
            }
        } catch (error) {
            console.log(
                `Unable to read batch ${id}`,
                error
            );
        }
    }

    return pending;
}


/* =========================
   APPROVALS
========================= */

async function getApprovals(id, type) {
    const result = [];

    for (const owner of owners) {
        const signed =
            type === "batch"
                ? await contract.batchApproved(
                    id,
                    owner
                )
                : await contract.approved(
                    id,
                    owner
                );

        result.push({
            owner,
            signed
        });
    }

    return result;
}


/* =========================
   PENDING CARD
========================= */

function pendingCard(transaction) {
    const percentage =
        threshold === 0n
            ? 0
            : Math.min(
                100,
                Math.round(
                    (
                        transaction.confirmations /
                        Number(threshold)
                    ) * 100
                )
            );

    const amount =
        transaction.type === "single"
            ? `${formatEth(transaction.value)} ETH`
            : "Multiple transfers";

    const target =
        transaction.type === "single"
            ? transaction.target
            : "Multiple recipients";

    return `
        <div
            class="transaction-card clickable"
            data-pending-type="${transaction.type}"
            data-pending-id="${transaction.id}"
        >
            <div class="transaction-top">
                <strong>
                    ${
                        transaction.type === "single"
                            ? "ETH Transfer"
                            : "Batch Transfer"
                    }
                </strong>

                <span class="transaction-amount">
                    ${amount}
                </span>
            </div>

            <div class="transaction-address">
                ${target}
            </div>

            <div class="approval-row">
                <span>
                    ${transaction.confirmations}/${threshold.toString()}
                    owners signed
                </span>

                <span>
                    Pending
                </span>
            </div>

            <div class="approval-bar">
                <div
                    class="approval-fill"
                    style="width:${percentage}%"
                ></div>
            </div>
        </div>
    `;
}


/* =========================
   REFRESH PENDING
========================= */

async function refreshPendingTransactions() {
    if (!contract) {
        return;
    }

    try {
        const [
            single,
            batch
        ] = await Promise.all([
            getPendingSingleTransactions(),
            getPendingBatchTransactions()
        ]);

        const pending =
            [...single, ...batch].sort(
                (a, b) =>
                    b.blockNumber -
                    a.blockNumber
            );

        const container =
            document.getElementById(
                "pendingTransactions"
            );

        if (pending.length === 0) {
            container.innerHTML = `
                <div class="empty-history">
                    <h3>No pending transactions</h3>
                    <p>
                        Transactions below the approval
                        threshold stay here.
                    </p>
                </div>
            `;

            return;
        }

        container.innerHTML =
            pending
                .map(pendingCard)
                .join("");

        container
            .querySelectorAll(
                "[data-pending-id]"
            )
            .forEach(card => {
                card.addEventListener(
                    "click",
                    () =>
                        openPendingDetails(
                            card.dataset.pendingType,
                            Number(
                                card.dataset.pendingId
                            )
                        )
                );
            });

    } catch (error) {
        console.log(
            "Pending transaction refresh error",
            error
        );
    }
}


/* =========================
   PENDING DETAILS
========================= */

async function openPendingDetails(type, id) {
    try {
        const approvals =
            await getApprovals(
                id,
                type
            );

        const signedCount =
            approvals.filter(
                item => item.signed
            ).length;

        let transaction;

        if (type === "single") {
            transaction =
                await contract.transactions(id);
        } else {
            transaction =
                await contract.batchTransactions(id);
        }

        const title =
            type === "single"
                ? `Transaction ${id}`
                : `Batch Transaction ${id}`;

        document.getElementById(
            "modalTitle"
        ).textContent = title;

        let batchDetails = "";

        if (type === "batch") {
            try {
                const logs =
                        await queryWalletEvents(
                        contract.filters.BatchTransactionSubmitted()
                    );

                const log =
                    logs.find(
                        item =>
                            Number(
                                item.args.transactionId
                            ) === id
                    );

                if (log) {
                    const submittedTx =
                        await provider.getTransaction(
                            log.transactionHash
                        );

                    if (submittedTx) {
                        const parsed =
                            contract.interface.parseTransaction({
                                data: submittedTx.data,
                                value: submittedTx.value
                            });

                        const recipients =
                            parsed?.args?.[0] || [];

                        const values =
                            parsed?.args?.[1] || [];

                        batchDetails =
                            recipients
                                .map(
                                    (recipient, index) =>
                                        `
                                        <div class="detail-row">
                                            <span>
                                                Transfer ${index + 1}
                                            </span>

                                            <strong>
                                                ${recipient}
                                                ·
                                                ${formatEth(
                                                    values[index]
                                                )} ETH
                                            </strong>
                                        </div>
                                        `
                                )
                                .join("");
                    }
                }
            } catch (error) {
                console.log(
                    "Batch details error",
                    error
                );
            }
        }

        const signers =
            approvals
                .map(
                    item =>
                        `
                        <div class="signer-row">
                            <span>${item.owner}</span>

                            <strong
                                class="${
                                    item.signed
                                        ? "signed"
                                        : "not-signed"
                                }"
                            >
                                ${
                                    item.signed
                                        ? "Signed"
                                        : "Not signed"
                                }
                            </strong>
                        </div>
                        `
                )
                .join("");

        const details =
            type === "single"
                ? `
                    <div class="detail-row">
                        <span>Recipient</span>
                        <strong>
                            ${transaction.target}
                        </strong>
                    </div>

                    <div class="detail-row">
                        <span>Amount</span>
                        <strong>
                            ${formatEth(transaction.value)} ETH
                        </strong>
                    </div>
                `
                : `
                    <div class="detail-row">
                        <span>Type</span>
                        <strong>
                            Batch transfer
                        </strong>
                    </div>

                    ${batchDetails}
                `;

        const canApprove =
            await contract.isOwner(account);

        const alreadySigned =
            approvals.some(
                item =>
                    item.owner.toLowerCase() ===
                    account.toLowerCase() &&
                    item.signed
            );

        const thresholdReached =
            signedCount >= Number(threshold);

        document.getElementById(
            "modalContent"
        ).innerHTML = `
            ${details}

            <div class="detail-row">
                <span>Approvals</span>
                <strong>
                    ${signedCount}/${threshold.toString()}
                </strong>
            </div>

            <div class="detail-row">
                <span>Owners</span>
                <div>
                    ${signers}
                </div>
            </div>

            <div class="card-actions">

                <button
                    id="modalApproveBtn"
                    class="primary"
                    ${
                        !canApprove ||
                        alreadySigned
                            ? "disabled"
                            : ""
                    }
                >
                    ${
                        alreadySigned
                            ? "Already Signed"
                            : "Sign Transaction"
                    }
                </button>

                <button
                    id="modalExecuteBtn"
                    ${
                        !canApprove ||
                        !thresholdReached
                            ? "disabled"
                            : ""
                    }
                >
                    Execute
                </button>

            </div>
        `;

        document
            .getElementById(
                "modalApproveBtn"
            )
            .addEventListener(
                "click",
                () =>
                    approvePending(
                        type,
                        id
                    )
            );

        document
            .getElementById(
                "modalExecuteBtn"
            )
            .addEventListener(
                "click",
                () =>
                    executePending(
                        type,
                        id
                    )
            );

        document
            .getElementById(
                "transactionModal"
            )
            .classList.add("active");

    } catch (error) {
        notify(getError(error));
    }
}


/* =========================
   APPROVE PENDING
========================= */

async function approvePending(type, id) {
    try {
        requireWallet();
        requireOwner();

        const tx =
            type === "batch"
                ? await contract.approveBatchTransaction(id)
                : await contract.approveTransaction(id);

        await tx.wait();

        const state =
            type === "batch"
                ? await contract.batchTransactions(id)
                : await contract.transactions(id);

        savePendingTransaction(
            type,
            id
        );

        if (
            state.confirmations >= await contract.threshold()
        ) {
            notify(
                "2/2 signatures received · Ready to execute"
            );
        } else {
            notify(
                "Owner signature added"
            );
        }

        closeModal();

        await updateWallet();
        await refreshPendingTransactions();

    } catch (error) {

        console.log(
            "Approve pending error:",
            error
        );

        notify(getError(error));
    }
}


/* =========================
   EXECUTE PENDING
========================= */

async function executePending(type, id) {
    try {
        requireWallet();
        requireOwner();

        const state =
            type === "batch"
                ? await contract.batchTransactions(id)
                : await contract.transactions(id);

        if (
            state.confirmations <
            threshold
        ) {
            throw new Error(
                `Threshold not reached: ${state.confirmations}/${threshold}`
            );
        }

        const tx =
            type === "batch"
                ? await contract.executeBatchTransaction(id)
                : await contract.executeTransaction(id);

        const receipt = await tx.wait();

        saveHistoryItem({
            id: String(id),
            type: type === "batch" ? "Batch" : "Send",
            amount: type === "batch" ? "Batch transfer" : formatEth(state.value),
            to: type === "batch" ? "Multiple recipients" : state.target,
            hash: receipt.hash,
            block: receipt.blockNumber
        });

        removePendingTransaction(
            type,
            id
        );

        notify(
            "Transaction executed successfully"
        );

        closeModal();

        await updateWallet();
        await refreshPendingTransactions();
        await renderHistory();

    } catch (error) {
        notify(getError(error));
    }
}


/* =========================
   BATCH
========================= */

async function submitBatch() {
    try {
        requireWallet();
        requireOwner();

        const recipients =
            document
                .getElementById("batchRecipients")
                .value
                .split("\n")
                .map(item => item.trim())
                .filter(Boolean);

        const amounts =
            document
                .getElementById("batchAmounts")
                .value
                .split("\n")
                .map(item => item.trim())
                .filter(Boolean);

        if (
            recipients.length === 0 ||
            recipients.length !== amounts.length
        ) {
            throw new Error(
                "Recipients and amounts must match"
            );
        }

        if (
            recipients.some(
                recipient =>
                    !ethers.isAddress(recipient)
            )
        ) {
            throw new Error(
                "Invalid recipient address"
            );
        }

        const values =
            amounts.map(amount => {
                if (
                    !amount ||
                    Number(amount) <= 0
                ) {
                    throw new Error(
                        "Invalid batch amount"
                    );
                }

                return ethers.parseEther(
                    amount
                );
            });

        const total =
            values.reduce(
                (sum, value) =>
                    sum + value,
                0n
            );

        const balance =
            await contract.getBalance();

        if (balance < total) {
            throw new Error(
                "Insufficient wallet balance"
            );
        }

        const data =
            recipients.map(() => "0x");

        const id =
            await contract
                .submitBatchTransaction
                .staticCall(
                    recipients,
                    values,
                    data
                );

        const tx =
            await contract.submitBatchTransaction(
                recipients,
                values,
                data
            );

        await tx.wait();

        savePendingTransaction(
            "batch",
            id.toString()
        );

        const approval =
            await contract.approveBatchTransaction(
                id
            );

        await approval.wait();

        const batch =
            await contract.batchTransactions(id);

        notify(
            batch.confirmations >= threshold
                ? `Batch ready to execute · ${id}`
                : `Batch submitted · waiting for owner signatures · ${id}`
        );

        document.getElementById(
            "batchRecipients"
        ).value = "";

        document.getElementById(
            "batchAmounts"
        ).value = "";

        document.getElementById(
            "batchResult"
        ).textContent =
            `Batch created with ${recipients.length} transfer(s)`;

        await updateWallet();
        await refreshPendingTransactions();
        await renderHistory();

    } catch (error) {
        notify(getError(error));
    }
}


/* =========================
   SPENDING LIMIT
========================= */

async function configureSpender() {
    try {
        const spender =
            document
                .getElementById("spenderAddress")
                .value
                .trim();

        const limit =
            document
                .getElementById("spenderLimit")
                .value
                .trim();

        if (!ethers.isAddress(spender)) {
            throw new Error(
                "Invalid spender address"
            );
        }

        if (
            !limit ||
            Number(limit) < 0
        ) {
            throw new Error(
                "Enter a valid daily limit"
            );
        }

        const result =
            await submitSelfCall(
                "configureSpender",
                [
                    spender,
                    true,
                    ethers.parseEther(limit)
                ]
            );

        notify(
            result.hash
                ? "Spending limit configured"
                : `Spending limit change is pending · ${result.id}`
        );

        await refreshPendingTransactions();

    } catch (error) {
        notify(getError(error));
    }
}

async function checkSpender() {
    try {
        requireWallet();

        const spender =
            document
                .getElementById("spenderAddress")
                .value
                .trim();

        if (!ethers.isAddress(spender)) {
            throw new Error(
                "Invalid spender address"
            );
        }

        const remaining =
            await contract.getSpenderRemainingLimit(
                spender
            );

        document.getElementById(
            "spenderRemaining"
        ).textContent =
            `Remaining: ${ethers.formatEther(remaining)} ETH`;

    } catch (error) {
        notify(getError(error));
    }
}

async function spendEther() {
    try {
        requireWallet();

        const recipient =
            document
                .getElementById("spendRecipient")
                .value
                .trim();

        const amount =
            document
                .getElementById("spendAmount")
                .value
                .trim();

        if (!ethers.isAddress(recipient)) {
            throw new Error(
                "Invalid recipient address"
            );
        }

        if (
            !amount ||
            Number(amount) <= 0
        ) {
            throw new Error(
                "Enter a valid amount"
            );
        }

        const enabled =
            await contract.isSpender(
                account
            );

        if (!enabled) {
            throw new Error(
                "Connected wallet is not an authorized spender"
            );
        }

        const tx =
            await contract.spend(
                recipient,
                ethers.parseEther(amount)
            );

        await tx.wait();

        notify(
            "Spender transaction completed"
        );

        await updateWallet();
        await renderHistory();

    } catch (error) {
        notify(getError(error));
    }
}


/* =========================
   SIMULATION
========================= */

async function simulateTransaction() {
    try {
        requireWallet();

        const recipient =
            document
                .getElementById("simulationRecipient")
                .value
                .trim();

        const amount =
            document
                .getElementById("simulationAmount")
                .value
                .trim();

        if (!ethers.isAddress(recipient)) {
            throw new Error(
                "Invalid recipient address"
            );
        }

        if (
            !amount ||
            Number(amount) <= 0
        ) {
            throw new Error(
                "Enter a valid amount"
            );
        }

        const value =
            ethers.parseEther(amount);

        const balance =
            await contract.getBalance();

        if (balance < value) {
            document.getElementById(
                "simulationResult"
            ).textContent =
                "Simulation failed: insufficient wallet balance";

            return;
        }

        const result =
            await contract
                .simulateTransaction
                .staticCall(
                    recipient,
                    value,
                    "0x"
                );

        document.getElementById(
            "simulationResult"
        ).textContent =
            result[0]
                ? "Simulation successful"
                : `Simulation failed: ${ethers.toUtf8String(result[1] || "0x")}`;

    } catch (error) {
        document.getElementById(
            "simulationResult"
        ).textContent =
            `Simulation failed: ${getError(error)}`;
    }
}


/* =========================
   RECOVERY
========================= */

async function initiateRecovery() {
    try {
        requireWallet();

        const newOwner =
            document
                .getElementById("newRecoveryOwner")
                .value
                .trim();

        if (!ethers.isAddress(newOwner)) {
            throw new Error(
                "Invalid recovery owner address"
            );
        }

        const recovery =
            await contract.recoveryAddress();

        if (
            recovery.toLowerCase() !==
            account.toLowerCase()
        ) {
            throw new Error(
                "Only the configured recovery address can initiate recovery"
            );
        }

        const tx =
            await contract.initiateRecovery(
                newOwner
            );

        await tx.wait();

        notify(
            "Recovery initiated"
        );

        await loadRecovery();

    } catch (error) {
        notify(getError(error));
    }
}

async function cancelRecovery() {
    try {
        requireWallet();

        const tx =
            await contract.cancelRecovery();

        await tx.wait();

        notify(
            "Recovery cancelled"
        );

        await loadRecovery();

    } catch (error) {
        notify(getError(error));
    }
}

async function executeRecovery() {
    try {
        requireWallet();

        const tx =
            await contract.executeRecovery();

        await tx.wait();

        notify(
            "Wallet recovery executed"
        );

        await updateWallet();
        await refreshPendingTransactions();

    } catch (error) {
        notify(getError(error));
    }
}


/* =========================
   NETWORK
========================= */

async function switchNetwork() {
    try {
        const selected =
            Number(
                document
                    .getElementById("networkSelect")
                    .value
            );

        if (
            selected !==
            SEPOLIA_CHAIN_ID
        ) {
            notify(
                "This Saven wallet is currently deployed on Sepolia"
            );

            return;
        }

        await window.ethereum.request({
            method:
                "wallet_switchEthereumChain",

            params: [
                {
                    chainId: "0xaa36a7"
                }
            ]
        });

        notify(
            "Network switched to Sepolia"
        );

    } catch (error) {
        notify(getError(error));
    }
}


/* =========================
   MENU / FEATURES
========================= */

function openFeature(feature) {
    closeFeature();

    const map = {
        owners: "ownersFeature",
        batch: "batchFeature",
        spending: "spendingFeature",
        simulation: "simulationFeature",
        recovery: "recoveryFeature"
    };

    const panel =
        document.getElementById(
            map[feature]
        );

    if (panel) {
        panel.style.display = "block";
    }

    closeMenu();
}

function closeFeature() {
    document
        .querySelectorAll(".feature-panel")
        .forEach(
            panel =>
                panel.style.display = "none"
        );
}

function openMenu() {
    document
        .getElementById("sideMenu")
        .classList.add("active");

    document
        .getElementById("menuOverlay")
        .classList.add("active");
}

function closeMenu() {
    document
        .getElementById("sideMenu")
        .classList.remove("active");

    document
        .getElementById("menuOverlay")
        .classList.remove("active");
}

function closeModal() {
    document
        .getElementById("transactionModal")
        .classList.remove("active");
}


/* =========================
   COPY
========================= */

async function copyAddress(address, button) {
    try {
        await navigator.clipboard.writeText(
            address
        );

        const original =
            button.textContent;

        button.textContent =
            "Copied";

        setTimeout(
            () =>
                button.textContent =
                    original,
            1500
        );

    } catch (error) {
        notify(getError(error));
    }
}


/* =========================
   HISTORY
========================= */

async function getTransactionBlockTimestamp(
    blockNumber
) {
    const block =
        await provider.getBlock(
            blockNumber
        );

    return (
        block?.timestamp ||
        Math.floor(Date.now() / 1000)
    );
}

async function renderHistory() {
    if (!contract) {
        return;
    }

    try {
        const history = [...getStoredHistory()];

        /* =========================
           SINGLE TRANSACTIONS
        ========================= */

        const submitted =
            await queryWalletEvents(
                contract.filters.TransactionSubmitted()
            );

        const executed =
            await queryWalletEvents(
                contract.filters.TransactionExecuted()
            );

        const executedById = new Map(
            executed.map(log => [
                Number(log.args.transactionId),
                log
            ])
        );

        for (const log of submitted) {
            const id =
                Number(log.args.transactionId);

            try {
                const transaction =
                    await contract.transactions(id);

                if (transaction.executed && !history.some(
                    item => item.type === "Send" && item.id === String(id)
                )) {
                    const execution = executedById.get(id);

                    history.push({
                        id: String(id),
                        type: "Send",
                        amount: formatEth(
                            transaction.value
                        ),
                        to: transaction.target,
                        hash: execution?.transactionHash || log.transactionHash,
                        block: execution?.blockNumber || log.blockNumber
                    });
                }
            } catch (error) {
                console.log(
                    `Could not read transaction ${id}`,
                    error
                );
            }
        }


        /* =========================
           BATCH TRANSACTIONS
        ========================= */

        const batchSubmitted =
            await queryWalletEvents(
                contract.filters.BatchTransactionSubmitted()
            );

        const batchExecuted =
            await queryWalletEvents(
                contract.filters.BatchTransactionExecuted()
            );

        const executedBatchById = new Map(
            batchExecuted.map(log => [
                Number(log.args.transactionId),
                log
            ])
        );

        for (const log of batchSubmitted) {
            const id =
                Number(log.args.transactionId);

            const execution = executedBatchById.get(id);

            if (!execution || history.some(
                item => item.type === "Batch" && item.id === String(id)
            )) {
                continue;
            }

            history.push({
                id: String(id),
                type: "Batch",
                amount: "Batch transfer",
                to: "Multiple recipients",
                hash: execution.transactionHash,
                block: execution.blockNumber
            });
        }


        /* =========================
           ETH RECEIVED
        ========================= */

        const etherReceived =
            await queryWalletEvents(
                contract.filters.EtherReceived()
            );

        for (const log of etherReceived) {
            history.push({
                type: "Receive",
                amount: formatEth(
                    log.args.amount
                ),
                to: log.args.from,
                hash: log.transactionHash,
                block: log.blockNumber
            });
        }


        /* =========================
           SPENDER TRANSFERS
        ========================= */

        const spenderTransfers =
            await queryWalletEvents(
                contract.filters.SpenderTransfer()
            );

        for (const log of spenderTransfers) {
            history.push({
                type: "Spender",
                amount: formatEth(
                    log.args.amount
                ),
                to: log.args.to,
                hash: log.transactionHash,
                block: log.blockNumber
            });
        }


        /* =========================
           SORT
        ========================= */

        history.sort(
            (a, b) =>
                b.block - a.block
        );


        const container =
            document.getElementById(
                "transactionHistory"
            );

        if (!container) {
            return;
        }


        if (history.length === 0) {
            container.innerHTML = `
                <div class="empty-history">
                    <h3>No transactions yet</h3>
                    <p>
                        Completed wallet activity
                        will appear here.
                    </p>
                </div>
            `;

            return;
        }


        /* =========================
           DISPLAY
        ========================= */

        const rows = [];

        for (
            const item of history.slice(0, 30)
        ) {
            let timestamp = 0;

            try {
                const block =
                    await provider.getBlock(
                        item.block
                    );

                timestamp =
                    block?.timestamp || 0;

            } catch {
                timestamp = 0;
            }


            rows.push(`
                <div class="history-item">

                    <strong>
                        ${item.type}
                    </strong>

                    <p>
                        ${item.amount} ETH
                    </p>

                    <small>
                        ${item.to}
                    </small>

                    <small>
                        ${
                            timestamp
                                ? formatTime(timestamp)
                                : ""
                        }
                    </small>

                    <small>
                        ${item.hash}
                    </small>

                </div>
            `);
        }


        container.innerHTML =
            rows.join("");


    } catch (error) {

        console.log(
            "History loading error",
            error
        );
    }
}


/* =========================
   BUTTON EVENTS
========================= */

document
    .getElementById("connectBtn")
    .addEventListener(
        "click",
        connectWallet
    );

document
    .getElementById("sendBtn")
    .addEventListener(
        "click",
        () => {
            closeFeature();

            document.getElementById(
                "sendSection"
            ).style.display = "block";
        }
    );

document
    .getElementById("receiveBtn")
    .addEventListener(
        "click",
        () => {
            closeFeature();

            document.getElementById(
                "receiveSection"
            ).style.display = "block";
        }
    );

document
    .getElementById("executeSendBtn")
    .addEventListener(
        "click",
        sendEther
    );

document
    .getElementById("addOwnerBtn")
    .addEventListener(
        "click",
        addOwner
    );

document
    .getElementById("removeOwnerBtn")
    .addEventListener(
        "click",
        removeOwner
    );

document
    .getElementById("changeThresholdBtn")
    .addEventListener(
        "click",
        changeThreshold
    );

document
    .getElementById("submitBatchBtn")
    .addEventListener(
        "click",
        submitBatch
    );

document
    .getElementById("configureSpenderBtn")
    .addEventListener(
        "click",
        configureSpender
    );

document
    .getElementById("checkSpenderBtn")
    .addEventListener(
        "click",
        checkSpender
    );

document
    .getElementById("spendBtn")
    .addEventListener(
        "click",
        spendEther
    );

document
    .getElementById("simulateBtn")
    .addEventListener(
        "click",
        simulateTransaction
    );

document
    .getElementById("initiateRecoveryBtn")
    .addEventListener(
        "click",
        initiateRecovery
    );

document
    .getElementById("cancelRecoveryBtn")
    .addEventListener(
        "click",
        cancelRecovery
    );

document
    .getElementById("executeRecoveryBtn")
    .addEventListener(
        "click",
        executeRecovery
    );

document
    .getElementById("switchNetworkBtn")
    .addEventListener(
        "click",
        switchNetwork
    );

document
    .getElementById("menuBtn")
    .addEventListener(
        "click",
        openMenu
    );

document
    .getElementById("menuCloseBtn")
    .addEventListener(
        "click",
        closeMenu
    );

document
    .getElementById("menuOverlay")
    .addEventListener(
        "click",
        closeMenu
    );

document
    .getElementById("modalCloseBtn")
    .addEventListener(
        "click",
        closeModal
    );

document
    .getElementById("copyContractBtn")
    .addEventListener(
        "click",
        event =>
            copyAddress(
                CONTRACT_ADDRESS,
                event.currentTarget
            )
    );

document
    .getElementById("copyReceiveBtn")
    .addEventListener(
        "click",
        event =>
            copyAddress(
                CONTRACT_ADDRESS,
                event.currentTarget
            )
    );

document
    .querySelectorAll("[data-close]")
    .forEach(
        button =>
            button.addEventListener(
                "click",
                closeFeature
            )
    );

document
    .querySelectorAll(".menu-item")
    .forEach(
        item =>
            item.addEventListener(
                "click",
                () =>
                    openFeature(
                        item.dataset.feature
                    )
            )
    );

window.addEventListener(
    "load",
    closeFeature
);


/* =========================
   METAMASK ACCOUNT CHANGE
========================= */

if (window.ethereum) {

    window.ethereum.on(
        "accountsChanged",
        async accounts => {

            if (!accounts || accounts.length === 0) {
                account = null;
                signer = null;
                contract = null;

                connectBtn.textContent =
                    "Connect Wallet";

                return;
            }

            await connectWallet();
        }
    );

    window.ethereum.on(
        "chainChanged",
        () => {
            window.location.reload();
        }
    );
}
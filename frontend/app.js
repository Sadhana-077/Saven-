const CONTRACT_ADDRESS =
    "0x04788Cb52FB35597F2E2561fa6CDF8Ac6463B551";

const CONTRACT_ABI = [
    "function owner() view returns (address)",
    "function getBalance() view returns (uint256)",
    "function sendEther(address payable _to, uint256 _amount)",
    "event EtherReceived(address indexed from, uint256 amount)",
    "event EtherSent(address indexed to, uint256 amount)"
];

let provider = null;
let signer = null;
let contract = null;
let account = null;


/* =====================================================
   CONNECT WALLET
===================================================== */

async function connectWallet() {

    try {

        // Check MetaMask
        if (!window.ethereum) {

            document.getElementById("status").textContent =
                "Please install MetaMask.";

            return;
        }


        document.getElementById("status").textContent =
            "Connecting to MetaMask...";


        // Request wallet account
        const accounts =
            await window.ethereum.request({
                method: "eth_requestAccounts"
            });


        if (!accounts || accounts.length === 0) {

            throw new Error(
                "No MetaMask account found."
            );
        }


        // Create ethers provider
        provider =
            new ethers.BrowserProvider(
                window.ethereum
            );


        // Check current network
        const network =
            await provider.getNetwork();


        console.log(
            "Connected Chain ID:",
            network.chainId.toString()
        );


        // Sepolia Chain ID = 11155111
        if (network.chainId !== 11155111n) {

            document.getElementById("status").textContent =
                "Please switch MetaMask to Sepolia Network.";

            return;
        }


        // Get signer
        signer =
            await provider.getSigner();


        // Get connected account
        account =
            await signer.getAddress();


        console.log(
            "Connected Account:",
            account
        );


        // Create contract instance
        contract =
            new ethers.Contract(
                CONTRACT_ADDRESS,
                CONTRACT_ABI,
                signer
            );


        console.log(
            "Smart Contract:",
            CONTRACT_ADDRESS
        );


        // Update Connect Wallet button
        document.getElementById("connectBtn").textContent =
            account.slice(0, 6) +
            "..." +
            account.slice(-4);


        // Update receive address
        const receiveAddress =
            document.getElementById("receiveAddress");

        if (receiveAddress) {

            receiveAddress.textContent =
                CONTRACT_ADDRESS;
        }


        /* ---------------------------------------------
           CHECK CONTRACT OWNER
        --------------------------------------------- */

        const owner =
            await contract.owner();


        console.log(
            "Contract Owner:",
            owner
        );


        if (
            owner.toLowerCase() !==
            account.toLowerCase()
        ) {

            document.getElementById("status").textContent =
                "Connected, but this account is not the wallet owner.";

        } else {

            document.getElementById("status").textContent =
                "Owner connected successfully.";
        }


        // Update balance
        await updateBalance();


        // Load transaction history
        loadTransactionHistory();


    } catch (error) {

        console.error(
            "Connect Wallet Error:",
            error
        );


        document.getElementById("status").textContent =
            error.shortMessage ||
            error.reason ||
            error.message ||
            "Failed to connect wallet.";
    }
}


/* =====================================================
   UPDATE BALANCE
===================================================== */

async function updateBalance() {

    try {

        if (!window.ethereum) {
            return;
        }


        // Read-only provider
        const readProvider =
            new ethers.BrowserProvider(
                window.ethereum
            );


        // Read-only contract
        const readContract =
            new ethers.Contract(
                CONTRACT_ADDRESS,
                CONTRACT_ABI,
                readProvider
            );


        // Get smart contract balance
        const balance =
            await readContract.getBalance();


        // Convert Wei to ETH
        const formattedBalance =
            ethers.formatEther(balance);


        // Show 5 decimal places
        document.getElementById("balance").textContent =
            Number(formattedBalance).toFixed(5);


        console.log(
            "Smart Contract Balance:",
            formattedBalance,
            "ETH"
        );


    } catch (error) {

        console.error(
            "Balance Error:",
            error
        );


        document.getElementById("status").textContent =
            error.shortMessage ||
            error.message ||
            "Failed to update balance.";
    }
}


/* =====================================================
   SEND BUTTON
===================================================== */

document.getElementById("sendBtn").onclick =
    function () {

        document.getElementById(
            "sendSection"
        ).style.display = "block";


        document.getElementById(
            "receiveSection"
        ).style.display = "none";
    };


/* =====================================================
   RECEIVE BUTTON
===================================================== */

document.getElementById("receiveBtn").onclick =
    function () {

        document.getElementById(
            "receiveSection"
        ).style.display = "block";


        document.getElementById(
            "sendSection"
        ).style.display = "none";
    };


/* =====================================================
   CLOSE PANELS
===================================================== */

function closePanels() {

    document.getElementById(
        "sendSection"
    ).style.display = "none";


    document.getElementById(
        "receiveSection"
    ).style.display = "none";
}


/* =====================================================
   SEND ETH
===================================================== */

document.getElementById("executeSendBtn").onclick =
    async function () {

        try {

            // Check connection
            if (!contract || !account) {

                document.getElementById("status").textContent =
                    "Please connect MetaMask first.";

                return;
            }


            /* ---------------------------------------------
               CHECK OWNER
            --------------------------------------------- */

            const owner =
                await contract.owner();


            if (
                owner.toLowerCase() !==
                account.toLowerCase()
            ) {

                document.getElementById("status").textContent =
                    "Only the wallet owner can send ETH.";

                return;
            }


            /* ---------------------------------------------
               GET INPUT VALUES
            --------------------------------------------- */

            const recipient =
                document.getElementById(
                    "recipient"
                ).value.trim();


            const amount =
                document.getElementById(
                    "amount"
                ).value.trim();


            /* ---------------------------------------------
               VALIDATE RECIPIENT
            --------------------------------------------- */

            if (!ethers.isAddress(recipient)) {

                document.getElementById("status").textContent =
                    "Invalid recipient address.";

                return;
            }


            /* ---------------------------------------------
               VALIDATE AMOUNT
            --------------------------------------------- */

            if (
                !amount ||
                Number(amount) <= 0
            ) {

                document.getElementById("status").textContent =
                    "Enter a valid ETH amount.";

                return;
            }


            // Convert ETH → Wei
            const value =
                ethers.parseEther(amount);


            /* ---------------------------------------------
               CHECK CONTRACT BALANCE
            --------------------------------------------- */

            const contractBalance =
                await contract.getBalance();


            if (
                value >
                contractBalance
            ) {

                document.getElementById("status").textContent =
                    "Insufficient smart contract balance.";

                return;
            }


            /* ---------------------------------------------
               SEND TRANSACTION
            --------------------------------------------- */

            document.getElementById("status").textContent =
                "Waiting for MetaMask signature...";


            const tx =
                await contract.sendEther(
                    recipient,
                    value
                );


            console.log(
                "Transaction Hash:",
                tx.hash
            );


            document.getElementById("status").textContent =
                "Transaction submitted. Waiting for confirmation...";


            /* ---------------------------------------------
               WAIT FOR BLOCK CONFIRMATION
            --------------------------------------------- */

            const receipt =
                await tx.wait();


            console.log(
                "Transaction Confirmed:",
                receipt
            );


            /* ---------------------------------------------
               SAVE TRANSACTION
            --------------------------------------------- */

            saveTransaction({

                hash: tx.hash,

                recipient: recipient,

                amount: amount,

                blockNumber:
                    receipt.blockNumber,

                status: "Success",

                timestamp: Date.now()
            });


            /* ---------------------------------------------
               CLEAR INPUTS
            --------------------------------------------- */

            document.getElementById(
                "recipient"
            ).value = "";


            document.getElementById(
                "amount"
            ).value = "";


            /* ---------------------------------------------
               UPDATE UI
            --------------------------------------------- */

            await updateBalance();

            loadTransactionHistory();


            document.getElementById("status").textContent =
                "ETH sent successfully!";


        } catch (error) {

            console.error(
                "Send ETH Error:",
                error
            );


            document.getElementById("status").textContent =
                error.shortMessage ||
                error.reason ||
                error.message ||
                "Transaction failed.";
        }
    };


/* =====================================================
   SAVE TRANSACTION
===================================================== */

function saveTransaction(transaction) {

    let history =
        JSON.parse(
            localStorage.getItem(
                "savenTransactions"
            )
        ) || [];


    history.unshift(transaction);


    // Keep latest 20 transactions
    history =
        history.slice(0, 20);


    localStorage.setItem(
        "savenTransactions",
        JSON.stringify(history)
    );
}


/* =====================================================
   LOAD TRANSACTION HISTORY
===================================================== */

function loadTransactionHistory() {

    const history =
        JSON.parse(
            localStorage.getItem(
                "savenTransactions"
            )
        ) || [];


    const container =
        document.getElementById(
            "transactionHistory"
        );


    if (history.length === 0) {

        container.innerHTML = `

            <div class="empty-history">

                <div class="empty-icon">
                    ↕
                </div>

                <h3>No transactions yet</h3>

                <p>
                    Your successful ETH transactions will appear here.
                </p>

            </div>

        `;

        return;
    }


    container.innerHTML =
        history.map(
            function (tx) {

                const date =
                    new Date(
                        tx.timestamp
                    );


                const formattedDate =
                    date.toLocaleDateString() +
                    " " +
                    date.toLocaleTimeString(
                        [],
                        {
                            hour: "2-digit",
                            minute: "2-digit"
                        }
                    );


                return `

                    <div class="transaction-item">

                        <div class="tx-icon">
                            ↗
                        </div>


                        <div class="tx-info">

                            <div class="tx-title">
                                ETH Sent
                            </div>


                            <div class="tx-recipient">
                                To:
                                ${shortenAddress(
                                    tx.recipient
                                )}
                            </div>

                        </div>


                        <div class="tx-right">

                            <div class="tx-amount">
                                -${tx.amount} ETH
                            </div>


                            <div class="tx-time">
                                ${formattedDate}
                            </div>


                            <a
                                class="tx-link"
                                href="https://sepolia.etherscan.io/tx/${tx.hash}"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                View on Etherscan ↗
                            </a>

                        </div>

                    </div>

                `;
            }
        ).join("");
}


/* =====================================================
   SHORTEN ADDRESS
===================================================== */

function shortenAddress(address) {

    if (!address) {
        return "";
    }


    return (
        address.slice(0, 6) +
        "..." +
        address.slice(-4)
    );
}


/* =====================================================
   COPY TEXT
===================================================== */

async function copyText(
    text,
    message
) {

    try {

        if (
            navigator.clipboard &&
            window.isSecureContext
        ) {

            await navigator.clipboard.writeText(
                text
            );

        } else {

            const textarea =
                document.createElement(
                    "textarea"
                );


            textarea.value =
                text;


            textarea.style.position =
                "fixed";


            textarea.style.left =
                "-9999px";


            document.body.appendChild(
                textarea
            );


            textarea.focus();

            textarea.select();


            const copied =
                document.execCommand(
                    "copy"
                );


            document.body.removeChild(
                textarea
            );


            if (!copied) {

                throw new Error(
                    "Copy command failed"
                );
            }
        }


        document.getElementById(
            "status"
        ).textContent =
            message;


    } catch (error) {

        console.error(
            "Copy Error:",
            error
        );


        document.getElementById(
            "status"
        ).textContent =
            "Copy failed. Please copy the address manually.";
    }
}


/* =====================================================
   COPY CONTRACT ADDRESS
===================================================== */

function copyContractAddress() {

    copyText(
        CONTRACT_ADDRESS,
        "Contract address copied!"
    );
}


/* =====================================================
   COPY RECEIVE ADDRESS
===================================================== */

function copyReceiveAddress() {

    copyText(
        CONTRACT_ADDRESS,
        "Wallet address copied!"
    );
}


/* =====================================================
   CLEAR TRANSACTION HISTORY
===================================================== */

function clearHistory() {

    const confirmed =
        confirm(
            "Clear all transaction history?"
        );


    if (!confirmed) {
        return;
    }


    localStorage.removeItem(
        "savenTransactions"
    );


    loadTransactionHistory();


    document.getElementById(
        "status"
    ).textContent =
        "Transaction history cleared.";
}


/* =====================================================
   METAMASK ACCOUNT CHANGE
===================================================== */

if (window.ethereum) {

    window.ethereum.on(
        "accountsChanged",
        async function (accounts) {

            console.log(
                "Accounts changed:",
                accounts
            );


            if (
                !accounts ||
                accounts.length === 0
            ) {

                account = null;

                signer = null;

                contract = null;


                document.getElementById(
                    "connectBtn"
                ).textContent =
                    "Connect Wallet";


                document.getElementById(
                    "status"
                ).textContent =
                    "Wallet disconnected.";


                return;
            }


            // Reconnect using new account
            await connectWallet();
        }
    );


    /* ---------------------------------------------
       NETWORK CHANGE
    --------------------------------------------- */

    window.ethereum.on(
        "chainChanged",
        function () {

            console.log(
                "Network changed"
            );


            window.location.reload();
        }
    );
}


/* =====================================================
   CONNECT BUTTON
===================================================== */

document.getElementById(
    "connectBtn"
).addEventListener(
    "click",
    connectWallet
);
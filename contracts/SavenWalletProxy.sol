// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SavenWalletProxy {

    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    constructor(
        address _implementation,
        bytes memory _data
    ) payable {

        require(
            _implementation != address(0),
            "Invalid implementation"
        );

        assembly {
            sstore(
                IMPLEMENTATION_SLOT,
                _implementation
            )
        }

        if (_data.length > 0) {

            (
                bool success,
                bytes memory result
            ) = _implementation.delegatecall(_data);

            if (!success) {

                if (result.length > 0) {

                    assembly {
                        revert(
                            add(result, 32),
                            mload(result)
                        )
                    }

                }

                revert("Initialization failed");
            }
        }
    }

    function implementation()
        external
        view
        returns (address impl)
    {
        assembly {
            impl := sload(IMPLEMENTATION_SLOT)
        }
    }

    function upgradeTo(
        address _newImplementation
    )
        external
    {
        require(
            msg.sender == address(this),
            "Only wallet can upgrade"
        );

        require(
            _newImplementation != address(0),
            "Invalid implementation"
        );

        assembly {
            sstore(
                IMPLEMENTATION_SLOT,
                _newImplementation
            )
        }
    }

    fallback() external payable {

        assembly {

            let impl :=
                sload(IMPLEMENTATION_SLOT)

            calldatacopy(
                0,
                0,
                calldatasize()
            )

            let result :=
                delegatecall(
                    gas(),
                    impl,
                    0,
                    calldatasize(),
                    0,
                    0
                )

            returndatacopy(
                0,
                0,
                returndatasize()
            )

            switch result

            case 0 {
                revert(
                    0,
                    returndatasize()
                )
            }

            default {
                return(
                    0,
                    returndatasize()
                )
            }
        }
    }

    receive() external payable {}
}
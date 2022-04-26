import { Idl } from "@project-serum/anchor";

const idl: Idl = {
  version: "0.11.0",
  name: "mean_multisig",
  instructions: [
    {
      "name": "createMultisig",
      "accounts": [
        {
          "name": "proposer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "multisig",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "multisigOpsAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "owners",
          "type": {
            "vec": {
              "defined": "Owner"
            }
          }
        },
        {
          "name": "threshold",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u8"
        },
        {
          "name": "label",
          "type": "string"
        }
      ]
    },
    {
      "name": "editMultisig",
      "accounts": [
        {
          "name": "multisig",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "multisigSigner",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": [
        {
          "name": "owners",
          "type": {
            "vec": {
              "defined": "Owner"
            }
          }
        },
        {
          "name": "threshold",
          "type": "u64"
        },
        {
          "name": "label",
          "type": "string"
        }
      ]
    },
    {
      "name": "createTransaction",
      "accounts": [
        {
          "name": "multisig",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "transaction",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "transactionDetail",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "proposer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "multisigOpsAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "pid",
          "type": "publicKey"
        },
        {
          "name": "accs",
          "type": {
            "vec": {
              "defined": "TransactionAccount"
            }
          }
        },
        {
          "name": "data",
          "type": "bytes"
        },
        {
          "name": "operation",
          "type": "u8"
        },
        {
          "name": "title",
          "type": "string"
        },
        {
          "name": "description",
          "type": "string"
        },
        {
          "name": "expirationDate",
          "type": "u64"
        },
        {
          "name": "pdaTimestamp",
          "type": "u64"
        },
        {
          "name": "pdaBump",
          "type": "u8"
        }
      ]
    },
    {
      "name": "cancelTransaction",
      "accounts": [
        {
          "name": "multisig",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "transaction",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "transactionDetail",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "proposer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "approve",
      "accounts": [
        {
          "name": "multisig",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "transaction",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "transactionDetail",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "executeTransaction",
      "accounts": [
        {
          "name": "multisig",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "multisigSigner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "transaction",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "transactionDetail",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "executeTransactionPda",
      "accounts": [
        {
          "name": "multisig",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "multisigSigner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "pdaAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "transaction",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "transactionDetail",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "pdaTimestamp",
          "type": "u64"
        },
        {
          "name": "pdaBump",
          "type": "u8"
        }
      ]
    }
  ],
  accounts: [
    {
      "name": "Multisig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owners",
            "type": {
              "vec": "publicKey"
            }
          },
          {
            "name": "threshold",
            "type": "u64"
          },
          {
            "name": "nonce",
            "type": "u8"
          },
          {
            "name": "ownerSetSeqno",
            "type": "u32"
          },
          {
            "name": "label",
            "type": "string"
          },
          {
            "name": "createdOn",
            "type": "u64"
          },
          {
            "name": "pendingTxs",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "MultisigV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owners",
            "type": {
              "array": [
                {
                  "defined": "OwnerData"
                },
                10
              ]
            }
          },
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "nonce",
            "type": "u8"
          },
          {
            "name": "label",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ownerSetSeqno",
            "type": "u32"
          },
          {
            "name": "threshold",
            "type": "u64"
          },
          {
            "name": "pendingTxs",
            "type": "u64"
          },
          {
            "name": "createdOn",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Transaction",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "publicKey"
          },
          {
            "name": "programId",
            "type": "publicKey"
          },
          {
            "name": "accounts",
            "type": {
              "vec": {
                "defined": "TransactionAccount"
              }
            }
          },
          {
            "name": "data",
            "type": "bytes"
          },
          {
            "name": "signers",
            "type": {
              "vec": "bool"
            }
          },
          {
            "name": "ownerSetSeqno",
            "type": "u32"
          },
          {
            "name": "createdOn",
            "type": "u64"
          },
          {
            "name": "executedOn",
            "type": "u64"
          },
          {
            "name": "operation",
            "type": "u8"
          },
          {
            "name": "keypairs",
            "type": {
              "vec": {
                "array": [
                  "u8",
                  64
                ]
              }
            }
          },
          {
            "name": "proposer",
            "type": "publicKey"
          },
          {
            "name": "pdaTimestamp",
            "type": "u64"
          },
          {
            "name": "pdaBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "TransactionDetail",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "title",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "description",
            "type": {
              "array": [
                "u8",
                512
              ]
            }
          },
          {
            "name": "expirationDate",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Owner",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "address",
            "type": "publicKey"
          },
          {
            "name": "name",
            "type": "string"
          }
        ]
      }
    }
  ],
  types: [
    {
      "name": "OwnerData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "address",
            "type": "publicKey"
          },
          {
            "name": "name",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "TransactionAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pubkey",
            "type": "publicKey"
          },
          {
            "name": "isSigner",
            "type": "bool"
          },
          {
            "name": "isWritable",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "ErrorCode",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "InvalidOwner"
          },
          {
            "name": "InvalidOwnersLen"
          },
          {
            "name": "NotEnoughSigners"
          },
          {
            "name": "TransactionAlreadySigned"
          },
          {
            "name": "Overflow"
          },
          {
            "name": "UnableToDelete"
          },
          {
            "name": "AlreadyExecuted"
          },
          {
            "name": "AlreadyExpired"
          },
          {
            "name": "InvalidThreshold"
          },
          {
            "name": "UniqueOwners"
          },
          {
            "name": "OwnerNameTooLong"
          },
          {
            "name": "InvalidMultisigNonce"
          },
          {
            "name": "InvalidMultisigVersion"
          },
          {
            "name": "InvalidOwnerSetSeqNumber"
          },
          {
            "name": "InvalidMultisig"
          }
        ]
      }
    }
  ]
}

export default idl;
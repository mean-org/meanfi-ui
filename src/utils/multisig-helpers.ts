import { OperationType } from "../models/enums";

export function getOperationName(op: OperationType) {

    switch (op) {
        case OperationType.CreateMint:
            return "Create Mint";
        case OperationType.MintTokens:
            return "Mint token";
        case OperationType.TransferTokens:
            return "Transfer tokens";
        case OperationType.UpgradeProgram:
            return "Upgrade program";
        case OperationType.UpgradeIDL:
            return "Upgrade IDL";
        case OperationType.SetMultisigAuthority:
            return "Set Multisig Authority";
        case OperationType.EditMultisig:
            return "Edit Multisig";
        case OperationType.TreasuryCreate:
            return "Create Treasury";
        case OperationType.TreasuryClose:
            return "Close Treasury";
        case OperationType.TreasuryRefreshBalance:
            return "Refresh Treasury Data";
        case OperationType.TreasuryWithdraw:
            return "Withdraw Treasury Funds";
        case OperationType.DeleteAsset:
            return "Close Asset";
        case OperationType.CreateAsset:
            return "Create Asset";
        case OperationType.SetAssetAuthority:
            return "Change Asset Authority";
        case OperationType.StreamCreate:
            return "Create Stream";
        case OperationType.StreamClose:
            return "Close Stream";
        case OperationType.StreamAddFunds:
            return "Top Up Stream";
        case OperationType.StreamPause:
            return "Pause Stream";
        case OperationType.StreamResume:
            return "Resume Stream";
        default:
            return '';
    }

};

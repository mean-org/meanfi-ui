import { OperationType } from "../models/enums";

export function getOperationName(op: OperationType) {

    switch (op) {
        case OperationType.CreateMint:
            return "Create mint";
        case OperationType.MintTokens:
            return "Mint token";
        case OperationType.TransferTokens:
            return "Transfer tokens";
        case OperationType.UpgradeProgram:
            return "Upgrade program";
        case OperationType.UpgradeIDL:
            return "Upgrade IDL";
        case OperationType.SetMultisigAuthority:
            return "Set multisig authority";
        case OperationType.EditMultisig:
            return "Edit multisig";
        case OperationType.TreasuryCreate:
            return "Create treasury";
        case OperationType.TreasuryClose:
            return "Close treasury";
        case OperationType.TreasuryRefreshBalance:
            return "Refresh treasury data";
        case OperationType.TreasuryWithdraw:
            return "Withdraw treasury funds";
        case OperationType.DeleteAsset:
            return "Close asset";
        case OperationType.CreateAsset:
            return "Create asset";
        case OperationType.SetAssetAuthority:
            return "Change asset authority";
        case OperationType.StreamCreate:
            return "Create stream";
        case OperationType.StreamClose:
            return "Close stream";
        case OperationType.StreamAddFunds:
            return "Top up stream";
        case OperationType.StreamPause:
            return "Pause stream";
        case OperationType.StreamResume:
            return "Resume stream";
        default:
            return '';
    }

}

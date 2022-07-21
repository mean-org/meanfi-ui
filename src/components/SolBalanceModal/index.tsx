import { MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { Modal } from "antd";
import BN from "bn.js";
import { QRCodeSVG } from "qrcode.react";
import { useContext } from "react";
// import { useTranslation } from "react-i18next";
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "../../constants";
import { AppStateContext } from "../../contexts/appstate";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { IconLoading } from "../../Icons";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import { NATIVE_SOL } from "../../utils/tokens";
import { getTokenAmountAndSymbolByTokenAddress, toUiAmount } from "../../utils/utils";
import { AddressDisplay } from "../AddressDisplay";

export const SolBalanceModal = (props: {
  handleClose: any;
  isVisible: boolean;
  address: string;
  accountAddress: string;
  tokenSymbol: string;
  multisigAddress: string;
  nativeBalance: number;
  selectedMultisig: MultisigInfo | undefined;
  isStreamingAccount: boolean;
}) => {
  // const { t } = useTranslation("common");
  const { theme } = useContext(AppStateContext);

  const { handleClose, isVisible, multisigAddress, selectedMultisig, isStreamingAccount } = props;

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">SOL Balance</div>}
      footer={null}
      visible={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={360}>
      <div className="buy-token-options">
        <div className="text-center">
          <div className="d-flex flex-column mb-1">
            {isStreamingAccount ? (
              <span className="info-label">
                Your SOL streaming account balance:
              </span>
            ) : (
              <span className="info-label">
                Balance of SOL in safe:
              </span>
            )}
            <span className="info-value">
              {(selectedMultisig && selectedMultisig !== undefined) ? (
                <>
                  {getTokenAmountAndSymbolByTokenAddress(
                    toUiAmount(new BN(selectedMultisig.balance), NATIVE_SOL.decimals || 9),
                    NATIVE_SOL_MINT.toBase58()
                  )}
                </>
              ) : (
                <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
              )}
            </span>
            {isStreamingAccount && (
              <>
                {(selectedMultisig && (toUiAmount(new BN(selectedMultisig.balance), NATIVE_SOL.decimals || 9) < 0.05)) ? (
                  <span className="form-field-error">
                    You are running low on SOL needed <br />
                    to pay for transaction fees.
                  </span>
                ) : null}
              </>
            )}
          </div>
          {isStreamingAccount ? (
            <h4 className="mb-3">Scan the QR code to send SOL to this account</h4>
          ) : (
            <h4 className="mb-3">Scan the QR code to send SOL to this safe</h4>
          )}

          <div className={theme === 'light' ? 'qr-container bg-white' : 'qr-container bg-black'}>
            <QRCodeSVG
              value={multisigAddress as string}
              size={200}
            />
          </div>

          <div className="flex-center font-size-70 mb-2">
            <AddressDisplay
              address={multisigAddress as string}
              showFullAddress={true}
              iconStyles={{ width: "15", height: "15" }}
              newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${multisigAddress}${getSolanaExplorerClusterParam()}`}
            />
          </div>

          {!isStreamingAccount ? (
            <div className="font-light font-size-75 px-4">This address can only be used to receive SOL  for this safe</div>
          ) : (
            <div className="font-light font-size-75 px-4">This address can only be used to receive SOL to pay for the transaction fees for this streaming account</div>
          )}
        </div>
      </div>
    </Modal>
  );
};
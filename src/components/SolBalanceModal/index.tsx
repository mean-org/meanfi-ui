import { MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { Modal } from "antd";
import { QRCodeSVG } from "qrcode.react";
import { MIN_SOL_BALANCE_REQUIRED, SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "../../constants";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { IconLoading } from "../../Icons";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import { NATIVE_SOL } from "../../utils/tokens";
import { getTokenAmountAndSymbolByTokenAddress, toUiAmount } from "../../utils/utils";
import { AddressDisplay } from "../AddressDisplay";
import BN from "bn.js";

export const SolBalanceModal = (props: {
  accountAddress: string;
  address: string;
  handleClose: any;
  isStreamingAccount: boolean;
  isVisible: boolean;
  multisigAddress: string;
  nativeBalance: number;
  selectedMultisig: MultisigInfo | undefined;
  tokenSymbol: string;
  treasuryBalance?: number;
}) => {

  const {
    address,
    handleClose,
    isStreamingAccount,
    isVisible,
    multisigAddress,
    selectedMultisig,
    treasuryBalance
  } = props;

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
            {/* Balance title */}
            {isStreamingAccount ? (
              <span className="info-label">
                Your SOL streaming account balance:
              </span>
            ) : (
              <span className="info-label">
                Balance of SOL in safe:
              </span>
            )}
            {/* Balance value */}
            <span className="info-value">
              {isStreamingAccount ? (
                <>
                  {treasuryBalance !== undefined ? (
                    <>
                      {getTokenAmountAndSymbolByTokenAddress(
                        treasuryBalance,
                        NATIVE_SOL_MINT.toBase58()
                      )}
                    </>
                  ) : (
                    <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
                  )}
                </>
              ) : (
                <>
                  {selectedMultisig && selectedMultisig !== undefined ? (
                    <>
                      {getTokenAmountAndSymbolByTokenAddress(
                        toUiAmount(new BN(selectedMultisig.balance), NATIVE_SOL.decimals || 9),
                        NATIVE_SOL_MINT.toBase58()
                      )}
                    </>
                  ) : (
                    <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
                  )}
                </>
              )}
            </span>
            {/* Warn if Safe balance is low */}
            {isStreamingAccount && (
              <>
                {(selectedMultisig && (toUiAmount(new BN(selectedMultisig.balance), NATIVE_SOL.decimals) < MIN_SOL_BALANCE_REQUIRED)) ? (
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

          <div className="qr-container bg-white">
            <QRCodeSVG
              value={isStreamingAccount ? address : multisigAddress as string}
              size={200}
            />
          </div>

          <div className="flex-center font-size-70 mb-2">
            <AddressDisplay
              address={isStreamingAccount ? address : multisigAddress as string}
              showFullAddress={true}
              iconStyles={{ width: "15", height: "15" }}
              newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${isStreamingAccount ? address : multisigAddress}${getSolanaExplorerClusterParam()}`}
            />
          </div>

          {!isStreamingAccount ? (
            <div className="font-light font-size-75 px-4">This address can only be used to receive SOL for this safe</div>
          ) : (
            <div className="font-light font-size-75 px-4">This address can only be used to receive SOL to pay for the transaction fees for this streaming account</div>
          )}
        </div>
      </div>
    </Modal>
  );
};
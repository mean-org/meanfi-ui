import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { Modal } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import {
  MIN_SOL_BALANCE_REQUIRED,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
} from '../../constants';
import { getSolanaExplorerClusterParam } from '../../contexts/connection';
import { IconLoading } from '../../Icons';
import { NATIVE_SOL } from '../../constants/tokens';
import {
  displayAmountWithSymbol,
  getAmountFromLamports,
  getAmountWithSymbol,
  toUiAmount,
} from '../../middleware/utils';
import { AddressDisplay } from '../AddressDisplay';

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
    treasuryBalance,
  } = props;

  return (
    <Modal
      className="mean-modal simple-modal unpadded-content"
      title={<div className="modal-title">SOL Balance</div>}
      footer={null}
      open={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={360}
    >
      <div className="buy-token-options">
        <div className="text-center">
          {/* Balance title */}
          {isStreamingAccount ? (
            <p className="mb-0">Your SOL streaming account balance:</p>
          ) : (
            <p className="mb-0">Balance of SOL in safe:</p>
          )}
          {/* Balance value */}
          <p className="mb-2">
            {isStreamingAccount ? (
              <>
                {treasuryBalance !== undefined ? (
                  <>
                    {getAmountWithSymbol(
                      treasuryBalance,
                      NATIVE_SOL.address,
                      false,
                    )}
                  </>
                ) : (
                  <IconLoading
                    className="mean-svg-icons"
                    style={{ height: '12px', lineHeight: '12px' }}
                  />
                )}
              </>
            ) : (
              <>
                {selectedMultisig && selectedMultisig !== undefined ? (
                  <>
                    {displayAmountWithSymbol(
                      getAmountFromLamports(selectedMultisig.balance),
                      NATIVE_SOL.address,
                      NATIVE_SOL.decimals,
                    )}
                  </>
                ) : (
                  <IconLoading
                    className="mean-svg-icons"
                    style={{ height: '12px', lineHeight: '12px' }}
                  />
                )}
              </>
            )}
          </p>
          {/* Warn if Safe balance is low */}
          {isStreamingAccount && (
            <p>
              {selectedMultisig &&
              parseFloat(
                toUiAmount(selectedMultisig.balance, NATIVE_SOL.decimals),
              ) < MIN_SOL_BALANCE_REQUIRED ? (
                <span className="form-field-error">
                  You are running low on SOL needed <br />
                  to pay for transaction fees.
                </span>
              ) : null}
            </p>
          )}

          {isStreamingAccount ? (
            <p>Scan the QR code to send SOL to this account</p>
          ) : (
            <p>Scan the QR code to send SOL to this safe</p>
          )}

          <div className="qr-container bg-white">
            <QRCodeSVG
              value={isStreamingAccount ? address : (multisigAddress as string)}
              size={200}
            />
          </div>

          <div className="flex-center mb-1">
            <AddressDisplay
              address={
                isStreamingAccount ? address : (multisigAddress as string)
              }
              maxChars={12}
              iconStyles={{ width: '16', height: '16', verticalAlign: '-2' }}
              newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${
                isStreamingAccount ? address : multisigAddress
              }${getSolanaExplorerClusterParam()}`}
            />
          </div>

          {!isStreamingAccount ? (
            <p className="px-5">
              This address can only be used to receive SOL for this safe
            </p>
          ) : (
            <p className="px-5">
              This address can only be used to receive SOL to pay for the
              transaction fees for this streaming account
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};

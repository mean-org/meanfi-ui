import React from 'react';
import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from 'qrcode.react';
import { AddressDisplay } from '../../../../components/AddressDisplay';
import { MIN_SOL_BALANCE_REQUIRED, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, WRAPPED_SOL_MINT_ADDRESS } from '../../../../constants';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { getAmountWithSymbol } from '../../../../middleware/utils';

export const VestingContractSolBalanceModal = (props: {
  address: string;
  handleClose: any;
  isVisible: boolean;
  treasuryBalance: number;
}) => {
  const { t } = useTranslation("common");
  const { address, handleClose, isVisible, treasuryBalance } = props;

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('vesting.sol-balance.modal-title')}</div>}
      footer={null}
      visible={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={360}>
      <div className="buy-token-options shift-up-1">
        <div className="text-center">
          <h4 className="mb-0">{t('vesting.sol-balance.contract-balance-label')}:</h4>
          <div className="font-size-100 font-extrabold mb-2">
            {
              getAmountWithSymbol(
                treasuryBalance,
                WRAPPED_SOL_MINT_ADDRESS,
              )
            }
          </div>
          {treasuryBalance < MIN_SOL_BALANCE_REQUIRED && (
            <p className="fg-warning">{t('vesting.sol-balance.contract-balance-low-warning')}</p>
          )}

          <h3 className="mb-2">{t('vesting.sol-balance.qrcode-scan-label')}</h3>

          {address && (
            <>
              <div className="qr-container bg-white">
                <QRCodeSVG
                  value={address}
                  size={200}
                />
              </div>
              <div className="flex-center font-size-70 mb-2">
                <AddressDisplay
                  address={address}
                  showFullAddress={true}
                  iconStyles={{ width: "15", height: "15" }}
                  newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${address}${getSolanaExplorerClusterParam()}`}
                />
              </div>
            </>
          )}
          <div className="font-light font-size-75 px-4">{t('vesting.sol-balance.deposit-address-disclaimer')}</div>
        </div>
      </div>
    </Modal>
  );
};

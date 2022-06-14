import React, { useContext } from 'react';
import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from 'qrcode.react';
import { AppStateContext } from '../../../../contexts/appstate';
import { AddressDisplay } from '../../../../components/AddressDisplay';
import { MIN_SOL_BALANCE_REQUIRED, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, WRAPPED_SOL_MINT_ADDRESS } from '../../../../constants';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { getAmountWithSymbol } from '../../../../utils/utils';

export const VestingContractSolBalanceModal = (props: {
  address: string;
  handleClose: any;
  isVisible: boolean;
  treasuryBalance: number;
}) => {
  const { t } = useTranslation("common");
  const { theme } = useContext(AppStateContext);
  const { address, handleClose, isVisible, treasuryBalance } = props;

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">SOL Balance</div>}
      footer={null}
      visible={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={360}>
      <div className="buy-token-options shift-up-1">
        <div className="text-center">
          <h4 className="mb-0">Your SOL contract balance:</h4>
          <div className="font-size-100 font-extrabold mb-2">
            {
              getAmountWithSymbol(
                treasuryBalance,
                WRAPPED_SOL_MINT_ADDRESS,
              )
            }
          </div>
          {treasuryBalance < MIN_SOL_BALANCE_REQUIRED && (
            <p className={`${theme === 'light' ? 'fg-error' : 'fg-orange-red'}`}>You are running low on SOL needed<br/>to pay for vesting transaction fees.</p>
          )}

          <h3 className="mb-2">Scan the QR code to receive funds</h3>

          {address && (
            <>
              <div className={theme === 'light' ? 'qr-container bg-white' : 'qr-container bg-black'}>
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

          {/* <div className="font-light font-size-75 px-4">{t('assets.no-balance.line4')}</div>
          <div className="font-light font-size-75 px-4">{t('assets.no-balance.line5')}</div> */}
          <div className="font-light font-size-75 px-4">This address can only be used to receive SOL to pay for transactions fee on this vesting contract account</div>
        </div>
      </div>
    </Modal>
  );
};

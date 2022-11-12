import React, { useContext, useState } from 'react';
import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { AppStateContext } from '../../contexts/appstate';
import { useWallet } from '../../contexts/wallet';
import { AddressDisplay } from '../AddressDisplay';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../constants';
import { getSolanaExplorerClusterParam } from '../../contexts/connection';
import { QRCodeSVG } from 'qrcode.react';

export const ReceiveSplOrSolModal = (props: {
  handleClose: any;
  isVisible: boolean;
  address: string;
  accountAddress: string;
  tokenSymbol: string;
  multisigAddress: string;
}) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const { theme } = useContext(AppStateContext);
  const { address, accountAddress, tokenSymbol, isVisible, handleClose } =
    props;
  const [overrideWithWallet, setOverrideWithWallet] = useState(false);

  const isWalletAddress = () => {
    return publicKey &&
      address &&
      accountAddress &&
      address === publicKey.toBase58() &&
      accountAddress === publicKey.toBase58()
      ? true
      : false;
  };

  return (
    <Modal
      className="mean-modal simple-modal"
      title={
        <div className="modal-title">Receive {tokenSymbol || 'Funds'}</div>
      }
      footer={null}
      open={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={360}
    >
      <div className="buy-token-options">
        <div className="text-center">
          <h3 className="mb-3">Scan the QR code to receive funds</h3>

          {isWalletAddress() || overrideWithWallet ? (
            <div className="qr-container bg-white">
              <>
                {!props.multisigAddress ? (
                  <QRCodeSVG
                    value={publicKey?.toBase58() as string}
                    size={200}
                  />
                ) : (
                  <QRCodeSVG
                    value={props.multisigAddress as string}
                    size={200}
                  />
                )}
              </>
            </div>
          ) : (
            <div className="qr-container bg-white">
              <QRCodeSVG value={address} size={200} />
            </div>
          )}

          {isWalletAddress() || overrideWithWallet ? (
            <div className="flex-center font-size-70 mb-2">
              <>
                {!props.multisigAddress ? (
                  <AddressDisplay
                    address={publicKey?.toBase58() as string}
                    showFullAddress={true}
                    iconStyles={{ width: '15', height: '15' }}
                    newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${publicKey?.toBase58()}${getSolanaExplorerClusterParam()}`}
                  />
                ) : (
                  <AddressDisplay
                    address={props.multisigAddress as string}
                    showFullAddress={true}
                    iconStyles={{ width: '15', height: '15' }}
                    newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${
                      props.multisigAddress
                    }${getSolanaExplorerClusterParam()}`}
                  />
                )}
              </>
            </div>
          ) : (
            <div className="flex-center font-size-70 mb-2">
              <AddressDisplay
                address={address}
                showFullAddress={true}
                iconStyles={{ width: '15', height: '15' }}
                newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${address}${getSolanaExplorerClusterParam()}`}
              />
            </div>
          )}

          <>
            <div className="font-light font-size-75 px-4">
              {t('assets.no-balance.line4')}
            </div>
            <div className="font-light font-size-75 px-4">
              {t('assets.no-balance.line5')}
            </div>
          </>

          {/* {(isWalletAddress() || overrideWithWallet) ? (
            <>
              <div className="font-light font-size-75 px-4">{t('assets.no-balance.line4')}</div>
              <div className="font-light font-size-75 px-4">{t('assets.no-balance.line5')}</div>
            </>
          ) : (
            <>
              {tokenSymbol && (
                <div className="font-light font-size-75 px-4">Use this address to receive {tokenSymbol}</div>
              )}
              {(!overrideWithWallet && publicKey) && (
                <div className="mt-2">Looking for your wallet address? 👉 [<span className="simplelink underline-on-hover" onClick={() => setOverrideWithWallet(true)}>here</span>]</div>
              )}
            </>
          )} */}
        </div>
      </div>
    </Modal>
  );
};

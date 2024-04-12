import { Modal } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../constants';
import { getSolanaExplorerClusterParam } from '../../contexts/connection';
import { AddressDisplay } from '../AddressDisplay';

interface Props {
  isOpen: boolean;
  multisigAddress: string;
  handleClose: () => void;
}

const CopyMultisigIdModal = ({ isOpen, multisigAddress, handleClose }: Props) => {
  const { t } = useTranslation('common');

  return (
    <Modal
      className='mean-modal simple-modal'
      title={<div className='modal-title'>{t('multisig.copy-multisig-id.modal-title')}</div>}
      footer={null}
      open={isOpen}
      onOk={handleClose}
      onCancel={handleClose}
      width={380}
    >
      <div className='buy-token-options'>
        <p className='mb-2'>{t('multisig.copy-multisig-id.disclaimer1')}</p>
        <p className='mb-3'>{t('multisig.copy-multisig-id.disclaimer2')}</p>

        <div className='text-center'>
          <p className='mb-1'>{t('multisig.copy-multisig-id.scan-qr-code-label')}</p>
          <div className='qr-container bg-white'>
            <QRCodeSVG value={multisigAddress} size={200} />
          </div>
          <p className='mb-1'>{t('multisig.copy-multisig-id.copy-address-label')}</p>
          <div className='flex-center mb-1'>
            <AddressDisplay
              address={multisigAddress}
              maxChars={12}
              iconStyles={{ width: '16', height: '16', verticalAlign: '-2' }}
              newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${multisigAddress}${getSolanaExplorerClusterParam()}`}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CopyMultisigIdModal;

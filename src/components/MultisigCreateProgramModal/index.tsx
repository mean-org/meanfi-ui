import React, { useCallback } from 'react';
import { Modal, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { MultisigV2 } from '../../models/multisig';
import { IconCopy } from '../../Icons';
import { copyText } from '../../utils/ui';
import { notify } from '../../utils/notifications';

export const MultisigCreateProgramModal = (props: {
  handleClose: any;
  handleOk: any;
  handleAfterClose: any;
  isVisible: boolean;
  selectedMultisig: MultisigV2
}) => {
  const { t } = useTranslation('common');

  const onAcceptModal = () => {
    props.handleOk();
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onAfterClose = () => {
    props.handleAfterClose();
  }

  // Copy address to clipboard
  const copyMultisigAddress = useCallback((address: any) => {

    if (copyText(address.toString())) {
      notify({
        description: t('notifications.multisigid-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.multisigid-not-copied-message'),
        type: "error"
      });
    }

  },[t])

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('multisig.multisig-programs.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={480}>

      <div className="mb-3">
        <h3>Adding a program to your Multisig</h3>
        <p>To use program upgrades for your on-chain program through the MeanFi Multisig you will need to set the upgrade authority of your program to this multisig account:</p>
        <div className="well small mb-2">
          <div className="flex-fixed-right">
            <div className="left position-relative">
              <span className="recipient-field-wrapper">
                <span className="referral-link font-size-80 text-monospace">{props.selectedMultisig.address.toBase58()}</span>
              </span>
            </div>
            <div className="right">
              <div className="add-on simplelink" onClick={() => copyMultisigAddress(props.selectedMultisig.address.toBase58())}>
                <IconCopy className="mean-svg-icons" />
              </div>
            </div>
          </div>
        </div>
        <p>You can use the Solana CLI to set a program's upgrade authority, to learn more about this, <a className="simplelink underline"
          href='https://docs.solana.com/cli/deploy-a-program#set-a-programs-upgrade-authority'
          title="Set a program's upgrade authority"
          target="_blank"
          rel="noopener noreferrer">click here</a>
        </p>
        <p>Once you complete this step you can refresh the list of programs and it will appear on the list and you can immediately start upgrading your progam.</p>
      </div>

      <div className="transaction-progress">
        <Button
          type="primary"
          shape="round"
          size="large"
          onClick={onCloseModal}>
          {t('general.cta-close')}
        </Button>
      </div>

    </Modal>
  );
};

import { Button, Modal } from 'antd';

import { InputMean } from 'components/InputMean';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  handleClose: () => void;
  handleOk: ({ proposalTitle }: { proposalTitle: string }) => void;
}
export const MultisigMakeProgramImmutableModal = ({
  handleClose,
  handleOk,
}: Props) => {
  const { t } = useTranslation('common');

  const [proposalTitle, setProposalTitle] = useState('');

  const onAcceptModal = () => {
    handleOk({ proposalTitle });
  };

  const isValidForm = (): boolean => {
    return !!proposalTitle;
  };

  const getButtonLabel = () => {
    return !proposalTitle ? 'Add a proposal title' : 'Make immutable';
  };

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">Make Program Immutable</div>}
      footer={null}
      open={true}
      onOk={onAcceptModal}
      onCancel={handleClose}
      width={480}
    >
      <div>
        <div className="form-label text-left">
          {t('multisig.proposal-modal.title')}
        </div>
        <InputMean
          id="proposal-title-field"
          name="Title"
          className={`w-100 general-text-input`}
          onChange={(e: any) => {
            setProposalTitle(e.target.value);
          }}
          placeholder="Add a proposal title (required)"
          value={proposalTitle}
        />
      </div>

      <div className="row two-col-ctas mt-3 transaction-progress p-0">
        <div className="col-6">
          <Button
            block
            type="text"
            shape="round"
            size="middle"
            onClick={() => handleClose()}
          >
            {t('general.cta-close')}
          </Button>
        </div>
        <div className="col-6">
          <Button
            block
            type="primary"
            shape="round"
            size="middle"
            disabled={!isValidForm()}
            onClick={() => {
              onAcceptModal();
            }}
          >
            {getButtonLabel()}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

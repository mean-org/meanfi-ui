import React, { useEffect, useState } from 'react';
import { Modal } from "antd";
import { TokenInfo } from '@solana/spl-token-registry';
import { UserTokenAccount } from '../../models/transactions';
import { VestingLockCreateAccount } from '../../pages/vesting/components/VestingLockCreateAccount';

export const VestingContractCreateModal = (props: {
  handleClose: any;
  isVisible: boolean;
  selectedToken: UserTokenAccount | undefined;
}) => {
  const { isVisible, handleClose, selectedToken } = props;
  const [token, setToken] = useState<TokenInfo | undefined>(undefined);

  useEffect(() => {
    if (isVisible && selectedToken) {
      setToken(selectedToken);
    }
  }, [isVisible, selectedToken]);

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">Create Vesting Contract</div>}
      footer={null}
      visible={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={480}>
        <VestingLockCreateAccount
          inModal={true}
          token={token}
          vestingAccountCreated={handleClose}
          tokenChanged={(t: TokenInfo) => setToken(t)}
        />

    </Modal>
  );
};

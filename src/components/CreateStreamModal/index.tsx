import React, { useEffect, useState } from 'react';
import { Modal } from "antd";
import { RepeatingPayment } from '../../views';
import { TokenInfo } from '@solana/spl-token-registry';
import { UserTokenAccount } from "../../models/accounts";

export const CreateStreamModal = (props: {
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
      title={<div className="modal-title">Create outgoing stream</div>}
      footer={null}
      open={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={480}>
        <RepeatingPayment inModal={true} transferCompleted={props.handleClose} token={token} tokenChanged={(t: TokenInfo) => setToken(t)} />
    </Modal>
  );
};

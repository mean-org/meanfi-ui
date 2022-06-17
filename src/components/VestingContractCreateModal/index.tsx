import React, { useEffect, useState } from 'react';
import { Modal } from "antd";
import { TokenInfo } from '@solana/spl-token-registry';
import { UserTokenAccount } from '../../models/transactions';
import { VestingLockCreateAccount } from '../../pages/vesting/components/VestingLockCreateAccount';
import { TransactionFees } from '@mean-dao/msp';

export const VestingContractCreateModal = (props: {
  handleClose: any;
  handleOk: any;
  isBusy: boolean;
  isVisible: boolean;
  nativeBalance: number;
  selectedList: TokenInfo[];
  selectedToken: UserTokenAccount | undefined;
  transactionFees: TransactionFees;
  userBalances: any;
}) => {
  const {
    handleClose,
    handleOk,
    isBusy,
    isVisible,
    nativeBalance,
    selectedList,
    selectedToken,
    transactionFees,
    userBalances,
  } = props;
  const [token, setToken] = useState<TokenInfo | undefined>(undefined);

  useEffect(() => {
    if (isVisible && selectedToken) {
      setToken(selectedToken);
    }
  }, [isVisible, selectedToken]);

  return (
    <Modal
      className="mean-modal simple-modal unpadded-content"
      title={<div className="modal-title">Create Vesting Contract</div>}
      footer={null}
      visible={isVisible}
      onCancel={handleClose}
      width={480}>
        <VestingLockCreateAccount
          inModal={true}
          token={token}
          isBusy={isBusy}
          transactionFees={transactionFees}
          onStartTransaction={handleOk}
          tokenChanged={(t: TokenInfo) => setToken(t)}
          userBalances={userBalances}
          nativeBalance={nativeBalance}
          selectedList={selectedList}
        />

    </Modal>
  );
};

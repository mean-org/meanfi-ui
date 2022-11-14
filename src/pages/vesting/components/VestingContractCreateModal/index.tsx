import React, { useEffect, useState } from 'react';
import { Modal } from 'antd';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { UserTokenAccount } from 'models/accounts';
import { VestingContractCreateForm } from '../VestingContractCreateForm';
import { TransactionFees } from '@mean-dao/msp';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';

export const VestingContractCreateModal = (props: {
  accountAddress: string;
  handleClose: any;
  handleOk: any;
  isBusy: boolean;
  isMultisigContext: boolean;
  isVisible: boolean;
  loadingMultisigAccounts: boolean;
  nativeBalance: number;
  selectedList: TokenInfo[];
  selectedMultisig: MultisigInfo | undefined;
  selectedToken: UserTokenAccount | undefined;
  transactionFees: TransactionFees;
  userBalances: any;
}) => {
  const {
    accountAddress,
    handleClose,
    handleOk,
    isBusy,
    isMultisigContext,
    isVisible,
    loadingMultisigAccounts,
    nativeBalance,
    selectedList,
    selectedMultisig,
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
      className="mean-modal simple-modal"
      title={<div className="modal-title">Create Vesting Contract</div>}
      footer={null}
      open={isVisible}
      onCancel={handleClose}
      width={480}
    >
      <VestingContractCreateForm
        inModal={true}
        token={token}
        isBusy={isBusy}
        loadingMultisigAccounts={loadingMultisigAccounts}
        accountAddress={accountAddress}
        isMultisigContext={isMultisigContext}
        transactionFees={transactionFees}
        onStartTransaction={handleOk}
        tokenChanged={(t: TokenInfo) => setToken(t)}
        userBalances={userBalances}
        nativeBalance={nativeBalance}
        selectedList={selectedList}
        selectedMultisig={selectedMultisig}
      />
    </Modal>
  );
};

import React, { useEffect, useState } from 'react';
import { Modal, Tabs } from "antd";
import { useTranslation } from "react-i18next";
import { OneTimePayment, RepeatingPayment } from '../../views';
import { TokenInfo } from '@solana/spl-token-registry';
import { UserTokenAccount } from '../../models/transactions';
import { useLocation } from 'react-router-dom';

type TransfersTabOption = "one-time" | "recurring";

export const SendAssetModal = (props: {
  handleClose: any;
  isVisible: boolean;
  selected: TransfersTabOption;
  selectedToken: UserTokenAccount | undefined;
}) => {
  const { selected, isVisible, handleClose, selectedToken } = props;
  const location = useLocation();
  const { t } = useTranslation("common");
  const [token, setToken] = useState<TokenInfo | undefined>(undefined);

  useEffect(() => {
    if (isVisible && selectedToken) {
      setToken(selectedToken);
    }
  }, [isVisible, selectedToken]);

  const tabs = [
    {
      key: "one-time",
      label: t('swap.tabset.one-time'),
      children: (<OneTimePayment inModal={true} transferCompleted={props.handleClose} token={token} tokenChanged={(t: TokenInfo) => setToken(t)} />)
    },
    {
      key: "recurring",
      label: t('swap.tabset.recurring'),
      children: (<RepeatingPayment inModal={true} transferCompleted={props.handleClose} token={token} tokenChanged={(t: TokenInfo) => setToken(t)} />)
    }
  ];

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{
        location.pathname.endsWith('/streams')
          ? t("transfers.create-money-stream-modal-title")
          : t("transfers.send-asset-modal-title")
      }</div>}
      footer={null}
      visible={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={480}>
        {location.pathname.endsWith('/streams') ? (
          <RepeatingPayment inModal={true} transferCompleted={props.handleClose} token={token} tokenChanged={(t: TokenInfo) => setToken(t)} />
        ) : (
          <Tabs
            items={tabs}
            className="shift-up-2"
            defaultActiveKey={selected}
            centered
          />
        )}
    </Modal>
  );
};

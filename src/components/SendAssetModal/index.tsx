import React, { useEffect, useState } from 'react';
import { Modal, Tabs } from "antd";
import { useTranslation } from "react-i18next";
import { OneTimePayment, RepeatingPayment } from '../../views';
import { TokenInfo } from '@solana/spl-token-registry';
import { UserTokenAccount } from '../../models/transactions';
import { useLocation } from 'react-router-dom';

const { TabPane } = Tabs;
type TransfersTabOption = "one-time" | "recurring";

export const SendAssetModal = (props: {
  handleClose: any;
  isVisible: boolean;
  selected: TransfersTabOption;
  selectedToken: UserTokenAccount;
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
          <Tabs className="shift-up-2" defaultActiveKey={selected} centered>
            <TabPane tab={t('swap.tabset.one-time')} key={"one-time"}>
              <OneTimePayment inModal={true} transferCompleted={props.handleClose} token={token} tokenChanged={(t: TokenInfo) => setToken(t)} />
            </TabPane>
            <TabPane tab={t('swap.tabset.recurring')} key={"recurring"}>
              <RepeatingPayment inModal={true} transferCompleted={props.handleClose} token={token} tokenChanged={(t: TokenInfo) => setToken(t)} />
            </TabPane>
          </Tabs>
        )}
    </Modal>
  );
};

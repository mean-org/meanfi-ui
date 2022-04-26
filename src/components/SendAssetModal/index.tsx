import React, { useContext } from 'react';
import { Modal, Tabs } from "antd";
import { useTranslation } from "react-i18next";
import { AppStateContext } from '../../contexts/appstate';
import { OneTimePayment, RepeatingPayment } from '../../views';

const { TabPane } = Tabs;
type TransfersTabOption = "one-time" | "recurring";

export const SendAssetModal = (props: {
  handleClose: any;
  isVisible: boolean;
  selected: TransfersTabOption;
  tokenSymbol: string;
}) => {
  const { tokenSymbol, selected, isVisible, handleClose } = props;
  const { t } = useTranslation("common");
  const {
    tokenList,
    selectedToken,
    setSelectedToken,
    setContract,
  } = useContext(AppStateContext);

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">Send {tokenSymbol || 'Funds'}</div>}
      footer={null}
      visible={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={480}>
        <Tabs className="shift-up-2" defaultActiveKey={selected} centered>
          <TabPane tab={t('swap.tabset.one-time')} key={"one-time"}>
            <OneTimePayment inModal={true} />
          </TabPane>
          <TabPane tab={t('swap.tabset.recurring')} key={"recurring"}>
            <RepeatingPayment inModal={true} />
          </TabPane>
        </Tabs>
    </Modal>
  );
};

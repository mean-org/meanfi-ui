import { Modal, Tabs, Button } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import { useContext } from "react";
import { AppStateContext } from "../../contexts/appstate";
import { STREAMING_PAYMENT_CONTRACTS } from "../../constants";
import { ContractDefinition } from "../../models/contract-definition";
import { useTranslation } from "react-i18next";

const { TabPane } = Tabs;

export const ContractSelectorModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const { contract, setContract } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  const getCategories = (): ContractDefinition[] => {
    const results = STREAMING_PAYMENT_CONTRACTS.reduce((accumulator: ContractDefinition[], currentItem: ContractDefinition, currentIndex) => {
      // look up if the current item is of category that is already in our end result.
      const index = accumulator.findIndex((item) => item.categoryId === currentItem.categoryId);
      if (index < 0) {
          accumulator.push(currentItem); // now item added to the array
      }
      return accumulator;
    }, []);

    return results || [];
  }

  const getContractListByCategory = (categoryId: string): ContractDefinition[] => {
    return STREAMING_PAYMENT_CONTRACTS.filter(c => c.categoryId === categoryId);
  }

  const contractCategories = (
    <Tabs defaultActiveKey={contract?.categoryId} centered>
      {getCategories().map((tab) => {
        return (
          <TabPane tab={t(`contract-selector.categories.${tab.categoryId}`)} key={tab.categoryId}>
            <div className="contract-card-list vertical-scroll">
              {getContractListByCategory(tab.categoryId).map(cntrct => {
                return (
                  <div key={`${cntrct.id}`} className={`contract-card ${cntrct.name === contract?.name
                    ? "selected"
                    : cntrct.disabled
                    ? "disabled"
                    : ""
                  }`}
                  onClick={() => {
                    if (!cntrct.disabled) {
                      setContract(cntrct.name);
                    }
                  }}>
                    <div className="checkmark">
                      <CheckOutlined />
                    </div>
                    <div className="contract-meta">
                      <div className="contract-name">{t(`contract-selector.${cntrct.translationId}.name`)}</div>
                      <div className="contract-description">{t(`contract-selector.${cntrct.translationId}.description`)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabPane>
        );
      })}
    </Tabs>
  );

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('contract-selector.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={480}>
      {/* A formarla */}
      <div className="text-center">
        <span className="yellow-pill">{t('contract-selector.lead')}</span>
      </div>
      {contractCategories}
      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        onClick={props.handleOk}>
        {t("contract-selector.primary-action")}
      </Button>
    </Modal>
  );
};

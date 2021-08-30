import React from 'react';
import { Modal, Button } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import { useContext } from "react";
import { AppStateContext } from "../../contexts/appstate";
import { STREAMING_PAYMENT_CONTRACTS } from "../../constants";
import { ContractDefinition } from "../../models/contract-definition";
import { useTranslation } from "react-i18next";

export const ContractSelectorModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const { contract, setContract } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  // const getCategories = (): ContractDefinition[] => {
  //   const results = STREAMING_PAYMENT_CONTRACTS.reduce((accumulator: ContractDefinition[], currentItem: ContractDefinition, currentIndex) => {
  //     // look up if the current item is of category that is already in our end result.
  //     const index = accumulator.findIndex((item) => item.categoryId === currentItem.categoryId);
  //     if (index < 0) {
  //         accumulator.push(currentItem); // now item added to the array
  //     }
  //     return accumulator;
  //   }, []);

  //   return results || [];
  // }

  const getContractListByCategory = (categoryId: string): ContractDefinition[] => {
    return STREAMING_PAYMENT_CONTRACTS.filter(c => c.categoryId === categoryId && !c.disabled);
  }

  const contractsList = (
    <div className="contract-card-list vertical-scroll">
      {getContractListByCategory('cat1').map(cntrct => {
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
  );

  // const oldContractsList = (
  //   <Tabs defaultActiveKey={contract?.categoryId} centered>
  //     {getCategories().map((tab) => {
  //       return (
  //         <div className="contract-card-list vertical-scroll">
  //           {getContractListByCategory(tab.categoryId).map(cntrct => {
  //             return (
  //               <div key={`${cntrct.id}`} className={`contract-card ${cntrct.name === contract?.name
  //                 ? "selected"
  //                 : cntrct.disabled
  //                 ? "disabled"
  //                 : ""
  //               }`}
  //               onClick={() => {
  //                 if (!cntrct.disabled) {
  //                   setContract(cntrct.name);
  //                 }
  //               }}>
  //                 <div className="checkmark">
  //                   <CheckOutlined />
  //                 </div>
  //                 <div className="contract-meta">
  //                   <div className="contract-name">{t(`contract-selector.${cntrct.translationId}.name`)}</div>
  //                   <div className="contract-description">{t(`contract-selector.${cntrct.translationId}.description`)}</div>
  //                 </div>
  //               </div>
  //             );
  //           })}
  //         </div>
  //       );
  //     })}
  //   </Tabs>
  // );

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('contract-selector.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={480}>
      {contractsList}
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

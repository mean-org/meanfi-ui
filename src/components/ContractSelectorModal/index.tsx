import { Modal } from "antd";
// import { useContext } from "react";
// import { AppStateContext } from "../../contexts/contract";
// import { STREAMING_PAYMENT_CONTRACTS } from "../../constants";
// import { ContractDefinition } from "../../models/contract-definition";

export const ContractSelectorModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  // const { currentScreen, setCurrentScreen } = useContext(AppStateContext);

  // const getCategories = (): string[] => {
  //   const results = STREAMING_PAYMENT_CONTRACTS.reduce((accumulator: ContractDefinition[], currentItem: ContractDefinition, currentIndex) => {
  //     // look up if the current item is of an integrationId that is already in our end result.
  //     const index = accumulator.findIndex((item) => item.category === currentItem.category);
  //     if (index < 0) {
  //         accumulator.push(currentItem); // now item added to the array
  //     }
  //     return accumulator;
  //   }, []);

  //   const categoryList = results.map(i => i.category);
  //   return categoryList || [];
  // }

  // const contractCategories = (
  //   <Tabs defaultActiveKey="1" centered>
  //     <TabPane tab="Tab 1" key="1">
  //       Content of Tab Pane 1
  //     </TabPane>
  //     <TabPane tab="Tab 2" key="2">
  //       Content of Tab Pane 2
  //     </TabPane>
  //     <TabPane tab="Tab 3" key="3">
  //       Content of Tab Pane 3
  //     </TabPane>
  //   </Tabs>
  // );

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">Create a New Money Streaming Contract</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={480}>
      {/* A formarla */}
      <div className="text-center">
        <span className="yellow-badge">Choose from battle-tested audited contracts</span>
      </div>
    </Modal>
  );
};

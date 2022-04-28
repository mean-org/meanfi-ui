import './style.scss';
import { Row } from "antd"
import { IconArrowBack } from "../../../../Icons"
import { ProposalResumeItem } from '../ProposalResumeItem';

export const SafeDetailsView = (props: {
  isSafeDetails: boolean;
  onDataToSafeView: any;
  proposalSelected: any
}) => {
  const { onDataToSafeView, proposalSelected } = props;

  // When back button is clicked, goes to Safe Info
  const hideDetailsHandler = () => {
    // Sends the value to the parent component "SafeView"
    onDataToSafeView();
  };

  return (
    <>
      <Row gutter={[8, 8]} className="safe-details-container">
        <div onClick={hideDetailsHandler} className="back-button icon-button-container">
          <IconArrowBack className="mean-svg-icons" />
          <span>Back</span>
        </div>
      </Row>
      <ProposalResumeItem 
        id={proposalSelected.id}
        title={proposalSelected.title}
        expires={proposalSelected.expires}
        approved={proposalSelected.approved}
        rejected={proposalSelected.rejected}
        status={proposalSelected.status}
        needs={proposalSelected.needs}
      />
    </>
  )
}
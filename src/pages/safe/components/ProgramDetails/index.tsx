import { Row } from "antd";
import { IconArrowBack } from "../../../../Icons";

export const ProgramDetailsView = (props: {
  isProgramDetails: boolean;
  onDataToProgramView: any;
  programSelected: any;
}) => {
  const { isProgramDetails, onDataToProgramView, programSelected } = props;

  // When back button is clicked, goes to Safe Info
  const hideProgramDetailsHandler = () => {
    // Sends the value to the parent component "SafeView"
    onDataToProgramView();
  };

  return (
    <>
      <div className="program-details-container">
        <Row gutter={[8, 8]} className="program-details-resume">
          <div onClick={hideProgramDetailsHandler} className="back-button icon-button-container">
            <IconArrowBack className="mean-svg-icons" />
            <span>Back</span>
          </div>
        </Row>
        <Row>
          <h3>{programSelected.name}</h3>
        </Row>
      </div>
    </>
  )
};
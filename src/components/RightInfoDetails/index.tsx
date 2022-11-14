import { Col, Row } from "antd";
import "./style.scss";

export const RightInfoDetails = (props: {
  infoData: Array<any>;
  xs?: number;
  sm?: number;
  md?: number;
  lg?: number;
  classNameInfoGroup?: string;
}) => {
  const { infoData, xs, sm, md, lg, classNameInfoGroup } = props;

  return (
    <Row gutter={[8, 8]} className="right-info-container ml-0 mr-0">
      {infoData.map((info, index) => (
        <Col xs={xs || 12} sm={sm || 12} md={md || 12} lg={lg || 12} key={index}>
          <div className={`right-info-group ${classNameInfoGroup}`}>
            <span className="info-label">
              {info.name}
            </span>
            <span className="info-value">
              {info.value}
            </span>
            {info.content && (
              <span className="info-content">
                {info.content}
              </span>
            )}
          </div>
        </Col>
      ))}
    </Row>
  )
}
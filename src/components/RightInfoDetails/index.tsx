import { Col, Row } from "antd";
import "./style.scss";

export const RightInfoDetails = (props: {
  infoData: Array<any>;
}) => {
  const { infoData } = props;

  return (
    <Row gutter={[8, 8]} className="right-info-container">
      {infoData.map((info, index) => (
        <Col xs={12} sm={12} md={12} lg={12} key={index}>
          <div className="right-info-group">
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
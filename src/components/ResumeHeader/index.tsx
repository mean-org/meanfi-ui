import './style.scss';
import { Row } from "antd"

export const ResumeHeader = (props: {
  title?: any;
}) => {

  const { title } = props;

  return (
    <>
      <Row className="asset-category-title flex-fixed-right">
        <div className="title">Outflows</div>
        <div className="amount">1</div>
      </Row>
    </>
  )
}
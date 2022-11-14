import { Card, Col } from 'antd';

const CardWithHeader = (props: {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  header: JSX.Element;
  body: JSX.Element;
  className: string;
}) => {
  const { xs, sm, md, lg, header, body, className } = props;

  return (
    <Col xs={xs} sm={sm} md={md} lg={lg}>
      <Card className={`ant-card card ${className}`}>
        <div className="ant-card-head">
          <div className="ant-card-head-wrapper">
            {header}
          </div>
        </div>
        <div className="ant-card-body">
          {body}
        </div>
      </Card>
    </Col>
  );
};

export default CardWithHeader;
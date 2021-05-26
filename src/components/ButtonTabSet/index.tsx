import { Button, Col, Row } from "antd";

export const ButtonTabSet = (props: {
    currentTab: string;
    onTabChange(tab: string): any;
}) => {
    return (
        <div className="button-tabset-container">
            <Row gutter={[24, 24]}>
                <Col span={12}>
                    <Button
                    block
                    shape="round"
                    type="text"
                    size="large"
                    className={`${
                        props.currentTab === "contract" ? "ant-btn-shaded" : "ant-btn-flat"
                    }`}
                    onClick={() => props.onTabChange("contract")}>
                    Contract
                    </Button>
                </Col>
                <Col span={12}>
                    <Button
                    block
                    shape="round"
                    type="text"
                    size="large"
                    className={`${
                        props.currentTab === "streams" ? "ant-btn-shaded" : "ant-btn-flat"
                    }`}
                    onClick={() => props.onTabChange("streams")}>
                    Streams
                    </Button>
                </Col>
            </Row>
        </div>
    );
};

import { Button, Col, Dropdown, Menu, Row } from "antd";
import { IconEllipsisVertical } from "../../Icons";
import { MoneyStreamDetails } from "../../components/MoneyStreamDetails";
import { useCallback, useContext } from "react";
import { Stream, STREAM_STATUS } from "@mean-dao/msp";
import { StreamInfo, STREAM_STATE } from "@mean-dao/money-streaming/lib/types";
import { getShortDate } from "../../utils/ui";
import { useTranslation } from "react-i18next";
import { ArrowUpOutlined } from "@ant-design/icons";
import { AppStateContext } from "../../contexts/appstate";
import { getTokenAmountAndSymbolByTokenAddress, toUiAmount } from "../../utils/utils";
import BN from "bn.js";

export const MoneyStreamsOutgoingView = (props: {
  stream?: any;
  onSendFromOutgoingStreamDetails?: any;
  // tabs?: Array<any>;
}) => {
  const {
    getTokenByMintAddress,
  } = useContext(AppStateContext);

  const { stream, onSendFromOutgoingStreamDetails } = props;
  const { t } = useTranslation('common');

  const isNewStream = useCallback(() => {
    if (stream) {
      return stream.version >= 2 ? true : false;
    }

    return false;
  }, [stream]);

  const hideDetailsHandler = () => {
    onSendFromOutgoingStreamDetails();
  }

  const getStreamStatus = useCallback((item: Stream | StreamInfo) => {
    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        switch (v1.state) {
          case STREAM_STATE.Schedule:
            return t('streams.status.status-scheduled');
          case STREAM_STATE.Paused:
            return t('streams.status.status-stopped');
          default:
            return t('streams.status.status-running');
        }
      } else {
        switch (v2.status) {
          case STREAM_STATUS.Schedule:
            return t('streams.status.status-scheduled');
          case STREAM_STATUS.Paused:
            if (v2.isManuallyPaused) {
              return t('streams.status.status-paused');
            }
            return t('streams.status.status-stopped');
          default:
            return t('streams.status.status-running');
        }
      }
    }
  }, [t]);

  const renderFundsLeftInAccount = () => {
    if (!stream) {return null;}

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;
    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        <span className="info-data large mr-1">
          {stream
            ? getTokenAmountAndSymbolByTokenAddress(
                isNewStream()
                  ? toUiAmount(new BN(v2.fundsLeftInStream), token?.decimals || 6)
                  : v1.escrowUnvestedAmount,
                stream.associatedToken as string
              )
            : '--'
          }
        </span>
        <span className="info-icon">
          {(stream && getStreamStatus(stream) === "Running") ? (
            <ArrowUpOutlined className="mean-svg-icons outgoing bounce" />
          ) : (
            <ArrowUpOutlined className="mean-svg-icons outgoing" />
          )}
        </span>
      </>
    )
  }

  // Info Data
  const infoData = [
    {
      name: "Funds left in account",
      value: renderFundsLeftInAccount()
    },
  ];

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="mso-00" onClick={() => {}}>
        <span className="menu-item-text">Copy stream id</span>
      </Menu.Item>
      <Menu.Item key="mso-01" onClick={() => {}}>
        <span className="menu-item-text">View on Explorer</span>
      </Menu.Item>
      <Menu.Item key="mso-02" onClick={() => {}}>
        <span className="menu-item-text">Close stream</span>
      </Menu.Item>
    </Menu>
  );

  // Buttons
  const buttons = (
    <Row gutter={[8, 8]} className="safe-btns-container mb-1">
      <Col xs={20} sm={18} md={20} lg={18} className="btn-group">
        <Button
          type="default"
          shape="round"
          size="small"
          className="thin-stroke"
          onClick={() => {}}>
            <div className="btn-content">
              Add funds
            </div>
        </Button>
        <Button
          type="default"
          shape="round"
          size="small"
          className="thin-stroke"
          onClick={() => {}}>
            <div className="btn-content">
              Pause stream
            </div>
        </Button>
      </Col>

      <Col xs={4} sm={6} md={4} lg={6}>
        <Dropdown
          overlay={menu}
          placement="bottomRight"
          trigger={["click"]}>
          <span className="ellipsis-icon icon-button-container mr-1">
            <Button
              type="default"
              shape="circle"
              size="middle"
              icon={<IconEllipsisVertical className="mean-svg-icons"/>}
              onClick={(e) => e.preventDefault()}
            />
          </span>
        </Dropdown>
      </Col>
    </Row>
  );

  return (
    <>
      <MoneyStreamDetails
        stream={stream}
        hideDetailsHandler={hideDetailsHandler}
        infoData={infoData}
        isStreamOutgoing={true}
        buttons={buttons}
      />
    </>
  )
}
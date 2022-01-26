import React, { useState } from "react";
import { Button, Popover } from "antd";
import { useTranslation } from "react-i18next";
import { CloseOutlined } from "@ant-design/icons";
import { shortenAddress } from "../../utils/utils";
import "./style.less";
import { MultisigParticipant } from "../../models/multisig";

export const MultisigOwnersView = (props: {
  participants: MultisigParticipant[];
  label: string;
  className?: string;
}) => {
  const { t } = useTranslation("common");
  const [popoverVisible, setPopoverVisible] = useState(false);

  const handlePopoverVisibleChange = (visibleChange: boolean) => {
    setPopoverVisible(visibleChange);
  };

  const titleContent = (
    <div className="flexible-left">
      <div className="left">{t('multisig.multisig-account-detail.multisig-owners')}</div>
      <div className="right">
        <Button
          type="default"
          shape="circle"
          icon={<CloseOutlined />}
          onClick={() => handlePopoverVisibleChange(false)}
        />
      </div>
    </div>
  );

  const bodyContent = (
    <>
    {props.participants && props.participants.length > 0 ? (
      <div className="cebra-list">
      {props.participants.map((item, index) => {
        return (
          <div key={`${index}`} className="cebra-list-item flex-fixed-right">
            <div className="left">{item.name || `Owner ${index + 1}`}</div>
            <div className="right text-monospace">{shortenAddress(item.address, 6)}</div>
          </div>
        );
      })}
      </div>
    ) : (
      <div className="pl-1">{t('multisig.create-multisig.multisig-no-participants')}</div>
    )}
    </>
  );

  return (
    <>
      <Popover
        placement="bottom"
        title={titleContent}
        content={bodyContent}
        visible={popoverVisible}
        onVisibleChange={handlePopoverVisibleChange}
        trigger="click">
        {props.className ? (
          <span className={`${props.className}`}>(<span className="simplelink underline-on-hover">{props.label}</span>)</span>
        ) : (
          (<span className="simplelink underline-on-hover">{props.label}</span>)
        )}
      </Popover>
    </>
  );
};

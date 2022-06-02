import { useState } from "react";
import { Button, Popover, Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import { CloseOutlined, CopyOutlined } from "@ant-design/icons";
// import { shortenAddress } from "../../utils/utils";
import "./style.scss";
import { MultisigParticipant } from "@mean-dao/mean-multisig-sdk";
// import { copyText } from "../../utils/ui";
// import { openNotification } from "../Notifications";
import { CopyExtLinkGroup } from "../CopyExtLinkGroup";

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

  // const onCopyAddress = (address: any) => {
  //   if (address && copyText(address)) {
  //     openNotification({
  //       description: t('notifications.account-address-copied-message'),
  //       type: "info"
  //     });
  //   } else {
  //     openNotification({
  //       description: t('notifications.account-address-not-copied-message'),
  //       type: "error"
  //     });
  //   }
  // }

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
          <div key={`${index}`} className="cebra-list-item flex-fixed-right align-items-center">
            <div className="left">{item.name || `Owner ${index + 1}`}</div>
            <CopyExtLinkGroup
              content={item.address}
              number={6}
              message={t('assets.account-address-copy-cta')}
              externalLink={true}
            />
            {/* <div className="right text-monospace">{shortenAddress(item.address, 6)}</div>
            <span className="icon-button-container">
              <Tooltip placement="bottom" title={t('assets.account-address-copy-cta')}>
                <Button
                  type="default"
                  shape="circle"
                  size="middle"
                  icon={<CopyOutlined />}
                  onClick={() => onCopyAddress(item.address)}
                />
              </Tooltip>
            </span> */}
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

import React from "react";
import { Button, Popover } from "antd";
import { TooltipPlacement } from "antd/lib/tooltip";
import { InfoCircleOutlined } from "@ant-design/icons";

export const InfoIcon = (props: {
  content: React.ReactElement | null;
  title?: React.ReactElement;
  style?: React.CSSProperties;
  trigger?: string;
  placement?: TooltipPlacement | undefined;
}) => {
  return (
    <Popover
      title={props.title || null}
      trigger={props.trigger || "hover"}
      placement={props.placement || "top"}
      content={<div style={{ width: 300 }}>{props.content}</div>}>
      <Button
        className="info-icon-button"
        type="default"
        shape="circle">
        <InfoCircleOutlined style={props.style} />
      </Button>
    </Popover>
  );
};

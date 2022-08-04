import React from "react";
import { Button, Popover } from "antd";
import { TooltipPlacement } from "antd/lib/tooltip";

export const InfoIcon = (props: {
  children: React.ReactElement;
  content: React.ReactElement | null;
  title?: React.ReactElement;
  style?: React.CSSProperties;
  trigger?: string;
  placement?: TooltipPlacement | undefined;
  className?: string;
}) => {
  return (
    <Popover
      title={props.title || null}
      trigger={props.trigger || "hover"}
      placement={props.placement || "top"}
      content={<div style={{ width: 320 }}>{props.content}</div>}>
      <Button
        className={`info-icon-button ${props.className}`}
        type="default"
        shape="circle">
        {props.children}
      </Button>
    </Popover>
  );
};

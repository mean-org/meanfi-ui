import { Button, Popover, type PopoverProps } from 'antd';
import type { TooltipPlacement } from 'antd/lib/tooltip';
import type React from 'react';

export const InfoIcon = (props: {
  children: React.ReactElement;
  content: React.ReactNode;
  title?: React.ReactElement;
  style?: React.CSSProperties;
  trigger?: PopoverProps['trigger'];
  placement?: TooltipPlacement | undefined;
  className?: string;
}) => {
  return (
    <Popover
      title={props.title || null}
      trigger={props.trigger || 'hover'}
      placement={props.placement || 'top'}
      content={<div style={{ width: 320 }}>{props.content}</div>}
    >
      <Button className={`info-icon-button ${props.className}`} type='default' shape='circle'>
        {props.children}
      </Button>
    </Popover>
  );
};

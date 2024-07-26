import notification from 'antd/lib/notification';
import type { IconType } from 'antd/lib/notification/interface';
import type { ReactNode } from 'react';

export const openNotification = (props: {
  type?: IconType;
  handleClose?: () => void;
  title?: string;
  description: ReactNode | string;
  duration?: number | null | undefined;
  key?: string;
  btn?: ReactNode;
}) => {
  const { type, title, description, duration, handleClose, key, btn } = props;
  notification.open({
    btn,
    key,
    type: type || 'info',
    style: { top: 110 },
    message: <span>{title}</span>,
    description: <span>{description}</span>,
    duration: duration,
    placement: 'topRight',
    onClose: handleClose,
  });
};

import notification, { IconType } from "antd/lib/notification";
import { ReactNode } from "react";

export const openNotification = (props: {
    type?: IconType,
    handleClose?: any;
    title?: string;
    description: JSX.Element | string;
    duration?: number | null | undefined;
    key?: string;
    btn?: ReactNode;
}) => {
    const { type, title, description, duration, handleClose, key, btn } = props;
    notification.open({
        btn,
        key,
        type: type || "info",
        top: 110,
        message: <span>{title}</span>,
        description: (
            <span>{description}</span>
        ),
        duration: duration,
        placement: "topRight",
        onClose: handleClose,
    });
};

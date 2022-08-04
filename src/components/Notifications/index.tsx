import notification, { IconType } from "antd/lib/notification";

export const openNotification = (props: {
    type?: IconType,
    handleClose?: any;
    title?: string;
    description: JSX.Element | string;
    duration?: number | null | undefined;
    key?: string;
}) => {
    const { type, title, description, duration, handleClose, key } = props;
    notification.open({
        key,
        type: type || "info",
        top: 110,
        message: <span>{title}</span>,
        description: (
            <span>{description}</span>
        ),
        duration: duration,
        placement: "topRight",
        onClose: handleClose ? handleClose : undefined,
    });
};

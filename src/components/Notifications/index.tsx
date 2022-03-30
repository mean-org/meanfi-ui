import notification, { IconType } from "antd/lib/notification";

export const openNotification = (props: {
    type?: IconType,
    handleClose?: any;
    title?: string;
    description: JSX.Element;
    duration?: number | null | undefined;
    key?: string;
}) => {
    const { type, title, description, duration, handleClose, key } = props;
    notification.open({
        key,
        type: type || "info",
        message: <span>{title}</span>,
        description: (
            <span>{description}</span>
        ),
        duration: duration,
        placement: "bottomLeft",
        onClose: handleClose ? handleClose : undefined,
    });
};

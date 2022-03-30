import notification, { IconType } from "antd/lib/notification";

export const openNotification = (props: {
    type?: IconType,
    handleClose?: any;
    title?: string;
    description: JSX.Element;
    duration?: number | null | undefined;
}) => {
    const { type, title, description, duration, handleClose } = props;
    const key = `open${Date.now()}`;
    notification.open({
        key,
        type: type || "info",
        message: <span style={{ color: "black" }}>{title}</span>,
        description: (
            <span style={{ color: "black", opacity: 0.5 }}>{description}</span>
        ),
        duration: duration,
        placement: "bottomLeft",
        onClose: handleClose ? handleClose : undefined,
    });
};

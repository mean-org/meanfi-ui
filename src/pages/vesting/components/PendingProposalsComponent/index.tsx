import React, { useContext } from "react";
import { ArrowRightOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import { useNavigate } from "react-router-dom";
import { AppStateContext } from "../../../../contexts/appstate";

export const PendingProposalsComponent = (props: {
    accountAddress: string | null;
    extraClasses?: string;
    pendingMultisigTxCount: number | undefined;
}) => {
    const {
        accountAddress,
        extraClasses,
        pendingMultisigTxCount,
    } = props;
    const {
        loadingMultisigTxPendingCount,
        setHighLightableMultisigId,
    } = useContext(AppStateContext);
    const navigate = useNavigate();

    if (loadingMultisigTxPendingCount || !pendingMultisigTxCount || pendingMultisigTxCount === 0) {
        return null;
    }

    return (
        <>
            <div key="pending-proposals" className={`transaction-list-row${extraClasses ? ' ' + extraClasses : '' }`}>
                <div className="flex-row align-items-center fg-warning simplelink underline-on-hover" onClick={() => {
                    let url = '/multisig';
                    if (accountAddress) {
                        setHighLightableMultisigId(accountAddress);
                        url = `/multisig/${accountAddress}?v=proposals`;
                    }
                    navigate(url);
                }}>
                    <div className="font-bold">There are pending proposals on this account</div>
                    <span className="icon-button-container ml-1">
                        <Tooltip placement="bottom" title="Go to safe account">
                            <Button
                                type="default"
                                shape="circle"
                                size="middle"
                                icon={<ArrowRightOutlined />}
                                className="fg-warning"
                            />
                        </Tooltip>
                    </span>
                </div>
            </div>
        </>
    );
}

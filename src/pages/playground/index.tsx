import { Divider } from 'antd';
import React, { useContext, useEffect, useState } from 'react';
import { PreFooter } from "../../components/PreFooter";
import { AppStateContext } from '../../contexts/appstate';
import { UserTokenAccount } from '../../models/transactions';
import { getAmountWithTokenSymbol } from '../../utils/ui';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';

const CRYPTO_VALUES: number[] = [
    0.1,
    0.02,
    0.003,
    0.0004,
    0.00005,
    0.000004,
    0.0000003,
    0.00000002,
    0.00000012345678,
    1.50,
    10.50,
    1200.55,
    18560.50,
    1000.000009
];

export const PlaygroundView = () => {

    const { userTokens } = useContext(AppStateContext);
    const [selectedMint, setSelectedMint] = useState<UserTokenAccount | undefined>(undefined);

    useEffect(() => {
        if (!selectedMint) {
            setSelectedMint(userTokens[0]);
        }
    }, [
        selectedMint,
        userTokens
    ]);

    const renderTable = () => {
        return CRYPTO_VALUES.map((value: number, index: number) => {
            return (
                <div className="item-list-row" key={index}>
                    <div className="std-table-cell responsive-cell pr-2 text-right">
                        {selectedMint ? `${value.toFixed(selectedMint.decimals)} ${selectedMint.symbol}` : ''}
                    </div>
                    <div className="std-table-cell responsive-cell pr-2 text-right">
                        {selectedMint ? getTokenAmountAndSymbolByTokenAddress(value, selectedMint.address) : ''}
                    </div>
                    <div className="std-table-cell responsive-cell text-right">
                        {selectedMint ? getAmountWithTokenSymbol(value, selectedMint, selectedMint.decimals) : ''}
                    </div>
                </div>
            );
        });
    };

  return (
    <>
    <div className="solid-bg">
        <section className="content">
            <div className="container mt-4 flex-column flex-center">
                <div className="boxed-area">
                    <div className="item-list-header">
                        <div className="header-row">
                            <div className="std-table-cell responsive-cell pr-2 text-right">Format1</div>
                            <div className="std-table-cell responsive-cell pr-2 text-right">Format2</div>
                            <div className="std-table-cell responsive-cell text-right">Format3</div>
                        </div>
                    </div>
                    <div className="item-list-body">
                        {renderTable()}
                    </div>
                    <Divider />
                    <div>
                        Format1: <code>value.toFixed(decimals)</code><br/>
                        Format2: <code>getTokenAmountAndSymbolByTokenAddress(value, mintAddress)</code><br/>
                        Format3: <code>formatAmount(value, decimals)</code>
                    </div>
                </div>
            </div>
        </section>
    </div>
    <PreFooter />
    </>
  );

};

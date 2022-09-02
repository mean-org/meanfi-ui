import "./style.scss";
import { IconSafe, IconWallet } from "../../Icons";
import { AccountSelectorItem } from "../AccountSelectorItem";
import { useWallet } from "../../contexts/wallet";
import { shortenAddress } from "../../middleware/utils";
import { useContext } from "react";
import { AppStateContext } from "../../contexts/appstate";
import { toUsCurrency } from "../../middleware/ui";

export const AccountSelector = () => {
  const {
    multisigAccounts,
  } = useContext(AppStateContext);

  const { wallet } = useWallet();
  
  const walletAccountPublicKey = wallet && wallet.publicKey ? wallet.publicKey.toBase58() : "";
  const walletAccountIcon = wallet ? wallet.icon : "";
  const walletAccountAddress = shortenAddress(walletAccountPublicKey as string, 8);

  return (
    <div className="account-selector">
      <div className="boxed-area">
        <h2>Select Account</h2>
        <div className="wallet-account left mb-2">
          <div className="account-title fg-secondary-40">
            <IconWallet className="mean-svg-icons fg-secondary-40 mr-1" />
            <span className="m-0">Wallet Account</span>
          </div>
          <div className="account-content">
            <AccountSelectorItem
              id={walletAccountPublicKey}
              src={walletAccountIcon}
              title={walletAccountAddress}
              subtitle="Personal account"
              amount="$34.01"
              resume="balance"
            />
          </div>
        </div>
        <div className="safe-account right">
          <div className="account-title fg-secondary-40">
            <IconSafe className="mean-svg-icons fg-secondary-40 mr-1" />
            <span className="m-0">Super Safe</span>
          </div>
          <div className="account-content">
            {multisigAccounts.length > 0 && (
              multisigAccounts.map((item, index) => {

                const safeAccountAddress = shortenAddress(item.authority.toBase58() as string, 8);
                const safeAccountBalance = toUsCurrency(item.balance);

                return (
                  <div 
                    key={`${index + 50}`}
                    id={item.authority.toBase58()}
                      >
                    <AccountSelectorItem
                      id={item.authority.toBase58()}
                      src={walletAccountIcon}
                      title={item.label}
                      subtitle={safeAccountAddress}
                      amount={safeAccountBalance}
                      resume="safe balance"
                    />
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
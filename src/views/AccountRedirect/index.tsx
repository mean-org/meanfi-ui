import { useWallet } from '@solana/wallet-adapter-react';
import { Empty, Spin } from 'antd';
import { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PreFooter } from 'src/components/PreFooter';
import { AppStateContext } from 'src/contexts/appstate';
import { useWalletAccount } from 'src/contexts/walletAccount';
import { consoleOut } from 'src/middleware/ui';
import type { AccountContext } from 'src/models/accounts';
import './style.scss';

const AccountRedirect = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { publicKey } = useWallet();
  const { selectedAccount, setSelectedAccount } = useWalletAccount();
  const { multisigAccounts, loadingMultisigAccounts } = useContext(AppStateContext);

  const [canRedirect, setCanRedirect] = useState(false);

  const accountParameter = useMemo(() => {
    const pathParts = location.pathname.split('/');
    return pathParts[pathParts.length - 1];
  }, [location]);

  // #1 Set selected account or redirect to root
  useEffect(() => {
    // We are not ready to redirect if we are still loading multisig accounts
    if (loadingMultisigAccounts) {
      console.info('loadingMultisigAccounts:', loadingMultisigAccounts);
      return;
    }

    // Go to root if there is no wallet connected
    if (!publicKey) {
      console.info('no wallet connected');
      return;
    }

    console.info('accountParameter:', accountParameter);

    // Go to root if there is no account
    if (!accountParameter) {
      console.info('path param account is missing');
      return;
    }

    if (accountParameter === 'personal') {
      const personalAccount: AccountContext = {
        name: 'Personal account',
        address: publicKey.toBase58(),
        isMultisig: false,
      };
      consoleOut('Setting selectedAccount on AccountRedirect component:', personalAccount, 'crimson');
      setSelectedAccount(personalAccount);
      return;
    }

    const item = multisigAccounts?.find(item => item.authority.toBase58() === accountParameter);
    // Go to root if the multisig account is not found
    if (!item) {
      setSelectedAccount(undefined, true);
      navigate('/');
      return;
    }
    const multisigAccount: AccountContext = {
      name: item.label,
      address: item.authority.toBase58(),
      isMultisig: true,
    };
    consoleOut('Setting selectedAccount on AccountRedirect component:', multisigAccount, 'crimson');
    setSelectedAccount(multisigAccount);
  }, [publicKey, multisigAccounts, loadingMultisigAccounts, accountParameter, navigate, setSelectedAccount]);

  // #2 Once account is set, flag to redirect
  useEffect(() => {
    if (!selectedAccount.address) {
      return;
    }

    setCanRedirect(true);
  }, [selectedAccount]);

  // #3 Redirect to the correct page
  useEffect(() => {
    if (canRedirect) {
      if (accountParameter === 'personal') {
        navigate('/my-account');
      } else {
        navigate('/super-safe?v=proposals');
      }
    }
  }, [canRedirect, accountParameter, navigate]);

  return (
    <div className='page-container'>
      <div className='container main-container'>
        <div className='interaction-area'>
          <div className='h-100 flex-center'>
            <Spin spinning={!canRedirect} size='large'>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>Loading account ...</p>} />
            </Spin>
          </div>
        </div>
      </div>
      <PreFooter />
    </div>
  );
};

export default AccountRedirect;

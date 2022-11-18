import { AppStateContext } from 'contexts/appstate';
import { useConnection } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { getProgramsByUpgradeAuthority } from 'middleware/getProgramsByUpgradeAuthority';
import { consoleOut } from 'middleware/ui';
import { useContext, useEffect, useState } from 'react';

const useAccountPrograms = () => {
  const connection = useConnection();
  const { publicKey } = useWallet();
  const { selectedAccount, setPrograms } = useContext(AppStateContext);
  const [loadingPrograms, setLoadingPrograms] = useState(false);

  // Get Programs owned by the account in context
  useEffect(() => {
    if (!connection || !publicKey || !selectedAccount.address) {
      return;
    }

    setTimeout(() => {
      setLoadingPrograms(true);
      setPrograms([]);
    });

    consoleOut('Fetching programs for:', selectedAccount.address, 'blue');
    getProgramsByUpgradeAuthority(
      connection,
      selectedAccount.address
    )
      .then(progs => {
        setPrograms(progs);
        consoleOut('programs from middleware:', progs);
      })
      .catch(error => {
        setPrograms([]);
        console.error(error);
      })
      .finally(() => setLoadingPrograms(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    publicKey,
    connection,
    selectedAccount.address,
  ]);

  return {
    loadingPrograms,
  };
};

export default useAccountPrograms;

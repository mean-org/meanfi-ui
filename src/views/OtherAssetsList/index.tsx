import { Identicon } from "components/Identicon";
import { formatThousands, shortenAddress } from "middleware/utils";
import { ProgramAccounts } from "models/accounts";
import { useLocation } from "react-router-dom";

export const OtherAssetsList = (props: {
  onProgramSelected?: any;
  programs?: ProgramAccounts[];
  selectedProgram: ProgramAccounts | undefined;
}) => {
  const {
    onProgramSelected,
    programs,
    selectedProgram,
  } = props;
  const location = useLocation();

  const getActiveClass = (program: ProgramAccounts) => {
    if (
      selectedProgram &&
      selectedProgram.pubkey.equals(program.pubkey) &&
      location.pathname.startsWith('/programs/')
    ) {
      return 'selected'
    }
    return '';
  }

  return (
    <>
      <div
        key="asset-category-other-assets-items"
        className="asset-category flex-column other-assets-list"
      >
        {programs ? programs.map(program => {
          const address = program.pubkey.toBase58();
          return (
            <div
              key={`${address}`}
              onClick={() => onProgramSelected(program)}
              id={address}
              className={`transaction-list-row ${getActiveClass(program)}`}
            >
              <div className="icon-cell">
                <div className="token-icon">
                  <Identicon
                    address={address}
                    style={{ width: '24', height: '24', display: 'inline-flex' }}
                  />
                </div>
              </div>
              <div className="description-cell">
                <div className="title">{shortenAddress(address)}</div>
              </div>
              <div className="rate-cell">
                <div className="rate-amount">{formatThousands(program.size)} bytes</div>
              </div>
            </div>
          );
        }) : null}
      </div>
    </>
  );
};

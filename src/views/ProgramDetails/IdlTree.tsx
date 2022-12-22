import ReactJson from 'react-json-view';
import './style.scss';

interface Props {
  selectedProgramIdl: any;
}

const IdlTree = ({ selectedProgramIdl }: Props) => {
  const noIdlInfo =
    'The program IDL is not initialized. To load the IDL info please run `anchor idl init` with the required parameters from your program workspace.';

  return !selectedProgramIdl ? (
    <div className={'no-idl-info'}>{noIdlInfo}</div>
  ) : (
    <ReactJson theme={'ocean'} enableClipboard={false} src={selectedProgramIdl} />
  );
};

export default IdlTree;

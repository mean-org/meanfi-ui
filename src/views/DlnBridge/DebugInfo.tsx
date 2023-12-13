import { ReactNode } from 'react';

interface DebugInfoProps {
  caption: string;
  value: ReactNode;
  useSeparator?: boolean;
}

const DebugInfo = ({ caption, value, useSeparator }: DebugInfoProps) => {
  return (
    <div className="flex-fixed-left">
      <div className="left">
        <span className="font-size-75">{caption}</span>
      </div>
      <div className={`right flex-row align-items-center${useSeparator ? ' vertical-bar' : ''}`}>{value}</div>
    </div>
  );
};

export default DebugInfo;

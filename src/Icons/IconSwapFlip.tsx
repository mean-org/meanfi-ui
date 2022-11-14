import { CSSProperties } from 'react';

export const IconSwapFlip = (props: {
  className: string;
  style?: CSSProperties;
}) => {
  return (
    <svg
      className={props.className}
      style={props.style}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="matrix(-0.235961,0,0,-0.235961,14.2416,14.8905)">
        <g>
          <path
            fillRule="nonzero"
            fillOpacity="0"
            stroke="currentColor"
            strokeWidth="6px"
            d="M28.946,-27.937C28.967,-9.606 29.015,33.753 29.034,50.236"
            fill="none"
          />
        </g>
      </g>
      <g transform="matrix(-0.166849,0.166849,-0.166849,-0.166849,6.06421,7.98509)">
        <g>
          <path
            fillRule="nonzero"
            fillOpacity="0"
            stroke="currentColor"
            strokeWidth="6px"
            d="M-20.549,-4.93L-20.549,12.747L-2.927,12.747"
            fill="none"
          />
        </g>
      </g>
      <g transform="matrix(0.235961,0,0,0.235961,9.75837,9.10948)">
        <g>
          <path
            fillRule="nonzero"
            fillOpacity="0"
            stroke="currentColor"
            strokeWidth="6px"
            d="M28.946,-27.937C28.967,-9.606 29.015,33.753 29.034,50.236"
            fill="none"
          />
        </g>
      </g>
      <g transform="matrix(0.166849,-0.166849,0.166849,0.166849,17.9358,16.0149)">
        <g>
          <path
            fillRule="nonzero"
            fillOpacity="0"
            stroke="currentColor"
            strokeWidth="6px"
            d="M-20.549,-4.93L-20.549,12.747L-2.927,12.747"
            fill="none"
          />
        </g>
      </g>
    </svg>
  );
};

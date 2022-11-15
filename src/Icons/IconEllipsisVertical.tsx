import { CSSProperties } from 'react';

export const IconEllipsisVertical = (props: {
  className: string;
  style?: CSSProperties;
}) => {
  return (
    <svg
      className={props.className}
      style={props.style}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.001 7.8c-1.215 0-2.201 0.985-2.201 2.2s0.986 2.2 2.201 2.2c1.215 0 2.199-0.985 2.199-2.2s-0.984-2.2-2.199-2.2zM10.001 5.2c1.215 0 2.199-0.986 2.199-2.2s-0.984-2.2-2.199-2.2c-1.215 0-2.201 0.985-2.201 2.2s0.986 2.2 2.201 2.2zM10.001 14.8c-1.215 0-2.201 0.985-2.201 2.2s0.986 2.2 2.201 2.2c1.215 0 2.199-0.985 2.199-2.2s-0.984-2.2-2.199-2.2z"
        fill="currentColor"
      ></path>
    </svg>
  );
};

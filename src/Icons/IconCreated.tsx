import { CSSProperties } from 'react';

export const IconCreated = (props: {
  className: string;
  style?: CSSProperties;
}) => {
  return (
    <svg
      className={props.className}
      style={props.style}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M5 13h6v6c0 0.552 0.448 1 1 1s1-0.448 1-1v-6h6c0.552 0 1-0.448 1-1s-0.448-1-1-1h-6v-6c0-0.552-0.448-1-1-1s-1 0.448-1 1v6h-6c-0.552 0-1 0.448-1 1s0.448 1 1 1z"
        fill="currentColor"
      ></path>
    </svg>
  );
};

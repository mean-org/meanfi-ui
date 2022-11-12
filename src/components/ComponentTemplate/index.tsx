import React from 'react';

export const ComponentTemplate = (props: { param1: any; param2: any }) => {
  const { param1, param2 } = props;

  return (
    <>
      <p>Passed-in param1: {param1}</p>
      <p>Passed-in param2: {param2}</p>
    </>
  );
};

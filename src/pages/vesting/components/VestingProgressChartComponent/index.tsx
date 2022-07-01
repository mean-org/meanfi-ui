import React, { useCallback, useContext, useEffect, useState } from "react";
import { PieChart, Pie, Sector, ResponsiveContainer } from "recharts";
import { AppStateContext } from "../../../../contexts/appstate";

export const VestingProgressChartComponent = (props: {
  unvestedAmount: number;
  vestedAmount: number;
}) => {
  const {
    unvestedAmount,
    vestedAmount,
  } = props;
  const {
    theme,
  } = useContext(AppStateContext);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pieFillColor] = useState(theme === 'light' ? '#B3B6C0' : '#323645');

  const onPieEnter = useCallback(
    (_, index) => {
      // if (unvestedAmount < 100) {
      // }
      setActiveIndex(index);
    }, []);

  const data = [
    { name: 'total vested', value: vestedAmount },
    { name: 'left to vest', value: unvestedAmount }
  ];

  const renderActiveShape = useCallback((props: any) => {
    const RADIAN = Math.PI / 180;
    const {
      cx,
      cy,
      midAngle,
      innerRadius,
      outerRadius,
      startAngle,
      endAngle,
      fill,
      payload,
      percent
    } = props;
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 10) * cos;
    const sy = cy + (outerRadius + 10) * sin;
    const mx = cx + (outerRadius + 15) * cos;
    const my = cy + (outerRadius + 15) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 22;
    const ey = my;
    const textAnchor = cos >= 0 ? "start" : "end";
    const textFill = theme === 'light' ? '#424242' : '#FFFFFF';

    return (
      <g>
        <text x={cx} y={cy} dy={8} textAnchor="middle" fill={textFill}>
          {payload.name}
        </text>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 6}
          outerRadius={outerRadius + 10}
          fill={fill}
        />
        <path
          d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
          stroke="#818cab"
          fill="none"
        />
        <circle cx={ex} cy={ey} r={2} fill={fill} stroke="#818cab" />
        <text
          x={ex + (cos >= 0 ? 1 : -1) * 12}
          y={ey}
          textAnchor={textAnchor}
          fill={textFill}
        >{`${(percent * 100).toFixed(1)}%`}</text>
      </g>
    );
  }, [theme]);

  // useEffect(() => {
  //   if (unvestedAmount === 100) {
  //     setActiveIndex(1);
  //   }
  // }, [unvestedAmount]);

  return (
    <>
      <PieChart width={400} height={240} className="vesting-pie-chart">
        <Pie
          activeIndex={activeIndex}
          activeShape={renderActiveShape}
          data={data}
          cx="48%"
          cy="44%"
          innerRadius={50}
          outerRadius={70}
          fill={pieFillColor}
          stroke="#818cab"
          dataKey="value"
          onMouseEnter={onPieEnter}
        />
      </PieChart>
      {/* <ResponsiveContainer width="100%" height="100%" className="text-center">
      </ResponsiveContainer> */}
    </>
  );
}

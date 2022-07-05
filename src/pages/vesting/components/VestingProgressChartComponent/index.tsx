import React, { useCallback, useContext, useState } from "react";
import { PieChart, Pie, Sector } from "recharts";
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
      setActiveIndex(index);
    }, []);

  const data = [
    { name: 'Total vested', value: vestedAmount },
    { name: 'Left to vest', value: unvestedAmount }
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
    const activeColor = theme === 'light' ? '#797d8b' : '#818cab';

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
          fill={activeColor}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 6}
          outerRadius={outerRadius + 10}
          fill={activeColor}
        />
        <path
          d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
          stroke={activeColor}
          fill="none"
        />
        <circle cx={ex} cy={ey} r={2} fill={fill} stroke={activeColor} />
        <text
          x={ex + (cos >= 0 ? 1 : -1) * 12}
          y={ey}
          textAnchor={textAnchor}
          fill={textFill}
        >{`${(percent * 100).toFixed(1)}%`}</text>
      </g>
    );
  }, [theme]);

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
          stroke="none"
          dataKey="value"
          onMouseEnter={onPieEnter}
        />
      </PieChart>
    </>
  );
}

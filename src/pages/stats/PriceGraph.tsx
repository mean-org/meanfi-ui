import moment from "moment";
import { Button } from "antd";
import { array, bool, str } from "@project-serum/borsh";
import { useCallback, useContext, useEffect, useState } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

import "./style.scss";
import { MEAN_TOKEN } from "../../constants/tokens";
import { getCoingeckoMarketChart } from "../../middleware/api";
import { PriceGraphModel } from "../../models/price-graph";
import { AppStateContext } from "contexts/appstate";

const dateFormat = "MMM Do, YYYY";
const buttons = ["24H", "7D", "30D"];

export const PriceGraph = (props : {
  onPriceData: any;
}) => {
  const [activeBtn, setActiveBtn] = useState(buttons[2]);
  const emptyArr: PriceGraphModel[] = [];
  const [priceChangeData, setPriceData] = useState(emptyArr);
  const [dateShownOnTop, setDateShownOnTop] = useState('');
  const [priceShownOnTop, setPriceShownOnTop] = useState('');
  const { priceList } = useContext(AppStateContext);

  const onClickHandler = (event: any) => {
    if (event.target.innerHTML !== activeBtn) {
      setActiveBtn(event.target.innerHTML);
    }
  };

  useEffect(() => {
    (async () => {
      let days = 30;
      let interval: 'daily' | 'hourly' = 'daily';
      if (activeBtn.endsWith('D')) {
        days = Number(activeBtn.substring(0, activeBtn.length - 1));
      } else if (activeBtn.endsWith('H')) {
        interval = 'hourly';
        days = Number(activeBtn.substring(0, activeBtn.length - 1)) / 24;
      }
      const [marketPriceData] = await getCoingeckoMarketChart(MEAN_TOKEN.extensions.coingeckoId, MEAN_TOKEN.decimals, days, interval);
      if (marketPriceData && marketPriceData.length > 0) {
        setPriceData(marketPriceData);
        const lastItem = marketPriceData[marketPriceData.length - 1];
        setDateShownOnTop(moment(lastItem.dateData).format(dateFormat));
        setPriceShownOnTop(lastItem.priceData);
        props.onPriceData(lastItem.priceData);
      }
    })()
  }, [activeBtn, priceList]);

  /*********************** CUSTOM TOOLTIP *************************/
  const CustomToolTip = ({ active, payload, label }: any) => {
    const [dateOnTooltip, setDateOnTooltip] = useState("");
    const [priceOnTooltip, setPriceOnTooltip] = useState("");

    useEffect(() => {
      if (active && payload && payload.length > 0) {
        setDateOnTooltip(moment(new Date(label)).format(dateFormat));
        setPriceOnTooltip(payload[0].payload.priceData);
      }
    }, [active, label, payload]);

    useEffect(() => {
      window.addEventListener("click", onSelectedInfo);
      return () => {
        window.removeEventListener("click", onSelectedInfo);
      };
    });

    const onSelectedInfo = useCallback(() => {
      if (active) {
        setDateShownOnTop(dateOnTooltip);
        setPriceShownOnTop(priceOnTooltip);
      }
    }, [active, dateOnTooltip, priceOnTooltip]);

    if (active) {
      return (
        <div className="tooltip">
          <h4>{dateOnTooltip}</h4>
          <p>${priceOnTooltip}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <div className="price-items">
        <div className="price-items_left">
          <span className="price-items_price">
            $ {priceShownOnTop}
          </span>
          <span className="price-items_date">
            {dateShownOnTop}
          </span>
        </div>
        <div className="price-items_right">
          {buttons.map((btn, index) => (
            <Button
              key={index}
              type="ghost"
              shape="round"
              size="small"
              onClick={onClickHandler}
              className={`thin-stroke ${activeBtn === btn ? "active" : ""}`}
            >
              {btn}
            </Button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={215}>
        <AreaChart data={priceChangeData}>
          <defs>
            <linearGradient id="color" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b8011b" stopOpacity={1} />
              <stop offset="100%" stopColor="#b8011b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area dataKey="priceData" fill="url(#color)" stroke="#ff0017" />
          <XAxis
            dataKey="dateData"
            axisLine={false}
            tickLine={true}
            tickMargin={25}
            angle={-50}
            height={50}
            tickFormatter={(date) => {
              const d = new Date(date);

              if (activeBtn === "24H") {
                return moment(d).format("hha");
              } else {
                return moment(d).format("MMM, DD");
              }
            }}
          />
          <YAxis
            dataKey="priceData"
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
            width={35}
            tickSize={0}
            tickMargin={5}
            tickFormatter={(priceData) => priceData || 0}
          />
          <Tooltip
            content={
              <CustomToolTip active={bool} payload={array} label={str} />
            }
          />
          <CartesianGrid opacity={0.2} vertical={false} />
        </AreaChart>
      </ResponsiveContainer>
    </>
  );
};
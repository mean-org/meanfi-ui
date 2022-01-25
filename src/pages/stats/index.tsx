import React from 'react';
import { PreFooter } from "../../components/PreFooter";
import { IconMoneyTransfer } from '../../Icons';

export const StatsView = () => {
  return (
    <>
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle">
            <div className="title">
              <IconMoneyTransfer className="mean-svg-icons" />
              <div>Main title here</div>
            </div>
            <div className="subtitle">
              Subtitle here
            </div>
          </div>
          <p>Lorem ipsum dolor sit amet consectetur adipisicing elit. Excepturi natus laboriosam distinctio praesentium inventore! Placeat laborum, officiis labore aliquam quis, repellendus sapiente voluptates nostrum ad non accusantium cum delectus fugiat earum saepe nobis neque consectetur excepturi. Ea illo eligendi fuga quidem non, quibusdam odio quia? Quas, officia totam ducimus, incidunt quidem dolorum magni modi consequatur blanditiis quasi nesciunt. Veritatis aliquam explicabo reprehenderit iure cupiditate maiores placeat, blanditiis earum magnam repudiandae temporibus distinctio facere aliquid, laudantium corporis optio. Voluptas nemo officiis ea error sequi tempore veniam omnis quia at adipisci quaerat nam atque id maiores obcaecati totam necessitatibus perspiciatis, laudantium aperiam ab amet! Quam, earum esse vitae temporibus est nam blanditiis natus ipsam iusto nihil, corporis in quas animi magni repellendus, facere voluptas exercitationem neque assumenda ut molestiae hic.</p>
        </div>
      </div>
      <PreFooter />
    </>
  );
}

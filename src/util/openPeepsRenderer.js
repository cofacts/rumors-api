import React from 'react';
import ReactDOMServer from 'react-dom/server';
import Peeps from 'react-peeps';

export const NULL_USER_IMG =
  'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp';

const cofactsColors = {
  red1: '#fb5959',
  red2: '#ff7b7b',
  orange1: '#ff8a00',
  orange2: '#ffb600',
  yellow: '#ffea29',
  green1: '#00b172',
  green2: '#00d88b',
  green3: '#4ff795',
  blue1: '#2079f0',
  blue2: '#2daef7',
  blue3: '#5fd8ff',
  purple: '#966dee',
};

const colorOptions = Object.values(cofactsColors);

export const getBackgroundColor = avatarData => {
  if (avatarData?.backgroundColor) return avatarData.backgroundColor;
  if (avatarData?.backgroundColorIndex) {
    const index = Math.floor(
      colorOptions.length * avatarData.backgroundColorIndex
    );
    return colorOptions[index];
  }
  return cofactsColors.yellow;
};

export default function renderOpenPeepsDataUrl(user) {
  let avatarData;
  try {
    avatarData = JSON.parse(user.avatarData);
  } catch (e) {
    console.error('[renderOpenPeepsDataUrl]', e);
    return NULL_USER_IMG;
  }

  const backgroundColor = getBackgroundColor(avatarData);
  // We will use backgroundColor from getBackgroundColor
  delete avatarData.backgroundColor;

  const markup = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Peeps, {
      ...avatarData,
      viewBox: {
        x: 0,
        y: -80 /* Shift avatars down so that bottom of avatar touches ground */,
        width: 850,
        height: 1200,
      },
      style: {
        backgroundColor,
      },
    })
  );

  // Encode necessary items & add xmlns so that browser renders it
  // Ref: https://yoksel.github.io/url-encoder/
  //
  return `data:image/svg+xml;utf8,${markup
    .replace(/#/g, encodeURIComponent('#'))
    .replace('<svg ', "<svg xmlns='http://www.w3.org/2000/svg' ")
    .replace(/"/g, "'")}`;
}

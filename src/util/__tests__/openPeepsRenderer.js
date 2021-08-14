import renderOpenPeepsDataUrl, { NULL_USER_IMG } from '../openPeepsRenderer';

it('returns null user image when error', () => {
  const imgSrc = renderOpenPeepsDataUrl(null);

  expect(imgSrc).toEqual(NULL_USER_IMG);
});

it('renders avatarData', () => {
  const dataUrl = renderOpenPeepsDataUrl({
    avatarData:
      '{"accessory":"GlassAviator","body":"Geek","face":"EatingHappy","hair":"Long","facialHair":"None","backgroundColorIndex":0.9701398778032233,"flip":false}',
  });
  expect(dataUrl).toMatchSnapshot();
});

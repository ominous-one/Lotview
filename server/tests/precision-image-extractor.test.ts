import { maximizeImageUrl } from '../precision-image-extractor';

describe('precision image extractor', () => {
  it('normalizes AutoTrader urls that carry the invalid size suffix after the extension', () => {
    expect(
      maximizeImageUrl(
        'https://1s-photomanager-prd.autotradercdn.ca/photos/import/202601/3021/4605/example.jpg-1024x786?w=2048&h=1536&fit=bounds&auto=webp&quality=90'
      )
    ).toBe(
      'https://1s-photomanager-prd.autotradercdn.ca/photos/import/202601/3021/4605/example.jpg?w=2048&h=1536&fit=bounds&auto=webp&quality=90'
    );
  });

  it('upgrades AutoTrader urls that carry the size before the extension', () => {
    expect(
      maximizeImageUrl(
        'https://images.autotradercdn.ca/photos/import/202401/1234/5678/abc-640x480.jpg?w=800&fmt=webp'
      )
    ).toBe(
      'https://images.autotradercdn.ca/photos/import/202401/1234/5678/abc-2048x1536.jpg?w=2048&h=1536&fit=bounds&auto=webp&quality=90'
    );
  });
});

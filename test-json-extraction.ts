import puppeteer from 'puppeteer';

async function testJSONExtraction() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://www.cargurus.ca/Cars/link/407437205', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const result = await page.evaluate(() => {
      const data: any = {
        hasNextData: false,
        nextDataKeys: [],
        propsKeys: [],
        pagePropsKeys: [],
        listingKeys: []
      };

      // Check for __NEXT_DATA__ script
      const nextDataScript = document.querySelector('script#__NEXT_DATA__');
      if (nextDataScript && nextDataScript.textContent) {
        data.hasNextData = true;
        try {
          const nextData = JSON.parse(nextDataScript.textContent);
          data.nextDataKeys = Object.keys(nextData);
          
          if (nextData.props) {
            data.propsKeys = Object.keys(nextData.props);
            
            if (nextData.props.pageProps) {
              data.pagePropsKeys = Object.keys(nextData.props.pageProps);
              
              // Check for listing
              const listing = nextData.props.pageProps.listing || nextData.props.pageProps.listingDetail;
              if (listing) {
                data.listingKeys = Object.keys(listing);
                data.listing = listing; // Dump full listing object
              }
            }
          }
        } catch (e) {
          data.parseError = String(e);
        }
      }

      return data;
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

testJSONExtraction();

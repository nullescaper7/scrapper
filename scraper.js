const puppeteer = require('puppeteer');
const fs = require('fs');

const SITES = [
  'https://gledaibgtv.com/btv',
  'https://tvmaniabg.com/nova-tv/',
  'https://tvmaniabg.com/bnt1/',
  'https://www.gledaitv.fan/mtv-00s-live-tv.html',
  'https://www.gledaitv.fan/mtv-hits-live-tv.html',
  'https://kanal3.org/'
];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleKanal3(page) {
  try {
    // Wait for page to load
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Look for the "НА ЖИВО" button
    const buttonSelectors = [
      'a.elementor-button[href*="elementor-action"] span.elementor-button-text:contains("НА ЖИВО")',
      'span.elementor-button-text:contains("НА ЖИВО")',
      'a[href*="elementor-action"]',
      '.elementor-button:contains("НА ЖИВО")'
    ];
    
    for (const selector of buttonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          console.log('Clicking kanal3.org button...');
          await button.click();
          await delay(3000);
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function scrapeSite(page, url) {
  const m3uLinks = [];
  
  // Listen for m3u requests
  page.on('request', (req) => {
    const reqUrl = req.url();
    if (reqUrl.match(/\.m3u8(\?.*)?$/i)) {
      m3uLinks.push({
        url: reqUrl,
        headers: req.headers()
      });
    }
  });
  
  await page.goto(url, { 
    waitUntil: 'domcontentloaded', 
    timeout: 30000 
  });
  
  // Special handling for kanal3.org
  if (url.includes('kanal3.org')) {
    await handleKanal3(page);
    await delay(3000);
  } else {
    await delay(2000);
  }
  
  // Fallback: scan HTML for .m3u8
  if (m3uLinks.length === 0) {
    const html = await page.content();
    const regex = /https?:\/\/[^\s'"]+\.m3u8[^\s'"]*/gi;
    const matches = html.match(regex);
    if (matches && matches.length > 0) {
      m3uLinks.push({
        url: matches[0],
        headers: {
          'referer': url,
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
          'origin': new URL(url).origin
        }
      });
    }
  }
  
  if (m3uLinks.length === 0) {
    console.log(`✗ No M3U found for: ${url}`);
    return null;
  }
  
  const link = m3uLinks[0];
  const headers = link.headers;
  
  // Format headers exactly as in your example
  const formattedHeaders = [];
  if (headers['referer']) formattedHeaders.push(`Referer: ${headers['referer']}`);
  if (headers['user-agent']) formattedHeaders.push(`User-Agent: ${headers['user-agent']}`);
  if (headers['origin']) formattedHeaders.push(`Origin: ${headers['origin']}`);
  
  // Simple title extraction (last segment of URL)
  const title = url.split('/').filter(Boolean).pop().replace(/\.html$/i, '');
  
  return {
    title: title,
    updated: new Date().toISOString(),
    url: link.url,
    headers: formattedHeaders.join('\n')
  };
}

async function main() {
  console.log('Starting M3U scraper...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const results = [];
  
  for (const url of SITES) {
    try {
      const page = await browser.newPage();
      const customUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
      await page.setUserAgent(customUA);
      
      const result = await scrapeSite(page, url);
      await page.close();
      
      if (result) {
        results.push(result);
        console.log(`✓ ${url}`);
      }
      
    } catch (error) {
      console.error(`Error: ${url} - ${error.message}`);
    }
    
    // Small delay between sites
    await delay(1000);
  }
  
  await browser.close();
  
  // Save results
  if (results.length > 0) {
    fs.writeFileSync('channels.json', JSON.stringify(results, null, 2));
    console.log(`\nSaved ${results.length} channels to channels.json`);
  }
}

main().catch(console.error);

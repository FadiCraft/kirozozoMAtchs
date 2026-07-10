const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const puppeteer = require('puppeteer');

const BASE_URL = 'https://www.korax90.net/matches-today';
const DOMAIN = 'https://www.korax90.net';

async function getDirectStream(browser, iframeUrl) {
    if (!iframeUrl) return "";
    const fullIframeUrl = iframeUrl.startsWith('//') ? `https:${iframeUrl}` : iframeUrl;

    return new Promise(async (resolve) => {
        let found = false;
        let page;
        try {
            page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
            
            const timeout = setTimeout(async () => {
                if (!found) { await page.close().catch(() => {}); resolve(""); }
            }, 15000);

            page.on('request', async (request) => {
                const url = request.url();
                if (url.includes('.m3u8') && !found) {
                    found = true;
                    clearTimeout(timeout);
                    await page.close().catch(() => {});
                    resolve(url);
                }
            });

            await page.goto(fullIframeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch (e) {
            if (page) await page.close().catch(() => {});
            resolve("");
        }
    });
}

async function scrapeMatches() {
    let browser;
    try {
        console.log("🚀 جاري تهيئة المتصفح...");
        browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });

        console.log("🔍 جاري فحص المباريات...");
        // ترويسات قوية لتجاوز الحظر
        const { data } = await axios.get(BASE_URL, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Referer': 'https://www.google.com/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            }
        });
        
        const $ = cheerio.load(data);
        const matches = [];
        const currentTime = new Date().toLocaleString('ar-EG');

        $('.match-item').each((i, el) => {
            const buttonEl = $(el).find('button.match-row');
            const streamUrl = buttonEl.attr('data-frame') || "";
            const teams = $(el).find('.team');
            
            const match = {
                team1: $(teams[0]).find('.team-name').text().trim(),
                team1Logo: $(teams[0]).find('img').attr('src') || "",
                team2: $(teams[1]).find('.team-name').text().trim(),
                team2Logo: $(teams[1]).find('img').attr('src') || "",
                time: $(el).find('.score-time').text().trim(),
                status: $(el).find('.status-badge').text().trim(),
                channel: "غير متوفر",
                league: $(el).find('.league').text().trim(),
                LastTime: currentTime,
                streamUrl: streamUrl,
                stream: ""
            };
            matches.push(match);
        });

        for (let match of matches) {
            if (match.streamUrl) {
                console.log(`⏳ جاري استخراج: ${match.team1}`);
                match.stream = await getDirectStream(browser, match.streamUrl);
            }
        }

        fs.writeFileSync('match1.json', JSON.stringify(matches, null, 2), 'utf8');
        console.log("✅ تم الحفظ في match1.json");

    } catch (error) {
        console.error('❌ خطأ:', error.message);
    } finally {
        if (browser) await browser.close();
    }
}

scrapeMatches();

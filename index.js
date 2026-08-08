const puppeteer = require('puppeteer');
const fs = require('fs');

const BASE_URL = 'https://fabor-tv.to/matches-today/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function getDirectStream(browser, iframeUrl) {
    if (!iframeUrl) return "";
    const fullIframeUrl = iframeUrl.startsWith('//') ? `https:${iframeUrl}` : iframeUrl;

    return new Promise(async (resolve) => {
        let found = false;
        let page;
        try {
            page = await browser.newPage();
            await page.setUserAgent(USER_AGENT);
            
            page.on('request', (request) => {
                if (request.url().includes('.m3u8') && !found) {
                    found = true;
                    resolve(request.url());
                    page.close().catch(() => {});
                }
            });

            await page.goto(fullIframeUrl, { waitUntil: 'networkidle2', timeout: 25000 });
            
            // محاكاة نقرة للبدء (ضرورية للمشغلات)
            await page.mouse.click(500, 300).catch(() => {});
            
            setTimeout(() => {
                if (!found) { page.close().catch(() => {}); resolve(""); }
            }, 12000);
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
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
        });

        const page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);
        
        console.log("🔍 جاري فتح الموقع الرئيسي...");
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        const matches = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('.AY_Match').forEach(el => {
                const linkElement = el.querySelector('a');
                const matchUrl = linkElement ? linkElement.href : "";

                items.push({
                    team1: el.querySelector('.TM1 .TM_Name')?.innerText.trim() || "",
                    team1Logo: el.querySelector('.TM1 .TM_Logo img')?.src || "",
                    team2: el.querySelector('.TM2 .TM_Name')?.innerText.trim() || "",
                    team2Logo: el.querySelector('.TM2 .TM_Logo img')?.src || "",
                    time: el.querySelector('.MT_Time span')?.innerText.trim() || "",
                    status: el.querySelector('.MT_Stat')?.innerText.trim() || "",
                    league: el.querySelector('.TourName')?.innerText.trim() || "",
                    matchUrl: matchUrl, 
                    streamUrl: "",      
                    channel: "غير متوفر",
                    LastTime: new Date().toLocaleString('ar-EG'),
                    stream: ""
                });
            });
            return items;
        });

        console.log(`✅ تم العثور على ${matches.length} مباريات، جاري البحث عن الروابط...`);

        for (let match of matches) {
            if (match.matchUrl) {
                console.log(`\n🔗 جاري فحص مباراة: ${match.team1} ضد ${match.team2}`);
                
                let frameUrl = "";

                if (match.matchUrl.includes('fabor-tv.to/matches/')) {
                    let matchPage;
                    try {
                        matchPage = await browser.newPage();
                        await matchPage.setUserAgent(USER_AGENT);
                        
                        // تم تغيير domcontentloaded إلى networkidle2 لإعطاء فرصة للسكربتات بالعمل
                        await matchPage.goto(match.matchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

                        // انتظار صريح لظهور السيرفر (iframe) لتفادي سحب البيانات قبل ظهورها
                        try {
                            await matchPage.waitForSelector('iframe#player', { timeout: 10000 });
                        } catch (e) {
                            console.log("⚠️ لم يظهر السيرفر خلال الوقت المحدد (قد لا يتوفر بث).");
                        }

                        frameUrl = await matchPage.evaluate(() => {
                            const iframe = document.querySelector('iframe#player');
                            return iframe ? iframe.src : "";
                        });
                    } catch (err) {
                        console.log(`⚠️ حدث خطأ أثناء فتح صفحة المباراة: ${err.message}`);
                    } finally {
                        if (matchPage) await matchPage.close(); 
                    }
                } else {
                    frameUrl = match.matchUrl;
                }

                match.streamUrl = frameUrl;

                if (match.streamUrl) {
                    console.log(`⏳ جاري استخراج بث الـ m3u8 من المشغل...`);
                    match.stream = await getDirectStream(browser, match.streamUrl);
                    if(match.stream) console.log(`✅ تم العثور على البث بنجاح`);
                    else console.log(`❌ لم يتم العثور على ملف m3u8`);
                } else {
                    console.log(`❌ لم يتم العثور على سيرفر لهذه المباراة`);
                }
            }
        }

        matches.forEach(m => delete m.matchUrl);

        fs.writeFileSync('match1.json', JSON.stringify(matches, null, 2), 'utf8');
        console.log("\n🎉 انتهى العمل. تم حفظ البيانات في match1.json");

    } catch (error) {
        console.error('❌ خطأ فادح:', error.message);
    } finally {
        if (browser) await browser.close();
    }
}

scrapeMatches();

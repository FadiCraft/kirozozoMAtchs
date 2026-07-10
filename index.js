const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const puppeteer = require('puppeteer');

const BASE_URL = 'https://www.korax90.net/matches-today';
const DOMAIN = 'https://www.korax90.net';

/**
 * دالة لاستخراج الرابط المباشر m3u8 باستخدام المتصفح والتقاط الشبكة (Network Interception)
 */
async function getDirectStream(browser, iframeUrl) {
    if (!iframeUrl) return "";
    const fullIframeUrl = iframeUrl.startsWith('//') ? `https:${iframeUrl}` : iframeUrl;

    return new Promise(async (resolve) => {
        let found = false;
        let page;

        try {
            page = await browser.newPage();
            
            // إعدادات المتصفح لتجنب الحظر
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({
                'Referer': DOMAIN,
                'Origin': DOMAIN
            });

            // مؤقت زمني لإنهاء العملية إذا لم يتم العثور على البث خلال 15 ثانية
            const timeout = setTimeout(async () => {
                if (!found) {
                    if (page) await page.close().catch(() => {});
                    resolve("");
                }
            }, 15000);

            // مراقبة كل طلبات الشبكة (Network Requests)
            page.on('request', async (request) => {
                const url = request.url();
                
                // التقاط أول رابط يحتوي على m3u8
                if (url.includes('.m3u8') && !found) {
                    found = true;
                    clearTimeout(timeout); // إيقاف المؤقت
                    if (page) await page.close().catch(() => {}); // إغلاق الصفحة فوراً لتوفير الموارد
                    resolve(url);
                }
            });

            // فتح صفحة المشغل
            await page.goto(fullIframeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        } catch (e) {
            console.log(`⚠️ فشل الوصول للمشغل: ${fullIframeUrl} - ${e.message}`);
            if (page) await page.close().catch(() => {});
            resolve("");
        }
    });
}

/**
 * السكريبت الرئيسي لاستخراج المباريات
 */
async function scrapeMatches() {
    let browser;
    try {
        console.log("🚀 جاري تهيئة المتصفح المخفي...");
        // استخدام --no-sandbox مهم جداً لضمان عمل السكربت على السيرفرات وبيئات التشغيل
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        console.log("🔍 جاري فحص المباريات واستخراج البيانات...");
        const { data } = await axios.get(BASE_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        const $ = cheerio.load(data);
        const matches = [];
        const currentTime = new Date().toLocaleString('ar-EG');
        const matchElements = $('.match-item');

        for (let i = 0; i < matchElements.length; i++) {
            const el = matchElements[i];
            const buttonEl = $(el).find('button.match-row');
            const streamUrl = buttonEl.attr('data-frame') || "";

            const teams = $(el).find('.team');
            const team1El = $(teams[0]);
            const team2El = $(teams[1]);

            const getValidLogo = (teamEl) => {
                let logoUrl = teamEl.find('img').attr('src') || "";
                if (logoUrl.startsWith('/')) logoUrl = DOMAIN + logoUrl;
                return logoUrl;
            };

            const match = {
                team1: team1El.find('.team-name').text().trim(),
                team1Logo: getValidLogo(team1El),
                team2: team2El.find('.team-name').text().trim(),
                team2Logo: getValidLogo(team2El),
                time: $(el).find('.score-time').text().trim(),
                status: $(el).find('.status-badge').text().trim(),
                channel: "غير متوفر", 
                league: $(el).find('.league').text().trim(),
                LastTime: currentTime,
                streamUrl: streamUrl, 
                stream: ""     
            };

            if (streamUrl) {
                console.log(`⏳ جاري استخراج بث: ${match.team1} vs ${match.team2}`);
                // استدعاء دالة Puppeteer لمراقبة الشبكة
                match.stream = await getDirectStream(browser, streamUrl);
                
                if (match.stream) {
                    console.log(`✅ تم التقاط الرابط المباشر بنجاح!`);
                } else {
                    console.log(`❌ لم يتم العثور على رابط مباشر (البث لم يبدأ أو فشل الالتقاط)`);
                }
            }

            matches.push(match);
        }

        fs.writeFileSync('match1.json', JSON.stringify(matches, null, 2), 'utf8');
        console.log("---");
        console.log(`🎉 انتهى العمل. تم حفظ ${matches.length} مباراة في match1.json.`);

    } catch (error) {
        console.error('❌ خطأ في السكربت الرئيسي:', error.message);
    } finally {
        // إغلاق المتصفح في النهاية لتحرير الموارد
        if (browser) await browser.close();
    }
}

scrapeMatches();

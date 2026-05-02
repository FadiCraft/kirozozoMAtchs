const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://d.syrlive.com/matches-yesterday/';

async function getStreamServer(matchUrl) {
    try {
        const { data } = await axios.get(matchUrl, { timeout: 10000 });
        const $ = cheerio.load(data);
        // البحث عن iframe داخل الصفحة
        const iframeSrc = $('iframe.cf').attr('src') || $('iframe').attr('src');
        return iframeSrc || "";
    } catch (e) {
        return "";
    }
}

async function scrapeMatches() {
    try {
        console.log("جاري استخراج المباريات من SyrLive...");
        const { data } = await axios.get(BASE_URL);
        const $ = cheerio.load(data);
        const matches = [];

        // استخراج المباريات من الهيكل الجديد
        $('.match-container').each((i, el) => {
            // تحديد نوع المباراة من الكلاس
            let matchType = "upcoming"; // افتراضي
            if ($(el).hasClass('live')) {
                matchType = "live";
            } else if ($(el).hasClass('end')) {
                matchType = "finished";
            }

            // استخراج رابط التفاصيل
            const detailsUrl = $(el).find('a[title]').attr('href') || "";

            const match = {
                team1: $(el).find('.right-team .team-name').text().trim(),
                team1Logo: $(el).find('.right-team img').attr('data-src') || $(el).find('.right-team img').attr('src'),
                team2: $(el).find('.left-team .team-name').text().trim(),
                team2Logo: $(el).find('.left-team img').attr('data-src') || $(el).find('.left-team img').attr('src'),
                time: $(el).find('.match-time').text().trim(),
                result: $(el).find('.result').text().trim(),
                status: $(el).find('.date').text().trim(),
                type: matchType,
                // استخراج القنوات والمعلق والبطولة من match-info
                channel: $(el).find('.match-info ul li:nth-child(1) span').text().trim(),
                commentator: $(el).find('.match-info ul li:nth-child(2) span').text().trim(),
                league: $(el).find('.match-info ul li:nth-child(3) span').text().trim(),
                detailsUrl: detailsUrl,
                streamUrl: ""
            };
            matches.push(match);
        });

        // إذا لم توجد أي مباريات جديدة، احتفظ بالملف القديم
        if (matches.length === 0) {
            console.log("⚠️ لا توجد مباريات اليوم. سيتم الاحتفاظ بالملف السابق.");
            if (fs.existsSync('matches.json')) {
                console.log("تم الاحتفاظ بملف matches.json الحالي.");
                return; // خروج بدون حفظ ملف فارغ
            } else {
                console.log("لا يوجد ملف سابق، جاري إنشاء ملف فارغ...");
            }
        }

        // جلب السيرفرات للمباريات اللايف والقادمة فقط
        for (let match of matches) {
            if ((match.type === "live" || match.type === "upcoming") && match.detailsUrl) {
                console.log(`جاري جلب السيرفر لـ: ${match.team1} vs ${match.team2}`);
                match.streamUrl = await getStreamServer(match.detailsUrl);
            }
        }

        fs.writeFileSync('matches.json', JSON.stringify(matches, null, 2), 'utf8');
        console.log(`✅ تم استخراج ${matches.length} مباراة بنجاح.`);

    } catch (error) {
        console.error('❌ خطأ:', error.message);
    }
}

scrapeMatches();

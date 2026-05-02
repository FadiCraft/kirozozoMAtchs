const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://d.syrlive.com/matches-today/';

// بيانات عشوائية لإنشاء مباراة وهمية
const randomTeams = [
    { name: "ريال مدريد", logo: "https://example.com/real.png" },
    { name: "برشلونة", logo: "https://example.com/barca.png" },
    { name: "مانشستر سيتي", logo: "https://example.com/city.png" },
    { name: "ليفربول", logo: "https://example.com/liverpool.png" },
    { name: "بايرن ميونخ", logo: "https://example.com/bayern.png" },
    { name: "باريس سان جيرمان", logo: "https://example.com/psg.png" },
    { name: "يوفنتوس", logo: "https://example.com/juve.png" },
    { name: "تشيلسي", logo: "https://example.com/chelsea.png" }
];

const randomLeagues = ["الدوري الإنجليزي", "الدوري الإسباني", "دوري أبطال أوروبا", "الدوري الإيطالي", "الدوري الفرنسي", "الدوري الألماني"];
const randomChannels = ["beIN Sports 1", "beIN Sports 2", "Sky Sports", "ESPN", "Canal+ Sport"];
const randomCommentators = ["عصام الشوالي", "فهد العتيبي", "رؤوف خليف", "خليل البلوشي", "عامر الخوذيري"];

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomMatch() {
    const team1 = getRandomItem(randomTeams);
    let team2 = getRandomItem(randomTeams);
    
    // التأكد من عدم تكرار نفس الفريق
    while (team2.name === team1.name) {
        team2 = getRandomItem(randomTeams);
    }

    return {
        team1: team1.name,
        team1Logo: team1.logo,
        team2: team2.name,
        team2Logo: team2.logo,
        time: `${Math.floor(Math.random() * 3) + 18}:00`,
        result: `${Math.floor(Math.random() * 5)} - ${Math.floor(Math.random() * 4)}`,
        status: "مباراة استعراضية",
        type: "upcoming",
        channel: getRandomItem(randomChannels),
        commentator: getRandomItem(randomCommentators),
        league: getRandomItem(randomLeagues),
        detailsUrl: "",
        streamUrl: "https://example.com/stream",
        isRandom: true // علامة لتحديد أنها مباراة عشوائية
    };
}

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
                streamUrl: "",
                isRandom: false
            };
            matches.push(match);
        });

        // إذا لم توجد أي مباريات، قم بإنشاء مباريات عشوائية
        if (matches.length === 0) {
            console.log("⚠️ لا توجد مباريات اليوم. جاري إنشاء مباريات عشوائية...");
            
            // إنشاء 3 مباريات عشوائية بدلاً من ترك الملف فارغاً
            const randomMatches = [];
            for (let i = 0; i < 3; i++) {
                randomMatches.push(generateRandomMatch());
            }
            
            fs.writeFileSync('matches.json', JSON.stringify(randomMatches, null, 2), 'utf8');
            console.log(`✅ تم إنشاء ${randomMatches.length} مباراة عشوائية بنجاح.`);
            return;
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
        
        // في حالة حدوث خطأ، قم بإنشاء مباريات عشوائية أيضاً
        console.log("جاري إنشاء مباريات عشوائية بسبب الخطأ...");
        const randomMatches = [];
        for (let i = 0; i < 3; i++) {
            randomMatches.push(generateRandomMatch());
        }
        fs.writeFileSync('matches.json', JSON.stringify(randomMatches, null, 2), 'utf8');
        console.log(`✅ تم إنشاء ${randomMatches.length} مباراة عشوائية.`);
    }
}

scrapeMatches();

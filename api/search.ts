import type { VercelRequest, VercelResponse } from "@vercel/node";
import got from "got";
import cheerio from "cheerio";

interface GoogleMapsResult {
    name: string;
    rating: number;
    reviews: number;
    category: string;
    address: string;
    phone: string;
    website: string;
    mapsUrl: string;
    location: string;
}

const defaultHeaders = {
    "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
};

function extractPhone(text: string): string {
    const patterns = [
        /(?:\+62|062|62|0)[\s-]?(?:\d{2,4})[\s-]?(?:\d{3,4})[\s-]?(?:\d{3,5})/,
        /\(?\d{3,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,5}/,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[0].trim();
    }
    return "";
}

function parseRating(text: string): number {
    const cleaned = text.replace(",", ".").trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

function parseReviewCount(text: string): number {
    const match = text.match(/\(?([\d.,]+)\)?/);
    if (!match) return 0;
    return parseInt(match[1].replace(/[.,]/g, "")) || 0;
}

function safeDecode(value: string): string {
    if (!value) return "";
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

async function scrapeGoogleMaps(
    keyword: string,
    location: string,
    limit: number
): Promise<GoogleMapsResult[]> {
    const query = `${keyword} di ${location}`;
    const html = await got("https://www.google.com/search", {
        searchParams: { q: query, tbm: "lcl", hl: "id", gl: "id" },
        headers: defaultHeaders,
    }).text();

    const $ = cheerio.load(html);
    const results: GoogleMapsResult[] = [];

    $("div.VkpGBb").each(function () {
        if (results.length >= limit) return false;
        const el = $(this);

        const name =
            el.find("div.dbg0pd").text().trim() ||
            el.find("span.OSrXXb").text().trim() ||
            el.find("div[role='heading']").text().trim();
        if (!name) return;

        const ratingEl = el.find("span.yi40Hd").text() || el.find("span.BTtC6e").text();
        const rating = parseRating(ratingEl);

        const reviewsEl = el.find("span.RDApEe").text() || el.find("span.UY7F9").text();
        const reviews = parseReviewCount(reviewsEl);

        const detailDivs = el.find("div.rllt__details > div");
        const category =
            el.find("span.YhemCb").text().trim() ||
            detailDivs.eq(0).find("span").first().text().trim();

        let address = "";
        let phone = "";

        detailDivs.each(function () {
            const text = $(this).text().trim();
            if (!address && text.length > 10 && /\d/.test(text) && !/^\d[.,]\d/.test(text)) {
                address = text;
            }
            if (!phone) {
                const p = extractPhone(text);
                if (p) phone = p;
            }
        });

        if (!address) {
            const addrEl = el.find("span.LrzXr");
            if (addrEl.length) address = addrEl.text().trim();
        }

        const fullText = el.text();
        if (!phone) phone = extractPhone(fullText);

        const website =
            el.find('a[data-dtype="d3web"]').attr("href") ||
            el.find("a.yYlJEf").attr("href") ||
            "";

        const mapsLink =
            el.find("a.vwVdIc").attr("href") ||
            el.find('a[href*="maps/place"]').attr("href") ||
            "";

        results.push({
            name,
            rating,
            reviews,
            category,
            address,
            phone,
            website: safeDecode(website),
            mapsUrl: mapsLink ? `https://www.google.com${mapsLink}` : "",
            location,
        });
    });

    if (results.length === 0) {
        return scrapeGoogleMapsV2(keyword, location, limit);
    }

    return results;
}

async function scrapeGoogleMapsV2(
    keyword: string,
    location: string,
    limit: number
): Promise<GoogleMapsResult[]> {
    const query = `${keyword} di ${location}`;
    const html = await got("https://www.google.com/search", {
        searchParams: { q: query, tbm: "lcl", hl: "id", gl: "id", sa: "X" },
        headers: {
            ...defaultHeaders,
            "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
    }).text();

    const $ = cheerio.load(html);
    const results: GoogleMapsResult[] = [];

    $("div[data-cid]").each(function () {
        if (results.length >= limit) return false;
        const el = $(this);

        const name =
            el.find("div[role='heading'] span").text().trim() ||
            el.find("div.dbg0pd").text().trim() ||
            el.find("span.OSrXXb").text().trim();
        if (!name) return;

        const ratingEl =
            el.find("span.yi40Hd").text() ||
            el.find("span.BTtC6e").text() ||
            el.find("span[aria-hidden='true']").first().text();
        const rating = parseRating(ratingEl);

        const reviewsEl = el.find("span.RDApEe").text() || el.find("span.UY7F9").text();
        const reviews = parseReviewCount(reviewsEl);

        const allText = el.text();
        const phone = extractPhone(allText);

        let address = "";
        let category = "";

        el.find("span").each(function () {
            const text = $(this).text().trim();
            if (!category && text.length < 30 && !/\d/.test(text) && text.length > 2) {
                category = text;
            }
            if (
                !address &&
                text.length > 15 &&
                /[Jj]l\.?|[Kk]el\.?|[Kk]ec\.?|No\.?|\d{5}/.test(text)
            ) {
                address = text;
            }
        });

        const website = el.find('a[href*="http"]:not([href*="google"])').attr("href") || "";

        results.push({
            name,
            rating,
            reviews,
            category,
            address,
            phone,
            website,
            mapsUrl: "",
            location,
        });
    });

    return results;
}

function filterResults(
    results: GoogleMapsResult[],
    minRating: number,
    hasPhone: boolean
): GoogleMapsResult[] {
    return results.filter((r) => {
        if (minRating > 0 && r.rating < minRating) return false;
        if (hasPhone && !r.phone) return false;
        return true;
    });
}

function buildSummary(results: GoogleMapsResult[]) {
    const total = results.length;
    const avgRating =
        total > 0
            ? Math.round((results.reduce((sum, r) => sum + r.rating, 0) / total) * 100) / 100
            : 0;
    const totalReviews = results.reduce((sum, r) => sum + r.reviews, 0);
    const withPhone = results.filter((r) => r.phone).length;
    const withWebsite = results.filter((r) => r.website).length;

    const categories: { [key: string]: number } = {};
    results.forEach((r) => {
        if (r.category) categories[r.category] = (categories[r.category] || 0) + 1;
    });

    const topRated = [...results]
        .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
        .slice(0, 5);

    return { total, avgRating, totalReviews, withPhone, withWebsite, categories, topRated };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const keyword = (req.query.keyword as string)?.trim();
    const location = (req.query.location as string)?.trim();
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const minRating = parseFloat((req.query.minRating as string) || "0");
    const hasPhone = req.query.hasPhone === "true";

    if (!keyword || !location) {
        return res.status(400).json({
            error: "Parameter 'keyword' dan 'location' wajib diisi.",
        });
    }

    try {
        let results = await scrapeGoogleMaps(keyword, location, limit);
        if (minRating > 0 || hasPhone) {
            results = filterResults(results, minRating, hasPhone);
        }
        const summary = buildSummary(results);
        return res.status(200).json({ results, summary });
    } catch (err: any) {
        return res.status(500).json({
            error: err.message || "Terjadi kesalahan saat scraping.",
        });
    }
}

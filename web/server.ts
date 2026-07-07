import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { URL } from "url";
import {
    googleMaps,
    googleMapsHeadless,
    googleMapsOsmFallback,
    googleMapsFilter,
    googleMapsSummary,
} from "../src/others/google-maps";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
// Dinaikkan dari 60s karena sekarang ada langkah tambahan (warm-up +
// enrichment nomor telepon lewat halaman detail) yang butuh waktu lebih.
const SEARCH_TIMEOUT_MS = 120000;
// Set EXPOSE_ERROR_DETAILS=0 di production/publik supaya client cuma
// dapat pesan generik (detail lengkap tetap dicatat di log server).
const EXPOSE_ERROR_DETAILS = process.env.EXPOSE_ERROR_DETAILS !== "0";

// --- Rate limit & concurrency guard sederhana untuk /api/search ---
// Setiap request Puppeteer membuka Chrome penuh (berat di CPU/RAM).
// Tanpa batas, beberapa request bersamaan bisa menghabiskan memori
// server (pernah terjadi saat pengujian). Batas ini generous untuk
// pemakaian normal, cuma menahan penyalahgunaan/serangan.
const MAX_CONCURRENT_SEARCHES = 2;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 15;
let activeSearches = 0;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    timestamps.push(now);
    requestLog.set(ip, timestamps);
    return timestamps.length > RATE_LIMIT_MAX_REQUESTS;
}

// Log audit sederhana ke file (siapa mencari apa, kapan, hasil berapa/error
// apa) supaya ada jejak kalau nanti perlu investigasi penyalahgunaan.
// Kegagalan tulis log tidak boleh pernah menggagalkan request itu sendiri.
const ACCESS_LOG_PATH = path.join(__dirname, "access.log");
function logSearchAccess(entry: {
    ip: string;
    keyword: string;
    location: string;
    status: number;
    resultCount?: number;
    errorSummary?: string;
}): void {
    try {
        const line =
            JSON.stringify({ time: new Date().toISOString(), ...entry }) + "\n";
        fs.appendFile(ACCESS_LOG_PATH, line, () => {
            /* abaikan kegagalan tulis log, jangan sampai mengganggu response */
        });
    } catch {
        /* abaikan */
    }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} melebihi batas waktu ${ms / 1000} detik.`)), ms)
        ),
    ]);
}

const MIME: { [ext: string]: string } = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const urlPath = (req.url || "/").split("?")[0];
    const filePath = path.join(
        PUBLIC_DIR,
        urlPath === "/" ? "index.html" : urlPath
    );
    // Cek batas direktori pakai path.sep, bukan cuma startsWith string —
    // startsWith(PUBLIC_DIR) saja bisa salah anggap folder sibling
    // (mis. "public-lain") sebagai bagian dari PUBLIC_DIR.
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) return false;
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
    return true;
}

function sendJson(res: http.ServerResponse, status: number, data: any) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname === "/api/search" && req.method === "GET") {
        const keyword = url.searchParams.get("keyword")?.trim();
        const location = url.searchParams.get("location")?.trim();
        const limit = parseInt(url.searchParams.get("limit") || "20");
        const minRating = parseFloat(url.searchParams.get("minRating") || "0");
        const hasPhone = url.searchParams.get("hasPhone") === "true";

        if (!keyword || !location) {
            return sendJson(res, 400, {
                error: "Parameter 'keyword' dan 'location' wajib diisi.",
            });
        }

        const clientIp = (req.socket && req.socket.remoteAddress) || "unknown";
        if (isRateLimited(clientIp)) {
            logSearchAccess({ ip: clientIp, keyword, location, status: 429, errorSummary: "rate-limited" });
            return sendJson(res, 429, {
                error: `Terlalu banyak permintaan. Maksimal ${RATE_LIMIT_MAX_REQUESTS} pencarian per 5 menit, coba lagi sebentar lagi.`,
            });
        }
        if (activeSearches >= MAX_CONCURRENT_SEARCHES) {
            logSearchAccess({ ip: clientIp, keyword, location, status: 429, errorSummary: "concurrency-limited" });
            return sendJson(res, 429, {
                error: "Server sedang memproses pencarian lain, coba lagi dalam beberapa detik.",
            });
        }
        activeSearches++;

        try {
            let results: Awaited<ReturnType<typeof googleMaps>>;
            let warning = "";
            try {
                results = await withTimeout(
                    googleMapsHeadless(keyword, location, { limit }),
                    SEARCH_TIMEOUT_MS,
                    "Pencarian headless browser"
                );
            } catch (headlessErr: any) {
                const headlessMsg = headlessErr.message || String(headlessErr);
                console.warn(`  [headless gagal] ${headlessMsg} — mencoba mode HTTP biasa...`);
                try {
                    results = await withTimeout(
                        googleMaps(keyword, location, { limit }),
                        SEARCH_TIMEOUT_MS,
                        "Pencarian HTTP"
                    );
                } catch (httpErr: any) {
                    const httpMsg = httpErr.message || String(httpErr);
                    console.warn(`  [HTTP gagal] ${httpMsg} — mencoba fallback OpenStreetMap...`);
                    try {
                        results = await withTimeout(
                            googleMapsOsmFallback(keyword, location, { limit }),
                            SEARCH_TIMEOUT_MS,
                            "Pencarian OpenStreetMap"
                        );
                        warning =
                            "Google Maps sedang tidak bisa diakses, hasil ini berasal dari OpenStreetMap " +
                            "(tidak ada data rating/jumlah review, dan kelengkapan data bisa lebih terbatas).";
                    } catch (osmErr: any) {
                        throw new Error(
                            `Mode headless browser gagal: ${headlessMsg}\n` +
                                `Mode HTTP biasa gagal: ${httpMsg}\n` +
                                `Fallback OpenStreetMap juga gagal: ${osmErr.message || osmErr}`
                        );
                    }
                }
            }
            if (minRating > 0 || hasPhone) {
                results = googleMapsFilter(results, { minRating, hasPhone });
            }
            const summary = googleMapsSummary(results);
            logSearchAccess({ ip: clientIp, keyword, location, status: 200, resultCount: results.length });
            return sendJson(res, 200, { results, summary, warning: warning || undefined });
        } catch (err: any) {
            const detail = err.message || String(err);
            console.error(`  [/api/search error] ${detail}`);
            logSearchAccess({ ip: clientIp, keyword, location, status: 500, errorSummary: detail });
            return sendJson(res, 500, {
                error: EXPOSE_ERROR_DETAILS ? detail : "Pencarian gagal. Coba lagi dalam beberapa saat.",
            });
        } finally {
            activeSearches--;
        }
    }

    if (serveStatic(req, res)) return;

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
});

server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
        const next = PORT + 1;
        console.log(`  Port ${PORT} sudah dipakai, mencoba port ${next}...`);
        server.listen(next, () => {
            console.log(`\n  FaiScrap running at http://localhost:${next}\n`);
        });
    } else {
        throw err;
    }
});

server.listen(PORT, () => {
    console.log(`\n  FaiScrap running at http://localhost:${PORT}\n`);
});

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
const SEARCH_TIMEOUT_MS = 60000;

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
    if (!filePath.startsWith(PUBLIC_DIR)) return false;
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
            return sendJson(res, 200, { results, summary, warning: warning || undefined });
        } catch (err: any) {
            return sendJson(res, 500, { error: err.message || "Terjadi kesalahan." });
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
            console.log(`\n  MapsBiz Scraper running at http://localhost:${next}\n`);
        });
    } else {
        throw err;
    }
});

server.listen(PORT, () => {
    console.log(`\n  MapsBiz Scraper running at http://localhost:${PORT}\n`);
});

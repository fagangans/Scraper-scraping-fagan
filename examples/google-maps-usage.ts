/**
 * Contoh penggunaan Google Maps Business Scraper
 *
 * Cara pakai:
 *   npx ts-node examples/google-maps-usage.ts
 *
 * Atau setelah build:
 *   node lib/examples/google-maps-usage.js
 */

import {
    googleMaps,
    googleMapsExport,
    googleMapsFilter,
    googleMapsSummary,
} from "../src/others/google-maps";

async function main() {
    console.log("=== Google Maps Business Scraper ===\n");

    // ============================================================
    // 1. Cari restoran di Palembang
    // ============================================================
    console.log("🔍 Mencari restoran di Palembang...\n");
    const restoran = await googleMaps("restoran", "palembang", { limit: 10 });

    console.log(`Ditemukan ${restoran.length} restoran:\n`);
    restoran.forEach((r, i) => {
        console.log(`${i + 1}. ${r.name}`);
        console.log(`   Kategori : ${r.category || "-"}`);
        console.log(`   Rating   : ${r.rating} ⭐ (${r.reviews} review)`);
        console.log(`   Alamat   : ${r.address || "-"}`);
        console.log(`   Telepon  : ${r.phone || "-"}`);
        console.log(`   Website  : ${r.website || "-"}`);
        console.log(`   Maps     : ${r.mapsUrl || "-"}`);
        console.log();
    });

    // ============================================================
    // 2. Export ke file JSON
    // ============================================================
    const jsonOutput = googleMapsExport(restoran, {
        filepath: "./data/restoran-palembang.json",
        format: "json",
    });
    console.log("✅ Data tersimpan ke ./data/restoran-palembang.json\n");

    // ============================================================
    // 3. Export ke file CSV (bisa dibuka di Excel / Google Sheets)
    // ============================================================
    googleMapsExport(restoran, {
        filepath: "./data/restoran-palembang.csv",
        format: "csv",
    });
    console.log("✅ Data tersimpan ke ./data/restoran-palembang.csv\n");

    // ============================================================
    // 4. Filter: hanya rating >= 4.0
    // ============================================================
    const topRestoran = googleMapsFilter(restoran, { minRating: 4.0 });
    console.log(`🏆 Restoran dengan rating >= 4.0: ${topRestoran.length} tempat`);
    topRestoran.forEach((r) => {
        console.log(`   - ${r.name} (${r.rating}⭐)`);
    });
    console.log();

    // ============================================================
    // 5. Filter: hanya yang punya nomor telepon
    // ============================================================
    const withPhone = googleMapsFilter(restoran, { hasPhone: true });
    console.log(`📞 Restoran dengan nomor telepon: ${withPhone.length} tempat`);
    withPhone.forEach((r) => {
        console.log(`   - ${r.name}: ${r.phone}`);
    });
    console.log();

    // ============================================================
    // 6. Ringkasan data
    // ============================================================
    const summary = googleMapsSummary(restoran);
    console.log("📊 Ringkasan:");
    console.log(`   Total bisnis    : ${summary.total}`);
    console.log(`   Rata-rata rating: ${summary.avgRating}`);
    console.log(`   Total review    : ${summary.totalReviews}`);
    console.log(`   Punya telepon   : ${summary.withPhone}`);
    console.log(`   Punya website   : ${summary.withWebsite}`);
    console.log(`   Kategori        :`, summary.categories);
    console.log();

    // ============================================================
    // 7. Contoh kota lain
    // ============================================================
    console.log("🔍 Mencari hotel di Jakarta...\n");
    const hotel = await googleMaps("hotel", "jakarta", { limit: 5 });
    hotel.forEach((r, i) => {
        console.log(`${i + 1}. ${r.name} - ${r.rating}⭐ - ${r.address || "-"}`);
    });
    console.log();

    // ============================================================
    // 8. Cari bisnis spesifik
    // ============================================================
    console.log("🔍 Mencari bengkel di Medan...\n");
    const bengkel = await googleMaps("bengkel mobil", "medan", { limit: 5 });
    googleMapsExport(bengkel, {
        filepath: "./data/bengkel-medan.json",
        format: "json",
    });
    console.log(`✅ ${bengkel.length} bengkel tersimpan ke ./data/bengkel-medan.json\n`);

    console.log("=== Selesai! ===");
}

main().catch(console.error);

(function () {
    const form = document.getElementById("searchForm");
    const keywordInput = document.getElementById("keyword");
    const locationInput = document.getElementById("location");
    const limitInput = document.getElementById("limit");
    const minRatingInput = document.getElementById("minRating");
    const hasPhoneInput = document.getElementById("hasPhone");
    const searchBtn = document.getElementById("searchBtn");
    const searchBtnLabel = document.getElementById("searchBtnLabel");
    const statusEl = document.getElementById("status");
    const resultsEl = document.getElementById("results");
    const emptyState = document.getElementById("emptyState");
    const resultsHeader = document.getElementById("resultsHeader");
    const summarySection = document.getElementById("summarySection");

    let currentResults = [];
    let currentQuery = { keyword: "", location: "" };

    // Navbar transparan di atas, jadi kaca/blur begitu halaman di-scroll
    // (ala navbar iPhone/Safari) — cuma efek visual, tidak mengubah logika lain.
    const mainHeader = document.getElementById("mainHeader");
    if (mainHeader) {
        const updateHeaderState = () => {
            const scrolled = window.scrollY > 12;
            mainHeader.classList.toggle("bg-white/70", scrolled);
            mainHeader.classList.toggle("backdrop-blur-xl", scrolled);
            mainHeader.classList.toggle("border-slate-200/80", scrolled);
            mainHeader.classList.toggle("shadow-sm", scrolled);
            mainHeader.classList.toggle("border-transparent", !scrolled);
        };
        updateHeaderState();
        window.addEventListener("scroll", updateHeaderState, { passive: true });
    }

    document.querySelectorAll(".suggest-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
            const { keyword, location } = JSON.parse(btn.dataset.suggest);
            keywordInput.value = keyword;
            locationInput.value = location;
            form.requestSubmit();
        });
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const keyword = keywordInput.value.trim();
        const location = locationInput.value.trim();
        if (!keyword || !location) return;

        currentQuery = { keyword, location };
        setLoading(true);
        renderSkeleton(parseInt(limitInput.value));
        hideStatus();

        try {
            const params = new URLSearchParams({
                keyword,
                location,
                limit: limitInput.value,
                minRating: minRatingInput.value,
                hasPhone: hasPhoneInput.checked ? "true" : "false",
            });
            const res = await fetch(`/api/search?${params.toString()}`);
            const text = await res.text();

            let data;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error("Server mengembalikan respons tidak valid. Coba lagi dalam beberapa saat.");
            }

            if (!res.ok) {
                throw new Error(data.error || "Pencarian gagal.");
            }

            if (data.warning) {
                showStatus("info", data.warning);
            }

            currentResults = data.results || [];
            renderResults(currentResults);
            renderSummary(data.summary);
        } catch (err) {
            currentResults = [];
            clearResults();
            showStatus("error", err.message || "Terjadi kesalahan. Coba lagi.");
            summarySection.classList.add("hidden");
            resultsHeader.classList.add("hidden");
            emptyState.classList.remove("hidden");
        } finally {
            setLoading(false);
        }
    });

    document.getElementById("exportJson").addEventListener("click", () => {
        if (!currentResults.length) return;
        const payload = {
            query: currentQuery,
            scrapedAt: new Date().toISOString(),
            totalResults: currentResults.length,
            results: currentResults,
        };
        downloadFile(
            JSON.stringify(payload, null, 2),
            `${currentQuery.keyword}-${currentQuery.location}.json`,
            "application/json"
        );
    });

    document.getElementById("exportCsv").addEventListener("click", () => {
        if (!currentResults.length) return;
        const headers = [
            "No", "Nama", "Kategori", "Rating", "Reviews",
            "Alamat", "Telepon", "Website", "Google Maps", "Lokasi",
        ];
        const rows = currentResults.map((r, i) => [
            i + 1,
            csvEscape(r.name),
            csvEscape(r.category),
            r.rating,
            r.reviews,
            csvEscape(r.address),
            csvEscape(r.phone),
            csvEscape(r.website),
            csvEscape(r.mapsUrl),
            csvEscape(r.location),
        ].join(","));
        const csv = [headers.join(","), ...rows].join("\n");
        downloadFile(
            csv,
            `${currentQuery.keyword}-${currentQuery.location}.csv`,
            "text/csv;charset=utf-8"
        );
    });

    document.getElementById("exportPdf").addEventListener("click", () => {
        if (!currentResults.length) return;

        if (!window.jspdf || typeof window.jspdf.jsPDF !== "function") {
            showStatus("error", "Library PDF (jsPDF) gagal dimuat dari CDN. Periksa koneksi internet atau pemblokir iklan/firewall, lalu muat ulang halaman.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

        if (typeof doc.autoTable !== "function") {
            showStatus("error", "Library tabel PDF (jspdf-autotable) gagal dimuat dari CDN. Periksa koneksi internet atau pemblokir iklan/firewall, lalu muat ulang halaman.");
            return;
        }

        try {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.setTextColor(180, 83, 9);
            doc.text("FaiScrap - Data Bisnis", 14, 15);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.text(`${currentQuery.keyword} di ${currentQuery.location} | ${new Date().toLocaleDateString("id-ID")} | Total: ${currentResults.length} data`, 14, 22);

            const headers = [["No", "Nama", "Alamat", "Website", "Nomor HP", "Rating"]];
            const rows = currentResults.map((r, i) => [
                i + 1,
                r.name || "-",
                r.address || "-",
                r.website || "-",
                r.phone || "-",
                r.rating ? r.rating.toFixed(1) : "-",
            ]);

            doc.autoTable({
                head: headers,
                body: rows,
                startY: 28,
                theme: "grid",
                headStyles: {
                    fillColor: [180, 83, 9],
                    textColor: 255,
                    fontStyle: "bold",
                    fontSize: 9,
                    halign: "center",
                },
                bodyStyles: {
                    fontSize: 8,
                    textColor: [30, 41, 59],
                },
                alternateRowStyles: {
                    fillColor: [255, 251, 235],
                },
                columnStyles: {
                    0: { halign: "center", cellWidth: 12 },
                    1: { cellWidth: 55 },
                    2: { cellWidth: 70 },
                    3: { cellWidth: 55 },
                    4: { cellWidth: 35, halign: "center" },
                    5: { halign: "center", cellWidth: 18 },
                },
                margin: { left: 14, right: 14 },
                didDrawPage: function () {
                    doc.setFontSize(7);
                    doc.setTextColor(148, 163, 184);
                    doc.text(
                        `Halaman ${doc.internal.getNumberOfPages()}`,
                        doc.internal.pageSize.width - 14,
                        doc.internal.pageSize.height - 8,
                        { align: "right" }
                    );
                },
            });

            const filename = `${currentQuery.keyword}-${currentQuery.location}.pdf`
                .replace(/\s+/g, "-")
                .toLowerCase();
            doc.save(filename);
        } catch (err) {
            console.error("Gagal membuat PDF:", err);
            showStatus("error", "Gagal membuat PDF: " + (err.message || "kesalahan tidak diketahui") + ". Buka Console browser (F12) untuk detail.");
        }
    });

    function csvEscape(val) {
        if (val == null) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
    }

    function downloadFile(content, filename, mime) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename.replace(/\s+/g, "-").toLowerCase();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function setLoading(loading) {
        searchBtn.disabled = loading;
        searchBtnLabel.textContent = loading ? "Mencari..." : "Cari Sekarang";
    }

    function clearResults() {
        resultsEl.innerHTML = "";
    }

    function renderSkeleton(count) {
        emptyState.classList.add("hidden");
        resultsHeader.classList.add("hidden");
        summarySection.classList.add("hidden");
        clearResults();
        const n = Math.min(Math.max(count, 3), 9);
        for (let i = 0; i < n; i++) {
            const card = document.createElement("div");
            card.className = "bg-white border border-slate-200 rounded-xl p-4";
            card.innerHTML = `
                <div class="skeleton h-5 w-3/4 mb-3"></div>
                <div class="skeleton h-3 w-1/2 mb-2"></div>
                <div class="skeleton h-3 w-full mb-2"></div>
                <div class="skeleton h-3 w-5/6"></div>
            `;
            resultsEl.appendChild(card);
        }
    }

    function renderResults(results) {
        clearResults();
        if (!results.length) {
            emptyState.classList.remove("hidden");
            resultsHeader.classList.add("hidden");
            summarySection.classList.add("hidden");
            showStatus("info", "Tidak ada hasil ditemukan. Coba kata kunci lain.");
            return;
        }
        emptyState.classList.add("hidden");
        resultsHeader.classList.remove("hidden");

        results.forEach((r, i) => {
            const card = document.createElement("article");
            card.className = "result-card bg-white border border-slate-200 rounded-xl p-4 flex flex-col";

            const stars = renderStars(r.rating);
            const ratingLine = r.rating
                ? `<div class="flex items-center gap-1 text-sm">
                       <div class="flex items-center" aria-label="Rating ${r.rating}">${stars}</div>
                       <span class="font-semibold text-slate-700">${r.rating.toFixed(1)}</span>
                       <span class="text-slate-400">(${r.reviews})</span>
                   </div>`
                : `<div class="text-xs text-slate-400">Belum ada rating</div>`;

            const category = r.category
                ? `<span class="inline-block text-xs font-medium text-primary bg-amber-50 rounded-full px-2 py-0.5">${escapeHtml(r.category)}</span>`
                : "";

            card.innerHTML = `
                <header class="flex items-start justify-between gap-2 mb-2">
                    <h3 class="font-heading font-semibold text-slate-900 leading-snug">${i + 1}. ${escapeHtml(r.name)}</h3>
                </header>
                ${category ? `<div class="mb-2">${category}</div>` : ""}
                <div class="mb-3">${ratingLine}</div>
                ${r.address ? `<p class="text-sm text-slate-600 flex gap-2 mb-2">
                    <svg class="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span>${escapeHtml(r.address)}</span>
                </p>` : ""}
                ${r.phone ? `<p class="text-sm text-slate-600 flex gap-2 mb-2">
                    <svg class="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    <a href="tel:${encodeURIComponent(r.phone)}" class="hover:text-primary transition-colors cursor-pointer">${escapeHtml(r.phone)}</a>
                </p>` : ""}
                <div class="mt-auto pt-3 flex flex-wrap gap-2 text-xs">
                    ${safeUrl(r.website) ? `<a href="${escapeAttr(safeUrl(r.website))}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        Website
                    </a>` : ""}
                    ${safeUrl(r.mapsUrl) ? `<a href="${escapeAttr(safeUrl(r.mapsUrl))}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-primary transition-colors cursor-pointer">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        Google Maps
                    </a>` : ""}
                </div>
            `;
            resultsEl.appendChild(card);
        });
    }

    function renderStars(rating) {
        let html = "";
        const full = Math.floor(rating);
        for (let i = 0; i < 5; i++) {
            const cls = i < full ? "star-filled" : "star-empty";
            html += `<svg class="w-4 h-4 ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
        }
        return html;
    }

    function renderSummary(summary) {
        if (!summary || !summary.total) {
            summarySection.classList.add("hidden");
            return;
        }
        summarySection.classList.remove("hidden");
        document.getElementById("sumTotal").textContent = summary.total;
        document.getElementById("sumAvgRating").textContent = summary.avgRating.toFixed(1);
        document.getElementById("sumPhone").textContent = summary.withPhone;
        document.getElementById("sumWebsite").textContent = summary.withWebsite;
    }

    function showStatus(type, message) {
        const classes = {
            error: "bg-red-50 border-red-200 text-red-700",
            info: "bg-amber-50 border-amber-200 text-amber-800",
        };
        statusEl.className = `border rounded-lg px-4 py-3 text-sm ${classes[type] || classes.info}`;
        statusEl.textContent = message;
        statusEl.classList.remove("hidden");
    }

    function hideStatus() {
        statusEl.classList.add("hidden");
    }

    function escapeHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    function escapeAttr(str) {
        return escapeHtml(str);
    }

    // Data website/mapsUrl berasal dari hasil scraping (termasuk OpenStreetMap
    // yang bisa diedit siapa saja) — HTML-escape saja tidak cukup untuk
    // mencegah skema berbahaya seperti "javascript:" dipakai di href. Hanya
    // izinkan http/https, selain itu link dianggap tidak valid.
    function safeUrl(str) {
        const value = String(str || "").trim();
        if (!value) return "";
        try {
            const parsed = new URL(value, window.location.href);
            if (parsed.protocol === "http:" || parsed.protocol === "https:") {
                return value;
            }
        } catch {
            return "";
        }
        return "";
    }
})();

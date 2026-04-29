const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

// ================= CONFIG =================
const PORT = process.env.PORT || 3000;

const API_MD5 = "https://wtxmd52.tele68.com/v1/txmd5/sessions";
const API_TX = "https://wtx.tele68.com/v1/tx/sessions";

// cache đơn giản (10 giây)
let cache = {
    md5: { data: null, time: 0 },
    tx: { data: null, time: 0 }
};

// ================= HELPER =================
function analyzeData(data) {
    if (!data || !data.list || data.list.length < 10) return null;

    let history = data.list.slice(0, 50); // tăng data cho chính xác hơn

    let resultList = history.map(i => (i.resultTruyenThong || "").toUpperCase());
    let diceList = history.map(i => i.dices);
    let sumList = history.map(i => i.point);
    let sessionList = history.map(i => i.id);

    function formatTX(value) {
        return value === "TAI" ? "Tài" : "Xỉu";
    }

    // ===== pattern (cũ → mới cho dễ đọc) =====
    let patternArr = resultList.map(v => v === "TAI" ? "T" : "X");

    let pattern = patternArr
        .slice()
        .reverse()
        .join("");

    // =========================
    // 🔥 PATTERN MATCHING AI
    // =========================

    let size = 5; // độ dài pattern mẫu (4-6 là đẹp)

    let currentPattern = patternArr.slice(0, size).join("");

    let countT = 0;
    let countX = 0;
    let total = 0;

    for (let i = 1; i <= patternArr.length - size - 1; i++) {
        let sub = patternArr.slice(i, i + size).join("");

        if (sub === currentPattern) {
            let next = patternArr[i - 1]; // vì index 0 là mới nhất

            if (next === "T") countT++;
            if (next === "X") countX++;

            total++;
        }
    }

    // =========================
    // 🎯 DỰ ĐOÁN + ĐỘ TIN CẬY
    // =========================

    let du_doan_raw;
    let do_tin_cay;

    if (total > 0) {
        if (countT > countX) {
            du_doan_raw = "TAI";
            do_tin_cay = ((countT / total) * 100).toFixed(1);
        } else if (countX > countT) {
            du_doan_raw = "XIU";
            do_tin_cay = ((countX / total) * 100).toFixed(1);
        } else {
            du_doan_raw = resultList[0];
            do_tin_cay = 50;
        }
    } else {
        // fallback về bệt
        let last = resultList[0];
        let count = 1;

        for (let i = 1; i < resultList.length; i++) {
            if (resultList[i] === last) count++;
            else break;
        }

        du_doan_raw = count >= 2
            ? (last === "TAI" ? "XIU" : "TAI")
            : last;

        do_tin_cay = 50;
    }

    return {
        phien_truoc: sessionList[0],
        xuc_xac: diceList[0],
        tong: sumList[0],

        ket_qua: formatTX(resultList[0]),

        phien_hien_tai: sessionList[0] + 1,

        pattern,

        du_doan: formatTX(du_doan_raw),

        do_tin_cay: do_tin_cay + "%",

        // 🔥 thêm debug xịn
        pattern_detail: {
            mau: currentPattern,
            so_lan_gap: total,
            T: countT,
            X: countX
        }
    };
}

// ================= FETCH FUNCTION =================
async function fetchWithCache(key, url) {
    const now = Date.now();

    if (cache[key].data && (now - cache[key].time < 10000)) {
        return cache[key].data;
    }

    try {
        const res = await axios.get(url, { timeout: 5000 });

        // ✅ FIX Ở ĐÂY
        const analyzed = analyzeData(res.data);

        cache[key] = {
            data: analyzed,
            time: now
        };

        return analyzed;

    } catch (err) {
        console.log("API lỗi:", err.message);
        return { error: "API nguồn lỗi hoặc timeout" };
    }
}

// ================= ROUTES =================

// test
app.get("/", (req, res) => {
    res.send("API Trung Gian Dang Chay OK");
});

// MD5
app.get("/api/lc/md5", async (req, res) => {
    const data = await fetchWithCache("md5", API_MD5);
    res.json(data);
});

// Tài xỉu thường
app.get("/api/lc/taixiu", async (req, res) => {
    const data = await fetchWithCache("tx", API_TX);
    res.json(data);
});

// ================= RUN =================
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

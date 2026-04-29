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
    if (!data || !data.list || data.list.length < 2) return null;

    let history = data.list.slice(0, 20);

    let resultList = history.map(i => (i.resultTruyenThong || "").toUpperCase());
    let diceList = history.map(i => i.dices);
    let sumList = history.map(i => i.point);
    let sessionList = history.map(i => i.id);

    function formatTX(value) {
        return value === "TAI" ? "Tài" : "Xỉu";
    }

    // ===== thống kê =====
    let thang = 0;
    let thua = 0;

    for (let i = 1; i < resultList.length; i++) {
        if (resultList[i] === resultList[i - 1]) thang++;
        else thua++;
    }

    // ===== pattern =====
    let last = resultList[0];
    let count = 1;

    for (let i = 1; i < resultList.length; i++) {
        if (resultList[i] === last) count++;
        else break;
    }

    let pattern = `${formatTX(last)} ${count}`;

    // ===== dự đoán =====
    let du_doan_raw = count >= 2
        ? (last === "TAI" ? "XIU" : "TAI")
        : last;

    let do_tin_cay = Math.min(95, 50 + count * 10);

    return {
        phien_truoc: sessionList[0],
        xuc_xac: diceList[0],
        tong: sumList[0],

        ket_qua: formatTX(last),

        phien_hien_tai: sessionList[0] + 1,

        pattern,
        du_doan: formatTX(du_doan_raw),

        do_tin_cay: do_tin_cay + "%",

        thong_ke: {
            thang,
            thua
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

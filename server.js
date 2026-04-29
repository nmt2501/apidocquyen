const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

// ================= CONFIG =================
const PORT = process.env.PORT || 3000;

const API_MD5 = "https://wtxmd52.tele68.com/v1/txmd5/sessions";
const API_TX = "https://wtx.tele68.com/v1/tx/sessions";

// cache 10s
let cache = {
    md5: { data: null, time: 0 },
    tx: { data: null, time: 0 }
};

function analyzeData(data) {
    if (!data || !data.list || data.list.length < 10) return null;

    let history = data.list.slice(0, 60);

    let resultList = history.map(i => (i.resultTruyenThong || "").toUpperCase());
    let diceList = history.map(i => i.dices);
    let sumList = history.map(i => i.point);
    let sessionList = history.map(i => i.id);

    function formatTX(v) {
        return v === "TAI" ? "Tài" : "Xỉu";
    }

    // ===== pattern =====
    let patternArr = resultList.map(v => v === "TAI" ? "T" : "X");
    let pattern = patternArr.slice().reverse().join("");

    let scoreT = 0;
    let scoreX = 0;

    // ======================================
    // 🤖 1. MULTI PATTERN MATCH (CHÍNH)
    // ======================================
    let weights = { 3: 1, 4: 1.5, 5: 2, 6: 3 };

    for (let size = 3; size <= 6; size++) {
        let current = patternArr.slice(0, size).join("");

        let countT = 0;
        let countX = 0;
        let total = 0;

        for (let i = 1; i <= patternArr.length - size - 1; i++) {
            let sub = patternArr.slice(i, i + size).join("");

            if (sub === current) {
                let next = patternArr[i - 1];

                if (next === "T") countT++;
                if (next === "X") countX++;

                total++;
            }
        }

        if (total > 0) {
            let w = weights[size];

            scoreT += (countT / total) * w;
            scoreX += (countX / total) * w;
        }
    }

    // ======================================
    // 🔥 2. CẦU BỆT (STREAK)
    // ======================================
    let streak = 1;
    for (let i = 1; i < resultList.length; i++) {
        if (resultList[i] === resultList[0]) streak++;
        else break;
    }

    if (streak >= 3) {
        // bệt mạnh → dễ đảo
        if (resultList[0] === "TAI") scoreX += 2;
        else scoreT += 2;
    }

    // ======================================
    // 🔄 3. CẦU 1-1 (XEN KẼ)
    // ======================================
    let isZigzag = true;
    for (let i = 0; i < 6; i++) {
        if (resultList[i] === resultList[i + 1]) {
            isZigzag = false;
            break;
        }
    }

    if (isZigzag) {
        // tiếp tục xen kẽ
        if (resultList[0] === "TAI") scoreX += 1.5;
        else scoreT += 1.5;
    }

    // ======================================
    // 🔁 4. ĐẢO NHỊP (2-2 / 3-3)
    // ======================================
    let block2 =
        resultList[0] === resultList[1] &&
        resultList[2] === resultList[3] &&
        resultList[0] !== resultList[2];

    if (block2) {
        // theo block
        if (resultList[0] === "TAI") scoreT += 1;
        else scoreX += 1;
    }

// ======================================
// 🎯 QUYẾT ĐỊNH
// ======================================
let du_doan_raw;
let totalScore = scoreT + scoreX;

if (totalScore > 0) {
    if (scoreT > scoreX) du_doan_raw = "TAI";
    else du_doan_raw = "XIU";
} else {
    du_doan_raw = resultList[0];
}

let do_tin_cay = totalScore > 0
    ? (Math.max(scoreT, scoreX) / totalScore) * 100
    : 50;

// clamp
do_tin_cay = Math.max(50, Math.min(95, do_tin_cay));

// ======================================
// 🔥 XÁC ĐỊNH LOẠI CẦU
// ======================================
let loai_cau = "Ngẫu nhiên";

if (streak >= 3) {
    loai_cau = "Cầu bệt";
} else if (isZigzag) {
    loai_cau = "Cầu 1-1";
} else {
    let block2 =
        resultList[0] === resultList[1] &&
        resultList[2] === resultList[3] &&
        resultList[0] !== resultList[2];

    if (block2) loai_cau = "Cầu 2-2";
}

// ======================================
// 📊 TỈ LỆ
// ======================================
let ti_le_tai = totalScore > 0
    ? ((scoreT / totalScore) * 100).toFixed(1)
    : "50.0";

let ti_le_xiu = totalScore > 0
    ? ((scoreX / totalScore) * 100).toFixed(1)
    : "50.0";

// ======================================
// 📦 RETURN
// ======================================
return {
    phien_truoc: sessionList[0],
    xuc_xac: diceList[0],
    tong: sumList[0],

    ket_qua: formatTX(resultList[0]),

    phien_hien_tai: sessionList[0] + 1,

    pattern,

    du_doan: formatTX(du_doan_raw),

    do_tin_cay: do_tin_cay.toFixed(1) + "%",

    chi_tiet: {
        loai_cau,
        ti_le_tai: ti_le_tai + "%",
        ti_le_xiu: ti_le_xiu + "%"
    }
};

// ================= FETCH =================
async function fetchWithCache(key, url) {
    const now = Date.now();

    if (cache[key].data && (now - cache[key].time < 10000)) {
        return cache[key].data;
    }

    try {
        const res = await axios.get(url, { timeout: 5000 });

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
app.get("/", (req, res) => {
    res.send("API Trung Gian Dang Chay OK");
});

app.get("/api/lc/md5", async (req, res) => {
    const data = await fetchWithCache("md5", API_MD5);
    res.json(data);
});

app.get("/api/lc/taixiu", async (req, res) => {
    const data = await fetchWithCache("tx", API_TX);
    res.json(data);
});

// ================= RUN =================
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

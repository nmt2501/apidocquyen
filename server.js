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

    // =========================
    // PATTERN BASE
    // =========================
    let patternArr = resultList.map(v => v === "TAI" ? "T" : "X");
    let pattern = patternArr.slice().reverse().join("");

    let scoreT = 0;
    let scoreX = 0;

    // =========================
    // MULTI PATTERN MATCH
    // =========================
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

    // =========================
    // 🔥 STREAK
    // =========================
    let streak = 1;
    for (let i = 1; i < resultList.length; i++) {
        if (resultList[i] === resultList[0]) streak++;
        else break;
    }

    if (streak >= 3) {
        if (resultList[0] === "TAI") scoreX += 2;
        else scoreT += 2;
    }

    // =========================
    // 🔄 ZIGZAG
    // =========================
    let isZigzag = true;
    for (let i = 0; i < 6; i++) {
        if (resultList[i] === resultList[i + 1]) {
            isZigzag = false;
            break;
        }
    }

    if (isZigzag) {
        if (resultList[0] === "TAI") scoreX += 1.5;
        else scoreT += 1.5;
    }

    // =========================
    // 🔁 BLOCK
    // =========================
    let block2 =
        resultList[0] === resultList[1] &&
        resultList[2] === resultList[3] &&
        resultList[0] !== resultList[2];

    if (block2) {
        if (resultList[0] === "TAI") scoreT += 1;
        else scoreX += 1;
    }

    // =========================
    // ⚡ MICRO PATTERN FIXED
    // =========================
    const seq = (len) =>
        resultList.slice(0, len).map(v => v === "TAI" ? "T" : "X").join("");

    let seq3 = seq(3);
    let seq4 = seq(4);

    // 121 / 212
    if (seq3 === "TXT" || seq3 === "XTX") {
        if (resultList[0] === "TAI") scoreX += 2;
        else scoreT += 2;
    }

    // 131 / 313
    if (seq3 === "TTX" || seq3 === "XXT") {
        if (resultList[0] === "TAI") scoreX += 1.5;
        else scoreT += 1.5;
    }

    // 123-ish
    if (seq4 === "TXTT" || seq4 === "XTXT") {
        if (resultList[0] === "TAI") scoreT += 1.2;
        else scoreX += 1.2;
    }

    // 323
    if (seq4 === "TTXX" || seq4 === "XXTT") {
        if (resultList[0] === "TAI") scoreT += 1.3;
        else scoreX += 1.3;
    }

    // =========================
    // 📈 TREND 10 PHIÊN
    // =========================
    let recent = resultList.slice(0, 10);

    let tCount = recent.filter(v => v === "TAI").length;
    let xCount = recent.filter(v => v === "XIU").length;

    if (tCount > xCount) {
        scoreT += (tCount / 10) * 2;
    } else {
        scoreX += (xCount / 10) * 2;
    }

    // =========================
    // 🎯 DECISION
    // =========================
    let totalScore = scoreT + scoreX;

    let du_doan_raw =
        totalScore > 0
            ? (scoreT > scoreX ? "TAI" : "XIU")
            : resultList[0];

    let do_tin_cay =
        totalScore > 0
            ? (Math.max(scoreT, scoreX) / totalScore) * 100
            : 50;

    do_tin_cay = Math.max(50, Math.min(95, do_tin_cay));

    // =========================
    // 🔥 LOẠI CẦU
    // =========================
    let loai_cau = "Ngẫu nhiên";

    if (streak >= 4) loai_cau = "Cầu bệt dài";
    else if (streak >= 2) loai_cau = "Cầu bệt ngắn";
    else if (isZigzag) loai_cau = "Cầu 1-1";
    else if (block2) loai_cau = "Cầu 2-2";
    else if (seq3 === "TXT" || seq3 === "XTX") loai_cau = "Cầu 1-2-1";
    else if (seq3 === "TTX" || seq3 === "XXT") loai_cau = "Cầu 1-3-1";

    // =========================
    // 📊 TỈ LỆ
    // =========================
    let ti_le_tai = totalScore > 0
        ? ((scoreT / totalScore) * 100).toFixed(1)
        : "50.0";

    let ti_le_xiu = totalScore > 0
        ? ((scoreX / totalScore) * 100).toFixed(1)
        : "50.0";

// ======================================
// 📊 THỐNG KÊ CHUẨN (SO SÁNH THỰC TẾ)
// ======================================
let thang = 0;
let thua = 0;
let totalCheck = 0;

// dùng cùng 1 logic dự đoán thật
function predictSimple(arr, index) {
    let base = arr[index - 1];

    let streak = 1;
    for (let i = index - 2; i >= 0; i--) {
        if (arr[i] === base) streak++;
        else break;
    }

    return streak >= 2
        ? (base === "TAI" ? "XIU" : "TAI")
        : base;
}

// bắt đầu từ index 1 → mới có dữ liệu để so sánh
for (let i = 1; i < resultList.length; i++) {

    let actual = resultList[i];
    let predict = predictSimple(resultList, i);

    if (!actual) continue;

    if (predict === actual) thang++;
    else thua++;

    totalCheck++;
}

let ti_le_thang =
    totalCheck > 0
        ? ((thang / totalCheck) * 100).toFixed(1)
        : "0.0";

// ======================================
// 🧠 8. NHẬN DIỆN LOẠI CẦU NÂNG CAO
// ======================================

let flipCount = 0;   // số lần đảo
let sameCount = 1;   // chuỗi giống nhau
let maxStreak = 1;   // bệt dài nhất

for (let i = 1; i < resultList.length; i++) {
    if (resultList[i] === resultList[i - 1]) {
        sameCount++;
    } else {
        flipCount++;
        maxStreak = Math.max(maxStreak, sameCount);
        sameCount = 1;
    }
}

// check streak cuối
maxStreak = Math.max(maxStreak, sameCount);

// ======================================
// 📏 CẦU NGẮN / DÀI
// ======================================
let cau_type = "Ngắn";

if (maxStreak >= 5) cau_type = "Dài";
else if (maxStreak >= 3) cau_type = "Trung bình";

// ======================================
// 🔄 CẦU ĐẢO (dao liên tục)
// ======================================
let cau_dao = flipCount >= 8; // nhiều lần đổi trong 20-60 phiên

// ======================================
// 🎭 CẦU BỊP / CẦU CHỈNH (nhiễu cao)
// ======================================
// đặc trưng: đảo nhiều + không có streak rõ + pattern rối
let entropyScore = flipCount / resultList.length;

let cau_bip = false;

if (entropyScore > 0.6 && maxStreak <= 2) {
    cau_bip = true;
}

// ======================================
// 📦 GOM NHẬN DIỆN
// ======================================
let nhan_dien_cau = "Bình thường";

if (cau_bip) {
    nhan_dien_cau = "Cầu bịp / cầu chỉnh";
} else if (cau_dao) {
    nhan_dien_cau = "Cầu đảo";
} else if (maxStreak >= 3) {
    nhan_dien_cau = "Cầu bệt";
} else {
    nhan_dien_cau = "Cầu thường";
}

    // =========================
    // 📦 RETURN
    // =========================
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
    },

    // ✅ PHẢI CÓ DẤU PHẨY Ở TRÊN
    thong_ke: {
        thang,
        thua,
        ti_le_thang: ti_le_thang + "%"
    },

    nhan_dien: {
    loai_cau: nhan_dien_cau,
    cau_do_dai: cau_type,
    do_on_dinh: maxStreak,
    so_lan_dao: flipCount
}
};
}
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

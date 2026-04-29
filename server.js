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

// ================= HELPER =================
function analyzeData(data) {
    if (!data || !data.list || data.list.length < 10) return null;

    let history = data.list.slice(0, 50);

    let resultList = history.map(i => (i.resultTruyenThong || "").toUpperCase());
    let diceList = history.map(i => i.dices);
    let sumList = history.map(i => i.point);
    let sessionList = history.map(i => i.id);

    function formatTX(value) {
        return value === "TAI" ? "Tài" : "Xỉu";
    }

    // ===== pattern (cũ → mới) =====
    let patternArr = resultList.map(v => v === "TAI" ? "T" : "X");

    let pattern = patternArr.slice().reverse().join("");

    // =========================
    // 🤖 MULTI PATTERN AI
    // =========================
    let weights = {
        3: 1,
        4: 1.5,
        5: 2,
        6: 3
    };

    let scoreT = 0;
    let scoreX = 0;
    let totalWeight = 0;

    for (let size = 3; size <= 6; size++) {
        let currentPattern = patternArr.slice(0, size).join("");

        let countT = 0;
        let countX = 0;
        let total = 0;

        for (let i = 1; i <= patternArr.length - size - 1; i++) {
            let sub = patternArr.slice(i, i + size).join("");

            if (sub === currentPattern) {
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

            totalWeight += w;
        }
    }

    // =========================
    // 🎯 QUYẾT ĐỊNH
    // =========================
    let du_doan_raw;
    let do_tin_cay;

    if (totalWeight > 0) {
        if (scoreT > scoreX) {
            du_doan_raw = "TAI";
            do_tin_cay = (scoreT / (scoreT + scoreX)) * 100;
        } else {
            du_doan_raw = "XIU";
            do_tin_cay = (scoreX / (scoreT + scoreX)) * 100;
        }
    } else {
        // fallback bệt
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

    // boost nhẹ nếu bệt mạnh
    if (
        resultList[0] === resultList[1] &&
        resultList[1] === resultList[2]
    ) {
        do_tin_cay += 5;
    }

    // clamp
    do_tin_cay = Math.max(50, Math.min(95, do_tin_cay)).toFixed(1);

    return {
        phien_truoc: sessionList[0],
        xuc_xac: diceList[0],
        tong: sumList[0],

        ket_qua: formatTX(resultList[0]),

        phien_hien_tai: sessionList[0] + 1,

        pattern,

        du_doan: formatTX(du_doan_raw),

        do_tin_cay: do_tin_cay + "%"
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

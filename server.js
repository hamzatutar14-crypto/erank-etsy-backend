<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>Tutar DEBUG - Canlı Test Paneli</title>
    <style>
        body { font-family: monospace; background: #121212; color: #00ff66; padding: 20px; }
        h1 { color: #fff; border-bottom: 2px solid #00ff66; padding-bottom: 10px; }
        .box { background: #1e1e1e; border: 1px solid #333; padding: 15px; margin-bottom: 15px; border-radius: 5px; }
        button { background: #00ff66; color: #000; border: none; padding: 10px 15px; font-weight: bold; cursor: pointer; border-radius: 3px; }
        button:hover { background: #00cc52; }
        pre { background: #000; padding: 10px; overflow-x: auto; color: #fff; border-radius: 3px; }
        .ok { color: #00ff66; font-weight: bold; }
    </style>
</head>
<body>

    <h1>Tutar DEBUG — Sistem Kontrol Paneli</h1>
    <p>Backend URL: <a href="https://etsy-backend-hamza-2028.onrender.com" target="_blank" style="color: #00ff66;">https://etsy-backend-hamza-2028.onrender.com</a></p>

    <div class="box">
        <h3>1 — Sağlık (Health) Kontrolü</h3>
        <button onclick="testHealth()">TEST ET (/health)</button>
        <pre id="health-result">Sonuç bekleniyor...</pre>
    </div>

    <div class="box">
        <h3>2 — Ultimate Keyword Analizi (/api/keyword/ultimate)</h3>
        <input type="text" id="keyword-input" value="tshirt" style="padding: 8px; background: #000; color: #fff; border: 1px solid #444; width: 200px;">
        <button onclick="testUltimate()">TEST ET</button>
        <pre id="ultimate-result">Sonuç bekleniyor...</pre>
    </div>

    <div class="box">
        <h3>3 — Günlük Trendler (/api/trending/daily)</h3>
        <button onclick="testTrending()">TEST ET</button>
        <pre id="trending-result">Sonuç bekleniyor...</pre>
    </div>

    <script>
        const BASE_URL = "https://etsy-backend-hamza-2028.onrender.com";

        async function testHealth() {
            const resBox = document.getElementById("health-result");
            resBox.innerText = "Yükleniyor...";
            try {
                const res = await fetch(`${BASE_URL}/health`);
                const data = await res.json();
                resBox.innerText = JSON.stringify(data, null, 2);
            } catch (err) {
                resBox.innerText = "Hata: " + err.message;
            }
        }

        async function testUltimate() {
            const kw = document.getElementById("keyword-input").value;
            const resBox = document.getElementById("ultimate-result");
            resBox.innerText = "Yükleniyor...";
            try {
                const res = await fetch(`${BASE_URL}/api/keyword/ultimate?keyword=${kw}`);
                const data = await res.json();
                resBox.innerText = JSON.stringify(data, null, 2);
            } catch (err) {
                resBox.innerText = "Hata: " + err.message;
            }
        }

        async function testTrending() {
            const resBox = document.getElementById("trending-result");
            resBox.innerText = "Yükleniyor...";
            try {
                const res = await fetch(`${BASE_URL}/api/trending/daily`);
                const data = await res.json();
                resBox.innerText = JSON.stringify(data, null, 2);
            } catch (err) {
                resBox.innerText = "Hata: " + err.message;
            }
        }
    </script>

</body>
</html>
          

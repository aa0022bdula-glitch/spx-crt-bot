const BOT_TOKEN = process.env.BOT_TOKEN || "8835837920:AAG6ZdjZsu5PQK5TXlogXr-mZEW5n6wFySE";
const CHAT_ID = process.env.CHAT_ID || "620712460";
const ALPHA_KEY = process.env.ALPHA_KEY || "5QW2KW34906SK7EV";
const SYMBOL = "SPY";
const MIN_WICK = 40; // الحد الأدنى لنسبة الذيل %

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: text,
      parse_mode: "HTML"
    })
  });
  const data = await res.json();
  if (!data.ok) {
    console.error("خطأ في إرسال التلقرام:", data.description);
  }
}

function aggregateCandles(hourlyCandles, hoursCount) {
  const result = [];
  for (let i = 0; i + hoursCount <= hourlyCandles.length; i += hoursCount) {
    const chunk = hourlyCandles.slice(i, i + hoursCount);
    const newest = chunk[0];
    const oldest = chunk[chunk.length - 1];
    result.push({
      open: oldest.open,
      close: newest.close,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low))
    });
  }
  return result;
}

function detectCRT(prevCandle, currCandle) {
  const totalRange = currCandle.high - currCandle.low;
  if (totalRange === 0) return null;

  // CRT شرائي
  if (currCandle.low < prevCandle.low && currCandle.close > prevCandle.low) {
    const bodyBottom = Math.min(currCandle.open, currCandle.close);
    const lowerWick = bodyBottom - currCandle.low;
    const wickRatio = ((lowerWick / totalRange) * 100).toFixed(1);
    if (parseFloat(wickRatio) >= MIN_WICK) {
      return { type: "شرائي (Bullish)", wickRatio, price: currCandle.close.toFixed(2) };
    }
  }

  // CRT بيعي
  if (currCandle.high > prevCandle.high && currCandle.close < prevCandle.high) {
    const bodyTop = Math.max(currCandle.open, currCandle.close);
    const upperWick = currCandle.high - bodyTop;
    const wickRatio = ((upperWick / totalRange) * 100).toFixed(1);
    if (parseFloat(wickRatio) >= MIN_WICK) {
      return { type: "بيعي (Bearish)", wickRatio, price: currCandle.close.toFixed(2) };
    }
  }

  return null;
}

async function fetchSeries(funcName, interval = "") {
  let url = `https://www.alphavantage.co/query?function=${funcName}&symbol=${SYMBOL}&apikey=${ALPHA_KEY}`;
  if (interval) url += `&interval=${interval}`;
  const res = await fetch(url);
  const data = await res.json();
  const key = Object.keys(data).find(k => k.includes("Time Series"));
  if (!key) return null;
  return Object.values(data[key]).map(c => ({
    open: parseFloat(c["1. open"]),
    high: parseFloat(c["2. high"]),
    low: parseFloat(c["3. low"]),
    close: parseFloat(c["4. close"])
  }));
}

async function checkFrame(label, candles) {
  if (!candles || candles.length < 2) return;
  const crt = detectCRT(candles[1], candles[0]);
  if (crt) {
    const msg =
      `<b>CRT</b>\n` +
      `نسبة الذيل: <b>${crt.wickRatio}%</b>\n` +
      `الفريم: <b>${label}</b>\n` +
      `النوع: ${crt.type} | السعر: ${crt.price}`;
    await sendTelegram(msg);
  }
}

async function run() {
  const c30m = await fetchSeries("TIME_SERIES_INTRADAY", "30min");
  if (c30m) await checkFrame("نصف ساعة (30M)", c30m);

  const c1h = await fetchSeries("TIME_SERIES_INTRADAY", "60min");
  if (c1h) {
    await checkFrame("ساعة (1H)", c1h);
    await checkFrame("ساعتين (2H)", aggregateCandles(c1h, 2));
    await checkFrame("ثلاث ساعات (3H)", aggregateCandles(c1h, 3));
    await checkFrame("أربع ساعات (4H)", aggregateCandles(c1h, 4));
  }

  const c1d = await fetchSeries("TIME_SERIES_DAILY");
  if (c1d) await checkFrame("يومي (1D)", c1d);
}

run();

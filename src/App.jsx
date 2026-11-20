// =============================================
// FLIPKART PDF EXTRACTOR
// =============================================
import React, { useEffect, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import { Upload, Package, FileText } from "lucide-react";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import "./App.css";

GlobalWorkerOptions.workerSrc = workerSrc;

// India State Code → Full Name
const STATE_MAP = {
  AP: "Andhra Pradesh", AR: "Arunachal Pradesh", AS: "Assam",
  BR: "Bihar", CG: "Chhattisgarh", GA: "Goa", GJ: "Gujarat",
  HR: "Haryana", HP: "Himachal Pradesh", JH: "Jharkhand",
  KA: "Karnataka", KL: "Kerala", MP: "Madhya Pradesh",
  MH: "Maharashtra", MN: "Manipur", ML: "Meghalaya",
  MZ: "Mizoram", NL: "Nagaland", OR: "Odisha", PB: "Punjab",
  RJ: "Rajasthan", SK: "Sikkim", TN: "Tamil Nadu",
  TS: "Telangana", TR: "Tripura", UP: "Uttar Pradesh",
  UK: "Uttarakhand", WB: "West Bengal", DL: "Delhi",
  JK: "Jammu & Kashmir", LA: "Ladakh", PY: "Puducherry",
  CH: "Chandigarh", AN: "Andaman & Nicobar",
};

function parseFlipkartPage(text) {
  const orderMatch = text.match(/\b(OD\d{15,})\b/);
  const orderId = orderMatch ? orderMatch[1] : null;
  if (!orderId) return null; // skip non-order pages

  const modeMatch = text.match(/\b(COD|PREPAID)\b/);
  const mode = modeMatch ? modeMatch[1] : "Unknown";

  const awbMatch = text.match(/AWB\s*\n+No\.\s*\n+(\S+)/);
  const awb = awbMatch ? awbMatch[1] : "Unknown";

  const nameMatch = text.match(/Name:\s*([^\n,]+)/);
  const name = nameMatch
    ? nameMatch[1].trim().replace(/\b\w/g, (c) => c.toUpperCase())
    : "Unknown";

  // Address block between "Name: ..." and "HBD:"
  const addrBlockMatch = text.match(
    /Shipping\/Customer address:\s*\nName:\s*[^\n]+\n([\s\S]*?)(?=HBD:|$)/
  );
  const addrLines = addrBlockMatch
    ? addrBlockMatch[1].split("\n").map((l) => l.trim()).filter(Boolean)
    : [];

  const half = Math.ceil(addrLines.length / 2);
  const address1 = addrLines.slice(0, half).join(", ") || "None";
  const address2 = addrLines.slice(half).join(", ") || "None";

  const pincodeMatch = text.match(/(\d{6}),\s*IN-[A-Z]{2}/);
  const pincode = pincodeMatch ? pincodeMatch[1] : "Unknown";

  const stateCodeMatch = text.match(/IN-([A-Z]{2})\b/);
  const stateCode = stateCodeMatch ? stateCodeMatch[1] : "";
  const state = STATE_MAP[stateCode] || stateCode || "Unknown";

  const cityMatch = text.match(/([A-Za-z][\w\s,]*?)\s*-\s*\d{6},\s*IN-/);
  let city = "Unknown";
  if (cityMatch) {
    const raw = cityMatch[1].trim().split(/[\n,]/).pop() || "";
    city = raw.replace(/^\d+\s+/, "").trim();
  }

  const sizeMatch = text.match(
    /\|\s*(XXXL|XXL|XL|L|M|S|XS|4XL|5XL|6XL|7XL|8XL|Free Size)\b/i
  );
  const size = sizeMatch ? sizeMatch[1].toUpperCase() : "N/A";

  const totalMatch = text.match(/TOTAL PRICE:\s*([\d.]+)/);
  const total = totalMatch ? `Rs.${totalMatch[1]}` : "Unknown";

  const descMatch = text.match(/SKU ID \| Description\s+QTY\s*\n\d+\s+\S+\s+\|\s+(.+?)(?:\n|$)/);
  const product = descMatch ? descMatch[1].trim() : "Unknown";

  const dateMatch = text.match(/Order Date:\s*([\d\-]+)/);
  const orderDate = dateMatch ? dateMatch[1] : "Unknown";

  const invoiceMatch = text.match(/Invoice No:\s*(\S+)/);
  const invoice = invoiceMatch ? invoiceMatch[1] : "Unknown";

  return { orderId, name, address1, address2, city, state, pincode, size, total, mode, awb, product, orderDate, invoice };
}

export default function FlipkartExtractor() {
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedMode, setSelectedMode] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const saved = localStorage.getItem("darkMode");
    if (saved === "true") setDarkMode(true);
  }, []);

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    setResults([]);
    setProgress(1);
    let allResults = [];

    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      setProgressLabel(`Reading: ${file.name}`);
      const pageResults = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          setTimeout(async () => {
            const pdf = await getDocument({ data: new Uint8Array(reader.result) }).promise;
            const parsed = [];
            for (let pn = 1; pn <= pdf.numPages; pn++) {
              const page = await pdf.getPage(pn);
              const tc = await page.getTextContent();
              const text = tc.items.map((i) => i.str).join("\n");
              const data = parseFlipkartPage(text);
              if (data) parsed.push(data);
              setProgress(Math.round(((fi / files.length) + (pn / pdf.numPages / files.length)) * 100));
            }
            resolve(parsed);
          }, 0);
        };
        reader.readAsArrayBuffer(file);
      });
      allResults = [...allResults, ...pageResults];
    }
    setResults(allResults);
    setProgress(0);
    setProgressLabel("");
  };

  // --- Filtering ---
  const filteredResults = results.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      item.name.toLowerCase().includes(q) ||
      item.orderId.toLowerCase().includes(q) ||
      item.awb.toLowerCase().includes(q) ||
      item.address1.toLowerCase().includes(q) ||
      item.city.toLowerCase().includes(q) ||
      item.state.toLowerCase().includes(q) ||
      item.pincode.includes(q) ||
      item.product.toLowerCase().includes(q);
    const matchesSize = selectedSize ? item.size === selectedSize : true;
    const matchesMode = selectedMode ? item.mode === selectedMode : true;
    const price = parseFloat(item.total.replace("Rs.", "")) || 0;
    const matchesPrice = (!minPrice || price >= parseFloat(minPrice)) && (!maxPrice || price <= parseFloat(maxPrice));
    return matchesSearch && matchesSize && matchesMode && matchesPrice;
  });

  // --- Stats ---
  const stats = (() => {
    const sizeMap = {}, stateMap = {};
    let grand = 0, cod = 0, prepaid = 0;
    filteredResults.forEach(({ size, total, mode, state }) => {
      sizeMap[size] = (sizeMap[size] || 0) + 1;
      stateMap[state] = (stateMap[state] || 0) + 1;
      grand += parseFloat(total.replace("Rs.", "")) || 0;
      if (mode === "COD") cod++;
      if (mode === "PREPAID") prepaid++;
    });
    const seen = new Set(); let dupes = 0;
    filteredResults.forEach(({ name, pincode, mode }) => {
      const k = `${name}|${pincode}|${mode}`;
      if (seen.has(k)) dupes++; else seen.add(k);
    });
    const topState = Object.entries(stateMap).sort((a, b) => b[1] - a[1])[0];
    return { total: filteredResults.length, grand, cod, prepaid, dupes, sizeMap, topState };
  })();

  const handleExport = () => {
    const data = filteredResults.map((item, i) => ({
      "#": i + 1,
      "Order ID": item.orderId,
      "Invoice No": item.invoice,
      "Order Date": item.orderDate,
      Name: item.name,
      "Address 1": item.address1,
      "Address 2": item.address2,
      City: item.city,
      State: item.state,
      Pincode: item.pincode,
      Size: item.size,
      Total: item.total,
      Mode: item.mode,
      AWB: item.awb,
      Product: item.product,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] || {}).map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Flipkart Orders");
    saveAs(new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/octet-stream" }), "flipkart_orders.xlsx");
  };

  const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "N/A"];

  return (
    <div className="container">
      <motion.div className="glass-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>

        {/* Header */}
        <div className="header">
          <div className="logo">
            <Package size={30} color="#2563eb" />
            <div>
              <h1 className="title">Flipkart Order Extractor</h1>
              <p className="subtitle">Upload Flipkart shipping label PDFs → Extract → Export Excel</p>
            </div>
          </div>
          <button className="btn-dark" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? "☀ Light" : "🌙 Dark"}
          </button>
        </div>

        {/* Upload */}
        <label htmlFor="pdfUpload" className="upload-zone">
          <Upload size={28} />
          <span>Upload Flipkart PDFs</span>
          <small>Multiple files supported • E-Kart / Delhivery / Ekart</small>
        </label>
        <input type="file" id="pdfUpload" accept="application/pdf" multiple onChange={handleFileUpload} style={{ display: "none" }} />

        {/* Progress */}
        {progress > 0 && (
          <div style={{ margin: "1rem 0" }}>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
            <p className="progress-text">{progressLabel || `${progress}% done`}</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <>
            {/* Action Bar */}
            <div className="action-bar">
              <button className="btn-export" onClick={handleExport}><FileText size={16} /> Export Excel ({filteredResults.length})</button>
              <button className="btn-clear" onClick={() => { setResults([]); setSearchQuery(""); setSelectedSize(""); setSelectedMode(""); setMinPrice(""); setMaxPrice(""); }}>🗑 Clear</button>
            </div>

            {/* Stats */}
            <div className="stats-grid">
              {[
                { label: "Total Orders", val: stats.total, cls: "blue" },
                { label: "Grand Total", val: `Rs.${stats.grand.toFixed(0)}`, cls: "green" },
                { label: "COD", val: stats.cod, cls: "orange" },
                { label: "Prepaid", val: stats.prepaid, cls: "purple" },
                { label: "Duplicates", val: stats.dupes, cls: "red" },
                { label: stats.topState ? `Top: ${stats.topState[0]}` : "Top State", val: stats.topState ? stats.topState[1] : 0, cls: "teal" },
              ].map((s) => (
                <div key={s.label} className={`stat-card ${s.cls}`}>
                  <div className="stat-num">{s.val}</div>
                  <div className="stat-lbl">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Size chips */}
            <div className="chip-row">
              {Object.entries(stats.sizeMap).map(([sz, cnt]) => (
                <span key={sz} className="size-chip">{sz}: {cnt}</span>
              ))}
            </div>

            {/* Search */}
            <input className="search-box" type="text" placeholder="🔍 Search name, Order ID, AWB, city, state, pincode, product..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />

            {/* Filters */}
            <div className="filter-section">
              <div className="filter-row">
                {SIZES.map((sz) => (
                  <button key={sz} className={`chip ${selectedSize === sz ? "chip-active" : ""}`} onClick={() => setSelectedSize(selectedSize === sz ? "" : sz)}>{sz}</button>
                ))}
              </div>
              <div className="filter-row">
                {["COD", "PREPAID"].map((m) => (
                  <button key={m} className={`mode-btn ${selectedMode === m ? (m === "COD" ? "mode-cod" : "mode-pre") : ""}`} onClick={() => setSelectedMode(selectedMode === m ? "" : m)}>{m}</button>
                ))}
                <input className="price-in" type="number" placeholder="Min ₹" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
                <span style={{ color: "#94a3b8" }}>—</span>
                <input className="price-in" type="number" placeholder="Max ₹" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
                <button className="btn-reset" onClick={() => { setMinPrice(""); setMaxPrice(""); setSelectedSize(""); setSelectedMode(""); setSearchQuery(""); }}>Reset</button>
              </div>
            </div>

            {/* Cards */}
            {filteredResults.length > 0 ? (
              <motion.div className="cards-grid">
                {filteredResults.map((item, idx) => (
                  <motion.div key={idx} className="order-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: idx < 30 ? idx * 0.015 : 0 }}>
                    <div className="card-header">
                      <span className="card-num">#{idx + 1}</span>
                      <span className={`mode-tag ${item.mode === "COD" ? "tag-cod" : "tag-pre"}`}>{item.mode}</span>
                    </div>
                    <div className="cust-name">{item.name}</div>
                    {[
                      ["Order ID", item.orderId, "mono"],
                      ["AWB", item.awb, "mono"],
                      ["Product", item.product, "small"],
                      ["Address", [item.address1, item.address2 !== "None" ? item.address2 : ""].filter(Boolean).join(", "), "small"],
                      ["Location", `${item.city}, ${item.state} - ${item.pincode}`, ""],
                      ["Date", item.orderDate, ""],
                    ].map(([lbl, val, cls]) => (
                      <div key={lbl} className="detail-row">
                        <span className="detail-lbl">{lbl}</span>
                        <span className={`detail-val ${cls}`}>{val}</span>
                      </div>
                    ))}
                    <div className="badge-row">
                      <span className="badge">📦 {item.size}</span>
                      <span className="badge badge-green">💰 {item.total}</span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <p className="empty">No orders match your filters.</p>
            )}
          </>
        )}

        {results.length === 0 && progress === 0 && (
          <p className="empty">Upload a Flipkart shipping PDF to get started.</p>
        )}
      </motion.div>
    </div>
  );
}

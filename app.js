"use strict";

/* =========================================
   ROBUXLY — APP.JS
   Perbaikan checkout, invoice, dan tracking
========================================= */

const MIN_ROBUX = 50;
const MAX_ROBUX = 5000;
const DEFAULT_ROBUX = 400;
const STOCK_REFRESH_MS = 30000;

const ORDER_ID_PATTERN = /^RBX-[A-Fa-f0-9]{32}$/;

const PRICE_RULES = [
  { min: 50, max: 400, rate: 160 },
  { min: 401, max: 5000, rate: 155 }
];

/* =========================================
   DOM ELEMENTS
========================================= */

const $ = (id) => document.getElementById(id);

const orderForm = $("order-form");
const usernameInput = $("username");
const whatsappInput = $("whatsapp");
const amountInput = $("robux-amount");
const packageSelect = $("package");

const rateValue = $("rate-value");
const totalPrice = $("total-price");
const submitButton = $("submit-order");
const formMessage = $("form-message");

const stockAvailable = $("stock-available");
const stockUsed = $("stock-used");
const stockProgress = $("stock-progress");

const orderResult = $("order-result");
const resultId = $("result-id");
const copyIdButton = $("copy-id");

const invoiceUsername = $("invoice-username");
const invoiceRobux = $("invoice-robux");
const invoiceRate = $("invoice-rate");
const invoicePrice = $("invoice-price");
const invoicePayment = $("invoice-payment");
const resultDetail = $("result-detail");
const invoiceTrackButton = $("invoice-track");

const trackingForm = $("tracking-form");
const trackingIdInput = $("tracking-id");
const trackingResult = $("tracking-result");

let latestStock = null;
let activeOrderId = null;
let isSubmitting = false;
let isTracking = false;

/* =========================================
   GENERAL HELPERS
========================================= */

function rupiah(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "Rp0";
  }

  return "Rp" + new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0
  }).format(amount);
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
}

function calculatePrice(robux) {
  const amount = Number(robux);

  const rule = PRICE_RULES.find(
    (item) => amount >= item.min && amount <= item.max
  );

  if (!rule) {
    return null;
  }

  return {
    rate: rule.rate,
    price: amount * rule.rate
  };
}

function getSelectedRobux() {
  const amount = Number(amountInput?.value);

  if (Number.isInteger(amount)) {
    return amount;
  }

  return 0;
}

function setMessage(element, message, type = "") {
  if (!element) return;

  element.textContent = message;
  element.classList.remove("success", "error", "info");

  if (type) {
    element.classList.add(type);
  }

  element.classList.remove("hidden");
}

function clearMessage(element) {
  if (!element) return;

  element.textContent = "";
  element.classList.remove("success", "error", "info");
}

function showElement(element) {
  if (!element) return;

  element.classList.remove("hidden");
  element.hidden = false;
  element.style.removeProperty("display");
}

function hideElement(element) {
  if (!element) return;

  element.classList.add("hidden");
  element.hidden = true;
}

function scrollToElement(element) {
  if (!element) return;

  window.setTimeout(() => {
    element.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, 100);
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Server memberikan respons yang tidak valid (HTTP ${response.status}).`
    );
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(
      data?.error ||
      data?.message ||
      `Permintaan gagal (HTTP ${response.status}).`
    );
  }

  return data;
}

/* =========================================
   PRICE CALCULATION
========================================= */

function updatePrice() {
  if (!amountInput) return;

  const robux = getSelectedRobux();
  const validAmount =
    Number.isInteger(robux) &&
    robux >= MIN_ROBUX &&
    robux <= MAX_ROBUX;

  if (!validAmount) {
    if (rateValue) rateValue.textContent = "-";
    if (totalPrice) totalPrice.textContent = "Rp0";

    if (robux !== 0) {
      setMessage(
        formMessage,
        `Jumlah Robux harus ${MIN_ROBUX}–${MAX_ROBUX}.`,
        "error"
      );
    }

    return;
  }

  clearMessage(formMessage);

  const pricing = calculatePrice(robux);

  if (!pricing) return;

  if (rateValue) {
    rateValue.textContent = rupiah(pricing.rate) + "/Robux";
  }

  if (totalPrice) {
    totalPrice.textContent = rupiah(pricing.price);
  }

  if (packageSelect) {
    packageSelect.value = String(robux);
  }
}

/* =========================================
   STOCK
========================================= */

async function loadStock() {
  try {
    const data = await fetchJSON("/api/stock");

    latestStock = data;

    if (stockAvailable) {
      stockAvailable.textContent = formatNumber(data.available);
    }

    if (stockUsed) {
      stockUsed.textContent =
        `${formatNumber(data.used)} / ${formatNumber(data.monthlyLimit)}`;
    }

    if (stockProgress) {
      const limit = Number(data.monthlyLimit) || 0;
      const used = Number(data.used) || 0;

      const percentage = limit > 0
        ? Math.min(100, Math.max(0, (used / limit) * 100))
        : 0;

      stockProgress.style.width = `${percentage}%`;
      stockProgress.setAttribute("aria-valuenow", String(Math.round(percentage)));
    }

    return data;
  } catch (error) {
    console.error("Gagal memuat stok:", error);

    if (stockAvailable) {
      stockAvailable.textContent = "-";
    }

    return null;
  }
}

/* =========================================
   INVOICE
========================================= */

function showInvoice(order) {
  /*
   * Jangan menyembunyikan invoice jika respons server
   * ternyata tidak memiliki data pesanan yang diperlukan.
   */

  if (!order || typeof order !== "object") {
    throw new Error("Data invoice tidak ditemukan dari server.");
  }

  const id = String(order.id || "").trim();
  const username = String(order.username || "").trim();
  const robux = Number(order.robux);
  const price = Number(order.price);

  if (!ORDER_ID_PATTERN.test(id)) {
    throw new Error("ID pesanan dari server tidak valid.");
  }

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    throw new Error("Username pada invoice tidak valid.");
  }

  if (
    !Number.isInteger(robux) ||
    robux < MIN_ROBUX ||
    robux > MAX_ROBUX
  ) {
    throw new Error("Jumlah Robux pada invoice tidak valid.");
  }

  const pricing = calculatePrice(robux);

  if (!pricing || !Number.isFinite(price) || price !== pricing.price) {
    throw new Error("Total invoice tidak sesuai dengan perhitungan harga.");
  }

  activeOrderId = id;

  // Isi semua data invoice sebelum menampilkannya.
  if (resultId) resultId.textContent = id;
  if (invoiceUsername) invoiceUsername.textContent = username;
  if (invoiceRobux) invoiceRobux.textContent = `${formatNumber(robux)} Robux`;
  if (invoiceRate) invoiceRate.textContent = `${rupiah(pricing.rate)}/Robux`;
  if (invoicePrice) invoicePrice.textContent = rupiah(price);

  if (invoicePayment) {
    const paymentStatus = String(
      order.paymentStatus || order.payment_status || ""
    );

    invoicePayment.textContent =
      paymentStatus === "paid"
        ? "Pembayaran terverifikasi"
        : "Belum dikonfirmasi";
  }

  if (resultDetail) {
    resultDetail.textContent =
      "Pesanan berhasil dibuat. Simpan ID pesanan ini untuk melacak statusnya. " +
      "Ikuti instruksi pembayaran resmi dari admin.";
  }

  if (trackingIdInput) {
    trackingIdInput.value = id;
  }

  // Pastikan invoice tidak tertinggal dalam keadaan tersembunyi.
  showElement(orderResult);

  // Simpan ID aktif hanya untuk sesi halaman ini.
  // ID juga ditampilkan agar pengguna bisa menyimpannya sendiri.
  scrollToElement(orderResult);
}

/* =========================================
   CHECKOUT
========================================= */

async function handleOrderSubmit(event) {
  event.preventDefault();

  if (isSubmitting) return;

  clearMessage(formMessage);

  const username = String(usernameInput?.value || "").trim();
  const whatsapp = String(whatsappInput?.value || "").trim();
  const robux = getSelectedRobux();

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    setMessage(
      formMessage,
      "Username Roblox harus terdiri dari 3–20 karakter huruf, angka, atau underscore.",
      "error"
    );
    usernameInput?.focus();
    return;
  }

  if (!/^[+0-9][0-9 ()-]{7,18}$/.test(whatsapp)) {
    setMessage(
      formMessage,
      "Periksa kembali nomor WhatsApp kamu.",
      "error"
    );
    whatsappInput?.focus();
    return;
  }

  if (
    !Number.isInteger(robux) ||
    robux < MIN_ROBUX ||
    robux > MAX_ROBUX
  ) {
    setMessage(
      formMessage,
      `Jumlah Robux harus ${MIN_ROBUX}–${MAX_ROBUX}.`,
      "error"
    );
    amountInput?.focus();
    return;
  }

  const pricing = calculatePrice(robux);

  if (!pricing) {
    setMessage(formMessage, "Harga pesanan tidak valid.", "error");
    return;
  }

  isSubmitting = true;

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Memproses...";
  }

  try {
    const data = await fetchJSON("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        whatsapp,
        robux
      })
    });

    if (!data.order) {
      throw new Error(
        "Server menerima permintaan, tetapi data invoice tidak tersedia."
      );
    }

    /*
     * Tampilkan invoice segera setelah server mengembalikan
     * pesanan yang berhasil dibuat. Jangan menunggu loadStock().
     */
    showInvoice(data.order);

    const notificationMessage =
      data.notification === "sent"
        ? " Notifikasi pesanan juga telah dikirim ke Discord."
        : " Namun, notifikasi Discord belum berhasil dikirim.";

    setMessage(
      formMessage,
      "Pesanan berhasil dibuat!" + notificationMessage,
      "success"
    );

    // Bersihkan input setelah invoice berhasil ditampilkan.
    if (usernameInput) usernameInput.value = "";
    if (whatsappInput) whatsappInput.value = "";

    if (amountInput) {
      amountInput.value = String(DEFAULT_ROBUX);
    }

    if (packageSelect) {
      packageSelect.value = String(DEFAULT_ROBUX);
    }

    updatePrice();

    // Perbarui tampilan stok tanpa menghalangi invoice.
    void loadStock();
  } catch (error) {
    console.error("Checkout gagal:", error);

    setMessage(
      formMessage,
      error instanceof Error
        ? error.message
        : "Pesanan gagal dibuat. Silakan coba kembali.",
      "error"
    );
  } finally {
    isSubmitting = false;

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Buat Pesanan";
    }
  }
}

/* =========================================
   COPY ORDER ID
========================================= */

async function copyOrderId() {
  const id = String(activeOrderId || resultId?.textContent || "").trim();

  if (!ORDER_ID_PATTERN.test(id)) {
    setMessage(formMessage, "ID pesanan belum tersedia.", "error");
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(id);
    } else {
      // Fallback untuk browser yang tidak mendukung Clipboard API.
      const textarea = document.createElement("textarea");
      textarea.value = id;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";

      document.body.appendChild(textarea);
      textarea.select();

      const copied = document.execCommand("copy");
      textarea.remove();

      if (!copied) {
        throw new Error("Browser tidak mengizinkan penyalinan otomatis.");
      }
    }

    setMessage(formMessage, "ID pesanan berhasil disalin.", "success");
  } catch (error) {
    console.error("Gagal menyalin ID:", error);

    setMessage(
      formMessage,
      "Gagal menyalin otomatis. Silakan salin ID secara manual.",
      "error"
    );
  }
}

/* =========================================
   ORDER TRACKING
========================================= */

function renderTracking(order) {
  if (!trackingResult) return;

  trackingResult.replaceChildren();

  const title = document.createElement("h3");
  title.textContent = "Detail Pesanan";

  const rows = [
    ["ID Pesanan", order.id],
    ["Username Roblox", order.username],
    ["Jumlah", `${formatNumber(order.robux)} Robux`],
    ["Total", rupiah(order.price)],
    [
      "Pembayaran",
      order.paymentStatus === "paid"
        ? "Terverifikasi"
        : order.paymentStatus === "rejected"
          ? "Ditolak"
          : "Belum dikonfirmasi"
    ],
    [
      "Status Pesanan",
      order.statusLabel || order.status || "Belum diketahui"
    ]
  ];

  trackingResult.appendChild(title);

  for (const [label, value] of rows) {
    const paragraph = document.createElement("p");
    const strong = document.createElement("strong");

    strong.textContent = `${label}: `;
    paragraph.appendChild(strong);
    paragraph.appendChild(document.createTextNode(String(value ?? "-")));

    trackingResult.appendChild(paragraph);
  }

  showElement(trackingResult);
}

async function handleTrackingSubmit(event) {
  event.preventDefault();

  if (isTracking) return;

  const id = String(trackingIdInput?.value || "").trim();

  if (!ORDER_ID_PATTERN.test(id)) {
    setMessage(
      trackingResult,
      "Format ID tidak valid. Gunakan ID lengkap yang diawali RBX-.",
      "error"
    );
    return;
  }

  isTracking = true;

  if (trackingResult) {
    trackingResult.textContent = "Memeriksa status pesanan...";
    showElement(trackingResult);
  }

  try {
    const data = await fetchJSON(
      `/api/orders?id=${encodeURIComponent(id)}`
    );

    if (!data.order) {
      throw new Error("Data pesanan tidak ditemukan.");
    }

    renderTracking(data.order);
  } catch (error) {
    console.error("Pelacakan gagal:", error);

    if (trackingResult) {
      trackingResult.textContent =
        error instanceof Error
          ? error.message
          : "Gagal memeriksa pesanan.";

      showElement(trackingResult);
    }
  } finally {
    isTracking = false;
  }
}

/* =========================================
   PACKAGE BUTTONS
========================================= */

function handlePackageClick(event) {
  const button = event.target.closest("[data-package]");

  if (!button) return;

  const amount = Number(button.dataset.package);

  if (
    !Number.isInteger(amount) ||
    amount < MIN_ROBUX ||
    amount > MAX_ROBUX
  ) {
    setMessage(formMessage, "Paket Robux tidak valid.", "error");
    return;
  }

  if (amountInput) {
    amountInput.value = String(amount);
  }

  if (packageSelect) {
    packageSelect.value = String(amount);
  }

  updatePrice();

  if (orderForm) {
    scrollToElement(orderForm);
  }
}

/* =========================================
   INITIALIZATION
========================================= */

function initializeApp() {
  if (orderForm) {
    orderForm.addEventListener("submit", handleOrderSubmit);
  }

  if (amountInput) {
    amountInput.addEventListener("input", updatePrice);
    amountInput.addEventListener("change", updatePrice);
  }

  if (packageSelect) {
    packageSelect.addEventListener("change", () => {
      if (amountInput) {
        amountInput.value = packageSelect.value;
      }

      updatePrice();
    });
  }

  document.addEventListener("click", handlePackageClick);

  if (copyIdButton) {
    copyIdButton.addEventListener("click", copyOrderId);
  }

  if (invoiceTrackButton) {
    invoiceTrackButton.addEventListener("click", () => {
      if (trackingIdInput && activeOrderId) {
        trackingIdInput.value = activeOrderId;
      }

      scrollToElement(trackingForm);

      window.setTimeout(() => {
        trackingIdInput?.focus();
      }, 250);
    });
  }

  if (trackingForm) {
    trackingForm.addEventListener("submit", handleTrackingSubmit);
  }

  if (orderResult) {
    hideElement(orderResult);
  }

  if (trackingResult) {
    hideElement(trackingResult);
  }

  if (amountInput && !amountInput.value) {
    amountInput.value = String(DEFAULT_ROBUX);
  }

  if (packageSelect && !packageSelect.value) {
    packageSelect.value = String(DEFAULT_ROBUX);
  }

  updatePrice();
  void loadStock();

  window.setInterval(() => {
    void loadStock();
  }, STOCK_REFRESH_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp, {
    once: true
  });
} else {
  initializeApp();
}

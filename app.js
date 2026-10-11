
"use strict";

const packages = {
  "80": { robux: 80, price: 15000 },
  "400": { robux: 400, price: 65000 },
  "800": { robux: 800, price: 125000 }
};

const rupiah = value =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);

const packageSelect = document.querySelector("#package");
const totalPrice = document.querySelector("#total-price");
const orderForm = document.querySelector("#order-form");
const submitButton = document.querySelector("#submit-order");
const formMessage = document.querySelector("#form-message");
const orderResult = document.querySelector("#order-result");

function updatePrice() {
  if (!packageSelect || !totalPrice) return;

  const selected = packages[packageSelect.value];

  if (selected) {
    totalPrice.textContent = rupiah(selected.price);
  }
}

function showFormMessage(message, type = "info") {
  if (!formMessage) return;

  formMessage.textContent = message;
  formMessage.dataset.type = type;
}

function setSubmitState(isLoading) {
  if (!submitButton) return;

  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading
    ? "Memproses pesanan..."
    : "Buat Pesanan →";
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    throw new Error(
      "Respons server tidak valid. Silakan coba beberapa saat lagi."
    );
  }
}

if (packageSelect) {
  packageSelect.addEventListener("change", updatePrice);
}

document.querySelectorAll("[data-package]").forEach(button => {
  button.addEventListener("click", () => {
    if (!packageSelect) return;

    const packageId = button.dataset.package;

    if (!packages[packageId]) return;

    packageSelect.value = packageId;
    updatePrice();

    document.querySelector("#checkout")?.scrollIntoView({
      behavior: "smooth"
    });
  });
});

// ========================================
// CHECKOUT: MEMBUAT PESANAN
// ========================================

if (orderForm) {
  orderForm.addEventListener("submit", async event => {
    event.preventDefault();

    showFormMessage("");

    if (orderResult) {
      orderResult.classList.add("hidden");
    }

    const username =
      document.querySelector("#username")?.value.trim() || "";

    const whatsapp =
      document.querySelector("#whatsapp")?.value.trim() || "";

    const packageId = packageSelect?.value || "";

    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      showFormMessage("Periksa kembali username Roblox.", "error");
      return;
    }

    if (!/^[+0-9][0-9 ()-]{7,18}$/.test(whatsapp)) {
      showFormMessage("Periksa kembali nomor WhatsApp.", "error");
      return;
    }

    if (!packages[packageId]) {
      showFormMessage("Paket Robux tidak valid.", "error");
      return;
    }

    setSubmitState(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          username,
          whatsapp,
          packageId
        })
      });

      const data = await readJsonResponse(response);

      if (!response.ok || !data.ok || !data.order?.id) {
        throw new Error(
          data.error || "Pesanan gagal dibuat. Silakan coba kembali."
        );
      }

      // Tampilkan informasi pesanan.
      const resultId = document.querySelector("#result-id");
      const resultDetail = document.querySelector("#result-detail");

      if (resultId) {
        resultId.textContent = data.order.id;
      }

      if (resultDetail) {
        resultDetail.textContent =
          `Username: ${data.order.username} · ` +
          `Paket: ${data.order.robux} Robux · ` +
          `Total: ${rupiah(data.order.price)} · ` +
          `Status: ${data.order.statusLabel || "Menunggu pembayaran"}`;
      }

      if (orderResult) {
        orderResult.classList.remove("hidden");
      }

      // Isi otomatis kolom pelacakan dengan ID pesanan baru.
      const trackingId = document.querySelector("#tracking-id");

      if (trackingId) {
        trackingId.value = data.order.id;
      }

      // Status notifikasi berdasarkan respons dari Worker.
      if (data.notification === "sent") {
        showFormMessage(
          "Pesanan berhasil dibuat dan server melaporkan notifikasi admin terkirim.",
          "success"
        );
      } else if (data.notification === "failed") {
        showFormMessage(
          "Pesanan berhasil tersimpan, tetapi notifikasi admin gagal dikirim. Hubungi admin untuk konfirmasi.",
          "warning"
        );
      } else {
        showFormMessage(
          "Pesanan berhasil dibuat. Status pengiriman notifikasi belum diketahui.",
          "info"
        );
      }

      orderResult?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      // Reset formulir setelah pesanan berhasil dibuat.
      orderForm.reset();

      if (packageSelect) {
        packageSelect.value = "400";
        updatePrice();
      }
    } catch (error) {
      showFormMessage(
        error.message || "Terjadi kesalahan. Silakan coba kembali.",
        "error"
      );
    } finally {
      setSubmitState(false);
    }
  });
}

// ========================================
// SALIN ID PESANAN
// ========================================

const copyButton = document.querySelector("#copy-id");

if (copyButton) {
  copyButton.addEventListener("click", async () => {
    const id =
      document.querySelector("#result-id")?.textContent.trim() || "";

    if (!id || id === "-") {
      copyButton.textContent = "ID tidak tersedia";
      return;
    }

    try {
      await navigator.clipboard.writeText(id);
      copyButton.textContent = "Tersalin!";
    } catch {
      copyButton.textContent = "Salin ID secara manual";
    }

    setTimeout(() => {
      copyButton.textContent = "Salin ID";
    }, 2500);
  });
}

// ========================================
// PELACAKAN STATUS PESANAN
// ========================================

const trackingForm = document.querySelector("#tracking-form");
const trackingResult = document.querySelector("#tracking-result");

if (trackingForm && trackingResult) {
  trackingForm.addEventListener("submit", async event => {
    event.preventDefault();

    trackingResult.replaceChildren();

    const id =
      document.querySelector("#tracking-id")?.value.trim() || "";

    if (!/^RBX-[A-Fa-f0-9]{32}$/.test(id)) {
      trackingResult.textContent = "Format ID pesanan tidak valid.";
      trackingResult.classList.remove("hidden");
      return;
    }

    trackingResult.textContent = "Memeriksa pesanan...";
    trackingResult.classList.remove("hidden");

    try {
      const response = await fetch(
        `/api/orders?id=${encodeURIComponent(id)}`,
        {
          method: "GET",
          headers: {
            "Accept": "application/json"
          },
          cache: "no-store"
        }
      );

      const data = await readJsonResponse(response);

      if (!response.ok || !data.ok || !data.order) {
        throw new Error(
          data.error || "Pesanan tidak ditemukan."
        );
      }

      trackingResult.replaceChildren();

      const title = document.createElement("strong");
      title.textContent = `Pesanan ${data.order.id}`;

      const details = document.createElement("p");
      details.textContent =
        `Username: ${data.order.username} · ` +
        `${data.order.robux} Robux · ` +
        `${rupiah(data.order.price)}`;

      const payment = document.createElement("p");
      payment.textContent =
        "Pembayaran: " +
        (data.order.paymentStatus === "verified"
          ? "Terverifikasi"
          : "Belum diverifikasi");

      const status = document.createElement("span");
      status.className = "status";
      status.textContent =
        data.order.statusLabel || "Status belum tersedia";

      trackingResult.append(title, details, payment, status);
    } catch (error) {
      trackingResult.textContent =
        error.message || "Gagal memeriksa pesanan.";
    }
  });
}

// ========================================
// INISIALISASI HALAMAN
// ========================================

updatePrice();

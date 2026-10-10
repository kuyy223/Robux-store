
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
  const selected = packages[packageSelect.value];
  if (selected) totalPrice.textContent = rupiah(selected.price);
}

packageSelect.addEventListener("change", updatePrice);

document.querySelectorAll("[data-package]").forEach(button => {
  button.addEventListener("click", () => {
    packageSelect.value = button.dataset.package;
    updatePrice();
    document.querySelector("#checkout").scrollIntoView({
      behavior: "smooth"
    });
  });
});

orderForm.addEventListener("submit", async event => {
  event.preventDefault();
  formMessage.textContent = "";
  orderResult.classList.add("hidden");

  const username = document.querySelector("#username").value.trim();
  const whatsapp = document.querySelector("#whatsapp").value.trim();
  const packageId = packageSelect.value;

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    formMessage.textContent = "Periksa kembali username Roblox.";
    return;
  }

  if (!/^[+0-9][0-9 ()-]{7,18}$/.test(whatsapp)) {
    formMessage.textContent = "Periksa kembali nomor WhatsApp.";
    return;
  }

  if (!packages[packageId]) {
    formMessage.textContent = "Paket tidak valid.";
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Memproses pesanan...";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, whatsapp, packageId })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Pesanan gagal dibuat.");
    }

    document.querySelector("#result-id").textContent = data.order.id;

    document.querySelector("#result-detail").textContent =
      `Username: ${data.order.username} · Paket: ${data.order.robux} Robux · Total: ${rupiah(data.order.price)} · Status: Menunggu pembayaran`;

    orderResult.classList.remove("hidden");
    orderResult.scrollIntoView({ behavior: "smooth", block: "center" });

    document.querySelector("#tracking-id").value = data.order.id;
    orderForm.reset();
    packageSelect.value = "400";
    updatePrice();
  } catch (error) {
    formMessage.textContent =
      error.message || "Terjadi kesalahan. Silakan coba kembali.";
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Buat Pesanan <span>→</span>';
  }
});

document.querySelector("#copy-id").addEventListener("click", async () => {
  const id = document.querySelector("#result-id").textContent;
  try {
    await navigator.clipboard.writeText(id);
    document.querySelector("#copy-id").textContent = "Tersalin!";
  } catch {
    document.querySelector("#copy-id").textContent =
      "Salin ID secara manual";
  }
});

const trackingForm = document.querySelector("#tracking-form");
const trackingResult = document.querySelector("#tracking-result");

trackingForm.addEventListener("submit", async event => {
  event.preventDefault();
  trackingResult.classList.remove("hidden");
  trackingResult.textContent = "Memeriksa pesanan...";

  const id = document.querySelector("#tracking-id").value.trim();

  if (!/^RBX-[A-Za-z0-9-]{8,32}$/.test(id)) {
    trackingResult.textContent = "Format ID pesanan tidak valid.";
    return;
  }

  try {
    const response = await fetch(
      `/api/orders?id=${encodeURIComponent(id)}`
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Pesanan tidak ditemukan.");
    }

    trackingResult.replaceChildren();

    const title = document.createElement("strong");
    title.textContent = `Pesanan ${data.order.id}`;

    const details = document.createElement("p");
    details.textContent =
      `Username: ${data.order.username} · ${data.order.robux} Robux · ${rupiah(data.order.price)}`;

    const status = document.createElement("span");
    status.className = "status";
    status.textContent = data.order.statusLabel;

    trackingResult.append(title, details, status);
  } catch (error) {
    trackingResult.textContent =
      error.message || "Gagal memeriksa pesanan.";
  }
});

updatePrice();

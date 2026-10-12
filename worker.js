
const STATUS_LABELS = {
  waiting_payment: "Menunggu pembayaran",
  processing: "Sedang diproses",
  completed: "Selesai",
  cancelled: "Dibatalkan"
};

const MIN_ROBUX = 50;
const MAX_ROBUX = 5000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function rupiah(value) {
  return "Rp " + new Intl.NumberFormat("id-ID").format(value);
}

function calculatePrice(robux) {
  const rate = robux <= 400 ? 160 : 155;
  return { rate, price: robux * rate };
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

async function ensureMonthlyPeriod(env) {
  const month = currentMonth();

  await env.DB.prepare(`
    UPDATE store_stock
    SET monthly_used = 0,
        month_key = ?,
        updated_at = datetime('now')
    WHERE id = 1 AND month_key != ?
  `).bind(month, month).run();
}

async function readStock(env) {
  await ensureMonthlyPeriod(env);

  return env.DB.prepare(`
    SELECT inventory_stock, monthly_limit, monthly_used, month_key
    FROM store_stock
    WHERE id = 1
  `).first();
}

async function getStock(env) {
  if (!env.DB) {
    return json({ error: "Database belum dikonfigurasi." }, 503);
  }

  try {
    const stock = await readStock(env);

    if (!stock) {
      return json({ error: "Data stok belum tersedia." }, 503);
    }

    return json({
      ok: true,
      available: stock.inventory_stock,
      monthlyLimit: stock.monthly_limit,
      used: stock.monthly_used,
      remainingMonthly: Math.max(
        0,
        stock.monthly_limit - stock.monthly_used
      ),
      month: stock.month_key,
      minRobux: MIN_ROBUX,
      maxRobux: MAX_ROBUX,
      rates: [
        { min: 50, max: 400, rate: 160 },
        { min: 401, max: 5000, rate: 155 }
      ]
    });
  } catch (error) {
    console.error("Gagal membaca stok:", error);
    return json({ error: "Gagal membaca data stok." }, 500);
  }
}

async function notifyDiscord(env, order) {
  if (
    typeof env.DISCORD_WEBHOOK_URL !== "string" ||
    !env.DISCORD_WEBHOOK_URL.trim()
  ) {
    throw new Error("Secret DISCORD_WEBHOOK_URL belum dikonfigurasi.");
  }

  const response = await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Robuxly Orders",
      allowed_mentions: { parse: [] },
      embeds: [{
        title: "🛒 Pesanan Robux Baru",
        color: 0x16834a,
        fields: [
          { name: "ID Pesanan", value: String(order.id) },
          { name: "Username Roblox", value: String(order.username) },
          { name: "WhatsApp", value: String(order.whatsapp) },
          { name: "Jumlah", value: `${order.robux} Robux` },
          { name: "Tarif", value: `${rupiah(order.rate)}/Robux` },
          { name: "Total", value: rupiah(order.price) },
          { name: "Pembayaran", value: "Belum diverifikasi" },
          {
            name: "Status",
            value: STATUS_LABELS.waiting_payment
          }
        ],
        footer: { text: "Robuxly • Notifikasi pesanan otomatis" },
        timestamp: new Date().toISOString()
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Discord webhook gagal dengan HTTP ${response.status}.`);
  }
}

async function createOrder(request, env) {
  if (!env.DB) {
    return json({ error: "Database belum dikonfigurasi." }, 503);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Format permintaan tidak valid." }, 400);
  }

  if (
    !body ||
    typeof body.username !== "string" ||
    typeof body.whatsapp !== "string"
  ) {
    return json({ error: "Data pesanan belum lengkap." }, 400);
  }

  const username = body.username.trim();
  const whatsapp = body.whatsapp.trim();

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return json({ error: "Username Roblox tidak valid." }, 400);
  }

  if (!/^[+0-9][0-9 ()-]{7,18}$/.test(whatsapp)) {
    return json({ error: "Nomor WhatsApp tidak valid." }, 400);
  }

  // Format baru: { username, whatsapp, robux }
  // Format lama: { username, whatsapp, packageId }
  let robux;

  if (Number.isInteger(body.robux)) {
    robux = body.robux;
  } else if (
    typeof body.packageId === "string" &&
    ["80", "400", "800"].includes(body.packageId)
  ) {
    robux = Number(body.packageId);
  } else {
    return json({ error: "Jumlah Robux tidak valid." }, 400);
  }

  if (robux < MIN_ROBUX || robux > MAX_ROBUX) {
    return json({
      error: `Jumlah Robux harus ${MIN_ROBUX}–${MAX_ROBUX}.`
    }, 400);
  }

  let stock;

  try {
    stock = await readStock(env);
  } catch (error) {
    console.error("Gagal memeriksa stok:", error);
    return json({ error: "Gagal memeriksa stok." }, 500);
  }

  if (!stock) {
    return json({ error: "Data stok belum tersedia." }, 503);
  }

  const { rate, price } = calculatePrice(robux);

  if (robux > stock.inventory_stock) {
    return json({
      error: "Stok Robux belum mencukupi.",
      available: stock.inventory_stock
    }, 409);
  }

  if (robux > stock.monthly_limit - stock.monthly_used) {
    return json({
      error: "Sisa kuota pengiriman bulanan tidak mencukupi."
    }, 409);
  }

  const order = {
    id: "RBX-" + crypto.randomUUID().replaceAll("-", ""),
    username,
    whatsapp,
    packageId: String(robux),
    robux,
    rate,
    price
  };

  try {
    await env.DB.prepare(`
      INSERT INTO orders
        (id, username, whatsapp, package_id, robux, price)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      order.id,
      order.username,
      order.whatsapp,
      order.packageId,
      order.robux,
      order.price
    ).run();
  } catch (error) {
    console.error("Gagal menyimpan pesanan:", error);
    return json({
      error: "Gagal menyimpan pesanan. Coba kembali."
    }, 500);
  }

  let notification = "failed";

  try {
    await notifyDiscord(env, order);
    notification = "sent";
  } catch (error) {
    console.error(
      "Notifikasi Discord gagal:",
      error instanceof Error ? error.message : "Kesalahan tidak diketahui"
    );
  }

  return json({
    ok: true,
    notification,
    message: notification === "sent"
      ? "Pesanan tersimpan dan notifikasi dikirim ke Discord."
      : "Pesanan tersimpan, tetapi notifikasi Discord gagal dikirim.",
    order: {
      id: order.id,
      username: order.username,
      robux: order.robux,
      rate: order.rate,
      price: order.price,
      status: "waiting_payment",
      statusLabel: STATUS_LABELS.waiting_payment
    }
  }, 201);
}

async function getOrder(request, env) {
  if (!env.DB) {
    return json({ error: "Database belum dikonfigurasi." }, 503);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";

  if (!/^RBX-[A-Fa-f0-9]{32}$/.test(id)) {
    return json({ error: "ID pesanan tidak valid." }, 400);
  }

  let order;

  try {
    order = await env.DB.prepare(`
      SELECT id, username, robux, price,
             payment_status, order_status
      FROM orders
      WHERE id = ?
      LIMIT 1
    `).bind(id).first();
  } catch (error) {
    console.error("Gagal membaca database:", error);
    return json({ error: "Gagal membaca database." }, 500);
  }

  if (!order) {
    return json({ error: "Pesanan tidak ditemukan." }, 404);
  }

  return json({
    ok: true,
    order: {
      id: order.id,
      username: order.username,
      robux: order.robux,
      price: order.price,
      paymentStatus: order.payment_status,
      status: order.order_status,
      statusLabel:
        STATUS_LABELS[order.order_status] || "Status diperbarui"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/stock") {
      if (request.method !== "GET") {
        return json({ error: "Metode tidak diizinkan." }, 405);
      }
      return getStock(env);
    }

    if (url.pathname === "/api/orders") {
      if (request.method === "POST") {
        return createOrder(request, env);
      }

      if (request.method === "GET") {
        return getOrder(request, env);
      }

      return json({ error: "Metode tidak diizinkan." }, 405);
    }

    return env.ASSETS.fetch(request);
  }
};

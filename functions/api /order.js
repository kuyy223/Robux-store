
const PACKAGES = {
  "80": { robux: 80, price: 15000 },
  "400": { robux: 400, price: 65000 },
  "800": { robux: 800, price: 125000 }
};

const STATUS_LABELS = {
  waiting_payment: "Menunggu pembayaran",
  processing: "Sedang diproses",
  completed: "Selesai",
  cancelled: "Dibatalkan"
};

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

async function notifyDiscord(env, order) {
  if (!env.DISCORD_WEBHOOK_URL) return;

  const payload = {
    username: "Robuxly Orders",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: "🛒 Pesanan Robux Baru",
      color: 0x16834a,
      fields: [
        { name: "ID Pesanan", value: order.id },
        { name: "Username Roblox", value: order.username },
        { name: "WhatsApp", value: order.whatsapp },
        { name: "Paket", value: `${order.robux} Robux` },
        { name: "Total", value: rupiah(order.price) },
        { name: "Pembayaran", value: "Belum diverifikasi" },
        { name: "Status", value: "Menunggu pembayaran" }
      ],
      footer: { text: "Robuxly • Notifikasi pesanan otomatis" },
      timestamp: new Date().toISOString()
    }]
  };

  const response = await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Discord webhook gagal: " + response.status);
  }
}

export async function onRequestPost({ request, env }) {
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
    typeof body.whatsapp !== "string" ||
    typeof body.packageId !== "string"
  ) {
    return json({ error: "Data pesanan belum lengkap." }, 400);
  }

  const username = body.username.trim();
  const whatsapp = body.whatsapp.trim();
  const packageId = body.packageId;

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return json({ error: "Username Roblox tidak valid." }, 400);
  }

  if (!/^[+0-9][0-9 ()-]{7,18}$/.test(whatsapp)) {
    return json({ error: "Nomor WhatsApp tidak valid." }, 400);
  }

  const selected = PACKAGES[packageId];

  if (!selected) {
    return json({ error: "Paket tidak tersedia." }, 400);
  }

  const id = "RBX-" + crypto.randomUUID().replaceAll("-", "");

  const order = {
    id,
    username,
    whatsapp,
    packageId,
    robux: selected.robux,
    price: selected.price
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
  } catch {
    return json({ error: "Gagal menyimpan pesanan. Coba kembali." }, 500);
  }

  let notification = "sent";

  try {
    await notifyDiscord(env, order);
  } catch {
    notification = "failed";
    console.error("Notifikasi Discord gagal untuk pesanan", order.id);
  }

  return json({
    ok: true,
    notification,
    order: {
      id: order.id,
      username: order.username,
      robux: order.robux,
      price: order.price,
      status: "waiting_payment",
      statusLabel: STATUS_LABELS.waiting_payment
    }
  }, 201);
}

export async function onRequestGet({ request, env }) {
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
      SELECT id, username, robux, price, payment_status, order_status
      FROM orders
      WHERE id = ?
      LIMIT 1
    `).bind(id).first();
  } catch {
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
      statusLabel: STATUS_LABELS[order.order_status] || "Status diperbarui"
    }
  });
}
